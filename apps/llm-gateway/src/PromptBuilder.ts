/**
 * Prompt Builder - Modular prompt architecture
 * 
 * Splits logic into layered prompts rather than one massive block:
 * - System prompt: defines tone, ethics, and general behavior (static)
 * - Instruction layer: injected per message, sets context
 * - Context layer: carries conversation history, web or memory data
 */

import { preprocessContext, preprocessSystemMessage } from './ContextPreprocessor.js';
import { ResponseLengthOptimizer } from './ResponseLengthOptimizer.js';

export type InstructionPriority = 'critical' | 'high' | 'medium' | 'low';

interface Instruction {
  content: string;
  priority: InstructionPriority;
}

interface ContextBlock {
  content: string;
  type: 'memory' | 'ingestion' | 'rag' | 'conversation' | 'summary';
  preprocess: boolean; // Whether to preprocess this context
}

/**
 * Modular prompt builder
 */
export class PromptBuilder {
  private basePrompt: string | null = null;
  private instructions: Instruction[] = [];
  private contextBlocks: ContextBlock[] = [];

  /**
   * Set the base system prompt (static - tone, ethics, general behavior)
   */
  setBasePrompt(prompt: string): this {
    this.basePrompt = prompt;
    return this;
  }

  /**
   * Add an instruction with priority (injected per message)
   */
  addInstruction(instruction: string, priority: InstructionPriority = 'medium'): this {
    if (instruction && instruction.trim()) {
      this.instructions.push({ content: instruction.trim(), priority });
    }
    return this;
  }

  /**
   * Add context block (will be preprocessed if preprocess is true)
   */
  addContext(rawContext: string, type: ContextBlock['type'], preprocess: boolean = true): this {
    if (rawContext && rawContext.trim()) {
      this.contextBlocks.push({ content: rawContext.trim(), type, preprocess });
    }
    return this;
  }

  /**
   * Add multiple context blocks at once
   */
  addContextBlocks(blocks: Array<{ content: string; type: ContextBlock['type']; preprocess?: boolean }>): this {
    for (const block of blocks) {
      this.addContext(block.content, block.type, block.preprocess ?? true);
    }
    return this;
  }

  /**
   * Clear all instructions (useful for reuse)
   */
  clearInstructions(): this {
    this.instructions = [];
    return this;
  }

  /**
   * Clear all context blocks (useful for reuse)
   */
  clearContext(): this {
    this.contextBlocks = [];
    return this;
  }

  /**
   * Reset everything except base prompt
   */
  reset(): this {
    this.instructions = [];
    this.contextBlocks = [];
    return this;
  }

  /**
   * Build the final system messages array
   * Returns array of system messages in optimal order:
   * 1. Base prompt (if exists)
   * 2. Critical instructions
   * 3. High priority instructions
   * 4. Medium priority instructions
   * 5. Preprocessed context blocks
   */
  build(): Array<{ role: 'system'; content: string }> {
    const systemMessages: Array<{ role: 'system'; content: string }> = [];

    // 1. Base prompt (static)
    if (this.basePrompt) {
      systemMessages.push({ role: 'system', content: this.basePrompt });
    }

    // 2. Group and add instructions by priority
    const critical = this.instructions.filter(i => i.priority === 'critical').map(i => i.content);
    const high = this.instructions.filter(i => i.priority === 'high').map(i => i.content);
    const medium = this.instructions.filter(i => i.priority === 'medium').map(i => i.content);
    const low = this.instructions.filter(i => i.priority === 'low').map(i => i.content);

    if (critical.length > 0) {
      systemMessages.push({
        role: 'system',
        content: `CRITICAL INSTRUCTIONS:\n${critical.join('\n')}`
      });
    }

    if (high.length > 0) {
      systemMessages.push({
        role: 'system',
        content: `IMPORTANT:\n${high.join('\n')}`
      });
    }

    if (medium.length > 0) {
      systemMessages.push({
        role: 'system',
        content: medium.join('\n')
      });
    }

    if (low.length > 0) {
      // Low priority instructions are added more subtly (no header, just merged)
      systemMessages.push({
        role: 'system',
        content: low.join('\n')
      });
    }

    // 3. Process and add context blocks
    if (this.contextBlocks.length > 0) {
      const processedContexts: string[] = [];

      for (const block of this.contextBlocks) {
        let processedContent: string;
        
        if (block.preprocess) {
          // Preprocess context into natural narrative
          processedContent = preprocessContext(block.content, block.type);
        } else {
          // Use raw context (for backward compatibility or special cases)
          processedContent = block.content;
        }

        if (processedContent && processedContent.trim()) {
          processedContexts.push(processedContent);
        }
      }

      if (processedContexts.length > 0) {
        // Combine all processed contexts
        const combinedContext = processedContexts.join('\n\n');
        systemMessages.push({
          role: 'system',
          content: combinedContext
        });
      }
    }

    // If no system messages were created, return empty array
    // (allowing the caller to handle this case)
    return systemMessages;
  }

