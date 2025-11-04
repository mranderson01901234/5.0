/**
 * Artifact Intent Classifier
 * Determines if an artifact should be created based on user text and LLM response
 * Phase 4: Uses gatekeeper API endpoint for enhanced classification
 */

import { getEnv } from './env';
import { httpJson } from './http';

export interface ArtifactIntent {
  shouldCreate: boolean;
  type: "table" | "doc" | "sheet" | "image" | null;
  confidence: number; // 0.0-1.0
}

/**
 * Classify artifact intent from user text and optional LLM response
 * Phase 3 MVP: Keyword-based detection for tables (fallback)
 */
export function classifyArtifactIntent(
  userText: string,
  responseText?: string
): ArtifactIntent {
  const lowerText = userText.toLowerCase();
  const lowerResponse = responseText?.toLowerCase() || "";

  // Table detection keywords
  const tableKeywords = [
    "table",
    "tabular",
    "list of",
    "compare",
    "comparison",
    "create a table",
    "show me a table",
    "make a table",
    "generate a table",
    "in a table",
    "as a table",
    "tabular format",
    "columns and rows",
  ];

  // Check user text for table intent
  const hasTableIntent = tableKeywords.some(keyword => lowerText.includes(keyword));

  // Check response text for table markers
  const hasTableMarkers = responseText
    ? /^\s*\|/.test(responseText) || // Starts with pipe
      /\|.*\|/.test(responseText) || // Contains pipe-delimited content
      /```.*table/i.test(responseText) || // Code block with table
      /<table/i.test(responseText) // HTML table tag
    : false;

  // High confidence if both user intent and response markers present
  if (hasTableIntent && hasTableMarkers) {
    return {
      shouldCreate: true,
      type: "table",
      confidence: 0.9,
    };
  }

  // Medium confidence if user intent is clear
  if (hasTableIntent) {
    return {
      shouldCreate: true,
      type: "table",
      confidence: 0.7,
    };
  }

  // Lower confidence if only response markers present (might be incidental)
  if (hasTableMarkers) {
    return {
      shouldCreate: true,
      type: "table",
      confidence: 0.6,
    };
  }

  // No artifact intent detected
  return {
    shouldCreate: false,
    type: null,
    confidence: 0.0,
  };
}

/**
 * Call gatekeeper API endpoint for more sophisticated classification
 * Phase 4: Integrated with backend gatekeeper endpoint
 */
export async function classifyArtifactIntentViaAPI(
  userText: string,
  threadId: string,
  userId: string,
  token?: string
): Promise<ArtifactIntent> {
  try {
    const { VITE_API_BASE_URL } = getEnv();
    // Normalize baseUrl: if it's just "/", keep it; otherwise remove trailing slash
    // This prevents double slashes when constructing URLs like `${baseUrl}/api/...`
    const baseUrl = VITE_API_BASE_URL === '/' 
      ? '' // Empty string for relative URLs, so `/api/...` becomes `/api/...` not `//api/...`
      : (VITE_API_BASE_URL.endsWith('/') ? VITE_API_BASE_URL.slice(0, -1) : VITE_API_BASE_URL);
    
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await httpJson<{
      shouldCreate: boolean;
      type: "table" | "doc" | "sheet" | "image" | null;
      rationale: string;
      confidence: number;
    }>(`${baseUrl}/api/artifacts/gatekeeper`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userText,
        threadId,
        userId,
      }),
    });

    // httpJson returns { data, status }, so we need to access response.data
    return {
      shouldCreate: response.data.shouldCreate,
      type: response.data.type,
      confidence: response.data.confidence,
    };
  } catch (error) {
    // Fallback to local classification on error
    console.warn('[classifyArtifactIntentViaAPI] API call failed, using fallback', error);
    return classifyArtifactIntent(userText);
  }
}

