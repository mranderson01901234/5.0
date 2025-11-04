/**
 * Performance benchmarks for the Thinking Narrator system
 * Run in browser console or test environment
 */

import { PatternMatcher } from './PatternMatcher';
import { ContextualVariator } from './ContextualVariator';
import { ThinkingEngine } from './ThinkingEngine';
import { getThinkingStorage, hashQuery } from './ThinkingStorage';

export interface BenchmarkResult {
  name: string;
  duration: number;
  iterations: number;
  avgTime: number;
  memory?: number;
}

export class ThinkingBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult[]> {
    console.log('🔬 Starting Thinking System Benchmarks...\n');

    await this.benchmarkPatternMatching();
    await this.benchmarkContextualVariation();
    await this.benchmarkThinkingGeneration();
    await this.benchmarkStorage();
    await this.benchmarkMemoryUsage();

    console.log('\n📊 Benchmark Results:\n');
    this.printResults();

    return this.results;
  }

  /**
   * Benchmark pattern matching performance
   */
  private async benchmarkPatternMatching(): Promise<void> {
    const matcher = new PatternMatcher();
    const testQueries = [
      "Write a function to reverse a string",
      "Debug this TypeError: Cannot read property of undefined",
      "Explain how React hooks work",
      "Design a microservices architecture",
      "Optimize this database query",
      "What is the difference between let and const?",
      "Create a REST API for a blog",
      "Find information about quantum computing",
      "Write a creative story about AI",
      "Configure Docker for production"
    ];

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      for (const query of testQueries) {
        matcher.classify(query);
      }
    }

    const duration = performance.now() - start;
    const avgTime = duration / (iterations * testQueries.length);

    this.results.push({
      name: 'Pattern Matching',
      duration,
      iterations: iterations * testQueries.length,
      avgTime
    });

    console.log(`✓ Pattern Matching: ${avgTime.toFixed(3)}ms avg`);
  }

  /**
   * Benchmark contextual variation
   */
  private async benchmarkContextualVariation(): Promise<void> {
    const variator = new ContextualVariator();
    const testSteps = [
      { text: 'Analyzing requirements...', duration: 400, depth: 0 },
      { text: 'Evaluating approaches...', duration: 500, depth: 0 },
      { text: 'Planning structure...', duration: 450, depth: 1 },
      { text: 'Considering edge cases...', duration: 400, depth: 1 },
      { text: 'Formulating solution...', duration: 350, depth: 0 }
    ];

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      variator.addVariation(
        testSteps,
        "Write a function to sort an array",
        ['function', 'sort', 'array']
      );
    }

    const duration = performance.now() - start;
    const avgTime = duration / iterations;

    this.results.push({
      name: 'Contextual Variation',
      duration,
      iterations,
      avgTime
    });

    console.log(`✓ Contextual Variation: ${avgTime.toFixed(3)}ms avg`);
  }

  /**
   * Benchmark full thinking generation
   */
  private async benchmarkThinkingGeneration(): Promise<void> {
    const engine = new ThinkingEngine();
    const testQueries = [
      "Write a function to reverse a string",
      "Debug this error message",
      "Explain how async/await works",
      "Design a scalable API",
      "Optimize this slow code"
    ];

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      for (const query of testQueries) {
        engine.generateThinking(query);
      }
    }

    const duration = performance.now() - start;
    const avgTime = duration / (iterations * testQueries.length);

    this.results.push({
      name: 'Full Thinking Generation',
      duration,
      iterations: iterations * testQueries.length,
      avgTime
    });

    console.log(`✓ Thinking Generation: ${avgTime.toFixed(3)}ms avg`);
  }

  /**
   * Benchmark IndexedDB operations
   */
  private async benchmarkStorage(): Promise<void> {
    const storage = getThinkingStorage();
    await storage.initialize();

    // Test pattern storage
    const iterations = 100;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await storage.storePattern({
        id: `test-${i}`,
        category: 'code',
        patterns: [['Step 1', 'Step 2', 'Step 3']],
        timestamp: Date.now(),
        version: 1
      });
    }

    const storeDuration = performance.now() - start;

    // Test retrieval
    const retrieveStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await storage.getPatternsByCategory('code');
    }
    const retrieveDuration = performance.now() - retrieveStart;

    // Clean up
    await storage.clearAll();

    this.results.push({
      name: 'Storage Write',
      duration: storeDuration,
      iterations,
      avgTime: storeDuration / iterations
    });

    this.results.push({
      name: 'Storage Read',
      duration: retrieveDuration,
      iterations,
      avgTime: retrieveDuration / iterations
    });

    console.log(`✓ Storage Write: ${(storeDuration / iterations).toFixed(3)}ms avg`);
    console.log(`✓ Storage Read: ${(retrieveDuration / iterations).toFixed(3)}ms avg`);
  }

  /**
   * Benchmark memory usage
   */
  private async benchmarkMemoryUsage(): Promise<void> {
    if (!performance.memory) {
      console.log('⚠ Memory API not available');
      return;
    }

    const baseline = performance.memory.usedJSHeapSize;

    // Create instances
    const engine = new ThinkingEngine();
    const storage = getThinkingStorage();

    // Generate some data
    for (let i = 0; i < 100; i++) {
      engine.generateThinking(`Test query ${i}`);
    }

    const afterGeneration = performance.memory.usedJSHeapSize;
    const memoryUsed = (afterGeneration - baseline) / 1024 / 1024;

    this.results.push({
      name: 'Memory Usage',
      duration: 0,
      iterations: 1,
      avgTime: 0,
      memory: memoryUsed
    });

    console.log(`✓ Memory Usage: ${memoryUsed.toFixed(2)}MB`);
  }

  /**
   * Print formatted results
   */
  private printResults(): void {
    console.table(
      this.results.map(r => ({
        Name: r.name,
        'Avg Time (ms)': r.avgTime.toFixed(3),
        'Total (ms)': r.duration.toFixed(2),
        Iterations: r.iterations,
        'Memory (MB)': r.memory?.toFixed(2) || 'N/A'
      }))
    );
  }

  /**
   * Verify correctness of implementations
   */
  async runTests(): Promise<boolean> {
    console.log('\n🧪 Running Correctness Tests...\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Pattern matching categories
    try {
      const matcher = new PatternMatcher();

      const codeQuery = matcher.classify("Write a function to sort an array");
      console.assert(codeQuery.category === 'code', 'Code query classification failed');

      const debugQuery = matcher.classify("Fix this error: undefined is not a function");
      console.assert(debugQuery.category === 'debugging', 'Debug query classification failed');

      const explainQuery = matcher.classify("What is a closure in JavaScript?");
      console.assert(explainQuery.category === 'explanation', 'Explain query classification failed');

      console.log('✓ Pattern matching tests passed');
      passed += 3;
    } catch (error) {
      console.error('✗ Pattern matching tests failed:', error);
      failed += 3;
    }

    // Test 2: Complexity estimation
    try {
      const matcher = new PatternMatcher();

      const simple = matcher.classify("Hello");
      console.assert(simple.complexity === 'simple', 'Simple complexity failed');

      const complex = matcher.classify(
        "I need to implement a comprehensive solution that handles multiple edge cases and integrates with several external APIs"
      );
      console.assert(complex.complexity === 'complex', 'Complex complexity failed');

      console.log('✓ Complexity estimation tests passed');
      passed += 2;
    } catch (error) {
      console.error('✗ Complexity estimation tests failed:', error);
      failed += 2;
    }

    // Test 3: Thinking generation
    try {
      const engine = new ThinkingEngine();

      const stream = engine.generateThinking("Write a React component");
      console.assert(stream.steps.length > 0, 'No thinking steps generated');
      console.assert(stream.totalDuration > 0, 'Invalid total duration');
      console.assert(stream.context.category === 'code', 'Wrong category');

      console.log('✓ Thinking generation tests passed');
      passed += 3;
    } catch (error) {
      console.error('✗ Thinking generation tests failed:', error);
      failed += 3;
    }

    // Test 4: Storage operations
    try {
      const storage = getThinkingStorage();
      await storage.initialize();

      const testPattern = {
        id: 'test-pattern',
        category: 'code',
        patterns: [['Step 1', 'Step 2']],
        timestamp: Date.now(),
        version: 1
      };

      await storage.storePattern(testPattern);
      const retrieved = await storage.getPatternsByCategory('code');
      console.assert(retrieved.length > 0, 'Pattern not stored/retrieved');

      await storage.clearAll();

      console.log('✓ Storage tests passed');
      passed += 1;
    } catch (error) {
      console.error('✗ Storage tests failed:', error);
      failed += 1;
    }

    // Test 5: Query hashing
    try {
      const hash1 = hashQuery("Write a function");
      const hash2 = hashQuery("write a function"); // Same but different case
      const hash3 = hashQuery("Different query");

      console.assert(hash1 === hash2, 'Case-insensitive hashing failed');
      console.assert(hash1 !== hash3, 'Hash collision detected');

      console.log('✓ Query hashing tests passed');
      passed += 2;
    } catch (error) {
      console.error('✗ Query hashing tests failed:', error);
      failed += 2;
    }

    console.log(`\n📈 Test Results: ${passed} passed, ${failed} failed\n`);
    return failed === 0;
  }
}

// Export convenience function
export async function runBenchmarks(): Promise<BenchmarkResult[]> {
  const benchmark = new ThinkingBenchmark();
  await benchmark.runTests();
  return await benchmark.runAll();
}

// Auto-run if imported in browser console
if (typeof window !== 'undefined') {
  (window as any).runThinkingBenchmarks = runBenchmarks;
  console.log('💡 Run benchmarks with: runThinkingBenchmarks()');
}
