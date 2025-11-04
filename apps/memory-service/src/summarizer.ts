/**
 * Conversation summarization using default model (OpenAI or Google)
 * Background job that runs during audits
 */

import { pino } from 'pino';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = pino({ name: 'summarizer' });

/**
 * Get default provider and model based on available API keys
 * Priority: google → openai → anthropic
 */
function getDefaultProvider(): { provider: 'google' | 'openai' | 'anthropic' | null; model: string } {
  const googleKey = process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  // Try to load config from gateway if available
  let configModels: { google?: string; openai?: string; anthropic?: string } = {};
  try {
    // Try multiple possible paths
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const possiblePaths = [
      join(currentDir, '..', '..', 'llm-gateway', 'config', 'llm-gateway.json'),
      join(process.cwd(), 'apps', 'llm-gateway', 'config', 'llm-gateway.json'),
      join(process.cwd(), '..', 'llm-gateway', 'config', 'llm-gateway.json'),
    ];
    
    for (const configPath of possiblePaths) {
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        configModels = config.models || {};
        break;
      }
    }
  } catch {
    // Config not available, use defaults
  }
  
  // Priority: google → openai → anthropic
  if (googleKey && configModels.google) {
    return { provider: 'google', model: configModels.google };
  }
  if (openaiKey && configModels.openai) {
    return { provider: 'openai', model: configModels.openai };
  }
  if (anthropicKey && configModels.anthropic) {
    return { provider: 'anthropic', model: configModels.anthropic };
  }
  
  // Fallback to hardcoded defaults if config not available
  if (googleKey) {
    return { provider: 'google', model: 'gemini-2.5-flash' };
  }
  if (openaiKey) {
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }
  if (anthropicKey) {
    return { provider: 'anthropic', model: 'claude-3-haiku-20240307' };
  }
  
  return { provider: null, model: '' };
}

/**
 * Generate summary using Google Gemini API
 */
async function generateSummaryWithGoogle(model: string, messages: Array<{ content: string; role: string }>): Promise<string | null> {
  const googleKey = process.env.GOOGLE_API_KEY;
  if (!googleKey) return null;
  
  try {
    const recentMessages = messages.slice(-20);
    const systemMessages = recentMessages.filter(m => m.role === 'system');
    const conversationMessages = recentMessages.filter(m => m.role !== 'system');
    
    const systemInstruction = 'Summarize this conversation in 1-2 sentences. Focus on the main topic and key points discussed. Be concise.';
    
    const requestBody: any = {
      contents: conversationMessages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.substring(0, 1000) }],
      })),
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.3,
      },
    };
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!text) {
      return null;
    }
    
    return text.substring(0, 200);
  } catch {
    return null;
  }
}

/**
 * Generate summary using OpenAI API
 */
async function generateSummaryWithOpenAI(model: string, messages: Array<{ content: string; role: string }>): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;
  
  try {
    const recentMessages = messages.slice(-20);
    const formattedMessages = recentMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.substring(0, 1000),
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Summarize this conversation in 1-2 sentences. Focus on the main topic and key points discussed. Be concise.'
          },
          ...formattedMessages
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const summary = data.choices?.[0]?.message?.content?.trim();
    
    if (!summary) {
      return null;
    }

    return summary.substring(0, 200);
  } catch {
    return null;
  }
}

/**
 * Generate a conversation summary using default model (OpenAI or Google)
 * Returns first 200 chars of first user message if API unavailable
 */
export async function generateSummary(messages: Array<{ content: string; role: string }>): Promise<string> {
  const { provider, model } = getDefaultProvider();
  
  if (!provider) {
    logger.debug('No API keys available, using fallback summary');
    return getFallbackSummary(messages);
  }

  logger.debug({ provider, model }, 'Using default provider for summarization');
  
  // Try default provider first
  let summary: string | null = null;
  
  // Load config models for fallback
  let configModels: { google?: string; openai?: string; anthropic?: string } = {};
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const possiblePaths = [
      join(currentDir, '..', '..', 'llm-gateway', 'config', 'llm-gateway.json'),
      join(process.cwd(), 'apps', 'llm-gateway', 'config', 'llm-gateway.json'),
      join(process.cwd(), '..', 'llm-gateway', 'config', 'llm-gateway.json'),
    ];
    for (const configPath of possiblePaths) {
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        configModels = config.models || {};
        break;
      }
    }
  } catch {
    // Use defaults
  }
  
  if (provider === 'google') {
    summary = await generateSummaryWithGoogle(model, messages);
    if (summary) {
      return summary;
    }
    // Fallback to OpenAI if Google fails
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      logger.debug('Google summarization failed, falling back to OpenAI');
      const openaiModel = configModels.openai || 'gpt-4o-mini';
      summary = await generateSummaryWithOpenAI(openaiModel, messages);
    }
  } else if (provider === 'openai') {
    summary = await generateSummaryWithOpenAI(model, messages);
    if (summary) {
      return summary;
    }
    // Fallback to Google if OpenAI fails
    const googleKey = process.env.GOOGLE_API_KEY;
    if (googleKey) {
      logger.debug('OpenAI summarization failed, falling back to Google');
      const googleModel = configModels.google || 'gemini-2.5-flash';
      summary = await generateSummaryWithGoogle(googleModel, messages);
    }
  }
  
  if (summary) {
    return summary;
  }

  logger.warn({ provider, model }, 'Summarization failed, using fallback');
  return getFallbackSummary(messages);
}

/**
 * Fallback: Use first user message as summary
 */
function getFallbackSummary(messages: Array<{ content: string; role: string }>): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    return firstUserMsg.content.substring(0, 200);
  }
  return 'Conversation';
}

