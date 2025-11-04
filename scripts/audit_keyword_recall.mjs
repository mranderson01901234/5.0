#!/usr/bin/env node

/**
 * Keyword Recall Audit
 * Tests recall functionality to identify keyword matching issues
 */

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
const TEST_USER_ID = `test-recall-audit-${Date.now()}`;

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

// Test cases with expected matches
const TEST_CASES = [
  {
    name: 'Direct Keyword Match',
    memory: 'my favorite color is blue',
    queries: [
      { query: 'favorite color', expected: true, reason: 'Should match "favorite" and "color"' },
      { query: 'blue', expected: true, reason: 'Should match value "blue"' },
      { query: 'what is my favorite color', expected: true, reason: 'Should match question form' },
    ],
  },
  {
    name: 'Working Context Match',
    memory: 'I am currently working on Project Atlas',
    queries: [
      { query: 'working on', expected: true, reason: 'Should match "working" keyword' },
      { query: 'what are you working on', expected: true, reason: 'Should match question form' },
      { query: 'Project Atlas', expected: true, reason: 'Should match project name' },
      { query: 'current project', expected: true, reason: 'Should match "current" synonym' },
    ],
  },
  {
    name: 'Preference Match',
    memory: 'I prefer dark mode interfaces and minimalist design',
    queries: [
      { query: 'dark mode', expected: true, reason: 'Should match "dark mode" phrase' },
      { query: 'prefer', expected: true, reason: 'Should match "prefer" keyword' },
      { query: 'design preference', expected: true, reason: 'Should match "design" and "preference"' },
    ],
  },
  {
    name: 'Goal Match',
    memory: 'I want to finish the UI redesign by next month',
    queries: [
      { query: 'UI redesign', expected: true, reason: 'Should match "UI" and "redesign"' },
      { query: 'finish', expected: true, reason: 'Should match "finish" keyword' },
      { query: 'goal', expected: false, reason: 'Should not match - "goal" not in memory' },
      { query: 'deadline', expected: false, reason: 'Should not match - "deadline" not in memory' },
    ],
  },
  {
    name: 'Synonym Challenge',
    memory: 'my favorite programming language is TypeScript',
    queries: [
      { query: 'favorite language', expected: true, reason: 'Should match direct keywords' },
      { query: 'preferred language', expected: false, reason: 'Synonym "preferred" not matched (no synonym expansion)' },
      { query: 'coding language', expected: false, reason: 'Synonym "coding" not matched' },
    ],
  },
];

