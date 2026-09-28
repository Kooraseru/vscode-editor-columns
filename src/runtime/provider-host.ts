import "./provider-registry";
import "./state-coordinator";

const vscode = require("vscode");
const { BridgeTransport } = require("./bridge-transport");
const { ProviderRegistry } = require("./provider-registry");
const { StateCoordinator } = require("./state-coordinator");

class ProviderHost {
  token: string;
  windowId: number;
  log: (message: string) => void;
  registry: any;
  coordinator: any;
  transport: any;

  constructor(token, windowId, log = () => undefined) {
    this.token = token;
    this.windowId = windowId;
    this.log = log;
    this.transport = new BridgeTransport(token, windowId, log);
    this.registry = new ProviderRegistry(() => void this.refresh());
    this.coordinator = new StateCoordinator(this.registry, snapshot => this.transport.publish(snapshot), log);
    this.registry.setInvalidationHandler((provider, change) => this.coordinator.invalidate(provider, change));
    this.transport.onEdit((message: any) => this.coordinator.applyEdit(message));
  }

  async start() {
    await this.transport.start();
  }

  register(provider) {
    return this.registry.register(provider);
  }

  async refresh() {
    await this.coordinator.syncVisibleEditors();
  }

  refreshEditor(editor: any) {
    return this.coordinator.refreshEditor(editor);
  }

  refreshDocument(document: any) {
    return this.coordinator.refreshDocument(document);
  }

  dispose() {
    this.coordinator.dispose();
    this.transport.publish({ version: 1, active: false, editors: [] });
    this.transport.dispose();
    this.registry.clear();
  }
}

module.exports = { ProviderHost };
