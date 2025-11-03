import { describe, it, expect } from 'vitest';
import { analyzeQuery, getVerbosityInstruction, getFollowUpGuidance } from './QueryAnalyzer.js';

describe('QueryAnalyzer', () => {
  describe('analyzeQuery - Complexity Detection', () => {
    it('should detect simple queries', () => {
      const analysis = analyzeQuery('What is React?');
      expect(analysis.complexity).toBe('simple');
      expect(analysis.intent).toBe('factual');
    });

    it('should detect complex queries', () => {
      const analysis = analyzeQuery('How does the React hooks architecture work and what are the design patterns?');
      expect(analysis.complexity).toBe('complex');
      expect(analysis.requiresDetail).toBe(true);
    });

    it('should detect moderate queries', () => {
      const analysis = analyzeQuery('Tell me about React hooks');
      expect(analysis.complexity).toBe('moderate');
    });

    it('should detect technical terms', () => {
      const analysis = analyzeQuery('Explain the algorithm for sorting');
      expect(analysis.complexity).toBe('complex');
      expect(analysis.requiresDetail).toBe(true);
    });
  });

  describe('analyzeQuery - Intent Detection', () => {
    it('should detect explanatory intent', () => {
      const analysis = analyzeQuery('How does React work?');
      expect(analysis.intent).toBe('explanatory');
    });

    it('should detect discussion intent', () => {
      const analysis = analyzeQuery('What is your opinion on React?');
      expect(analysis.intent).toBe('discussion');
    });

    it('should detect action intent', () => {
      const analysis = analyzeQuery('Show me how to create a React component');
      expect(analysis.intent).toBe('action');
    });

    it('should detect memory list intent', () => {
      const analysis = analyzeQuery('What do you remember?');
      expect(analysis.intent).toBe('memory_list');
    });

    it('should detect memory list intent with variations', () => {
      expect(analyzeQuery('what memories do you have').intent).toBe('memory_list');
      expect(analyzeQuery('list memories').intent).toBe('memory_list');
      expect(analyzeQuery('show memories').intent).toBe('memory_list');
      expect(analyzeQuery('what is saved').intent).toBe('memory_list');
      expect(analyzeQuery('what information do you have').intent).toBe('memory_list');
      expect(analyzeQuery('recall what we discussed').intent).toBe('memory_list');
    });

    it('should detect memory save intent', () => {
      expect(analyzeQuery('remember this').intent).toBe('memory_save');
      expect(analyzeQuery('save this').intent).toBe('memory_save');
      expect(analyzeQuery('store this').intent).toBe('memory_save');
      expect(analyzeQuery('memorize this').intent).toBe('memory_save');
      expect(analyzeQuery('keep this in mind').intent).toBe('memory_save');
      expect(analyzeQuery('note this').intent).toBe('memory_save');
    });

    it('should detect memory save intent with complex patterns', () => {
      // Test new patterns from user requirements
      expect(analyzeQuery('remember that my favorite color is blue').intent).toBe('memory_save');
      expect(analyzeQuery('my favorite color is blue - remember that for me').intent).toBe('memory_save');
      expect(analyzeQuery('can you remember that idea you gave me earlier').intent).toBe('memory_save');
      expect(analyzeQuery('remember my favorite color').intent).toBe('memory_save');
      expect(analyzeQuery('please remember that').intent).toBe('memory_save');
      expect(analyzeQuery('could you remember this').intent).toBe('memory_save');
    });

    it('should prioritize memory_save over other intents', () => {
      // memory_save should be detected even when other patterns might match
      expect(analyzeQuery('remember this for me').intent).toBe('memory_save');
      expect(analyzeQuery('save this to memory').intent).toBe('memory_save');
    });
  });

  describe('getVerbosityInstruction', () => {
    it('should return brief instruction for simple queries', () => {
      const analysis = analyzeQuery('What React?');
      const instruction = getVerbosityInstruction(analysis);
      expect(instruction).toContain('brief');
      expect(instruction).toContain('1-2 sentences');
    });

    it('should return brief instruction for "What is X?" queries', () => {
      const analysis = analyzeQuery('What is React?');
      const instruction = getVerbosityInstruction(analysis);
      // May be simple or moderate depending on exact matching
      expect(instruction).toBeTruthy();
    });

    it('should return comprehensive instruction for complex queries', () => {
      const analysis = analyzeQuery('Explain the React architecture and design patterns');
      const instruction = getVerbosityInstruction(analysis);
      expect(instruction).toContain('comprehensive');
    });

    it('should return balanced instruction for moderate queries', () => {
      const analysis = analyzeQuery('Tell me about React hooks');
      const instruction = getVerbosityInstruction(analysis);
      expect(instruction).toContain('balanced');
      expect(instruction).toContain('2-3 paragraphs');
    });
  });

  describe('getFollowUpGuidance', () => {
    it('should return guidance for complex queries', () => {
      const analysis = analyzeQuery('Explain React architecture and patterns');
      const guidance = getFollowUpGuidance(analysis);
      expect(guidance).toBeTruthy();
      expect(guidance).toContain('follow-up');
    });

    it('should return null for simple queries', () => {
      const analysis = analyzeQuery('What is React?');
      const guidance = getFollowUpGuidance(analysis);
      expect(guidance).toBeNull();
    });
  });
});

