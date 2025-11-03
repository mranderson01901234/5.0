import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { streamChat } from '../services/gateway';
import { notify } from '@/utils/toast';
import { log } from '@/utils/logger';

interface TestResult {
  testName: string;
  passed: boolean;
  issues: string[];
  response: string;
  metadata?: any;
}

interface TestScenario {
  name: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  expectedElements?: string[];
  description: string;
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: "Simple Knowledge Query",
    description: "Tests basic information retrieval",
    conversation: [
      { role: 'user', content: 'What is machine learning?' }
    ],
    expectedElements: ['algorithm', 'data', 'pattern', 'learn']
  },
  {
    name: "Multi-turn Context",
    description: "Tests conversation continuity",
    conversation: [
      { role: 'user', content: "I'm planning a trip to Japan next spring" },
      { role: 'assistant', content: "That sounds exciting! What time of year in spring are you thinking?" },
      { role: 'user', content: "March. What should I pack?" }
    ],
    expectedElements: ['Japan', 'March', 'spring']
  },
  {
    name: "Technical Deep Dive",
    description: "Tests complex reasoning",
    conversation: [
      { role: 'user', content: 'I need to build a real-time chat application. What architecture should I use?' }
    ],
    expectedElements: ['websocket', 'real-time', 'architecture']
  },
  {
    name: "Follow-up Question",
    description: "Tests context tracking",
    conversation: [
      { role: 'user', content: 'Tell me about Python decorators' },
      { role: 'assistant', content: 'Python decorators are a powerful feature that allows you to modify or extend the behavior of functions...' },
      { role: 'user', content: 'Can you give me a practical example?' }
    ],
    expectedElements: ['decorator', 'example']
  },
  {
    name: "Conversational Tone",
    description: "Tests natural language",
    conversation: [
      { role: 'user', content: 'Hey! How are you doing today?' }
    ],
    expectedElements: ['doing', 'today']
  },
  {
    name: "Memory Recall (Same Thread)",
    description: "Tests memory recall within the same conversation",
    conversation: [
      { role: 'user', content: 'Remember that I prefer dark mode interfaces' },
      { role: 'user', content: 'What was my preference again?' }
    ],
    expectedElements: ['dark', 'mode']
  }
];

