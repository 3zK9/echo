"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ConsentPanel from "@/components/p2p/ConsentPanel";
import {
  P2PApiError,
  prepareBrowserDevice,
  publishPresence,
  readInbox,
  type BrowserIdentity,
  type InboxItem,
} from "@/lib/p2p/browser";
import { normalizeGithubUsername } from "@/lib/p2p/protocol";

const POLL_INTERVAL_MS = 2_500;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_POLL_INTERVAL_MS = 15_000;

function describeError(error: unknown): string {
  if (error instanceof P2PApiError) {
    if (error.code === "peer_offline" || error.code === "peer_unavailable") return "That person is not currently available for a live connection.";
    if (error.code === "device_replacement_confirmation_required") {
      return "Another browser is already registered for live messages. Echo will not replace its device keys automatically.";
    }
    if (error.status === 404 || error.code === "p2p_disabled") return "Live messaging is not enabled on this deployment.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "This browser could not go online for live messages.";
}

export default function MessagesLobby({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<"offline" | "preparing" | "online" | "error">("offline");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [ownFingerprint, setOwnFingerprint] = useState<string | null>(null);
  const [replacementRequired, setReplacementRequired] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    let lastHeartbeat = 0;
    let running = false;
    let identity: BrowserIdentity | null = null;
    let pollDelay = POLL_INTERVAL_MS;

    const schedule = (milliseconds: number) => {
      if (!active) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, milliseconds);
    };

    const tick = async () => {
      if (!active || running) return;
      if (document.visibilityState !== "visible") {
        schedule(POLL_INTERVAL_MS);
        return;
      }
      running = true;
      try {
        if (!identity) {
          const registered = await prepareBrowserDevice(userId, {
            abortSignal: controller.signal,
            replaceExisting,
          });
          if (!active) return;
          identity = registered.identity;
          setOwnFingerprint(registered.device.fingerprint);
          if (replaceExisting) {
            setReplacementRequired(false);
            setReplacementConfirmed(false);
            setReplaceExisting(false);
          }
        }
        if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
          await publishPresence(identity, controller.signal);
          lastHeartbeat = Date.now();
        }
        const items = await readInbox(identity, controller.signal);
        if (!active) return;
        const incoming = items.filter((item) => item.session.role === "callee");
        setInbox(incoming);
        pollDelay = incoming.length > 0
          ? POLL_INTERVAL_MS
          : Math.min(MAX_POLL_INTERVAL_MS, Math.ceil(pollDelay * 1.7));
        setStatus("online");
        setError(null);
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setStatus("error");
        setError(describeError(caught));
        setReplacementRequired(caught instanceof P2PApiError &&
          caught.code === "device_replacement_confirmation_required");
        if (caught instanceof P2PApiError && caught.status < 500) {
          active = false;
          return;
        }
        pollDelay = Math.min(MAX_POLL_INTERVAL_MS, Math.ceil(pollDelay * 2));
      } finally {
        running = false;
        if (active) schedule(Math.max(POLL_INTERVAL_MS, Math.round(pollDelay * (0.85 + Math.random() * 0.3))));
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, replaceExisting, userId]);

  const uniqueInbox = useMemo(() => {
    const sessions = new Map<string, InboxItem>();
    for (const item of inbox) sessions.set(item.session.id, item);
    return [...sessions.values()];
  }, [inbox]);

  const openRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const normalized = normalizeGithubUsername(target);
      if (normalized === username.toLowerCase()) {
        setTargetError("Choose another Echo user.");
        return;
      }
      setTargetError(null);
      router.push(`/messages/${encodeURIComponent(normalized)}`);
    } catch {
      setTargetError("Enter a valid GitHub username.");
    }
  };

  const replaceBrowserDevice = () => {
    if (!replacementConfirmed) return;
    // The server verifies that this bit was included in the signature before
    // it replaces keys and closes any pending signaling sessions.
    setError(null);
    setStatus("preparing");
    setReplacementRequired(false);
    setReplaceExisting(true);
  };

  if (!enabled) {
    return <ConsentPanel actionLabel="Go online" onAccept={() => { setStatus("preparing"); setEnabled(true); }} />;
  }

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Live messages</h1>
            <p className="mt-1 text-sm text-white/65">No inbox history is stored. Keep this page visible to receive a request.</p>
          </div>
          <div className="text-right text-xs text-white/60">
            <div className="flex items-center justify-end gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${status === "online" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-amber-400"}`} />
              <span>{status === "online" ? "Online" : status === "error" ? "Connection error" : "Preparing identity…"}</span>
            </div>
            {ownFingerprint && <div className="mt-1 font-mono">device {ownFingerprint.slice(0, 12)}</div>}
          </div>
        </div>
        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            <p>{error}</p>
            {replacementRequired && (
              <div className="mt-4 rounded-xl border border-red-200/20 bg-black/15 p-3 text-sm text-red-100">
                <p>
                  Replacing the registered browser changes your live-message fingerprint, closes pending connection requests, and requires contacts to verify you again.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-red-100/90">
                  <input
                    type="checkbox"
                    checked={replacementConfirmed}
                    onChange={(event) => setReplacementConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>I understand that this replaces the other browser&apos;s live-message identity.</span>
                </label>
                <button
                  type="button"
                  disabled={!replacementConfirmed}
                  className="mt-3 rounded-full border border-red-200/30 px-3 py-1.5 font-semibold hover:bg-red-200/10 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={replaceBrowserDevice}
                >
                  Replace registered browser
                </button>
              </div>
            )}
            {status === "error" && (
              <button
                type="button"
                className="mt-3 rounded-full border border-red-200/30 px-3 py-1.5 font-semibold hover:bg-red-200/10"
                onClick={() => {
                  setEnabled(false);
                  setStatus("offline");
                  setError(null);
                  setReplacementRequired(false);
                  setReplacementConfirmed(false);
                  setReplaceExisting(false);
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        <form onSubmit={openRoom} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">GitHub username</span>
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value.slice(0, 39))}
              autoComplete="off"
              spellCheck={false}
              placeholder="GitHub username"
              className="w-full rounded-full border border-white/15 bg-black/25 px-4 py-3 outline-none focus:border-sky-400"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={status !== "online"}>Start live chat</button>
        </form>
        {targetError && <p role="alert" className="mt-2 text-sm text-red-300">{targetError}</p>}
      </section>

      <section className="panel p-5" aria-live="polite">
        <h2 className="font-semibold">Incoming requests</h2>
        {uniqueInbox.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">No one is waiting to connect.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {uniqueInbox.map(({ session }) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div>
                  <div className="font-semibold">@{session.peer.username}</div>
                  <div className="text-xs text-white/55">
                    {session.state === "created" ? "Safety-code check requested" : "Ready to review"}
                    {" · "}expires {new Date(session.expiresAt).toLocaleTimeString()}
                  </div>
                </div>
                <Link
                  prefetch={false}
                  className="rounded-full border border-sky-400/40 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/10"
                  href={`/messages/${encodeURIComponent(session.peer.username)}`}
                >
                  Review request
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
