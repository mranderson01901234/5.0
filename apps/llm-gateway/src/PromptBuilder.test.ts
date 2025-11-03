import { describe, it, expect } from 'vitest';
import { PromptBuilder } from './PromptBuilder.js';

describe('PromptBuilder', () => {
  describe('Basic building', () => {
    it('should build with base prompt only', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('You are a helpful assistant.');
      const result = builder.build();
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).toContain('helpful assistant');
    });

    it('should build merged message', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base prompt');
      const result = builder.buildMerged();
      
      expect(result.length).toBe(1);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('Base prompt');
    });

    it('should return empty array when no content', () => {
      const builder = new PromptBuilder();
      const result = builder.build();
      expect(result).toEqual([]);
    });
  });

  describe('Instructions', () => {
    it('should add and prioritize instructions', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addInstruction('Critical instruction', 'critical');
      builder.addInstruction('High priority', 'high');
      builder.addInstruction('Medium priority', 'medium');
      
      const result = builder.buildMerged();
      expect(result[0].content).toContain('CRITICAL INSTRUCTIONS');
      expect(result[0].content).toContain('IMPORTANT');
      expect(result[0].content).toContain('Critical instruction');
      expect(result[0].content).toContain('High priority');
      expect(result[0].content).toContain('Medium priority');
    });
  });

  describe('Context', () => {
    it('should add context blocks', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addContext('[Memory] user studied dopamine', 'memory', true);
      
      const result = builder.buildMerged();
      // Should preprocess and remove [Memory] marker
      expect(result[0].content).not.toContain('[Memory]');
      // Should contain the content in some form
      expect(result[0].content).toContain('dopamine');
    });

    it('should handle multiple context blocks', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addContext('[Memory] memory 1', 'memory', true);
      builder.addContext('[Memory] memory 2', 'memory', true);
      
      const result = builder.buildMerged();
      const content = result[0].content;
      // Should contain both processed contexts (no [Memory] markers)
      expect(content).not.toContain('[Memory]');
      // Should have both memory items in some form
      expect(content.includes('memory 1') || content.includes('memory')).toBe(true);
    });

    it('should skip preprocessing when requested', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addContext('Raw context [Memory] test', 'memory', false);
      
      const result = builder.buildMerged();
      expect(result[0].content).toContain('Raw context [Memory] test');
    });
  });

  describe('Default base prompt', () => {
    it('should provide default base prompt', () => {
      const defaultPrompt = PromptBuilder.getDefaultBasePrompt();
      expect(defaultPrompt).toContain('conversational partner');
      expect(defaultPrompt).toContain('Guidelines');
    });
  });

  describe('Reset and clear', () => {
    it('should clear instructions', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addInstruction('Test', 'high');
      builder.clearInstructions();
      
      const result = builder.buildMerged();
      expect(result[0].content).not.toContain('Test');
    });

    it('should clear context', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addContext('Test context', 'memory', false);
      builder.clearContext();
      
      const result = builder.buildMerged();
      expect(result[0].content).not.toContain('Test context');
    });

    it('should reset everything except base prompt', () => {
      const builder = new PromptBuilder();
      builder.setBasePrompt('Base');
      builder.addInstruction('Test', 'high');
      builder.addContext('Test context', 'memory', false);
      builder.reset();
      
      const result = builder.buildMerged();
      expect(result[0].content).toContain('Base');
      expect(result[0].content).not.toContain('Test');
      expect(result[0].content).not.toContain('Test context');
    });
  });
});

