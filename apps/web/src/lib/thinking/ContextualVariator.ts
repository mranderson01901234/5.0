/**
 * ContextualVariator - Adds contextual variation to thinking steps
 * Uses lightweight word embeddings and similarity matching
 */

export interface ThinkingStep {
  text: string;
  duration: number; // milliseconds
  depth: number; // 0-2, for progressive disclosure
}

/**
 * Compact word embedding using pre-computed vectors
 * Only stores common technical terms for efficiency
 */
class CompactWordEmbedding {
  private vectors: Map<string, number[]>;
  private dimension: number = 50; // Compact dimension for browser efficiency

  constructor() {
    this.vectors = new Map();
    this.initializeVectors();
  }

  /**
   * Initialize compact word vectors for common technical terms
   * Using simplified semantic clusters
   */
  private initializeVectors(): void {
    // Generate compact vectors using semantic clustering
    const semanticClusters = {
      // Code/Development cluster
      code: ['function', 'class', 'component', 'method', 'implement', 'write', 'build', 'create'],

      // Analysis cluster
      analysis: ['analyze', 'evaluate', 'examine', 'review', 'assess', 'investigate'],

      // Structure cluster
      structure: ['design', 'architecture', 'pattern', 'organize', 'structure', 'plan'],

      // Problem-solving cluster
      solving: ['fix', 'debug', 'solve', 'resolve', 'repair', 'troubleshoot'],

      // Performance cluster
      performance: ['optimize', 'improve', 'enhance', 'speed', 'efficient', 'fast'],

      // Learning cluster
      learning: ['explain', 'understand', 'learn', 'clarify', 'describe', 'teach']
    };

    // Create base vectors for each cluster
    const clusterVectors: Record<string, number[]> = {};
    let clusterIndex = 0;

    for (const [cluster, _words] of Object.entries(semanticClusters)) {
      const vector = new Array(this.dimension).fill(0);

      // Set strong activation in cluster-specific dimensions
      const clusterStart = clusterIndex * 8;
      for (let i = 0; i < 8 && clusterStart + i < this.dimension; i++) {
        vector[clusterStart + i] = 0.8 + Math.random() * 0.2;
      }

      clusterVectors[cluster] = vector;
      clusterIndex++;
    }

    // Assign vectors to words with slight variations
    for (const [cluster, words] of Object.entries(semanticClusters)) {
      const baseVector = clusterVectors[cluster];

      for (const word of words) {
        // Add slight random variation to each word while keeping cluster similarity
        const wordVector = baseVector.map(v =>
          v > 0 ? v + (Math.random() - 0.5) * 0.2 : (Math.random() - 0.5) * 0.1
        );
        this.vectors.set(word.toLowerCase(), wordVector);
      }
    }
  }

  /**
   * Get vector for a word, or generate approximate vector
   */
  getVector(word: string): number[] {
    const normalized = word.toLowerCase();

    if (this.vectors.has(normalized)) {
      return this.vectors.get(normalized)!;
    }

    // Generate random normalized vector for unknown words
    const vector = Array.from({ length: this.dimension }, () => Math.random() - 0.5);
    return this.normalizeVector(vector);
  }

  /**
   * Calculate cosine similarity between two words
   */
  similarity(word1: string, word2: string): number {
    const v1 = this.getVector(word1);
    const v2 = this.getVector(word2);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < this.dimension; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / norm);
  }
}

export class ContextualVariator {
  private embeddings: CompactWordEmbedding;
  private variationTemplates: Map<string, string[]>;

  constructor() {
    this.embeddings = new CompactWordEmbedding();
    this.initializeVariationTemplates();
  }

