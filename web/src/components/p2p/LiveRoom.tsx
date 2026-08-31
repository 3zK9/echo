"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ConsentPanel from "@/components/p2p/ConsentPanel";
import {
  BrowserP2PError,
  P2PApiError,
  claimLiveSession,
  closeLiveSession,
  configureDataChannel,
  createInitiatorDataChannel,
  createLiveSession,
  createPeerConnection,
  createTextFrame,
  parseTextFrame,
  peerPinStatus,
  postSignalEnvelope,
  prepareCloseLiveSession,
  prepareBrowserDevice,
  publishPresence,
  readInbox,
  sendPreparedCloseLiveSession,
  sendTextFrame,
  trustPeer,
  waitForIceGathering,
  type BrowserIdentity,
  type ClientSession,
  type PinStatus,
  type PreparedCloseRequest,
  type TextFrame,
} from "@/lib/p2p/browser";
import {
  formatSafetyCode,
  MAX_TEXT_CHARACTERS,
  MAX_TEXT_UTF8_BYTES,
  safetyCodeBytes,
  signalEnvelopeHash,
  type SignalEnvelope,
  type SignalPhase,
} from "@/lib/p2p/protocol";
import { openSessionDescription, sealSessionDescription } from "@/lib/p2p/client-signal";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const CONNECT_TIMEOUT_MS = 25_000;
const DISCONNECT_GRACE_MS = 5_000;
const CROSSED_OFFER_WAIT_MS = 12_000;
const RECEIVE_WINDOW_MS = 10_000;
const MAX_RECEIVE_PER_WINDOW = 20;
const MAX_TRANSCRIPT_ITEMS = 100;

type RoomPhase =
  | "consent"
  | "preparing"
  | "waiting"
  | "negotiating"
  | "connecting"
  | "verifying"
  | "connected"
  | "failed"
  | "ended";

type TranscriptItem = TextFrame & { direction: "sent" | "received" };

type PendingNegotiation = {
  identity: BrowserIdentity;
  session: ClientSession;
  signal: AbortSignal;
  run: number;
};

type PeerSummary = {
  userId: string;
  username: string;
  name: string;
};

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(finish, milliseconds);
    function finish() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function describeFailure(error: unknown): string {
  if (error instanceof P2PApiError) {
    switch (error.code) {
      case "peer_offline":
      case "peer_unavailable":
        return "@peer is not online in Live Messages yet.";
      case "session_expired":
      case "session_not_found":
        return "This live request expired. Start a new one from Messages.";
      case "device_mismatch":
      case "device_changed":
        return "A messaging device changed while connecting. Start a new request and check the safety code.";
      case "device_replacement_confirmation_required":
        return "Another browser is already registered for live messages. Return to Messages to explicitly replace it, or use the existing browser.";
      case "p2p_disabled":
        return "Live messaging is not enabled on this deployment.";
      default:
        if (error.status === 404) return "The live request is no longer available.";
    }
  }
  if (error instanceof BrowserP2PError) return error.message;
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "The browser refused the direct connection.";
  }
  return "The direct connection could not be established.";
}

function replacePeerPlaceholder(message: string, username: string): string {
  return message.replace("@peer", `@${username}`);
}

function connectionStatus(phase: RoomPhase, peer: string): string {
  switch (phase) {
    case "preparing": return "Preparing this browser's protected device keys…";
    case "waiting": return `Waiting for @${peer} to answer…`;
    case "negotiating": return "Authenticating encrypted connection details…";
    case "connecting": return "Attempting a direct, STUN-only connection…";
    case "verifying": return "Compare and confirm the device safety code before Echo starts a direct connection.";
    case "connected": return "Direct connection open. Messages are not being stored.";
    case "ended": return "The direct connection ended. Its messages were cleared.";
    case "failed": return "The direct connection failed.";
    default: return "";
  }
}

