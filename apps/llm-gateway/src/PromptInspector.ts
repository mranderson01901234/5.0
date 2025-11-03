/**
 * Quick Prompt Inspector
 * Run this to see your current base prompt and system prompt structure
 */

import { PromptBuilder } from './PromptBuilder.js';
import { preprocessContext } from './ContextPreprocessor.js';

export async function inspectCurrentPrompts() {
  console.log('🔍 Current Prompt Analysis\n');
  
  // 1. Inspect base prompt
  console.log('=== BASE PROMPT ===');
  const basePrompt = PromptBuilder.getDefaultBasePrompt();
  console.log(basePrompt);
  console.log(`\nLength: ${basePrompt.length} characters\n`);
  
  // 2. Test prompt building with sample context
  console.log('=== SAMPLE PROMPT BUILD ===');
  const builder = new PromptBuilder();
  builder.setBasePrompt(basePrompt);
  
  // Add some sample instructions and context
  builder.addInstruction('Be conversational and helpful', 'high');
  builder.addInstruction('Provide detailed explanations when needed', 'medium');
  
  builder.addContext(
    '[Memory] user is learning React\n[Memory] user prefers practical examples',
    'memory',
    true
  );
  
  builder.addContext(
    'React is a JavaScript library for building user interfaces...',
    'rag',
    true
  );
  
  const builtPrompt = builder.build();
  console.log('Built prompt structure:');
  builtPrompt.forEach((msg, i) => {
    console.log(`\n--- Message ${i + 1} (${msg.role}) ---`);
    console.log(msg.content);
  });
  
  // 3. Analyze potential issues
  console.log('\n=== ANALYSIS ===');
  
  const fullPromptText = builtPrompt.map(m => m.content).join('\n');
  
  console.log(`Total prompt length: ${fullPromptText.length} characters`);
  console.log(`Estimated tokens: ~${Math.ceil(fullPromptText.length / 4)}`);
  
  // Check for conversational indicators
  const conversationalWords = ['you', 'your', 'I', 'we', 'let\'s', 'please'];
  const hasConversationalTone = conversationalWords.some(word => 
    fullPromptText.toLowerCase().includes(word)
  );
  console.log(`Conversational tone: ${hasConversationalTone ? '✅' : '❌'}`);
  
  // Check for memory integration instructions
  const hasMemoryInstructions = fullPromptText.toLowerCase().includes('memory') ||
                               fullPromptText.toLowerCase().includes('previous') ||
                               fullPromptText.toLowerCase().includes('context');
  console.log(`Memory integration guidance: ${hasMemoryInstructions ? '✅' : '❌'}`);
  
  // Check prompt structure
  const hasSystemRole = builtPrompt.some(m => m.role === 'system');
  console.log(`Uses system role: ${hasSystemRole ? '✅' : '❌'}`);
  
  console.log('\n=== RECOMMENDATIONS ===');
  
  if (!hasConversationalTone) {
    console.log('⚠️  Consider adding more conversational language to base prompt');
  }
  
  if (!hasMemoryInstructions) {
    console.log('⚠️  Consider adding explicit instructions about using memory context');
  }
  
  if (fullPromptText.length > 2000) {
    console.log('⚠️  Prompt might be too long for some models (especially Haiku)');
  }
  
  console.log('\n✅ Prompt inspection complete!');
}

// Also create a quick test to see how context preprocessing affects readability
export function testContextPreprocessing() {
  console.log('\n\n🔄 CONTEXT PREPROCESSING TEST\n');
  
  const rawMemory = `[Memory] user is learning Spanish
[Memory] user's favorite color is blue  
[Memory] user works at OpenAI as researcher
[Memory] user mentioned studying transformer architectures`;

  const rawRAG = `React Hooks: Learn about useState (from react.dev)
useState is a Hook that lets you add state to functional components
Example: const [count, setCount] = useState(0)`;

  console.log('=== RAW MEMORY ===');
  console.log(rawMemory);
  
  console.log('\n=== PREPROCESSED MEMORY ===');
  const preprocessedMemory = preprocessContext(rawMemory, 'memory');
  console.log(preprocessedMemory);
  
  console.log('\n=== RAW RAG ===');
  console.log(rawRAG);
  
  console.log('\n=== PREPROCESSED RAG ===');
  const preprocessedRAG = preprocessContext(rawRAG, 'rag');
  console.log(preprocessedRAG);
  
  console.log('\n❓ Questions to consider:');
  console.log('1. Is important specificity being lost in preprocessing?');
  console.log('2. Would the model benefit from knowing the source type?');
  console.log('3. Are technical details being oversimplified?');
  
  // Compare lengths
  console.log('\n📊 Length Comparison:');
  console.log(`Raw memory: ${rawMemory.length} chars → Preprocessed: ${preprocessedMemory.length} chars`);
  console.log(`Raw RAG: ${rawRAG.length} chars → Preprocessed: ${preprocessedRAG.length} chars`);
  
  // Check if important keywords are preserved
  console.log('\n🔑 Keyword Preservation:');
  const memoryKeywords = ['Spanish', 'blue', 'OpenAI', 'researcher', 'transformer'];
  const memoryPreserved = memoryKeywords.every(k => 
    preprocessedMemory.toLowerCase().includes(k.toLowerCase())
  );
  console.log(`Memory keywords preserved: ${memoryPreserved ? '✅' : '❌'}`);
  
  const ragKeywords = ['useState', 'Hook', 'functional', 'state'];
  const ragPreserved = ragKeywords.every(k =>
    preprocessedRAG.toLowerCase().includes(k.toLowerCase())
  );
  console.log(`RAG keywords preserved: ${ragPreserved ? '✅' : '❌'}`);
}

// Main execution when run directly
export async function run() {
  await inspectCurrentPrompts();
  testContextPreprocessing();
}

