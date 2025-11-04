#!/usr/bin/env tsx
/**
 * Test script for Imagen 4 image generation
 * Tests the generateImage function directly
 */

import '../../shared-env-loader.js';
import { generateImage } from './src/utils/imagen.js';

// Set environment variables for testing
process.env.VERTEX_AI_ACCESS_TOKEN = process.env.VERTEX_AI_ACCESS_TOKEN || 'AQ.Ab8RN6JtZVPmkzcmHKLoynEHIFgraxPnSBm9IXvMoI-O9jZFtw';
process.env.GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'LEA-Google-Integration';
process.env.GCP_LOCATION = process.env.GCP_LOCATION || 'us-central1';
process.env.IMAGE_GEN_ENABLED = 'true';

async function testImageGeneration() {
  console.log('🧪 Testing Imagen 4 Image Generation\n');
  
  // Verify configuration
  console.log('Configuration:');
  console.log(`  VERTEX_AI_ACCESS_TOKEN: ${process.env.VERTEX_AI_ACCESS_TOKEN ? '✅ SET (' + process.env.VERTEX_AI_ACCESS_TOKEN.substring(0, 20) + '...)' : '❌ NOT SET'}`);
  console.log(`  GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'LEA-Google-Integration (default)'}`);
  console.log(`  GCP_LOCATION: ${process.env.GCP_LOCATION || 'us-central1 (default)'}`);
  console.log(`  IMAGE_GEN_ENABLED: ${process.env.IMAGE_GEN_ENABLED}`);
  console.log('');
  
  const testPrompt = 'A beautiful sunset over a mountain landscape with vibrant colors';
  
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
        console.log(`    Base64 data: ${img.dataUrl.substring(0, 50)}...`);
      });
      console.log('\n✅ Image generation test PASSED!');
      process.exit(0);
    } else {
      console.error('❌ FAILED: No images returned');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testImageGeneration();

