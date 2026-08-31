const MAX_SDP_UTF8_BYTES = 24 * 1024;

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
  if (mediaLines.length !== 1 ||
      !/^m=application \d+ (?:UDP\/DTLS\/SCTP|DTLS\/SCTP) webrtc-datachannel(?:\s|$)/u.test(mediaLines[0])) {
    throw new P2PSdpError();
  }
  if (!lines.some((line) => /^a=sctp-port:\d+$/u.test(line))) {
    throw new P2PSdpError();
  }
  if (lines.some((line) =>
    /^m=(?:audio|video)\b/iu.test(line) ||
    /^a=(?:msid|ssrc|rtpmap|fmtp):/iu.test(line) ||
    /^a=(?:sendrecv|sendonly|recvonly)$/iu.test(line)
  )) {
    throw new P2PSdpError();
  }
  return sdp;
}
