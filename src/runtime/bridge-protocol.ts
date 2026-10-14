const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 64 * 1024;

type EditMessage = {
  protocol: number;
  type: "edit";
  requestId: string;
  windowId: number;
  documentId: string;
  editorId: string;
  revision: number;
  columnId: string;
  line: number;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClientMessage(data: Buffer): EditMessage {
  if (data.byteLength > MAX_MESSAGE_BYTES) throw new Error("message-too-large");
  let value: unknown;
  try {
    value = JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error("invalid-json");
  }
  if (!isRecord(value) || value.protocol !== PROTOCOL_VERSION) throw new Error("unsupported-protocol");
  if (value.type !== "edit" || typeof value.requestId !== "string" || value.requestId.length < 1 || value.requestId.length > 128 ||
      !Number.isSafeInteger(value.windowId) || typeof value.documentId !== "string" || value.documentId.length < 1 ||
      value.documentId.length > 4096 || typeof value.editorId !== "string" || value.editorId.length < 1 ||
      value.editorId.length > 256 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
      typeof value.columnId !== "string" || value.columnId.length < 1 ||
      value.columnId.length > 256 || !Number.isSafeInteger(value.line) || Number(value.line) < 0 ||
      typeof value.value !== "string") {
    throw new Error("invalid-message");
  }
  return value as EditMessage;
}

function serializeMessage(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_MESSAGE_BYTES) throw new Error("message-too-large");
  return serialized;
}

module.exports = { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, parseClientMessage, serializeMessage };
