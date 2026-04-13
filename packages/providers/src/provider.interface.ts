import type { ProviderAdapter } from '@copilot-fleet/core';
import type { ProviderConfig } from '@copilot-fleet/shared';

export type { ProviderAdapter };

export type ProviderFactory = (config: ProviderConfig) => ProviderAdapter;

export class ProviderRegistry {
  private factories: Map<string, ProviderFactory>;
  private instances: Map<string, ProviderAdapter>;

  constructor() {
    this.factories = new Map<string, ProviderFactory>();
    this.instances = new Map<string, ProviderAdapter>();
  }

  register(type: string, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  async create(config: ProviderConfig): Promise<ProviderAdapter> {
    const existing = this.instances.get(config.name);
    if (existing) {
      return existing;
    }

    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`No provider factory registered for type "${config.type}".`);
    }

    const instance = factory(config);
    await instance.initialize();
    this.instances.set(config.name, instance);
    return instance;
  }

  get(name: string): ProviderAdapter | undefined {
    return this.instances.get(name);
  }

  getAll(): Map<string, ProviderAdapter> {
    return new Map<string, ProviderAdapter>(this.instances);
  }

  async dispose(): Promise<void> {
    const instances = [...this.instances.values()];
    this.instances.clear();

    await Promise.all(
      instances.map(async (instance) => {
        await instance.dispose();
      }),
    );
  }
}