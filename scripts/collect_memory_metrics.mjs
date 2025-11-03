#!/usr/bin/env node

/**
 * Collect Memory Metrics
 * Aggregates traces from simulator into structured metrics
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TRACE_DIR = '.tmp/memory_traces';
const OUTPUT_FILE = 'ops/reports/memory_audit.json';

function collectMetrics() {
  console.log('Collecting memory metrics...');

  // Find latest trace file
  const files = readdirSync(TRACE_DIR)
    .filter(f => f.endsWith('.ndjson'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No trace files found');
    process.exit(1);
  }

  const latestFile = join(TRACE_DIR, files[0]);
  console.log(`Reading trace: ${latestFile}`);

  // Parse trace
  const content = readFileSync(latestFile, 'utf-8');
  const traces = content.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  console.log(`Parsed ${traces.length} trace entries`);

  // Aggregate metrics
  const metrics = {
    turnsTotal: traces.length,
    reviewsTriggered: traces.filter(t => t.reviewTriggered).length,
    memoriesSaved: traces.reduce((sum, t) => sum + t.savedItems, 0),
    avgBytesPerMemory: traces.length > 0
      ? traces.reduce((sum, t) => sum + t.bytesSaved, 0) / traces.length
      : 0,
    retrievalHitRate: traces.filter(t => t.retrievalHit).length / traces.length,
    duplicateSaveRate: 0, // Would need cross-check
    extractP50: percentile(traces.map(t => t.durations.extractMs), 50),
    extractP95: percentile(traces.map(t => t.durations.extractMs), 95),
    reviewP50: percentile(
      traces.filter(t => t.reviewTriggered).map(t => t.durations.reviewMs),
      50
    ),
    reviewP95: percentile(
      traces.filter(t => t.reviewTriggered).map(t => t.durations.reviewMs),
      95
    ),
    chatTTFBDeltaWithAudit: 0, // Would measure in integration test
    maxQueueDepth: Math.max(...traces.map(t => t.queueDepth), 0),
    droppedJobs: 0,
    topicDistribution: {},
    uniqueTopics: new Set(traces.map(t => t.topic)).size
  };

  // Topic distribution
  const topicCounts = {};
  traces.forEach(t => {
    topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
  });
  metrics.topicDistribution = topicCounts;

  // Load existing audit report
  let report = {};
  try {
    const existing = readFileSync(OUTPUT_FILE, 'utf-8');
    report = JSON.parse(existing);
  } catch (err) {
    console.log('Creating new audit report');
  }

  // Merge metrics into existing structure
  if (!report.metrics) {
    report.metrics = {};
  }
  
  report.metrics.collected = true;
  report.metrics.results = metrics;
  report.metrics.collectedAt = new Date().toISOString();
  report.metrics.traceFile = latestFile;

  // Write back
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n✓ Metrics collected:');
  console.log(`  Turns: ${metrics.turnsTotal}`);
  console.log(`  Reviews: ${metrics.reviewsTriggered}`);
  console.log(`  Memories saved: ${metrics.memoriesSaved}`);
  console.log(`  Retrieval hit rate: ${(metrics.retrievalHitRate * 100).toFixed(1)}%`);
  console.log(`  Extract P50: ${metrics.extractP50}ms`);
  console.log(`  Extract P95: ${metrics.extractP95}ms`);
  console.log(`  Review P50: ${metrics.reviewP50}ms`);
  console.log(`  Review P95: ${metrics.reviewP95}ms`);
  console.log(`\n✓ Saved to: ${OUTPUT_FILE}`);
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || sorted[0];
}

collectMetrics();

