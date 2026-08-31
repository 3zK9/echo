const MAX_SDP_UTF8_BYTES = 24 * 1024;
const CANDIDATE_PATTERN = /^a=candidate:\S+\s+\d+\s+\S+\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\S+)(?:\s|$)/iu;
const DATA_MEDIA_LINE_PATTERN = /^m=application (\d+) ((?:UDP\/DTLS\/SCTP|DTLS\/SCTP) webrtc-datachannel)\s*$/u;
const ORIGIN_LINE_PATTERN = /^o=(\S+\s+\d+\s+\d+\s+IN\s+(IP4|IP6))\s+\S+$/iu;
const CONNECTION_LINE_PATTERN = /^c=IN\s+(IP4|IP6)\s+\S+$/iu;

export class P2PSdpError extends TypeError {
  constructor(message = "invalid_data_channel_sdp") {
    super(message);
    this.name = "P2PSdpError";
  }
}

function hasInvalidSdpText(value: string): boolean {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isValidNetworkPort(value: string): boolean {
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535;
}

/**
 * Accept only a single modern WebRTC data-channel media section. Echo never
 * asks for capture permissions and also refuses remote RTP media at the SDP
 * boundary, before setRemoteDescription can create a receiver/transceiver.
 */
export function validateDataOnlySdp(sdp: unknown): string {
  if (typeof sdp !== "string" ||
      !sdp.startsWith("v=0") ||
      hasInvalidSdpText(sdp) ||
      new TextEncoder().encode(sdp).byteLength > MAX_SDP_UTF8_BYTES) {
    throw new P2PSdpError();
  }

  const lines = sdp.split(/\r?\n/u).filter(Boolean);
  const mediaLines = lines.filter((line) => line.startsWith("m="));
  const media = mediaLines.length === 1 ? DATA_MEDIA_LINE_PATTERN.exec(mediaLines[0]) : null;
  if (!media || !isValidNetworkPort(media[1])) {
    throw new P2PSdpError();
  }
  if (!lines.some((line) => /^a=sctp-port:\d+$/u.test(line))) {
    throw new P2PSdpError();
  }
  if (lines.some((line) =>
    /^m=(?:audio|video)\b/iu.test(line) ||
    /^a=(?:msid|ssrc|rtpmap|fmtp):/iu.test(line) ||
    /^a=(?:sendrecv|sendonly|recvonly)$/iu.test(line) ||
    // These attributes can carry transport addresses but have no role in
    // Echo's single, non-RTP data channel.
    /^a=(?:remote-candidates|rtcp):/iu.test(line)
  )) {
    throw new P2PSdpError();
  }
  return sdp;
}

function isMdnsHost(address: string): boolean {
  // Modern browsers conceal local host addresses with a randomized mDNS name.
  // Preserve those candidates for same-LAN connectivity, but never relay a
  // numeric host candidate to the other participant.
  return /^[a-z0-9-]+\.local$/iu.test(address);
}

function isGlobalIpv4Literal(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/u.test(part))) {
    return false;
  }
  const values = parts.map(Number);
  if (values.some((value) => value > 255)) return false;
  const [first, second, third] = values;
  if (
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }
  return true;
}

function isGlobalIpv6Literal(address: string): boolean {
  // Candidate addresses are literal IPv6 syntax, never URI-wrapped. Global
  // unicast is 2000::/3; rejecting every other range rules out loopback,
  // link-local, ULA, multicast, IPv4-mapped, and unspecified addresses.
  // 6to4 (2002::/16) is deliberately excluded: its next 32 bits encode an
  // IPv4 address, which could be a private address and turn an apparently
  // global candidate into a local-network probe on a 6to4-capable path.
  if (!address.includes(":") || address.includes(".") || address.includes("%")) return false;
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const fields = address.split("::").flatMap((half) => half ? half.split(":") : []);
  if (fields.some((field) => !/^[0-9a-f]{1,4}$/iu.test(field))) return false;
  if ((halves.length === 1 && fields.length !== 8) || (halves.length === 2 && fields.length >= 8)) {
    return false;
  }
  const firstField = halves[0] ? halves[0].split(":")[0] : "0";
  const firstValue = Number.parseInt(firstField, 16);
  return firstValue >= 0x2000 && firstValue <= 0x3fff && firstValue !== 0x2002;
}