export default function LiveRoom({
  selfUserId,
  peer,
}: {
  selfUserId: string;
  peer: PeerSummary;
}) {
  const [phase, setPhase] = useState<RoomPhase>("consent");
  const [failure, setFailure] = useState<string | null>(null);
  const [safetyCode, setSafetyCode] = useState<string | null>(null);
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null);
  const [safetyCompared, setSafetyCompared] = useState(false);
  const [trusted, setTrusted] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const closingRef = useRef(false);
  const runRef = useRef(0);
  const identityRef = useRef<BrowserIdentity | null>(null);
  const sessionRef = useRef<ClientSession | null>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const heartbeatRef = useRef<number | undefined>(undefined);
  const connectTimeoutRef = useRef<number | undefined>(undefined);
  const disconnectTimeoutRef = useRef<number | undefined>(undefined);
  const purgeTimeoutRef = useRef<number | undefined>(undefined);
  const purgeAttemptsRef = useRef(0);
  const purgeInFlightRef = useRef(false);
  const receiveTimesRef = useRef<number[]>([]);
  const receivedIdsRef = useRef(new Set<string>());
  const receivedIdOrderRef = useRef<string[]>([]);
  const trustedRef = useRef(false);
  const pendingNegotiationRef = useRef<PendingNegotiation | null>(null);
  const preparedCloseRef = useRef<PreparedCloseRequest | null>(null);
  const signalingPurgedRef = useRef(false);

  const closeTransport = useCallback((notifyServer: boolean) => {
    closingRef.current = true;
    controllerRef.current?.abort();
    controllerRef.current = null;
    window.clearInterval(heartbeatRef.current);
    window.clearTimeout(connectTimeoutRef.current);
    window.clearTimeout(disconnectTimeoutRef.current);
    window.clearTimeout(purgeTimeoutRef.current);
    heartbeatRef.current = undefined;
    connectTimeoutRef.current = undefined;
    disconnectTimeoutRef.current = undefined;
    purgeTimeoutRef.current = undefined;
    purgeInFlightRef.current = false;

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      try { channel.close(); } catch {}
    }
    const connection = connectionRef.current;
    connectionRef.current = null;
    if (connection) {
      connection.onconnectionstatechange = null;
      connection.oniceconnectionstatechange = null;
      connection.ondatachannel = null;
      connection.ontrack = null;
      try { connection.close(); } catch {}
    }

    const identity = identityRef.current;
    const session = sessionRef.current;
    const preparedClose = preparedCloseRef.current;
    preparedCloseRef.current = null;
    if (notifyServer && !signalingPurgedRef.current && preparedClose) {
      // The request starts synchronously. This matters during pagehide, when
      // there may be no time left to create a fresh Web Crypto signature.
      void sendPreparedCloseLiveSession(preparedClose, { keepalive: true }).catch(() => {});
      signalingPurgedRef.current = true;
    } else if (notifyServer && !signalingPurgedRef.current && identity && session) {
      void closeLiveSession(identity, session.id, { keepalive: true }).catch(() => {});
      signalingPurgedRef.current = true;
    }
    sessionRef.current = null;
    pendingNegotiationRef.current = null;
    receiveTimesRef.current = [];
    receivedIdsRef.current.clear();
    receivedIdOrderRef.current = [];
    if (mountedRef.current) {
      setChannelOpen(false);
      setTranscript([]);
      setDraft("");
      setSafetyCode(null);
      setPinStatus(null);
      setSafetyCompared(false);
      setTrusted(false);
      trustedRef.current = false;
    }
  }, []);

  const fail = useCallback((message: string) => {
    if (!mountedRef.current || closingRef.current) return;
    setFailure(message);
    setPhase("failed");
    closeTransport(true);
  }, [closeTransport]);

  const appendTranscript = useCallback((item: TranscriptItem) => {
    setTranscript((current) => [...current, item].slice(-MAX_TRANSCRIPT_ITEMS));
  }, []);

  const purgeSignaling = useCallback(function attemptPurge() {
    const prepared = preparedCloseRef.current;
    if (!prepared || signalingPurgedRef.current || purgeInFlightRef.current || closingRef.current) return;
    purgeInFlightRef.current = true;
    void sendPreparedCloseLiveSession(prepared, { keepalive: true }).then(() => {
      purgeInFlightRef.current = false;
      signalingPurgedRef.current = true;
      preparedCloseRef.current = null;
      purgeAttemptsRef.current = 0;
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
    }).catch(() => {
      purgeInFlightRef.current = false;
      purgeAttemptsRef.current += 1;
      if (purgeAttemptsRef.current <= 3 && !closingRef.current) {
        const retryMs = Math.min(10_000, 1_500 * 2 ** (purgeAttemptsRef.current - 1));
        window.clearTimeout(purgeTimeoutRef.current);
        purgeTimeoutRef.current = window.setTimeout(attemptPurge, retryMs);
      }
    });
  }, []);

  const attachChannel = useCallback((channel: RTCDataChannel) => {
    if (channelRef.current && channelRef.current !== channel) {
      try { channel.close(); } catch {}
      fail("The peer attempted to open an unsupported extra data channel.");
      return;
    }
    try {
      configureDataChannel(channel);
    } catch (error) {
      fail(describeFailure(error));
      return;
    }
    channelRef.current = channel;
    channel.onopen = () => {
      if (!mountedRef.current || closingRef.current) return;
      window.clearTimeout(connectTimeoutRef.current);
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
      setChannelOpen(true);
      setPhase(trustedRef.current ? "connected" : "verifying");
      // Negotiation is complete. Purge the relayed SDP immediately; the
      // established peer connection does not depend on the signaling row.
      purgeSignaling();
    };
    channel.onmessage = (event) => {
      if (!mountedRef.current || closingRef.current) return;
      try {
        const now = Date.now();
        receiveTimesRef.current = receiveTimesRef.current.filter((time) => now - time <= RECEIVE_WINDOW_MS);
        if (receiveTimesRef.current.length >= MAX_RECEIVE_PER_WINDOW) {
          throw new BrowserP2PError("invalid_message", "The peer exceeded the live-message rate limit.");
        }
        receiveTimesRef.current.push(now);
        const frame = parseTextFrame(event.data);
        if (receivedIdsRef.current.has(frame.id)) {
          throw new BrowserP2PError("invalid_message", "The peer replayed a message frame.");
        }
        receivedIdsRef.current.add(frame.id);
        receivedIdOrderRef.current.push(frame.id);
        if (receivedIdOrderRef.current.length > 200) {
          const oldest = receivedIdOrderRef.current.shift();
          if (oldest) receivedIdsRef.current.delete(oldest);
        }
        if (!trustedRef.current) return;
        appendTranscript({ ...frame, direction: "received" });
      } catch (error) {
        fail(error instanceof Error ? error.message : "The peer sent invalid data.");
      }
    };
    channel.onerror = () => fail("The direct data channel encountered an error.");
    channel.onclose = () => {
      if (!mountedRef.current || closingRef.current) return;
      setPhase("ended");
      closeTransport(true);
    };
  }, [appendTranscript, closeTransport, fail, purgeSignaling]);

  const attachConnection = useCallback((connection: RTCPeerConnection) => {
    connectionRef.current = connection;
    const inspectState = () => {
      if (closingRef.current || !mountedRef.current) return;
      if (connection.connectionState === "failed" || connection.iceConnectionState === "failed") {
        fail("A direct STUN-only connection could not be established on these networks.");
        return;
      }
      if (connection.connectionState === "disconnected") {
        window.clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = window.setTimeout(() => {
          if (connection.connectionState === "disconnected") {
            fail("The direct connection was interrupted.");
          }
        }, DISCONNECT_GRACE_MS);
      } else if (connection.connectionState === "connected") {
        window.clearTimeout(disconnectTimeoutRef.current);
      }
    };
    connection.onconnectionstatechange = inspectState;
    connection.oniceconnectionstatechange = inspectState;
    connection.ontrack = (event) => {
      event.track.stop();
      fail("The peer attempted to negotiate unsupported media.");
    };
  }, [fail]);

  const assertNoMediaReceivers = useCallback((connection: RTCPeerConnection) => {
    if (connection.getTransceivers().length !== 0 ||
        connection.getReceivers().some((receiver) => receiver.track && receiver.track.readyState !== "ended")) {
      throw new BrowserP2PError("channel_unavailable", "The peer attempted to negotiate unsupported media.");
    }
  }, []);

  const waitForSignal = useCallback(async (
    identity: BrowserIdentity,
    session: ClientSession,
    phaseToFind: SignalPhase,
    signal: AbortSignal,
  ): Promise<SignalEnvelope> => {
    let transientFailures = 0;
    let pollDelay = POLL_INTERVAL_MS;
    while (!signal.aborted) {
      if (Date.now() >= Date.parse(session.expiresAt)) {
        throw new P2PApiError(410, "session_expired");
      }
      if (document.visibilityState !== "visible") {
        await delay(POLL_INTERVAL_MS, signal);
        continue;
      }
      try {
        const items = await readInbox(identity, signal);
        const item = items.find((candidate) =>
          candidate.session.id === session.id &&
          candidate.session.peer.userId === session.peer.userId &&
          candidate.signal?.phase === phaseToFind,
        );
        const envelope = item?.signal;
        if (envelope?.phase === phaseToFind) return envelope;
        transientFailures = 0;
        pollDelay = Math.min(MAX_POLL_INTERVAL_MS, Math.ceil(pollDelay * 1.7));
      } catch (error) {
        if (error instanceof P2PApiError && error.status >= 500 && transientFailures < 2) {
          transientFailures += 1;
          pollDelay = Math.min(MAX_POLL_INTERVAL_MS, Math.ceil(pollDelay * 2));
        } else {
          throw error;
        }
      }
      const jitteredDelay = Math.max(POLL_INTERVAL_MS, Math.round(pollDelay * (0.85 + Math.random() * 0.3)));
      await delay(jitteredDelay, signal);
    }
    throw new DOMException("Aborted", "AbortError");
  }, []);

  const preparePeerTrust = useCallback(async (
    session: ClientSession,
    run: number,
    signal: AbortSignal,
  ): Promise<PinStatus | null> => {
    const [status, codeBytes] = await Promise.all([
      peerPinStatus(session.peer.userId, session.peer.deviceId, session.peer.fingerprint),
      safetyCodeBytes(session.self, session.peer),
    ]);
    if (!mountedRef.current || run !== runRef.current || signal.aborted) return null;
    const code = formatSafetyCode(codeBytes);
    setPinStatus(status);
    setSafetyCode(code);
    trustedRef.current = status.status === "trusted";
    setTrusted(status.status === "trusted");
    return status;
  }, []);

  const beginHeartbeat = useCallback((identity: BrowserIdentity) => {
    window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      if (document.visibilityState !== "visible" || closingRef.current) return;
      void publishPresence(identity).catch(() => {});
      const session = sessionRef.current;
      if (session && !signalingPurgedRef.current) {
        void prepareCloseLiveSession(identity, session.id).then((prepared) => {
          if (sessionRef.current?.id === session.id && !signalingPurgedRef.current) {
            preparedCloseRef.current = prepared;
          }
        }).catch(() => {});
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, []);

  const assertNegotiationActive = useCallback((run: number, signal: AbortSignal) => {
    if (run !== runRef.current || signal.aborted || closingRef.current) {
      throw new DOMException("Aborted", "AbortError");
    }
  }, []);

  const runCaller = useCallback(async (
    identity: BrowserIdentity,
    session: ClientSession,
    signal: AbortSignal,
    run: number,
  ) => {
    assertNegotiationActive(run, signal);
    const connection = createPeerConnection();
    attachConnection(connection);
    connection.ondatachannel = (event) => {
      try { event.channel.close(); } catch {}
      fail("The peer attempted to open an unsupported extra data channel.");
    };
    const channel = createInitiatorDataChannel(connection);
    attachChannel(channel);
    const offer = await connection.createOffer();
    assertNegotiationActive(run, signal);
    await connection.setLocalDescription(offer);
    const gatheredOffer = await waitForIceGathering(connection);
    assertNegotiationActive(run, signal);
    const offerEnvelope = await sealSessionDescription(identity, session, "offer", gatheredOffer);
    assertNegotiationActive(run, signal);
    await postSignalEnvelope(session.id, offerEnvelope, signal);
    assertNegotiationActive(run, signal);
    if (mountedRef.current) setPhase("waiting");

    const answerEnvelope = await waitForSignal(identity, session, "answer", signal);
    assertNegotiationActive(run, signal);
    if (mountedRef.current) setPhase("negotiating");
    const offerHash = await signalEnvelopeHash(offerEnvelope);
    const answer = await openSessionDescription(identity, session, answerEnvelope, "answer", offerHash);
    assertNegotiationActive(run, signal);
    await connection.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
    assertNoMediaReceivers(connection);
    if (mountedRef.current) setPhase("connecting");
  }, [assertNegotiationActive, assertNoMediaReceivers, attachChannel, attachConnection, fail, waitForSignal]);

  const runCallee = useCallback(async (
    identity: BrowserIdentity,
    session: ClientSession,
    signal: AbortSignal,
    run: number,
  ) => {
    assertNegotiationActive(run, signal);
    if (mountedRef.current) setPhase("waiting");
    const offerEnvelope = await waitForSignal(identity, session, "offer", signal);
    assertNegotiationActive(run, signal);
    if (mountedRef.current) setPhase("negotiating");
    // A callee may have opened the CREATED identity-check invitation before
    // the caller posted an offer. Claim only after that offer is present, then
    // continue with the same already verified device identities.
    const claimedSession = session.state === "claimed"
      ? session
      : await claimLiveSession(identity, session.id, signal);
    assertNegotiationActive(run, signal);
    sessionRef.current = claimedSession;
    const offer = await openSessionDescription(identity, claimedSession, offerEnvelope, "offer");
    assertNegotiationActive(run, signal);

    const connection = createPeerConnection();
    attachConnection(connection);
    connection.ondatachannel = (event) => attachChannel(event.channel);
    await connection.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
    assertNoMediaReceivers(connection);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    const gatheredAnswer = await waitForIceGathering(connection);
    assertNegotiationActive(run, signal);
    const offerHash = await signalEnvelopeHash(offerEnvelope);
    const answerEnvelope = await sealSessionDescription(identity, claimedSession, "answer", gatheredAnswer, offerHash);
    assertNegotiationActive(run, signal);
    await postSignalEnvelope(claimedSession.id, answerEnvelope, signal);
    if (mountedRef.current) setPhase("connecting");
  }, [assertNegotiationActive, assertNoMediaReceivers, attachChannel, attachConnection, waitForSignal]);

  const beginNegotiation = useCallback(async (pending: PendingNegotiation) => {
    const { identity, session, signal, run } = pending;
    try {
      if (run !== runRef.current || signal.aborted || closingRef.current) return;
      if (session.role === "caller") {
        await runCaller(identity, session, signal, run);
      } else {
        await runCallee(identity, session, signal, run);
      }
      if (run !== runRef.current || signal.aborted || closingRef.current) return;
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = window.setTimeout(() => {
        if (channelRef.current?.readyState !== "open") {
          fail("A direct STUN-only connection could not be established on these networks.");
        }
      }, CONNECT_TIMEOUT_MS);
    } catch (error) {
      if (signal.aborted || run !== runRef.current ||
          (error instanceof DOMException && error.name === "AbortError")) return;
      fail(replacePeerPlaceholder(describeFailure(error), peer.username));
    }
  }, [fail, peer.username, runCallee, runCaller]);

  const start = useCallback(async () => {
    const run = ++runRef.current;
    closingRef.current = false;
    setFailure(null);
    setSafetyCompared(false);
    setPinStatus(null);
    setSafetyCode(null);
    setTrusted(false);
    trustedRef.current = false;
    setTranscript([]);
    setPhase("preparing");
    signalingPurgedRef.current = false;
    preparedCloseRef.current = null;
    purgeAttemptsRef.current = 0;
    purgeInFlightRef.current = false;
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const registered = await prepareBrowserDevice(selfUserId, { abortSignal: controller.signal });
      if (run !== runRef.current || controller.signal.aborted) return;
      identityRef.current = registered.identity;
      await publishPresence(registered.identity, controller.signal);

      const inbox = await readInbox(registered.identity, controller.signal);
      const incoming = inbox.find((item) =>
        item.session.role === "callee" &&
        item.session.peer.userId === peer.userId,
      );
      let session: ClientSession;
      if (incoming) {
        session = incoming.signal?.phase === "offer"
          ? await claimLiveSession(registered.identity, incoming.session.id, controller.signal)
          : incoming.session;
      } else {
        try {
          session = await createLiveSession(registered.identity, peer.username, controller.signal);
        } catch (error) {
          const conflict = error instanceof P2PApiError && [
            "active_session_exists",
            "session_already_exists",
            "session_conflict",
          ].includes(error.code);
          if (!conflict) throw error;
          // If both people initiate at once, the database admits one session.
          // The callee can now see its CREATED identity-check invitation before
          // SDP exists, so wait for that bounded pre-connection state rather
          // than treating the collision as a connection failure.
          const deadline = Date.now() + CROSSED_OFFER_WAIT_MS;
          let racedIncoming: Awaited<ReturnType<typeof readInbox>>[number] | undefined;
          while (!racedIncoming && Date.now() < deadline) {
            const refreshed = await readInbox(registered.identity, controller.signal);
            racedIncoming = refreshed.find((item) =>
              item.session.role === "callee" &&
              item.session.peer.userId === peer.userId,
            );
            if (!racedIncoming && Date.now() < deadline) {
              await delay(Math.min(POLL_INTERVAL_MS, deadline - Date.now()), controller.signal);
            }
          }
          if (!racedIncoming) throw error;
          session = racedIncoming.signal?.phase === "offer"
            ? await claimLiveSession(registered.identity, racedIncoming.session.id, controller.signal)
            : racedIncoming.session;
        }
      }
      if (run !== runRef.current || controller.signal.aborted) return;
      if (session.self.userId !== selfUserId ||
          session.self.deviceId !== registered.identity.deviceId ||
          session.peer.userId !== peer.userId ||
          session.peer.username.toLowerCase() !== peer.username.toLowerCase()) {
        throw new TypeError("session_identity_mismatch");
      }
      sessionRef.current = session;
      preparedCloseRef.current = await prepareCloseLiveSession(registered.identity, session.id);
      const pin = await preparePeerTrust(session, run, controller.signal);
      if (!pin || run !== runRef.current || controller.signal.aborted) return;
      beginHeartbeat(registered.identity);
      const pending: PendingNegotiation = {
        identity: registered.identity,
        session,
        signal: controller.signal,
        run,
      };
      if (pin.status === "trusted") {
        await beginNegotiation(pending);
      } else {
        // No offer, ICE candidate gathering, remote SDP application, or answer
        // creation occurs until the human has compared the safety code outside
        // Echo and explicitly continues.
        pendingNegotiationRef.current = pending;
        if (mountedRef.current) setPhase("verifying");
      }
    } catch (error) {
      if (controller.signal.aborted || run !== runRef.current ||
          (error instanceof DOMException && error.name === "AbortError")) return;
      fail(replacePeerPlaceholder(describeFailure(error), peer.username));
    }
  }, [
    beginNegotiation,
    beginHeartbeat,
    fail,
    peer.userId,
    peer.username,
    preparePeerTrust,
    selfUserId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    const pageHide = () => {
      runRef.current += 1;
      closeTransport(true);
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A restored back/forward-cache snapshot must never revive a transcript
      // or a direct transport from before the page was hidden.
      runRef.current += 1;
      closeTransport(true);
      setFailure("This live session was cleared after browser history restoration.");
      setPhase("ended");
    };
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      closeTransport(true);
    };
  }, [closeTransport]);

  const acceptPeer = async () => {
    const session = sessionRef.current;
    const pending = pendingNegotiationRef.current;
    if (!session || !pending || pending.session.id !== session.id || !safetyCompared) return;
    // Claim this one-shot work item before any asynchronous IndexedDB call so
    // a double-click or key repeat cannot launch two peer connections.
    pendingNegotiationRef.current = null;
    setSafetyCompared(false);
    try {
      const savedPin = await trustPeer(
        session.peer.userId,
        session.peer.deviceId,
        session.peer.fingerprint,
      );
      if (
        pending.run !== runRef.current || pending.signal.aborted || closingRef.current ||
        sessionRef.current?.id !== session.id
      ) return;
      if (pending.run !== runRef.current || pending.signal.aborted || closingRef.current) return;
      trustedRef.current = true;
      setTrusted(true);
      setPinStatus({ status: "trusted", pin: savedPin });
      void beginNegotiation(pending);
    } catch {
      if (pending.run === runRef.current && !pending.signal.aborted && !closingRef.current) {
        pendingNegotiationRef.current = pending;
        setFailure("This browser could not save the trusted device fingerprint.");
      }
    }
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const channel = channelRef.current;
    if (!channel || !trusted || !channelOpen || !draft.trim()) return;
    try {
      const frame = createTextFrame(draft);
      sendTextFrame(channel, frame);
      appendTranscript({ ...frame, direction: "sent" });
      setDraft("");
      setSendError(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "The message could not be sent.");
    }
  };

  const end = () => {
    runRef.current += 1;
    closeTransport(true);
    setPhase("ended");
  };

  if (phase === "consent") {
    return (
      <ConsentPanel
        actionLabel={`Connect to @${peer.username}`}
        onAccept={() => void start()}
      />
    );
  }

  const utf8Length = new TextEncoder().encode(draft).byteLength;
  const canCompose = phase === "connected" && channelOpen && trusted;

  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold">Live with @{peer.username}</h1>
            <p className="text-xs text-white/55">{peer.name} · text only · no history</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/messages" className="rounded-full border border-white/15 px-3 py-2 text-sm hover:bg-white/10">Back</Link>
            {!["failed", "ended"].includes(phase) && (
              <button type="button" onClick={end} className="rounded-full border border-red-400/30 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10">
                End
              </button>
            )}
          </div>
        </header>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-sm" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "connected" ? "bg-emerald-400" : phase === "failed" ? "bg-red-400" : phase === "ended" ? "bg-white/30" : "bg-amber-400"}`} />
            <span>{connectionStatus(phase, peer.username)}</span>
          </div>
          {failure && <div role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{failure}</div>}
          {failure?.includes("Return to Messages") && (
            <Link href="/messages" className="mt-3 inline-block text-sm font-semibold text-sky-200 hover:underline">Manage live-message browser</Link>
          )}
          {(phase === "failed" || phase === "ended") && (
            <button type="button" className="btn-primary mt-4" onClick={() => void start()}>Start a new request</button>
          )}
        </div>
      </section>

      {safetyCode && (
        <section className="panel p-5" aria-labelledby="safety-code-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="safety-code-heading" className="font-semibold">Device safety code</h2>
              <p className="mt-1 text-sm text-white/60">
                Compare every group with @{peer.username} outside Echo. This code is not secret; an independent match helps detect a signaling-server impersonation.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${trusted ? "border-emerald-400/30 text-emerald-200" : pinStatus?.status === "changed" ? "border-red-400/40 text-red-200" : "border-amber-400/40 text-amber-200"}`}>
              {trusted ? "trusted device" : pinStatus?.status === "changed" ? "device changed" : "new device"}
            </span>
          </div>
          <div className="mt-4 select-all rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-sm leading-7 tracking-wide">
            {safetyCode}
          </div>
          {!trusted && (
            <div className={`mt-4 rounded-xl border p-3 ${pinStatus?.status === "changed" ? "border-red-400/40 bg-red-400/10" : "border-amber-400/30 bg-amber-400/10"}`}>
              {pinStatus?.status === "changed" ? (
                <p className="text-sm text-red-100">
                  This is not the device you trusted previously. Old fingerprint: <span className="font-mono">{pinStatus.pin.fingerprint.slice(0, 16)}</span>. Confirm the new safety code before replacing it.
                </p>
              ) : (
                <p className="text-sm text-amber-100">This is the first time this browser has seen @{peer.username}&apos;s device.</p>
              )}
              <p className="mt-3 text-sm text-white/75">
                Echo will not create or apply connection details until you confirm an out-of-band comparison. This prevents an unverified device from receiving a direct-network attempt.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-white/85">
                <input
                  type="checkbox"
                  checked={safetyCompared}
                  onChange={(event) => setSafetyCompared(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>I compared all five groups with @{peer.username} outside Echo.</span>
              </label>
              <button
                type="button"
                onClick={() => void acceptPeer()}
                disabled={!safetyCompared || !pendingNegotiationRef.current}
                className="mt-3 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pinStatus?.status === "changed" ? "Replace trusted device and continue" : "Trust device and continue"}
              </button>
            </div>
          )}
        </section>
      )}

      {trusted && (
        <section className="panel overflow-hidden">
          <div className="min-h-64 space-y-3 p-4" aria-live="polite" aria-label="Ephemeral live messages">
            {transcript.length === 0 ? (
              <p className="py-12 text-center text-sm text-white/50">
                {canCompose ? "Connected. Messages vanish when this connection closes." : "Waiting for the direct channel…"}
              </p>
            ) : transcript.map((message) => (
              <div key={message.id} className={`flex ${message.direction === "sent" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm [overflow-wrap:anywhere] ${message.direction === "sent" ? "bg-sky-500/30" : "bg-white/10"}`}>
                  {message.text}
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="border-t border-white/10 p-4">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, MAX_TEXT_CHARACTERS))}
              disabled={!canCompose}
              rows={3}
              maxLength={MAX_TEXT_CHARACTERS}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={canCompose ? "Write a live text message…" : "Waiting for a trusted direct connection…"}
              className="w-full resize-none rounded-xl border border-white/15 bg-black/25 p-3 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className={`text-xs ${utf8Length > MAX_TEXT_UTF8_BYTES ? "text-red-300" : "text-white/50"}`}>
                {utf8Length}/{MAX_TEXT_UTF8_BYTES} UTF-8 bytes
              </div>
              <button
                type="submit"
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canCompose || !draft.trim() || utf8Length > MAX_TEXT_UTF8_BYTES}
              >
                Send
              </button>
            </div>
            {sendError && <p role="alert" className="mt-2 text-sm text-red-300">{sendError}</p>}
          </form>
        </section>
      )}

      <p className="px-2 text-center text-xs text-white/45">
        WebRTC encrypts this direct data channel. Echo cannot recover messages after it closes.
      </p>
    </div>
  );
}
