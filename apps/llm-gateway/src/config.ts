import { readFileSync } from 'fs';
import { join } from 'path';

export interface GatewayConfig {
  flags: {
    fr: boolean;
    rag: boolean;
    hybridRAG?: boolean;
    editor: boolean;
    search: boolean;
    memoryEvents: boolean;
  };
  timeouts: {
    softMs: number;
    hardMs: number;
    ttfbSoftMs: number;
  };
  models: {
    openai: string;
    anthropic: string;
    google: string;
  };
  router: {
    frMaxTokens: number;
    frTimeoutMs: number;
    keepLastTurns: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxOutputTokensPerProvider?: {
      openai?: number;
      anthropic?: number;
      google?: number;
    };
  };
}

let config: GatewayConfig | null = null;

export function loadConfig(): GatewayConfig {
  if (!config) {
    const configPath = join(process.cwd(), 'config', 'llm-gateway.json');
    const data = readFileSync(configPath, 'utf-8');
    config = JSON.parse(data) as GatewayConfig;
  }
  return config;
}

