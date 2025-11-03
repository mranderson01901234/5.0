import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootEnvPath = resolve(__dirname, '.env');
loadEnv({ path: rootEnvPath });

// Load config
const configPath = resolve(__dirname, 'apps/llm-gateway/config/llm-gateway.json');
const gatewayConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

const results = {
  openai: { hasKey: false, keyValid: false, model: null, error: null },
  anthropic: { hasKey: false, keyValid: false, model: null, error: null },
  google: { hasKey: false, keyValid: false, model: null, error: null },
};

// Check API keys
results.openai.hasKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-key-here';
results.anthropic.hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-anthropic-key-here';
results.google.hasKey = !!process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your-google-key-here';

console.log('\n🔍 Testing LLM Providers...\n');
console.log('API Keys Found:');
console.log(`  OpenAI: ${results.openai.hasKey ? '✅' : '❌'} ${results.openai.hasKey ? process.env.OPENAI_API_KEY.substring(0, 20) + '...' : 'Missing'}`);
console.log(`  Anthropic: ${results.anthropic.hasKey ? '✅' : '❌'} ${results.anthropic.hasKey ? process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...' : 'Missing'}`);
console.log(`  Google: ${results.google.hasKey ? '✅' : '❌'} ${results.google.hasKey ? process.env.GOOGLE_API_KEY.substring(0, 20) + '...' : 'Missing'}`);
console.log('\n');

// Test OpenAI
if (results.openai.hasKey) {
  results.openai.model = gatewayConfig.models.openai;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: gatewayConfig.models.openai,
        messages: [{ role: 'user', content: 'Say "test" if you can read this.' }],
        max_tokens: 10,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      results.openai.keyValid = true;
      console.log(`✅ OpenAI: Working - Model "${gatewayConfig.models.openai}" responded`);
    } else {
      const error = await response.text();
      results.openai.error = `HTTP ${response.status}: ${error.substring(0, 100)}`;
      console.log(`❌ OpenAI: Failed - ${results.openai.error}`);
    }
  } catch (error) {
    results.openai.error = error.message;
    console.log(`❌ OpenAI: Error - ${error.message}`);
  }
} else {
  console.log(`⚠️  OpenAI: Skipped - No API key`);
}

// Test Anthropic
if (results.anthropic.hasKey) {
  results.anthropic.model = gatewayConfig.models.anthropic;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: gatewayConfig.models.anthropic,
        messages: [{ role: 'user', content: 'Say "test" if you can read this.' }],
        max_tokens: 10,
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      results.anthropic.keyValid = true;
      console.log(`✅ Anthropic: Working - Model "${gatewayConfig.models.anthropic}" responded`);
    } else {
      const error = await response.text();
      results.anthropic.error = `HTTP ${response.status}: ${error.substring(0, 100)}`;
      console.log(`❌ Anthropic: Failed - ${results.anthropic.error}`);
    }
  } catch (error) {
    results.anthropic.error = error.message;
    console.log(`❌ Anthropic: Error - ${error.message}`);
  }
} else {
  console.log(`⚠️  Anthropic: Skipped - No API key`);
}

// Test Google
if (results.google.hasKey) {
  results.google.model = gatewayConfig.models.google;
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const model = gatewayConfig.models.google;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Say "test" if you can read this.' }],
          }],
          generationConfig: {
            maxOutputTokens: 10,
          },
        }),
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      results.google.keyValid = true;
      console.log(`✅ Google: Working - Model "${gatewayConfig.models.google}" responded`);
    } else {
      const error = await response.text();
      results.google.error = `HTTP ${response.status}: ${error.substring(0, 100)}`;
      console.log(`❌ Google: Failed - ${results.google.error}`);
    }
  } catch (error) {
    results.google.error = error.message;
    console.log(`❌ Google: Error - ${error.message}`);
  }
} else {
  console.log(`⚠️  Google: Skipped - No API key`);
}

// Summary
console.log('\n📊 Summary:');
console.log('─'.repeat(60));
const working = [results.openai, results.anthropic, results.google].filter(r => r.keyValid).length;
console.log(`Working Providers: ${working}/3\n`);

console.log('Provider Status:');
console.log(`  OpenAI (${gatewayConfig.models.openai}): ${results.openai.keyValid ? '✅ Working' : results.openai.hasKey ? '❌ Failed' : '⚠️  No Key'}`);
console.log(`  Anthropic (${gatewayConfig.models.anthropic}): ${results.anthropic.keyValid ? '✅ Working' : results.anthropic.hasKey ? '❌ Failed' : '⚠️  No Key'}`);
console.log(`  Google (${gatewayConfig.models.google}): ${results.google.keyValid ? '✅ Working' : results.google.hasKey ? '❌ Failed' : '⚠️  No Key'}`);

if (working === 0) {
  console.log('\n❌ No providers are working! Check your API keys.');
  process.exit(1);
} else {
  console.log(`\n✅ ${working} provider(s) ready to use`);
}

