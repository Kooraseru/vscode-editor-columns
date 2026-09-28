const vscode = require("vscode");

class ProviderRegistry {
  providers: Map<string, any>;
  onDidChange: () => void;
  onInvalidation: (provider: any, change: any) => void;
  registrations: Map<string, { provider: any; order: number; listener?: any }>;
  nextOrder: number;

  constructor(onDidChange: () => void = () => undefined) {
    this.providers = new Map();
    this.registrations = new Map();
    this.nextOrder = 0;
    this.onDidChange = onDidChange;
    this.onInvalidation = () => undefined;
  }

  register(provider: any) {
    if (!provider || typeof provider.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(provider.id) ||
        typeof provider.provideCells !== "function") {
      throw new TypeError("A column provider requires a valid string id and provideCells(document, range, token) function.");
    }
    if (provider.width !== undefined && (!Number.isFinite(provider.width) || provider.width < 48 || provider.width > 800))
      throw new TypeError("Column provider width must be between 48 and 800 pixels.");
    if (provider.order !== undefined && !Number.isFinite(provider.order)) throw new TypeError("Column provider order must be finite.");
    if (provider.onDidChangeCells !== undefined && typeof provider.onDidChangeCells !== "function")
      throw new TypeError("Column provider onDidChangeCells must be an event function.");
    if (this.providers.has(provider.id)) throw new Error(`Column provider '${provider.id}' is already registered.`);
    this.providers.set(provider.id, provider);
    const registration = { provider, order: this.nextOrder++, listener: undefined };
    if (provider.onDidChangeCells) registration.listener = provider.onDidChangeCells(change => this.onInvalidation(provider, change));
    this.registrations.set(provider.id, registration);
    this.onDidChange();
    return new vscode.Disposable(() => {
      if (this.providers.delete(provider.id)) {
        this.registrations.get(provider.id)?.listener?.dispose();
        this.registrations.delete(provider.id);
        this.onDidChange();
      }
    });
  }

  get(id: string) {
    return this.providers.get(id);
  }

  matching(document: any) {
    return [...this.registrations.values()].filter(item =>
      !item.provider.selector || vscode.languages.match(item.provider.selector, document) > 0)
      .sort((left, right) => (left.provider.order ?? 0) - (right.provider.order ?? 0) || left.order - right.order)
      .map(item => item.provider);
  }

  setInvalidationHandler(handler: (provider: any, change: any) => void) { this.onInvalidation = handler; }

  clear() {
    for (const registration of this.registrations.values()) registration.listener?.dispose();
    this.providers.clear();
    this.registrations.clear();
  }
}

module.exports = { ProviderRegistry };
