/**
 * Conversation Flow Tester for Your Sophisticated Chat System
 * Tests memory recall, context integration, model routing, and conversational quality
 */

import { randomUUID } from 'crypto';

interface ConversationTest {
  name: string;
  scenario: TestScenario;
  expectedBehaviors: ExpectedBehavior[];
  threadId?: string;
  userId: string;
}

interface TestScenario {
  setup?: string;
  turns: ConversationTurn[];
}

interface ConversationTurn {
  user: string;
  expectedInResponse?: string[];
  shouldNotContain?: string[];
  expectedModel?: string;
  expectMemoryRecall?: boolean;
  expectWebSearch?: boolean;
  expectRAG?: boolean;
  expectedResponse?: {
    shouldStartWith?: string[];
    shouldNotStartWith?: string[];
    shouldContain?: string[];
    shouldAvoidPatterns?: string[]; // Will be compiled to RegExp
    maxLength?: number;
    minLength?: number;
  };
}

interface ExpectedBehavior {
  type: 'memory' | 'routing' | 'context' | 'tone' | 'length' | 'accuracy';
  description: string;
  validator: (response: any, metadata: any) => boolean;
}

interface TestResult {
  testName: string;
  passed: boolean;
  failures: string[];
  conversation: any[];
  duration?: number;
}

interface TestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  successRate: number;
  issues: string[];
  recommendations: string[];
  results: TestResult[];
}

export class ConversationFlowTester {
  private baseUrl: string;
  private apiKey: string;
  private userId: string;
  private testResults: TestResult[] = [];

  constructor(baseUrl: string, apiKey: string, userId: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.userId = userId;
  }

