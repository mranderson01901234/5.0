import { analyzeQuery } from './src/QueryAnalyzer.js';

const testQueries = [
  "remember that my favorite color is blue",
  "remember my phone number",
  "can you remember that",
  "remember this",
  "what do you remember",
];

console.log("=== Query Analyzer Test ===\n");
testQueries.forEach(query => {
  const analysis = analyzeQuery(query);
  console.log(`Query: "${query}"`);
  console.log(`  Intent: ${analysis.intent}`);
  console.log(`  Complexity: ${analysis.complexity}`);
  console.log();
});
