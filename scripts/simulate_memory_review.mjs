#!/usr/bin/env node

/**
 * Memory Review Simulator
 * Simulates a 30-turn session with mixed topics to test memory review cadence
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const TRACE_DIR = '.tmp/memory_traces';
const TRACE_FILE = join(TRACE_DIR, `${TIMESTAMP}.ndjson`);

// Ensure trace directory exists
mkdirSync(TRACE_DIR, { recursive: true });

const AUDIT_CADENCE = 8; // Every 8 messages
const TOPICS = {
  A: 'Python async programming',
  B: 'React hooks patterns'
};

class MemorySimulator {
  constructor() {
    this.turn = 0;
    this.memories = [];
    this.auditsTriggered = 0;
    this.topicHistory = [];
  }

  generateMessage(topic, role = 'user') {
    const turn = this.turn++;
    const templates = {
      A: {
        user: [
          'I need help with async/await in Python',
          'How do I handle multiple coroutines?',
          'What about asyncio.gather?',
          'Can you show me an example with FastAPI?'
        ],
        assistant: [
          'Async/await allows concurrent execution without threads',
          'Use asyncio.gather to run multiple coroutines in parallel',
          'FastAPI is built on async/await for high performance'
        ]
      },
      B: {
        user: [
          'How do I use React hooks?',
          'What is the difference between useState and useReducer?',
          'Can I create custom hooks?'
        ],
        assistant: [
          'Hooks are functions that let you use state in functional components',
          'useState is simple state, useReducer is for complex state logic',
          'Custom hooks start with "use" and can combine other hooks'
        ]
      }
    };

    const topicTemplates = templates[topic] || templates.A;
    const roleTemplates = topicTemplates[role] || [];
    const randomIndex = Math.floor(Math.random() * roleTemplates.length);
    const content = roleTemplates[randomIndex] || `Message about ${topic}`;

    return { role, content, timestamp: Date.now() };
  }

  simulateSession() {
    // Pattern: 5 topic A, 3 topic B, 5 topic A, 3 topic B, etc.
    const pattern = [
      ...Array(5).fill('A'),
      ...Array(3).fill('B'),
      ...Array(5).fill('A'),
      ...Array(3).fill('B'),
      ...Array(5).fill('A'),
      ...Array(3).fill('B'),
      ...Array(2).fill('A'), // Remainder to reach 30
      ...Array(4).fill('B')
    ].slice(0, 30);

    const trace = [];

    for (const topicKey of pattern) {
      this.topicHistory.push(topicKey);
      
      // User message
      const userMsg = this.generateMessage(topicKey, 'user');
      this.processTurn(userMsg, topicKey, trace);

      // Assistant message
      const assistantMsg = this.generateMessage(topicKey, 'assistant');
      this.processTurn(assistantMsg, topicKey, trace);
    }

    // Save trace
    const traceContent = trace.map(line => JSON.stringify(line)).join('\n');
    writeFileSync(TRACE_FILE, traceContent, 'utf-8');

    console.log(`✓ Simulated 30-turn session`);
    console.log(`✓ Generated trace: ${TRACE_FILE}`);
    console.log(`✓ Audits triggered: ${this.auditsTriggered}`);
    console.log(`✓ Expected audits: ${Math.ceil(30 / AUDIT_CADENCE)}`);

    return this.auditsTriggered;
  }

  processTurn(message, topic, trace) {
    const turnNum = Math.floor(this.turn / 2);
    const shouldTriggerAudit = (this.turn % AUDIT_CADENCE === 0 && this.turn > 0);

    const topicFirstSeen = this.topicHistory.filter(t => t === topic).length === 1;
    const retrievalHit = this.memories.some(m => m.topic === topic);

    // Simulate memory operations
    let reviewTriggered = false;
    let savedItems = 0;
    let bytesSaved = 0;

    if (shouldTriggerAudit) {
      reviewTriggered = true;
      this.auditsTriggered++;
      
      // Simulate scoring and saving
      const score = this.scoreMessage(message.content, message.role);
      if (score >= 0.65) {
        savedItems = 1;
        const memorySize = JSON.stringify({
          content: message.content.substring(0, 1024),
          priority: score,
          tier: 'TIER3'
        }).length;
        bytesSaved = memorySize;
        this.memories.push({
          topic,
          content: message.content.substring(0, 1024),
          priority: score,
          timestamp: Date.now()
        });
      }
    }

    const traceEntry = {
      turn: turnNum,
      topic,
      reviewTriggered,
      savedItems,
      bytesSaved,
      retrievalHit: retrievalHit && turnNum > 0,
      durations: {
        extractMs: this.simulateExtractLatency(),
        reviewMs: reviewTriggered ? this.simulateReviewLatency() : 0
      },
      queueDepth: this.auditsTriggered > 0 ? 1 : 0,
      topicFirstSeen,
      timestamp: Date.now()
    };

    trace.push(traceEntry);
  }

  scoreMessage(content, role) {
    let score = 0.4;
    
    // Relevance
    if (/async|await|hook|state|python|react/i.test(content)) score += 0.2;
    
    // Importance
    if (/how do|what|show me|need help/i.test(content)) score += 0.15;
    
    // Coherence
    if (content.length > 30 && content.length < 200) score += 0.15;
    
    // Recency (always recent in simulation)
    score += 0.1;

    return Math.min(1.0, score);
  }

  simulateExtractLatency() {
    // P50 ~2ms, P95 ~5ms
    return Math.floor(Math.random() * 5) + 1;
  }

  simulateReviewLatency() {
    // P50 ~50ms, P95 ~120ms
    return Math.floor(Math.random() * 100) + 20;
  }
}

// Run simulation
console.log('Starting memory review simulation...\n');

const simulator = new MemorySimulator();
simulator.simulateSession();

console.log('\n✓ Simulation complete');