  private testScenarios: ConversationTest[] = [
    {
      name: "Formulaic Response Pattern Test",
      userId: "test-formulaic",
      scenario: {
        setup: "Test for robotic, formulaic responses",
        turns: [
          {
            user: "What's 2+2?",
            expectedResponse: {
              shouldNotStartWith: [
                "continuing our discussion",
                "you asked about",
                "as we discussed",
                "building on",
                "following"
              ],
              shouldAvoidPatterns: [
                "^(continuing|following|building on|you (asked|mentioned))"
              ]
            }
          },
          {
            user: "Tell me more about that",
            expectedInResponse: ["addition", "math", "4"],
            expectedResponse: {
              // Follow-up SHOULD reference context naturally
              shouldContain: ["4", "two"]
            }
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'tone',
          description: 'Simple questions should not start with formulaic context acknowledgment',
          validator: (response, metadata) => true // Validated in turn checks
        }
      ]
    },

    {
      name: "Memory Integration Naturalness Test",
      userId: "test-memory-integration",
      scenario: {
        setup: "Test if memory is integrated naturally",
        turns: [
          {
            user: "I'm learning Spanish",
            expectedInResponse: ["spanish", "learning"]
          },
          {
            user: "What language tips do you have?",
            expectedInResponse: ["spanish"],
            expectedResponse: {
              shouldNotStartWith: [
                "you mentioned studying spanish earlier",
                "from your previous message about spanish",
                "earlier you said"
              ]
            }
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'context',
          description: 'Memory should be integrated naturally without robotic announcements',
          validator: (response, metadata) => 
            response.toLowerCase().includes('spanish')
        }
      ]
    },

    {
      name: "Context Source Confusion Test",
      userId: "test-context-sources",
      scenario: {
        setup: "Test if model distinguishes memory vs current context",
        turns: [
          {
            user: "What are the latest React features in 2025?",
            expectWebSearch: true,
            expectedInResponse: ["react", "2025"],
            expectedResponse: {
              shouldNotStartWith: [
                "you mentioned",
                "earlier you said",
                "in your previous message"
              ]
            }
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'accuracy',
          description: 'Web search results should not be treated as user mentions',
          validator: (response, metadata) => 
            response.length > 100 && response.toLowerCase().includes('react')
        }
      ]
    },

    {
      name: "Conversational Continuity Test",
      userId: "test-continuity",
      scenario: {
        turns: [
          {
            user: "I'm building a React app for tracking expenses",
            expectedInResponse: ["react", "expenses", "app"]
          },
          {
            user: "What components should I create first?",
            expectedInResponse: ["expense", "component"],
            expectedResponse: {
              shouldNotStartWith: [
                "you asked about components",
                "continuing our discussion"
              ]
            }
          },
          {
            user: "How do I handle state?",
            expectedInResponse: ["state", "react"],
            expectedResponse: {
              maxLength: 1200 // State management deserves detailed explanation (with some buffer)
            }
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'context',
          description: 'Should maintain context without being formulaic',
          validator: (response, metadata) => true // Validated in turn checks
        }
      ]
    },

    {
      name: "Response Length Appropriateness Test",
      userId: "test-response-length",
      scenario: {
        turns: [
          {
            user: "What's useState?",
            expectedInResponse: ["hook", "state"],
            expectedResponse: {
              minLength: 50,
              maxLength: 1200 // Increased - useState can warrant more detailed explanation
            }
          },
          {
            user: "Explain the philosophical implications of consciousness in AI systems",
            expectedInResponse: ["consciousness"], // More lenient - just check for main topic
            expectedResponse: {
              minLength: 300,
              maxLength: 2000 // Complex philosophical query can be longer
            }
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'length',
          description: 'Response length should match query complexity',
          validator: (response) => response.length > 50
        }
      ]
    },

    {
      name: "Memory Recall Across Conversations",
      userId: "test-user-memory",
      scenario: {
        setup: "Test if the system recalls information from previous conversations",
        turns: [
          {
            user: "I'm learning Spanish and my favorite color is blue",
            expectedInResponse: ["spanish", "blue"],
            expectMemoryRecall: false
          },
          {
            user: "What language was I learning?",
            expectedInResponse: ["spanish"],
            expectMemoryRecall: true
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'memory',
          description: 'Should recall Spanish from previous turn',
          validator: (response, metadata) => 
            response.toLowerCase().includes('spanish')
        }
      ]
    },

    {
      name: "Complex Reasoning Query Routing",
      userId: "test-user-routing",
      scenario: {
        turns: [
          {
            user: "Analyze the philosophical implications of artificial consciousness emerging from large language models",
            shouldNotContain: ["I don't have enough context"],
            expectMemoryRecall: false
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'length',
          description: 'Complex query should get substantial response',
          validator: (response) => response.length > 500
        }
      ]
    },

    {
      name: "Web Search Integration",
      userId: "test-user-web",
      scenario: {
        turns: [
          {
            user: "What are the latest updates to React?",
            expectWebSearch: true,
            expectedInResponse: ["React"], // Check for topic mention
            shouldNotContain: ["I don't have current information", "my knowledge cutoff", "couldn't find much"]
          }
        ]
      },
      expectedBehaviors: [
        {
          type: 'accuracy',
          description: 'Should provide current information or attempt web search',
          validator: (response, metadata) => {
            // More lenient: either web search was attempted OR response has substantial content
            const hasWebSearch = metadata?.web_search === true;
            const hasSubstantialContent = response.length > 100;
            const doesntSayNotFound = !response.toLowerCase().includes("couldn't find");
            return hasWebSearch || (hasSubstantialContent && doesntSayNotFound);
          }
        }
      ]
    }
  ];

  async runAllTests(): Promise<TestSummary> {
    console.log('🧪 Starting Conversation Flow Tests for Your Architecture\n');
    
    for (const test of this.testScenarios) {
      console.log(`Testing: ${test.name}`);
      const startTime = Date.now();
      const result = await this.runSingleTest(test);
      result.duration = Date.now() - startTime;
      this.testResults.push(result);
      
      if (result.passed) {
        console.log(`✅ PASSED (${result.duration}ms)`);
      } else {
        console.log(`❌ FAILED (${result.duration}ms): ${result.failures.join(', ')}`);
        // Show a preview of the conversation for debugging
        if (result.conversation.length > 0) {
          const lastAssistantMsg = result.conversation.filter(m => m.role === 'assistant').pop();
          if (lastAssistantMsg) {
            const preview = lastAssistantMsg.content.substring(0, 200);
            console.log(`   Response preview: "${preview}${lastAssistantMsg.content.length > 200 ? '...' : ''}"`);
          }
        }
      }
      console.log('');
      
      // Wait between tests to avoid rate limiting
      await this.sleep(1000);
    }

    return this.generateSummary();
  }

  private async runSingleTest(test: ConversationTest): Promise<TestResult> {
    const failures: string[] = [];
    const threadId = test.threadId || `test-${Date.now()}`;
    let messages: any[] = [];
    let searchPerformed = false;

    try {
      for (let i = 0; i < test.scenario.turns.length; i++) {
        const turn = test.scenario.turns[i];
        
        // Send message to your API
        const response = await this.sendMessage({
          thread_id: threadId,
          messages: [...messages, { role: 'user', content: turn.user }],
        });

        // Track if web search was performed
        if (response.metadata?.web_search) {
          searchPerformed = true;
        }

        // Update conversation history
        messages.push({ role: 'user', content: turn.user });
        messages.push({ role: 'assistant', content: response.content });

        // Validate turn expectations
        const turnFailures = this.validateTurn(turn, response, searchPerformed);
        failures.push(...turnFailures);
      }

      // Validate overall behaviors
      const lastResponse = messages[messages.length - 1];
      const lastMetadata = { 
        web_search: searchPerformed,
        model: undefined, // Model info not in SSE stream currently
        contextSources: undefined
      };
      
      for (const behavior of test.expectedBehaviors) {
        if (!behavior.validator(lastResponse.content, lastMetadata)) {
          failures.push(`Behavior check failed: ${behavior.description}`);
        }
      }

    } catch (error: any) {
      failures.push(`Test execution error: ${error.message}`);
    }

    return {
      testName: test.name,
      passed: failures.length === 0,
      failures,
      conversation: messages
    };
  }

  private async sendMessage(request: any): Promise<any> {
    // Convert camelCase to snake_case for API payload
    const apiPayload = {
      thread_id: request.thread_id || request.threadId,
      messages: request.messages,
      provider: request.provider,
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    };
    
    const response = await fetch(`${this.baseUrl}/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(apiPayload)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    let fullContent = '';
    let metadata: any = {};

    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE frames
        while (buffer.includes('\n\n')) {
          const frameEnd = buffer.indexOf('\n\n');
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          
          const lines = frame.split('\n');
          let eventType = 'delta';
          let data = {};
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              try {
                data = JSON.parse(dataStr);
              } catch (e) {
                // For token/delta events, data might be a string
                data = dataStr;
              }
            }
          }
          
          // Handle different event types
          if (eventType === 'delta' || eventType === 'token') {
            const deltaText = typeof data === 'string' ? data : ((data as any)?.text || data || '');
            fullContent += deltaText;
          } else if (eventType === 'done') {
            // Extract metadata from done event
            if (typeof data === 'object' && data !== null) {
              metadata = { ...metadata, ...data };
            }
          } else if (eventType === 'sources') {
            metadata.web_search = true;
          }
        }
      }
    }

    return { content: fullContent, metadata };
  }

  private validateTurn(turn: ConversationTurn, response: any, searchPerformed: boolean): string[] {
    const failures: string[] = [];
    const content = response.content.toLowerCase();
    const responseText = response.content;

    // Check expected content
    if (turn.expectedInResponse) {
      for (const expected of turn.expectedInResponse) {
        if (!content.includes(expected.toLowerCase())) {
          failures.push(`Missing expected content: "${expected}"`);
        }
      }
    }

    // Check forbidden content
    if (turn.shouldNotContain) {
      for (const forbidden of turn.shouldNotContain) {
        if (content.includes(forbidden.toLowerCase())) {
          failures.push(`Contains forbidden content: "${forbidden}"`);
        }
      }
    }

    // Check web search
    if (turn.expectWebSearch && !searchPerformed) {
      failures.push('Expected web search but none performed');
    }

    // Check memory recall (basic check - would need actual memory service integration to be fully accurate)
    if (turn.expectMemoryRecall) {
      // Just verify the response is contextually aware
      if (response.content.length < 50) {
        failures.push('Expected memory recall but response too short');
      }
    }

    // Validate expected response patterns if specified
    if (turn.expectedResponse) {
      const expected = turn.expectedResponse;
      
      // Check should start with
      if (expected.shouldStartWith) {
        const startsWithAny = expected.shouldStartWith.some(start => 
          responseText.toLowerCase().startsWith(start.toLowerCase())
        );
        if (!startsWithAny) {
          failures.push(`Should start with one of: ${expected.shouldStartWith.join(', ')}`);
        }
      }

      // Check should NOT start with
      if (expected.shouldNotStartWith) {
        for (const badStart of expected.shouldNotStartWith) {
          if (responseText.toLowerCase().startsWith(badStart.toLowerCase())) {
            failures.push(`Should NOT start with: "${badStart}"`);
          }
        }
      }

      // Check should contain
      if (expected.shouldContain) {
        for (const item of expected.shouldContain) {
          if (!content.includes(item.toLowerCase())) {
            failures.push(`Should contain: "${item}"`);
          }
        }
      }

      // Check should avoid patterns
      if (expected.shouldAvoidPatterns) {
        for (const patternStr of expected.shouldAvoidPatterns) {
          try {
            const pattern = new RegExp(patternStr, 'i');
            if (pattern.test(responseText)) {
              failures.push(`Should avoid pattern: ${patternStr}`);
            }
          } catch (e) {
            // Invalid regex, skip
          }
        }
      }

      // Check length constraints
      if (expected.maxLength && responseText.length > expected.maxLength) {
        failures.push(`Too long: ${responseText.length} chars (max ${expected.maxLength})`);
      }

      if (expected.minLength && responseText.length < expected.minLength) {
        failures.push(`Too short: ${responseText.length} chars (min ${expected.minLength})`);
      }
    }

    return failures;
  }

  private generateLargeContext(): string {
    // Generate a context that should trigger context-heavy routing
    return "Let me describe a complex software architecture scenario with multiple microservices, databases, caching layers, message queues, load balancers, monitoring systems, deployment pipelines, security protocols, data transformation processes, machine learning inference endpoints, real-time analytics, user authentication systems, content delivery networks, backup strategies, disaster recovery procedures, performance optimization techniques, scalability considerations, cost optimization approaches, compliance requirements, integration patterns, API gateways, service mesh configurations, container orchestration, infrastructure as code, observability stack, alerting mechanisms, and automated testing frameworks. ".repeat(10);
  }

  private generateSummary(): TestSummary {
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    
    const issues = this.testResults
      .filter(r => !r.passed)
      .flatMap(r => r.failures);

    const recommendations = this.generateRecommendations(issues);

    return {
      totalTests: total,
      passed,
      failed: total - passed,
      successRate: (passed / total) * 100,
      issues,
      recommendations,
      results: this.testResults
    };
  }

  private generateRecommendations(issues: string[]): string[] {
    const recommendations: string[] = [];
    
    if (issues.some(i => i.includes('memory recall'))) {
      recommendations.push('Consider increasing memory recall deadline from 200ms');
    }
    
    if (issues.some(i => i.includes('Wrong model'))) {
      recommendations.push('Review model routing logic in Router.ts');
    }
    
    if (issues.some(i => i.includes('Missing expected content'))) {
      recommendations.push('Check context preprocessing - may be removing too much detail');
    }
    
    if (issues.some(i => i.includes('conversational tone'))) {
      recommendations.push('Review base prompt in PromptBuilder.getDefaultBasePrompt()');
    }

    if (issues.some(i => i.includes('web search'))) {
      recommendations.push('Check web search configuration and API keys');
    }

    // New recommendations for formulaic responses
    if (issues.some(i => i.includes('Should NOT start with'))) {
      recommendations.push('🚨 CRITICAL: Responses are formulaic and robotic');
      recommendations.push('Remove mandatory context acknowledgment structure from base prompt');
      recommendations.push('Make response structure guidelines, not requirements');
    }

    if (issues.some(i => i.includes('Too long') || i.includes('Too short'))) {
      recommendations.push('Review response length guidance in base prompt');
    }

    if (issues.some(i => i.includes('Should avoid pattern'))) {
      recommendations.push('⚠️ Formulaic response patterns detected');
      recommendations.push('Consider removing rigid response structure requirements');
    }

    return recommendations;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
export async function runTests(baseUrl: string, apiKey: string, userId: string): Promise<TestSummary> {
  const tester = new ConversationFlowTester(baseUrl, apiKey, userId);
  const summary = await tester.runAllTests();
  
  console.log('\n📊 Test Summary:');
  console.log(`Success Rate: ${summary.successRate.toFixed(1)}%`);
  console.log(`Passed: ${summary.passed}/${summary.totalTests}`);
  
  if (summary.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    summary.recommendations.forEach(rec => console.log(`- ${rec}`));
  }
  
  return summary;
}

