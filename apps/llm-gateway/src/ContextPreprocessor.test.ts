import { describe, it, expect } from 'vitest';
import { preprocessContext, preprocessSystemMessage } from './ContextPreprocessor.js';

describe('ContextPreprocessor', () => {
  describe('preprocessContext - Memory', () => {
    it('should transform [Memory] blocks to natural narrative', () => {
      const input = '[Memory] user studied dopamine';
      const result = preprocessContext(input, 'memory');
      // Should remove [Memory] marker and transform to narrative
      expect(result).not.toContain('[Memory]');
      // Should contain the content in some form
      expect(result).toContain('dopamine');
    });

    it('should handle multiple memory entries', () => {
      const input = '[Memory] user studied dopamine\n[Memory] user likes React';
      const result = preprocessContext(input, 'memory');
      expect(result.split('\n\n').length).toBeGreaterThan(1);
      expect(result).not.toContain('[Memory]');
    });

    it('should handle memory with header', () => {
      const input = 'Relevant memories:\n[Memory] user studied dopamine';
      const result = preprocessContext(input, 'memory');
      expect(result).not.toContain('Relevant memories');
      expect(result).not.toContain('[Memory]');
    });
  });

  describe('preprocessContext - Ingestion', () => {
    it('should transform ingestion context with domain - simplified to just summary', () => {
      const input = 'React Hooks: Learn about useState (from react.dev)';
      const result = preprocessContext(input, 'ingestion');
      // Should extract just the summary part (after colon)
      expect(result).toContain('Learn about useState');
      // Should NOT contain domain metadata
      expect(result).not.toContain('react.dev');
      expect(result).not.toContain('(from');
      // Should NOT contain verbose "Information about" wrappers
      expect(result).not.toContain('Information about');
    });

    it('should handle multiple ingestion items - simplified format', () => {
      const input = 'Title 1: Summary 1 (from domain1.com)\n\nTitle 2: Summary 2 (from domain2.com)';
      const result = preprocessContext(input, 'ingestion');
      // Should have multiple items (separated by newlines)
      expect(result.split('\n\n').length).toBeGreaterThan(1);
      // Should contain just the summaries
      expect(result).toContain('Summary 1');
      expect(result).toContain('Summary 2');
      // Should NOT contain domains or verbose wrappers
      expect(result).not.toContain('domain1');
      expect(result).not.toContain('domain2');
      expect(result).not.toContain('Information about');
    });

    it('should handle ingestion without domain - simplified to just summary', () => {
      const input = 'React Hooks: Learn about useState';
      const result = preprocessContext(input, 'ingestion');
      // Should extract summary (after colon)
      expect(result).toContain('Learn about useState');
      // Should NOT contain title or verbose wrappers
      expect(result).not.toContain('React Hooks');
      expect(result).not.toContain('Information about');
    });
  });

  describe('preprocessContext - RAG', () => {
    it('should transform RAG context with type markers', () => {
      const input = '[memory] User mentioned React\n[web] Latest news about AI';
      const result = preprocessContext(input, 'rag');
      expect(result).not.toContain('[memory]');
      expect(result).not.toContain('[web]');
    });

    it('should handle RAG context with header', () => {
      const input = 'Relevant context:\n[memory] User mentioned React';
      const result = preprocessContext(input, 'rag');
      expect(result).not.toContain('Relevant context');
      expect(result).not.toContain('[memory]');
    });
  });

  describe('preprocessContext - Conversation', () => {
    it('should transform conversation history', () => {
      const input = '[Conversation 1]: discussed React hooks';
      const result = preprocessContext(input, 'conversation');
      expect(result).toContain('previous conversation');
      expect(result).not.toContain('[Conversation');
    });

    it('should handle multiple conversations', () => {
      const input = '[Conversation 1]: discussed React\n[Conversation 2]: discussed TypeScript';
      const result = preprocessContext(input, 'conversation');
      expect(result.split('\n\n').length).toBeGreaterThan(1);
    });
  });

  describe('preprocessContext - Summary', () => {
    it('should transform summary context', () => {
      const input = 'Previous conversation summary: We discussed React hooks and TypeScript';
      const result = preprocessContext(input, 'summary');
      // Should remove header prefix
      expect(result).not.toContain('Previous conversation summary');
      // Should contain the summary content
      expect(result).toContain('React hooks');
      // Should be transformed to narrative (either keeps original or wraps it)
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('preprocessSystemMessage', () => {
    it('should handle message with base prompt and context', () => {
      const input = `You are a helpful assistant.

Guidelines:
- Be helpful

Relevant memories:
[Memory] user studied dopamine`;
      const result = preprocessSystemMessage(input);
      expect(result).toContain('helpful assistant');
      expect(result).not.toContain('[Memory]');
      expect(result).not.toContain('Relevant memories');
    });

    it('should handle empty content', () => {
      const result = preprocessSystemMessage('');
      expect(result).toBe('');
    });

    it('should handle content without context markers', () => {
      const input = 'Just regular text without any markers';
      const result = preprocessSystemMessage(input);
      expect(result).toBe(input);
    });
  });
});

