const http = require("node:http");
const { WebSocket, WebSocketServer } = require("ws");
const { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, parseClientMessage, serializeMessage } = require("./bridge-protocol");

const FIRST_PORT = 49321;
const PORT_COUNT = 64;
const CANDIDATE_COUNT = 4;
const PORT_STRIDE = 17;

function candidatePorts(token: string, windowId: number): number[] {
  let hash = 2166136261;
  for (const character of `${token}:${windowId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const start = (hash >>> 0) % PORT_COUNT;
  return Array.from({ length: CANDIDATE_COUNT }, (_, index) =>
    FIRST_PORT + ((start + index * PORT_STRIDE) % PORT_COUNT));
}

function websocketProtocol(token: string, windowId: number): string {
  return `vscode-editor-columns-v${PROTOCOL_VERSION}.${windowId}.${token}`;
}

class BridgeTransport {
  token: string;
  windowId: number;
  log: (message: string) => void;
  server?: import("node:http").Server;
  sockets = new Set<any>();
  editHandler?: (message: any) => Promise<void>;
  latestState?: unknown;
  port?: number;

  constructor(token: string, windowId: number, log = (_message: string) => undefined) {
    this.token = token;
    this.windowId = windowId;
    this.log = log;
  }

  onEdit(handler: (message: any) => Promise<void>): void {
    this.editHandler = handler;
  }

  async start(): Promise<void> {
    for (const port of candidatePorts(this.token, this.windowId)) {
      if (await this.listen(port)) {
        this.port = port;
        this.log(`Bridge WebSocket listening on ws://127.0.0.1:${port} for window ${this.windowId}.`);
        return;
      }
    }
    throw new Error(`No window-specific bridge port is available for window ${this.windowId}.`);
  }

  private listen(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = http.createServer((_request: any, response: any) => {
        response.writeHead(426, { connection: "close" });
        response.end();
      });
      const webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
      const expectedProtocol = websocketProtocol(this.token, this.windowId);
      server.on("upgrade", (request: any, socket: any, head: Buffer) => {
        if (request.headers["sec-websocket-protocol"] !== expectedProtocol) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        webSockets.handleUpgrade(request, socket, head, (webSocket: any) => {
          webSockets.emit("connection", webSocket, request);
        });
      });
      webSockets.on("connection", (socket: any) => this.accept(socket));
      const fail = () => {
        server.close();
        webSockets.close();
        resolve(false);
      };
      server.once("error", fail);
      server.once("listening", () => {
        server.off("error", fail);
        this.server = server;
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
  }

  private accept(socket: any): void {
    this.sockets.add(socket);
    this.log(`Renderer bridge connected for window ${this.windowId}.`);
    socket.once("close", () => this.sockets.delete(socket));
    socket.on("error", (error: Error) => this.log(`Renderer bridge socket error: ${error.message}`));
    socket.on("message", (data: Buffer, isBinary: boolean) => void this.receive(socket, data, isBinary));
    this.send(socket, { protocol: PROTOCOL_VERSION, type: "ready", windowId: this.windowId });
    if (this.latestState !== undefined) this.send(socket, this.latestState);
  }

  private async receive(socket: any, data: Buffer, isBinary: boolean): Promise<void> {
    try {
      if (isBinary) throw new Error("invalid-message");
      const message = parseClientMessage(data);
      if (message.windowId !== this.windowId) throw new Error("wrong-window");
      if (!this.editHandler) throw new Error("edit-handler-unavailable");
      await this.editHandler(message);
      this.send(socket, { protocol: PROTOCOL_VERSION, type: "edit-result", requestId: message.requestId, ok: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "edit-failed";
      let requestId: string | undefined;
      try { requestId = JSON.parse(data.toString("utf8"))?.requestId; } catch {}
      this.send(socket, { protocol: PROTOCOL_VERSION, type: "error", requestId, code });
      if (["message-too-large", "invalid-json", "unsupported-protocol", "invalid-message", "wrong-window"].includes(code)) {
        socket.close(1008, code.slice(0, 123));
      }
    }
  }

  publish(snapshot: unknown): void {
    this.latestState = { protocol: PROTOCOL_VERSION, type: "state", windowId: this.windowId, snapshot };
    for (const socket of this.sockets) this.send(socket, this.latestState);
  }

  private send(socket: any, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(serializeMessage(message));
  }

  dispose(): void {
    for (const socket of this.sockets) socket.close(1001, "extension-disposed");
    this.sockets.clear();
    this.server?.close();
    this.server = undefined;
  }
}

module.exports = { BridgeTransport, candidatePorts, websocketProtocol };