  /**
   * Initialize variation templates for different contexts
   */
  private initializeVariationTemplates(): void {
    this.variationTemplates = new Map([
      // Action verbs variations
      ['analyzing', ['Analyzing', 'Examining', 'Evaluating', 'Reviewing', 'Assessing']],
      ['processing', ['Processing', 'Parsing', 'Interpreting', 'Extracting', 'Analyzing']],
      ['structuring', ['Structuring', 'Organizing', 'Arranging', 'Formulating', 'Composing']],
      ['identifying', ['Identifying', 'Detecting', 'Recognizing', 'Locating', 'Finding']],
      ['evaluating', ['Evaluating', 'Assessing', 'Judging', 'Weighing', 'Considering']],
      ['planning', ['Planning', 'Preparing', 'Designing', 'Mapping', 'Outlining']],
      ['generating', ['Generating', 'Creating', 'Producing', 'Formulating', 'Constructing']],
      ['optimizing', ['Optimizing', 'Refining', 'Enhancing', 'Improving', 'Perfecting']],

      // Object variations
      ['requirements', ['requirements', 'specifications', 'needs', 'criteria', 'parameters']],
      ['approach', ['approach', 'strategy', 'method', 'technique', 'solution']],
      ['structure', ['structure', 'organization', 'architecture', 'framework', 'layout']],
      ['components', ['components', 'elements', 'parts', 'modules', 'sections']],
      ['patterns', ['patterns', 'structures', 'templates', 'models', 'frameworks']],
      ['solution', ['solution', 'answer', 'resolution', 'approach', 'implementation']]
    ]);
  }

  /**
   * Add contextual variation to thinking steps based on query
   */
  addVariation(steps: ThinkingStep[], query: string, keywords: string[]): ThinkingStep[] {
    const queryWords = this.tokenize(query);

    return steps.map((step, index) => {
      // Add query-specific context to some steps
      if (index === 0 && keywords.length > 0) {
        // Customize first step with primary keyword
        const primaryKeyword = keywords[0];
        step.text = this.customizeStepText(step.text, primaryKeyword, queryWords);
      } else if (index === Math.floor(steps.length / 2) && keywords.length > 1) {
        // Customize middle step with secondary context
        const secondaryKeyword = keywords[1];
        step.text = this.customizeStepText(step.text, secondaryKeyword, queryWords);
      } else {
        // Add subtle variation to prevent repetition
        step.text = this.applySubtleVariation(step.text, index);
      }

      return step;
    });
  }

  /**
   * Customize step text with query-specific context
   */
  private customizeStepText(stepText: string, keyword: string, queryWords: string[]): string {
    // Find similar words in query to the step action
    const stepAction = this.extractAction(stepText);

    // If we can make it more specific, do so
    if (keyword && queryWords.includes(keyword.toLowerCase())) {
      // Make the step more specific to the keyword
      stepText = stepText.replace(/\.\.\.$/, ` for ${keyword}...`);
    }

    return stepText;
  }

  /**
   * Apply subtle variation to avoid repetitive language
   */
  private applySubtleVariation(stepText: string, seed: number): string {
    // Extract the action verb from the step
    const action = this.extractAction(stepText);

    // Look for variation templates
    for (const [key, variations] of this.variationTemplates) {
      if (action.toLowerCase().includes(key)) {
        // Use seed to deterministically select variation
        const variationIndex = seed % variations.length;
        const newAction = variations[variationIndex];

        // Replace the action in the step text
        return stepText.replace(new RegExp(`^${action}`, 'i'), newAction);
      }
    }

    return stepText;
  }

  /**
   * Extract the action verb from a thinking step
   */
  private extractAction(stepText: string): string {
    const match = stepText.match(/^([A-Za-z]+(?:\s+[a-z]+)?)/);
    return match ? match[1] : '';
  }

  /**
   * Simple tokenization
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  /**
   * Find contextually similar words using embeddings
   */
  findSimilarWords(word: string, candidates: string[], topK: number = 3): string[] {
    const similarities = candidates.map(candidate => ({
      word: candidate,
      similarity: this.embeddings.similarity(word, candidate)
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(item => item.word);
  }
}