export default function PromptTester() {
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();

  const runTests = async () => {
    if (selectedTests.length === 0) {
      notify.warn('No tests selected', 'Please select at least one test to run');
      return;
    }

    setIsRunning(true);
    setResults([]);

    for (const testIndex of selectedTests) {
      const scenario = TEST_SCENARIOS[testIndex];
      if (!scenario) continue;
      log.debug(`🧪 Testing: ${scenario.name}`);

      try {
        const startTime = Date.now();
        const result = await runScenario(scenario);
        const duration = Date.now() - startTime;
        log.debug(`✅ ${scenario.name} completed in ${duration}ms - ${result.passed ? 'PASS' : 'FAIL'}`);
        setResults(prev => [...prev, result]);
      } catch (error: any) {
        log.error(`❌ ${scenario.name} error:`, error);
        notify.error(`${scenario.name} failed`, error.message || 'Unknown error');
        setResults(prev => [...prev, {
          testName: scenario.name,
          passed: false,
          issues: [`Error: ${error.message}`],
          response: ''
        }]);
      }
    }

    setIsRunning(false);
  };

  const runScenario = async (scenario: TestScenario): Promise<TestResult> => {
    const conversationHistory: Array<{ role: string; content: string }> = [];
    let lastResponse = '';
    const testThreadId = `test-${Date.now()}-${Math.random()}`;

    try {
      // Play through conversation
      for (const turn of scenario.conversation) {
        if (turn.role === 'user') {
          // Send message using the stream utility with timeout
          const token = await getToken();
          
          const isMemorySave = turn.content.toLowerCase().includes('remember');
          log.debug(`📤 Sending message to thread ${testThreadId}:`, {
            isMemorySave,
            messageLength: turn.content.length,
            historyLength: conversationHistory.length
          });
          
          const streamPromise = (async () => {
            const { stream } = await streamChat({
              threadId: testThreadId,
              messages: [...conversationHistory, turn]
            }, token || undefined);

            let turnResponse = '';

            // Read stream events with timeout
            for await (const { ev, data } of stream) {
              if (ev === 'delta') {
                const deltaText = typeof data === 'string' ? data : (data?.text || data || '');
                turnResponse += deltaText;
              } else if (ev === 'done') {
                break;
              }
            }

            return turnResponse;
          })();

          // Add 30 second timeout per turn
          const turnResponse = await Promise.race([
            streamPromise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('Stream timeout after 30s')), 30000)
            )
          ]);

          log.debug(`📥 Received response:`, {
            isMemorySave,
            responseLength: turnResponse.length,
            preview: turnResponse.substring(0, 100)
          });

          lastResponse = turnResponse; // Track last response for evaluation

          conversationHistory.push(turn);
          conversationHistory.push({ role: 'assistant', content: turnResponse });

          // If this was a memory save, add a brief delay to allow memory to be indexed
          if (isMemorySave) {
            log.debug('⏳ Waiting 500ms for memory indexing...');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          conversationHistory.push(turn);
        }
      }

      // Evaluate the final response
      const evaluation = evaluateResponse(lastResponse, scenario);
      
      return {
        testName: scenario.name,
        passed: evaluation.passed,
        issues: evaluation.issues,
        response: lastResponse
      };
    } catch (error: any) {
      return {
        testName: scenario.name,
        passed: false,
        issues: [`Error: ${error.message || 'Unknown error'}`],
        response: lastResponse || ''
      };
    }
  };

  const evaluateResponse = (response: string, scenario: TestScenario): { passed: boolean; issues: string[] } => {
    const issues: string[] = [];
    const lowerResponse = response.toLowerCase();

    // Check expected elements
    if (scenario.expectedElements) {
      const missing = scenario.expectedElements.filter(
        element => !lowerResponse.includes(element.toLowerCase())
      );
      if (missing.length > 0) {
        issues.push(`Missing: ${missing.join(', ')}`);
      }
    }

    // Check length
    if (response.length < 20) {
      issues.push('Response too short');
    } else if (response.length > 2000) {
      issues.push('Response too long');
    }

    // Check conversational tone
    const conversational = /\b(I|you|your|we|let's|that's|here's)\b/i.test(response);
    if (!conversational) {
      issues.push('Not conversational enough');
    }

    // Check context awareness (skip for memory tests - they have special checks)
    if (scenario.conversation.length > 1 && !scenario.description.includes('memory')) {
      const contextAware = /\b(continu|earlier|previous|as we|mentioned|said)\b/i.test(response);
      if (!contextAware) {
        issues.push('Not showing context awareness');
      }
    }

    // Check for robotic patterns
    const roboticPatterns = [
      /\bas an ai language model\b/i,
      /\bi apologize but\b/i,
      /\bi cannot\s/,
    ];
    if (roboticPatterns.some(pattern => pattern.test(response))) {
      issues.push('Too robotic/formulaic');
    }

    // Special check for memory recall scenarios
    if (scenario.name === 'Cross-Chat Memory Recall' || scenario.description.includes('memory')) {
      // Check if response shows memory recall (mentions the saved information)
      const hasMemoryRecall = scenario.expectedElements?.some(elem => 
        lowerResponse.includes(elem.toLowerCase())
      );
      if (!hasMemoryRecall) {
        issues.push('Memory not recalled - response should reference saved preference');
      }
    }

    return {
      passed: issues.length === 0,
      issues
    };
  };

  const sendManualMessage = async () => {
    if (!currentInput.trim() || isLoading) return;

    const userMessage = { role: 'user' as const, content: currentInput };
    setMessages(prev => [...prev, userMessage]);
    setCurrentInput('');
    setIsLoading(true);

    try {
      const token = await getToken();
      const threadId = `manual-${Date.now()}`;
      
      const { stream } = await streamChat({
        threadId,
        messages: [...messages, userMessage]
      }, token || undefined);

      let assistantResponse = '';

      for await (const { ev, data } of stream) {
        if (ev === 'delta') {
          const deltaText = typeof data === 'string' ? data : (data?.text || data || '');
          assistantResponse += deltaText;
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);
    } catch (error: any) {
      log.error('Error:', error);
      notify.error('Request failed', error.message || 'Unknown error');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.message}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">Prompt Quality Tester</h1>
      <p className="text-white/70 mb-8">Test conversation quality and tune your prompts</p>

      {/* Test Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Tests</h2>
        <div className="space-y-3">
          {TEST_SCENARIOS.map((scenario, idx) => (
            <label key={idx} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTests.includes(idx)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTests([...selectedTests, idx]);
                  } else {
                    setSelectedTests(selectedTests.filter(i => i !== idx));
                  }
                }}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">{scenario.name}</div>
                <div className="text-sm text-gray-600">{scenario.description}</div>
              </div>
            </label>
          ))}
        </div>
        
        <button
          onClick={runTests}
          disabled={isRunning || selectedTests.length === 0}
          className="mt-4 px-6 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Running Tests...' : 'Run Selected Tests'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            Results: {passedCount} passed, {failedCount} failed
          </h2>
          <div className="space-y-4">
            {results.map((result, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${
                result.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{result.testName}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${
                    result.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                  }`}>
                    {result.passed ? '✅ PASS' : '❌ FAIL'}
                  </span>
                </div>
                
                {result.issues.length > 0 && (
                  <div className="mb-2">
                    <div className="text-sm font-medium text-red-700">Issues:</div>
                    <ul className="text-sm text-red-600 list-disc list-inside">
                      {result.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                    Show Response
                  </summary>
                  <div className="mt-2 p-3 bg-gray-100 rounded text-sm whitespace-pre-wrap">
                    {result.response || '(No response)'}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Tester */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Manual Tester</h2>
        <div className="mb-4 max-h-96 overflow-y-auto border rounded p-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
                msg.role === 'user' 
                  ? 'bg-blue-100' 
                  : 'bg-gray-100'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="text-left mb-3">
              <div className="inline-block bg-gray-100 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
                  Thinking...
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendManualMessage()}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            onClick={sendManualMessage}
            disabled={isLoading || !currentInput.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            Send
          </button>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold mb-2">💡 Testing Tips</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>• Check if responses acknowledge previous context</li>
          <li>• Verify tone is natural and conversational</li>
          <li>• Confirm responses are appropriately length</li>
          <li>• Look for synthesis vs raw data dumps</li>
          <li>• Test multi-turn conversation continuity</li>
        </ul>
      </div>
    </div>
  );
}

