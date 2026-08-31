export const TEXT_FRAME_PROTOCOL_VERSION = 1 as const;
export const TEXT_FRAME_MAX_CHARACTERS = 2_000;
export const TEXT_FRAME_MAX_UTF8_BYTES = 4 * 1024;
export const TEXT_FRAME_MAX_ENCODED_BYTES = 8 * 1024;

export type TextFrame = {
  v: typeof TEXT_FRAME_PROTOCOL_VERSION;
  type: "text";
  id: string;
  text: string;
};

export class P2PFrameError extends TypeError {
  readonly code: "invalid_message" | "message_too_large";

  constructor(code: "invalid_message" | "message_too_large", message: string) {
    super(message);
    this.name = "P2PFrameError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function hasDisallowedControlCharacter(text: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000d\u000e-\u001f\u007f]/u.test(text);
}

function hasLoneSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function normalizeOutgoingText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function validateMessageText(text: unknown): text is string {
  if (typeof text !== "string" || text.length === 0 || Array.from(text).length > TEXT_FRAME_MAX_CHARACTERS) {
    return false;
  }
  if (hasDisallowedControlCharacter(text) || hasLoneSurrogate(text)) return false;
  return new TextEncoder().encode(text).byteLength <= TEXT_FRAME_MAX_UTF8_BYTES;
}

export function createTextFrame(text: string, id = crypto.randomUUID()): TextFrame {
  const normalized = normalizeOutgoingText(text);
  if (!UUID_PATTERN.test(id) || !validateMessageText(normalized)) {
    throw new P2PFrameError("invalid_message", "Messages must be valid text between 1 byte and 4 KiB.");
  }
  return {
    v: TEXT_FRAME_PROTOCOL_VERSION,
    type: "text",
    id,
    text: normalized,
  };
}

export function serializeTextFrame(frame: TextFrame): string {
  const serialized = JSON.stringify(frame);
  if (new TextEncoder().encode(serialized).byteLength > TEXT_FRAME_MAX_ENCODED_BYTES) {
    throw new P2PFrameError("message_too_large", "The encoded message is too large.");
  }
  return serialized;
}

export function parseTextFrame(value: unknown): TextFrame {
  if (typeof value !== "string") {
    throw new P2PFrameError("invalid_message", "Only text frames are accepted.");
  }
  if (new TextEncoder().encode(value).byteLength > TEXT_FRAME_MAX_ENCODED_BYTES) {
    throw new P2PFrameError("message_too_large", "The encoded message is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new P2PFrameError("invalid_message", "The peer sent invalid message data.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new P2PFrameError("invalid_message", "The peer sent an invalid message frame.");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "id,text,type,v" ||
      record.v !== TEXT_FRAME_PROTOCOL_VERSION ||
      record.type !== "text" ||
      typeof record.id !== "string" ||
      !UUID_PATTERN.test(record.id) ||
      !validateMessageText(record.text)) {
    throw new P2PFrameError("invalid_message", "The peer sent an invalid message frame.");
  }
  return record as TextFrame;
}
