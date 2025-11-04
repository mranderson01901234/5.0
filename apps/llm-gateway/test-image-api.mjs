#!/usr/bin/env node
/**
 * Test image generation API endpoint end-to-end
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import Database from 'better-sqlite3';
import { generateImage, IMAGEN_MODELS, IMAGEN_COSTS } from './dist/utils/imagen.js';

// Load .env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');
config({ path: resolve(rootDir, '.env') });

async function testImageGeneration() {
  console.log('🧪 Testing Image Generation End-to-End');
  console.log('');
  
  const prompt = 'A beautiful sunset over mountains with vibrant orange and pink colors';
  const threadId = 'test-thread-' + Date.now();
  
  console.log('Prompt:', prompt);
  console.log('Thread ID:', threadId);
  console.log('');
  
  try {
    console.log('Step 1: Generating image...');
    const startTime = Date.now();
    const images = await generateImage(prompt, {
      aspectRatio: '1:1',
      sampleCount: 1,
    });
    const generationTime = Date.now() - startTime;
    
    if (!images || images.length === 0) {
      throw new Error('No images generated');
    }
    
    console.log('✅ Image generated in', generationTime, 'ms');
    console.log('Images:', images.length);
    console.log('');
    
    console.log('Step 2: Creating artifact payload...');
    const modelUsed = IMAGEN_MODELS.STANDARD;
    const costPerImage = IMAGEN_COSTS[modelUsed] || 0.04;
    const totalCost = costPerImage * images.length;
    
    const artifactData = {
      images,
      prompt,
      aspectRatio: '1:1',
      sampleCount: 1,
      model: modelUsed,
      metadata: {
        cost: totalCost,
        costPerImage,
        generationTimeMs: generationTime,
        imageCount: images.length,
        timestamp: Date.now(),
      },
    };
    
    console.log('✅ Artifact payload created');
    console.log('Cost:', totalCost);
    console.log('');
    
    console.log('Step 3: Testing database insert...');
    // Use gateway.db (not DB_PATH which is for memory-service)
    const { join } = await import('path');
    const dbPath = join(process.cwd(), 'gateway.db');
    console.log('Using database:', dbPath);
    const db = new Database(dbPath);
    
    const artifactId = 'test-' + Date.now();
    const userId = 'test-user';
    const createdAt = Math.floor(Date.now() / 1000);
    
    try {
      db.prepare(`
        INSERT INTO artifacts (id, user_id, thread_id, type, data, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId,
        userId,
        threadId,
        'image',
        JSON.stringify(artifactData),
        JSON.stringify(artifactData.metadata),
        createdAt
      );
      
      console.log('✅ Database insert successful');
      console.log('Artifact ID:', artifactId);
      
      // Verify it was saved
      const saved = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifactId);
      if (saved) {
        console.log('✅ Artifact retrieved from database');
        const parsedData = JSON.parse(saved.data);
        console.log('Images in saved data:', parsedData.images?.length || 0);
        console.log('Prompt:', parsedData.prompt);
        console.log('Model:', parsedData.model);
      } else {
        throw new Error('Artifact not found after insert');
      }
      
      // Cleanup
      db.prepare('DELETE FROM artifacts WHERE id = ?').run(artifactId);
      console.log('✅ Test artifact cleaned up');
      
    } catch (dbError) {
      console.error('❌ Database error:', dbError.message);
      if (dbError.message.includes('CHECK constraint')) {
        console.error('   Database schema still has old constraint!');
        console.error('   Run migration to add "image" type');
      }
      throw dbError;
    } finally {
      db.close();
    }
    
    console.log('');
    console.log('✅✅✅ All tests passed! ✅✅✅');
    console.log('');
    console.log('Summary:');
    console.log('  - Image generation: ✅');
    console.log('  - Artifact creation: ✅');
    console.log('  - Database storage: ✅');
    console.log('  - Database retrieval: ✅');
    
  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 10).join('\n'));
    }
    process.exit(1);
  }
}

testImageGeneration();