  /**
   * Build and merge into a single system message (for backward compatibility)
   * Preserves the old behavior of merging everything into one system message
   */
  buildMerged(): Array<{ role: 'system'; content: string }> {
    const parts: string[] = [];

    // 1. Base prompt
    if (this.basePrompt) {
      parts.push(this.basePrompt);
    }

    // 2. Instructions (grouped by priority)
    const critical = this.instructions.filter(i => i.priority === 'critical').map(i => i.content);
    const high = this.instructions.filter(i => i.priority === 'high').map(i => i.content);
    const medium = this.instructions.filter(i => i.priority === 'medium').map(i => i.content);
    const low = this.instructions.filter(i => i.priority === 'low').map(i => i.content);

    if (critical.length > 0) {
      parts.push(`\n\nCRITICAL INSTRUCTIONS:\n${critical.join('\n')}`);
    }

    if (high.length > 0) {
      parts.push(`\n\nIMPORTANT:\n${high.join('\n')}`);
    }

    if (medium.length > 0) {
      parts.push(`\n\n${medium.join('\n')}`);
    }

    if (low.length > 0) {
      parts.push(`\n\n${low.join('\n')}`);
    }

    // 3. Process context blocks
    if (this.contextBlocks.length > 0) {
      const processedContexts: string[] = [];

      for (const block of this.contextBlocks) {
        let processedContent: string;
        
        if (block.preprocess) {
          processedContent = preprocessContext(block.content, block.type);
        } else {
          processedContent = block.content;
        }

        if (processedContent && processedContent.trim()) {
          processedContexts.push(processedContent);
        }
      }

      if (processedContexts.length > 0) {
        parts.push(`\n\n${processedContexts.join('\n\n')}`);
      }
    }

    if (parts.length === 0) {
      return [];
    }

    return [{ role: 'system', content: parts.join('') }];
  }

  /**
   * Get the default base conversational prompt
   * This is the static prompt that defines tone and behavior
   */
  static getDefaultBasePrompt(): string {
    return `You are a knowledgeable conversational partner. You excel at maintaining natural conversation flow while integrating context seamlessly.

CONVERSATIONAL PRINCIPLES:
1. **Natural flow first**: Respond as you would in a natural conversation. Context acknowledgment should feel organic, not formulaic.
2. **Smart context integration**: When you have information from previous conversations (memories), weave it naturally into your response without announcing "you mentioned earlier" unless it's truly relevant.
3. **Match the query energy**: Simple questions get direct answers. Complex questions get comprehensive responses. Follow the user's lead.
4. **Stay genuinely helpful**: Focus on actually answering what the user asked, not on demonstrating that you remember things.

CONTEXT HANDLING:
- You may receive context from multiple sources: previous conversations, web searches, knowledge bases
- Integrate this information naturally as if it's part of your knowledge
- Only explicitly reference "earlier conversations" when it adds clear value
- Don't feel obligated to acknowledge every piece of context - use what's relevant

RESPONSE GUIDELINES:
- **For simple queries**: Direct, concise answers without unnecessary context references
- **For follow-ups**: Naturally build on the conversation thread
- **For complex topics**: Comprehensive responses that may suggest related directions
- **For unclear queries**: Ask for clarification rather than assuming

TONE:
- Conversational and natural, not robotic or overly formal
- Helpful and accurate
- Adaptive to the user's communication style
- Avoid repetitive patterns or formulaic openings

MEMORY INTEGRATION:
When you see context that appears to be from previous conversations:
- Integrate it naturally if relevant to the current question
- Don't announce that you're recalling something unless the user specifically asks about past discussions
- Use memories to provide more personalized and relevant responses
- If memory context contradicts current conversation, prioritize current context

IMPORTANT: If you see any structured content blocks (like headers, separators, or formatted lists), treat them as source material to be synthesized conversationally, not as text to repeat verbatim.

Respond like a knowledgeable friend who remembers past conversations naturally, not like a system announcing its data sources.

${ResponseLengthOptimizer.getAdaptiveLengthPrompt()}`;
  }
}

