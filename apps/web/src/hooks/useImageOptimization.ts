import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { log } from '../utils/logger';
import { getEnv } from '../utils/env';

export interface OptimizationData {
  isImageRequest: boolean;
  confidence: number;
  original: string;
  optimized: string | null;
  improvements: string[];
  qualityScore: number;
  showOptimizationButton: boolean;
  aspectRatio: string;
  aspectRatioReason: string;
}

export function useImageOptimization(prompt: string, debounceMs: number = 500) {
  const [optimizationData, setOptimizationData] = useState<OptimizationData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { getToken } = useAuth();

  const analyzePrompt = useCallback(async (promptText: string) => {
    if (!promptText || promptText.trim().length < 3) {
      setOptimizationData(null);
      return;
    }

    setIsAnalyzing(true);

    try {
      const token = await getToken();
      if (!token) {
        log.warn('[useImageOptimization] No auth token available');
        return;
      }

      const { VITE_API_BASE_URL } = getEnv();
      const apiUrl = VITE_API_BASE_URL === '/' || !VITE_API_BASE_URL
        ? '/api/image/analyze'
        : `${VITE_API_BASE_URL.replace(/\/$/, '')}/api/image/analyze`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze prompt');
      }

      const data: OptimizationData = await response.json();
      setOptimizationData(data);

      if (data.showOptimizationButton) {
        log.info('[useImageOptimization] Optimization available', {
          qualityScore: data.qualityScore,
          improvements: data.improvements.length,
        });
      }
    } catch (error) {
      log.error('[useImageOptimization] Analysis failed', error);
      setOptimizationData(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, [getToken]);

  // Debounced analysis
  useEffect(() => {
    const timer = setTimeout(() => {
      analyzePrompt(prompt);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [prompt, debounceMs, analyzePrompt]);

  return {
    optimizationData,
    isAnalyzing,
    showButton: optimizationData?.showOptimizationButton || false,
  };
}