function isGlobalIpLiteral(address: string): boolean {
  return isGlobalIpv4Literal(address) || isGlobalIpv6Literal(address);
}

function isAnonymousConnectionLine(line: string): boolean {
  if (!/^c=/iu.test(line)) return true;
  return line === "c=IN IP4 0.0.0.0" || line === "c=IN IP6 ::";
}

function redactConnectionLine(line: string): string {
  if (!/^c=/iu.test(line)) return line;
  const match = CONNECTION_LINE_PATTERN.exec(line);
  if (!match) throw new P2PSdpError("invalid_connection_line");
  return match[1].toUpperCase() === "IP6" ? "c=IN IP6 ::" : "c=IN IP4 0.0.0.0";
}

function isAnonymousDataMediaLine(line: string): boolean {
  if (!/^m=/u.test(line)) return true;
  const match = DATA_MEDIA_LINE_PATTERN.exec(line);
  return match?.[1] === "9";
}

function redactDataMediaLine(line: string): string {
  if (!/^m=/u.test(line)) return line;
  const match = DATA_MEDIA_LINE_PATTERN.exec(line);
  if (!match || !isValidNetworkPort(match[1])) {
    throw new P2PSdpError("invalid_data_channel_section");
  }
  // RFC 8839 reserves port 9 for an anonymized default destination. The
  // actual reachable candidate/port remains in the permitted ICE candidate.
  return `m=application 9 ${match[2]}`;
}

function redactOriginLine(line: string): string {
  if (!/^o=/iu.test(line)) return line;
  const match = ORIGIN_LINE_PATTERN.exec(line);
  if (!match) throw new P2PSdpError("invalid_origin_line");
  return `o=${match[1]} ${match[2].toUpperCase() === "IP6" ? "::" : "0.0.0.0"}`;
}

function isAnonymousOriginLine(line: string): boolean {
  if (!/^o=/iu.test(line)) return true;
  return /^o=\S+\s+\d+\s+\d+\s+IN\s+IP4\s+0\.0\.0\.0$/iu.test(line) ||
    /^o=\S+\s+\d+\s+\d+\s+IN\s+IP6\s+::$/iu.test(line);
}

function candidateParts(line: string): { address: string; type: string } | null {
  const match = CANDIDATE_PATTERN.exec(line);
  if (!match || !isValidNetworkPort(match[2])) return null;
  return { address: match[1], type: match[3].toLowerCase() };
}

function relatedAddressIsPrivatePlaceholder(
  address: string,
  port: string,
  candidateAddress: string,
): boolean {
  return port === "9" && address === (candidateAddress.includes(":") ? "::" : "0.0.0.0");
}

function relatedCandidateValues(line: string): { addresses: string[]; ports: string[] } {
  return {
    addresses: [...line.matchAll(/\braddr\s+(\S+)/giu)].map((match) => match[1]),
    ports: [...line.matchAll(/\brport\s+(\d+)/giu)].map((match) => match[1]),
  };
}

function redactRelatedCandidateAddress(line: string, candidateAddress: string): string {
  const { addresses, ports } = relatedCandidateValues(line);
  if (addresses.length > 1 || ports.length > 1) {
    throw new P2PSdpError("duplicate_related_candidate");
  }
  const [relatedAddress] = addresses;
  const [relatedPort] = ports;
  if (Boolean(relatedAddress) !== Boolean(relatedPort)) {
    throw new P2PSdpError("incomplete_related_candidate");
  }
  if (!relatedAddress) return line;
  const placeholder = candidateAddress.includes(":") ? "::" : "0.0.0.0";
  // RFC 8839 requires privacy-redacted related addresses to retain raddr and
  // rport, replacing their values with 0.0.0.0/:: and 9 respectively.
  return line
    .replace(/\braddr\s+\S+/giu, `raddr ${placeholder}`)
    .replace(/\brport\s+\d+/giu, "rport 9");
}

