import { Pool } from 'undici';
import type { IProvider } from './types.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleProvider } from './providers/google.js';
import { loadConfig } from './config.js';
import { logger } from './log.js';

class ProviderPool {
  private pools: Map<string, Pool> = new Map();
  private providers: Map<string, IProvider> = new Map();
  private prepared = false;

  constructor() {
    const config = loadConfig();
    const baseOptions = {
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 60000,
    };

    // Initialize pools
    this.pools.set('openai', new Pool('https://api.openai.com', baseOptions));
    this.pools.set('anthropic', new Pool('https://api.anthropic.com', baseOptions));
    this.pools.set('google', new Pool('https://generativelanguage.googleapis.com', baseOptions));

    // Initialize providers
    this.providers.set('openai', new OpenAIProvider(this.pools.get('openai')!));
    this.providers.set('anthropic', new AnthropicProvider(this.pools.get('anthropic')!));
    this.providers.set('google', new GoogleProvider(this.pools.get('google')!));
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;

    logger.info('Preparing providers...');
    const tasks = Array.from(this.providers.values()).map((p) => p.prepare());
    await Promise.all(tasks);

    // DNS pre-resolve by fetching /models endpoints
    const dnsTasks: Promise<void>[] = [];
    const pool = this.pools.get('openai');
    if (pool) {
      dnsTasks.push(
        pool
          .request({ path: '/v1/models', method: 'GET', headers: { 'User-Agent': 'llm-gateway' } })
          .then((r) => r.body.text())
          .then(() => {})
          .catch(() => {})
      );
    }
    await Promise.allSettled(dnsTasks);

    this.prepared = true;
    logger.info('Providers prepared');
  }

  getProvider(name: string): IProvider | undefined {
    return this.providers.get(name);
  }

  getPool(name: string): Pool | undefined {
    return this.pools.get(name);
  }

  async close(): Promise<void> {
    const tasks = Array.from(this.pools.values()).map((p) => p.close());
    await Promise.all(tasks);
  }
}

export const providerPool = new ProviderPool();