async function testRecall(query, userId) {
  try {
    const url = `${MEMORY_SERVICE_URL}/v1/recall?userId=${encodeURIComponent(userId)}&maxItems=5&deadlineMs=500&query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-user-id': userId,
        'x-internal-service': 'test-script',
      },
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        memories: data.memories || [],
        searchType: data.searchType || 'unknown',
        elapsedMs: data.elapsedMs || 0,
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        memories: [],
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      memories: [],
    };
  }
}

async function saveMemory(memory, userId, threadId) {
  try {
    const response = await fetch(`${MEMORY_SERVICE_URL}/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        'x-internal-service': 'test-script',
      },
      body: JSON.stringify({
        threadId,
        content: memory,
        priority: 0.9,
        tier: 'TIER1',
      }),
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, memory: data };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runAudit() {
  console.clear();
  log('\n🔍 Keyword Recall Functionality Audit', 'magenta');
  log(`Test User ID: ${TEST_USER_ID}`, 'magenta');
  log(`Memory Service: ${MEMORY_SERVICE_URL}\n`, 'magenta');
  
  section('PHASE 1: Setting Up Test Memories');
  
  const savedMemories = [];
  const threadId = `thread-${Date.now()}`;
  
  for (const testCase of TEST_CASES) {
    log(`\nSaving: ${testCase.name}`, 'blue');
    log(`  Memory: "${testCase.memory}"`, 'blue');
    
    const result = await saveMemory(testCase.memory, TEST_USER_ID, threadId);
    if (result.success) {
      savedMemories.push({
        ...testCase,
        savedMemory: result.memory,
      });
      log(`  ✅ Saved (ID: ${result.memory.id.substring(0, 8)}...)`, 'green');
    } else {
      log(`  ❌ Failed: ${result.error}`, 'red');
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for commits
  
  section('PHASE 2: Testing Recall Queries');
  
  const results = [];
  
  for (const testCase of savedMemories) {
    log(`\n📝 Test Case: ${testCase.name}`, 'cyan');
    log(`   Memory: "${testCase.memory}"`, 'blue');
    
    for (const queryTest of testCase.queries) {
      log(`\n   Query: "${queryTest.query}"`, 'yellow');
      log(`   Expected: ${queryTest.expected ? 'SHOULD MATCH' : 'SHOULD NOT MATCH'}`, 'yellow');
      log(`   Reason: ${queryTest.reason}`, 'yellow');
      
      const recallResult = await testRecall(queryTest.query, TEST_USER_ID);
      
      if (!recallResult.success) {
        log(`   ❌ Recall failed: ${recallResult.error}`, 'red');
        results.push({
          testCase: testCase.name,
          query: queryTest.query,
          expected: queryTest.expected,
          actual: false,
          error: recallResult.error,
          passed: false,
        });
        continue;
      }
      
      // Check if memory was found
      const found = recallResult.memories.some(m => 
        m.content.toLowerCase().includes(testCase.memory.toLowerCase().substring(0, 20))
      );
      
      const passed = found === queryTest.expected;
      
      if (passed) {
        log(`   ✅ PASS: ${found ? 'Found' : 'Not found'} (as expected)`, 'green');
      } else {
        log(`   ❌ FAIL: ${found ? 'Found but should not match' : 'Not found but should match'}`, 'red');
      }
      
      log(`   Search Type: ${recallResult.searchType}`, 'blue');
      log(`   Results: ${recallResult.memories.length} memories`, 'blue');
      
      if (recallResult.memories.length > 0 && !found) {
        log(`   Top results:`, 'blue');
        recallResult.memories.slice(0, 3).forEach((m, i) => {
          log(`     ${i + 1}. "${m.content.substring(0, 60)}..."`, 'blue');
        });
      }
      
      results.push({
        testCase: testCase.name,
        query: queryTest.query,
        expected: queryTest.expected,
        actual: found,
        searchType: recallResult.searchType,
        resultCount: recallResult.memories.length,
        passed,
        reason: queryTest.reason,
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  section('PHASE 3: Analysis Summary');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  
  log(`\nOverall Results: ${passed}/${total} tests passed (${passRate}%)`, 
    passed === total ? 'green' : passed > total * 0.7 ? 'yellow' : 'red');
  
  log('\nDetailed Results:', 'cyan');
  results.forEach((r, i) => {
    const status = r.passed ? '✅' : '❌';
    const color = r.passed ? 'green' : 'red';
    log(`  ${status} ${r.testCase}: "${r.query}"`, color);
    if (!r.passed) {
      log(`     Expected: ${r.expected ? 'match' : 'no match'}, Got: ${r.actual ? 'match' : 'no match'}`, 'yellow');
      log(`     Reason: ${r.reason}`, 'yellow');
      log(`     Search Type: ${r.searchType}`, 'yellow');
    }
  });
  
  // Group failures by type
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    section('PHASE 4: Failure Analysis');
    
    const falseNegatives = failures.filter(f => f.expected && !f.actual);
    const falsePositives = failures.filter(f => !f.expected && f.actual);
    
    if (falseNegatives.length > 0) {
      log(`\n❌ False Negatives (${falseNegatives.length}): Should match but didn't`, 'red');
      falseNegatives.forEach(fn => {
        log(`   - "${fn.query}" → Expected to find "${fn.testCase}"`, 'yellow');
        log(`     Issue: ${fn.reason}`, 'yellow');
        log(`     Search Type: ${fn.searchType}`, 'yellow');
      });
    }
    
    if (falsePositives.length > 0) {
      log(`\n❌ False Positives (${falsePositives.length}): Should not match but did`, 'red');
      falsePositives.forEach(fp => {
        log(`   - "${fp.query}" → Incorrectly matched "${fp.testCase}"`, 'yellow');
      });
    }
    
    // Analyze search type distribution
    const bySearchType = {};
    failures.forEach(f => {
      bySearchType[f.searchType] = (bySearchType[f.searchType] || 0) + 1;
    });
    
    log(`\n📊 Failures by Search Type:`, 'blue');
    Object.entries(bySearchType).forEach(([type, count]) => {
      log(`   ${type}: ${count} failures`, 'blue');
    });
  }
  
  section('PHASE 5: Recommendations');
  
  log('\n🔧 Identified Issues:', 'cyan');
  
  const keywordOnlyFailures = failures.filter(f => f.searchType === 'keyword');
  if (keywordOnlyFailures.length > 0) {
    log(`\n1. Keyword-Only Search Issues (${keywordOnlyFailures.length} failures):`, 'yellow');
    log('   - Current: Simple LIKE %keyword% matching', 'yellow');
    log('   - Problem: No phrase matching, no synonym expansion, no stemming', 'yellow');
    log('   - Impact: Misses contextual queries like "favorite color" vs "blue"', 'yellow');
  }
  
  const hybridFailures = failures.filter(f => f.searchType === 'hybrid');
  if (hybridFailures.length > 0) {
    log(`\n2. Hybrid Search Issues (${hybridFailures.length} failures):`, 'yellow');
    log('   - Problem: Semantic embeddings may not capture all query variations', 'yellow');
    log('   - Impact: Some queries fail even with embeddings', 'yellow');
  }
  
  log('\n💡 Optimization Opportunities:', 'cyan');
  log('   1. Enhance keyword extraction with phrase detection', 'green');
  log('   2. Add synonym expansion for common terms', 'green');
  log('   3. Implement FTS5 full-text search for better matching', 'green');
  log('   4. Add query preprocessing (normalization, stemming)', 'green');
  log('   5. Improve relevance scoring with term position weighting', 'green');
  log('   6. Add query expansion (synonyms, related terms)', 'green');
  
  console.log('\n');
}

runAudit().catch(err => {
  log(`\n❌ Audit failed: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});

