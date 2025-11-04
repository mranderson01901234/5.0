#!/usr/bin/env node
/**
 * Direct test of Imagen 4 image generation
 * Tests the generateImage function with Vertex AI
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load .env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');
config({ path: resolve(rootDir, '.env') });

// Import after env is loaded - try dist first, then src
let imagenModule;
try {
  imagenModule = await import('./dist/utils/imagen.js');
} catch {
  try {
    // If dist doesn't exist, we need to use tsx
    console.error('❌ Please build the project first: pnpm build');
    process.exit(1);
  } catch {
    process.exit(1);
  }
}

const { generateImage } = imagenModule;

async function testImageGeneration() {
  console.log('🧪 Testing Imagen 4 Image Generation with Vertex AI\n');
  
  // Verify configuration
  console.log('Configuration:');
  console.log(`  VERTEX_AI_ACCESS_TOKEN: ${process.env.VERTEX_AI_ACCESS_TOKEN ? '✅ SET (' + process.env.VERTEX_AI_ACCESS_TOKEN.substring(0, 20) + '...)' : '❌ NOT SET'}`);
  console.log(`  GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'LEA-Google-Integration (default)'}`);
  console.log(`  GCP_LOCATION: ${process.env.GCP_LOCATION || 'us-central1 (default)'}`);
  console.log(`  IMAGE_GEN_ENABLED: ${process.env.IMAGE_GEN_ENABLED || 'not set'}`);
  console.log('');
  
  if (!process.env.VERTEX_AI_ACCESS_TOKEN) {
    console.error('❌ ERROR: VERTEX_AI_ACCESS_TOKEN is not set!');
    process.exit(1);
  }
  
  const testPrompt = 'A beautiful sunset over a mountain landscape with vibrant orange and pink colors';
  
  console.log(`Generating image with prompt: "${testPrompt}"\n`);
  
  try {
    const startTime = Date.now();
    const images = await generateImage(testPrompt, {
      aspectRatio: '1:1',
      sampleCount: 1,
    });
    const duration = Date.now() - startTime;
    
    if (images && images.length > 0) {
      console.log(`✅ SUCCESS! Generated ${images.length} image(s) in ${duration}ms\n`);
      console.log('Image details:');
      images.forEach((img, idx) => {
        const dataLength = img.dataUrl.length;
        console.log(`  Image ${idx + 1}:`);
        console.log(`    MIME: ${img.mime}`);
        console.log(`    Data URL length: ${dataLength} characters`);
        console.log(`    Preview: ${img.dataUrl.substring(0, 80)}...`);
      });
      console.log('\n✅✅✅ Image generation test PASSED! ✅✅✅');
      process.exit(0);
    } else {
      console.error('❌ FAILED: No images returned');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testImageGeneration();