/**
 * Remove local numeric host candidates before an offer or answer is encrypted
 * and relayed. A direct peer still learns a usable server-reflexive/public
 * candidate, so this is a local-network privacy reduction rather than IP
 * anonymity. mDNS host candidates are retained for browsers that already
 * protect the numeric address.
 */
export function redactNumericHostCandidates(sdp: string): string {
  validateDataOnlySdp(sdp);
  const hasTrailingNewline = /\r?\n$/u.test(sdp);
  const lines = sdp.split(/\r?\n/u).filter(Boolean);
  const redacted = lines.flatMap((line) => {
    const candidate = candidateParts(line);
    if (/^a=candidate:/iu.test(line) && !candidate) {
      throw new P2PSdpError("invalid_candidate");
    }
    if (candidate && (
      !["host", "srflx", "prflx"].includes(candidate.type) ||
      (candidate.type === "host" && !isMdnsHost(candidate.address)) ||
      (candidate.type !== "host" && !isGlobalIpLiteral(candidate.address))
    )) return [];
    // Related-address values can reveal the numeric host address behind a
    // server-reflexive candidate. Keep the required fields using RFC 8839's
    // privacy placeholders instead.
    return [candidate
      ? redactRelatedCandidateAddress(line, candidate.address)
      : redactOriginLine(redactConnectionLine(redactDataMediaLine(line)))];
  });
  const result = `${redacted.join("\r\n")}${hasTrailingNewline ? "\r\n" : ""}`;
  return validateDataOnlySdp(result);
}

/**
 * Reject an incoming description that carries network-address information we
 * would never relay ourselves. Unlike outbound descriptions, remote SDP is
 * not rewritten: changing a signed, encrypted payload after verification
 * would make the peer's offer/answer binding ambiguous. Failing closed also
 * prevents an otherwise authenticated peer from directing ICE probes at a
 * private host address supplied in SDP.
 */
export function assertPrivacyPreservingRemoteSdp(sdp: string): string {
  const validated = validateDataOnlySdp(sdp);
  const lines = validated.split(/\r?\n/u).filter(Boolean);
  if (lines.some((line) =>
    !isAnonymousConnectionLine(line) ||
    !isAnonymousOriginLine(line) ||
    !isAnonymousDataMediaLine(line)
  )) {
    throw new P2PSdpError("identifying_connection_address");
  }
  for (const line of lines) {
    if (!/^a=candidate:/iu.test(line)) continue;
    const candidate = candidateParts(line);
    if (!candidate) throw new P2PSdpError("invalid_candidate");
    if (!["host", "srflx", "prflx"].includes(candidate.type)) {
      throw new P2PSdpError("unsupported_candidate_type");
    }
    if (candidate.type === "host" && !isMdnsHost(candidate.address)) {
      throw new P2PSdpError("numeric_host_candidate");
    }
    if (candidate.type !== "host" && !isGlobalIpLiteral(candidate.address)) {
      throw new P2PSdpError("non_global_candidate_address");
    }
    const { addresses, ports } = relatedCandidateValues(line);
    if (addresses.length > 1 || ports.length > 1) {
      throw new P2PSdpError("duplicate_related_candidate");
    }
    const [relatedAddress] = addresses;
    const [relatedPort] = ports;
    if (Boolean(relatedAddress) !== Boolean(relatedPort)) {
      throw new P2PSdpError("incomplete_related_candidate");
    }
    if (relatedAddress && relatedPort &&
        !relatedAddressIsPrivatePlaceholder(relatedAddress, relatedPort, candidate.address)) {
      throw new P2PSdpError("related_candidate_address");
    }
  }
  return validated;
}

export function hasUsableIceCandidate(sdp: string): boolean {
  validateDataOnlySdp(sdp);
  return sdp.split(/\r?\n/u).some((line) => /^a=candidate:/iu.test(line));
}
