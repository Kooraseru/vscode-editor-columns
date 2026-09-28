import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { WebSocket } from "ws";

const { BridgeTransport, candidatePorts, websocketProtocol } = require("../compiled/main/bridge-transport.js");
const { MAX_MESSAGE_BYTES, parseClientMessage } = require("../compiled/main/bridge-protocol.js");
const { deriveWindowIdFromLogPath } = require("../compiled/main/workbench-compatibility.js");

const received = new WeakMap();

function connect(url, protocol) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocol);
    const state = { messages: [], waiters: [] };
    received.set(socket, state);
    socket.on("message", data => {
      const message = JSON.parse(data.toString());
      const waiter = state.waiters.shift();
      if (waiter) waiter(message);
      else state.messages.push(message);
    });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      socket.terminate();
      reject(new Error(`WebSocket upgrade rejected with ${response.statusCode}.`));
    });
  });
}

function nextMessage(socket) {
  const state = received.get(socket);
  if (state.messages.length) return Promise.resolve(state.messages.shift());
  return new Promise(resolve => state.waiters.push(resolve));
}

test("VS Code log paths provide a validated per-window identity", () => {
  assert.equal(deriveWindowIdFromLogPath("C:\\logs\\window17\\exthost\\Kooraseru.vscode-editor-columns"), 17);
  assert.throws(() => deriveWindowIdFromLogPath("C:\\logs\\exthost\\extension"), /Cannot identify the VS Code window/);
  assert.throws(() => deriveWindowIdFromLogPath("C:\\logs\\window0\\exthost\\extension"), /invalid/);
});

test("candidate discovery is deterministic and bounded", () => {
  const ports = candidatePorts("token", 12);
  assert.equal(ports.length, 4);
  assert.equal(new Set(ports).size, ports.length);
  assert.deepEqual(candidatePorts("token", 12), ports);
});

test("transport authenticates and isolates window sessions", async t => {
  const token = `test-${process.pid}-${Date.now()}`;
  const transport = new BridgeTransport(token, 41);
  await transport.start();
  t.after(() => transport.dispose());
  const url = `ws://127.0.0.1:${transport.port}`;

  await assert.rejects(connect(url, websocketProtocol("wrong-token", 41)));
  await assert.rejects(connect(url, websocketProtocol(token, 42)));
  await assert.rejects(connect(url, `vscode-editor-columns-v0.41.${token}`));

  const socket = await connect(url, websocketProtocol(token, 41));
  t.after(() => socket.close());
  const ready = await nextMessage(socket);
  assert.deepEqual(ready, { protocol: 1, type: "ready", windowId: 41 });
});

test("transport pushes state while idle and acknowledges edits", async t => {
  const token = `push-${process.pid}-${Date.now()}`;
  const transport = new BridgeTransport(token, 52);
  transport.onEdit(async message => {
    assert.equal(message.value, "changed");
  });
  await transport.start();
  t.after(() => transport.dispose());
  const socket = await connect(`ws://127.0.0.1:${transport.port}`, websocketProtocol(token, 52));
  t.after(() => socket.close());
  await nextMessage(socket);

  await new Promise(resolve => setTimeout(resolve, 75));
  assert.equal(received.get(socket).messages.length, 0);

  const statePromise = nextMessage(socket);
  transport.publish({ columns: [] });
  assert.equal((await statePromise).type, "state");

  const resultPromise = nextMessage(socket);
  socket.send(JSON.stringify({ protocol: 1, type: "edit", requestId: "request-1", windowId: 52,
    documentId: "file:///one", editorId: "editor-1", revision: 3,
    columnId: "column", line: 0, value: "changed" }));
  assert.deepEqual(await resultPromise, { protocol: 1, type: "edit-result", requestId: "request-1", ok: true });
});

test("protocol rejects malformed, stale, and oversized messages", () => {
  assert.throws(() => parseClientMessage(Buffer.from("{")), /invalid-json/);
  assert.throws(() => parseClientMessage(Buffer.from(JSON.stringify({ protocol: 0, type: "edit" }))), /unsupported-protocol/);
  assert.throws(() => parseClientMessage(Buffer.alloc(MAX_MESSAGE_BYTES + 1)), /message-too-large/);
  assert.throws(() => parseClientMessage(Buffer.from(JSON.stringify({ protocol: 1, type: "edit", requestId: "x",
    windowId: 1, columnId: "column", line: 1, value: "value" }))), /invalid-message/);
});

test("renderer probes one bounded candidate sequence then backs off", async () => {
  const source = await readFile("../.heap/cache/compiled/main/workbench-bridge.js", "utf8");
  assert.doesNotMatch(source, /fetch\(|setInterval|\/state|\/edit|http:\/\//);
  const sockets = [];
  const delays = [];
  class FakeWebSocket {
    static OPEN = 1;
    listeners = new Map();
    readyState = 0;
    constructor(url, protocol) {
      this.url = url;
      this.protocol = protocol;
      sockets.push(this);
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    close() {}
    send() {}
    emit(type) { this.listeners.get(type)?.({}); }
  }
  const document = {
    head: { append() {} },
    body: {},
    createElement() { return { style: {}, append() {} }; },
    querySelectorAll() { return []; }
  };
  vm.runInNewContext(source, {
    WebSocket: FakeWebSocket,
    window: { vscodeWindowId: 7 },
    document,
    MutationObserver: class { observe() {} },
    setTimeout(callback, delay) { delays.push({ callback, delay }); return delays.length; },
    clearTimeout() {},
    crypto: { randomUUID: () => "request" },
    console
  });
  for (let index = 0; index < 4; index += 1) sockets[index].emit("close");
  assert.equal(sockets.length, 4);
  assert.equal(delays.length, 1);
  assert.equal(delays[0].delay, 250);
  for (let cycle = 1; cycle <= 9; cycle += 1) {
    delays[cycle - 1].callback();
    const firstSocket = cycle * 4;
    assert.equal(sockets.length, firstSocket + 1);
    for (let offset = 0; offset < 4; offset += 1) sockets[firstSocket + offset].emit("close");
    assert.equal(delays[cycle].delay, Math.min(30_000, 250 * 2 ** Math.min(cycle, 7)));
  }
});
