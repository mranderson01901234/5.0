# Natural-Language → Artifact Trigger Specification

**Version**: 1.0.0  
**Purpose**: Define how the system decides when to create artifacts vs chat-only responses

---

## Overview

The trigger mechanism determines whether a user's request should result in:
1. **Chat-only**: Standard text response (current behavior)
2. **Artifact creation**: Generate table/document/spreadsheet and open artifact pane

Two implementation approaches are considered:
- **Option A**: Pre-LLM gatekeeper classifier (fast, deterministic)
- **Option B**: LLM tool-calling self-trigger (more accurate, higher latency)

---

## Gatekeeper Classifier Interface

### Input

```typescript
interface GatekeeperInput {
  userText: string;                    // Current user message
  conversationSummary?: string;        // Optional: Last 3-5 messages summary
  threadId: string;                    // Conversation context ID
  userId: string;                      // For personalization
}
```

### Output

```typescript
interface GatekeeperOutput {
  shouldCreate: boolean;               // true = create artifact, false = chat-only
  type: "table" | "doc" | "sheet" | null;  // Artifact type (null if shouldCreate=false)
  rationale: string;                   // Human-readable explanation
  confidence: number;                  // 0.0-1.0 confidence score
}
```

### Confidence Thresholds

- **≥0.8**: High confidence, auto-create artifact
- **0.6-0.79**: Medium confidence, show confirmation prompt
- **<0.6**: Low confidence, chat-only (no artifact)

---

## Rule Set

### Positive Triggers (Create Artifact)

#### Table Triggers

**Keywords**:
- `"create a table"`, `"make a table"`, `"generate a table"`
- `"list in a table"`, `"show as table"`, `"format as table"`
- `"comparison table"`, `"comparison chart"`
- `"data table"`, `"results table"`

**Patterns**:
- Contains structured data requests: `"columns: X, Y, Z"`
- Mentions "rows" and "columns" together
- Comparative requests: `"compare X vs Y vs Z"`
- Tabular data indicators: `"with columns"`, `"with rows"`

**Examples**:
- ✅ "Create a table comparing iPhone 14, 15, and 16 specs"
- ✅ "Show the top 10 programming languages in a table format"
- ✅ "Make a table with columns: Name, Age, City for these people: ..."

#### Document Triggers

**Keywords**:
- `"create a document"`, `"write a document"`, `"generate a document"`
- `"draft"`, `"memo"`, `"report"`, `"letter"`, `"essay"`
- `"with sections"`, `"structured document"`
- `"save as document"`, `"export as document"`

**Patterns**:
- Requests multiple sections/parts
- Mentions formatting: `"formatted document"`, `"professional document"`
- Document types: `"proposal"`, `"summary document"`, `"analysis document"`

**Examples**:
- ✅ "Create a document with sections: Introduction, Methods, Results"
- ✅ "Write a draft proposal for the new project"
- ✅ "Generate a report summarizing the meeting notes"

#### Spreadsheet Triggers

**Keywords**:
- `"create a spreadsheet"`, `"make a spreadsheet"`, `"generate a spreadsheet"`
- `"excel"`, `"google sheets"`, `"csv"`
- `"with sheets"`, `"multiple tabs"`, `"worksheet"`
- `"budget spreadsheet"`, `"tracker spreadsheet"`

**Patterns**:
- Multiple sheets/tabs mentioned
- Financial/calculation contexts: `"budget"`, `"expense tracker"`, `"roster"`
- Data manipulation: `"calculate"`, `"sum"`, `"formulas"`

**Examples**:
- ✅ "Create a budget spreadsheet with sheets for Income, Expenses, Savings"
- ✅ "Make an Excel file with monthly sales data"
- ✅ "Generate a spreadsheet to track team member tasks"

### Negative Triggers (Chat-Only)

#### Exclude Patterns

1. **Simple questions**: `"what is"`, `"how does"`, `"why"`
2. **Conversational**: `"thanks"`, `"hello"`, `"tell me about"`
3. **Code requests**: `"write code"`, `"debug"`, `"explain this code"`
4. **General explanations**: `"explain"`, `"describe"`, `"summarize"` (without structure request)
5. **One-off answers**: `"yes"`, `"no"`, `"maybe"`

**Examples**:
- ❌ "What is machine learning?" (chat-only)
- ❌ "Explain how React works" (chat-only)
- ❌ "Thanks for the help!" (chat-only)
- ❌ "Write a function to reverse a string" (chat-only, code generation)

#### Ambiguous Cases (Show Confirmation)

- `"show me"` + structured data → Medium confidence (0.6-0.79)
- `"list"` without "table" → Medium confidence
- `"organize"` + data → Medium confidence

---

## Few-Shot Examples

### Positive Examples (Create Artifact)

#### Table
```
User: "Create a comparison table for iPhone 14, 15, and 16 with columns: Model, Price, Storage, Camera"
→ {shouldCreate: true, type: "table", confidence: 0.95, rationale: "Explicit table request with structured columns"}
```

#### Document
```
User: "Write a project proposal document with sections: Overview, Timeline, Budget, Team"
→ {shouldCreate: true, type: "doc", confidence: 0.92, rationale: "Document type request with multiple sections"}
```

#### Spreadsheet
```
User: "Make a monthly budget spreadsheet with sheets for January, February, March, and a Summary tab"
→ {shouldCreate: true, type: "sheet", confidence: 0.90, rationale: "Spreadsheet request with multiple sheets"}
```

### Negative Examples (Chat-Only)

#### Simple Question
```
User: "What is the capital of France?"
→ {shouldCreate: false, type: null, confidence: 0.05, rationale: "Simple factual question, no structure needed"}
```

#### Code Request
```
User: "Write a Python function to calculate factorial"
→ {shouldCreate: false, type: null, confidence: 0.10, rationale: "Code generation, not artifact creation"}
```

#### General Explanation
```
User: "Explain how photosynthesis works"
→ {shouldCreate: false, type: null, confidence: 0.08, rationale: "Explanatory question without structure request"}
```

### Medium Confidence (Show Confirmation)

#### Ambiguous Table
```
User: "Show me the top 10 movies of 2024"
→ {shouldCreate: true, type: "table", confidence: 0.68, rationale: "List request, could be table or chat"}
→ Action: Show confirmation: "Would you like this in a table format?"
```

#### Unclear Structure
```
User: "Organize my notes from yesterday's meeting"
→ {shouldCreate: true, type: "doc", confidence: 0.65, rationale: "Organize request, could be document or chat"}
→ Action: Show confirmation: "Create a structured document or just summarize in chat?"
```

---

## Implementation Options

### Option A: Pre-LLM Gatekeeper (Recommended for MVP)

**Pros**:
- Fast (<100ms latency)
- Deterministic (rule-based + lightweight LLM)
- No changes to existing LLM streaming
- Can cache results

**Cons**:
- May have false positives/negatives
- Requires maintenance of keyword patterns
- Less context-aware than full LLM

**Architecture**:
```
User Message → Gatekeeper (Rule-based + gpt-4o-mini) → Decision
                                     ↓
                         If shouldCreate=true:
                              → Open artifact pane
                              → Add artifact context to LLM prompt
                         If shouldCreate=false:
                              → Standard chat flow
```

**Implementation**:
1. Create `apps/llm-gateway/src/gatekeeper.ts`
2. Fast keyword matching (first pass)
3. If ambiguous, call `gpt-4o-mini` with few-shot prompt
4. Cache results for 5 minutes (by message hash)

### Option B: LLM Tool-Calling Self-Trigger

**Pros**:
- Highly accurate (full context awareness)
- Leverages LLM's understanding
- Single pass through LLM

**Cons**:
- Higher latency (LLM decides)
- Requires tool-calling infrastructure
- More complex error handling

**Architecture**:
```
User Message → LLM (with artifact tools) → Response + Tool Calls
                                           ↓
                              If tool_call detected:
                                   → Execute tool (create artifact)
                                   → Stream artifact creation status
                              Else:
                                   → Standard text response
```

**Implementation**:
1. Extend `ChatStreamRequestSchema` to include `tools` array
2. Define artifact tools in OpenAI/Anthropic format
3. Parse tool calls from streaming response
4. Execute tool calls after `done` event

---

## Safety Controls

### Explicit User Confirmation Required For:

1. **High-cost operations**: Large spreadsheets (>1000 rows), complex documents (>10 sections)
2. **Destructive actions**: Replacing existing artifact
3. **Medium confidence (0.6-0.79)**: Show confirmation prompt

### Rate Limiting

- Gatekeeper calls: 20/second per user
- Artifact creation: 5/minute per user
- Export operations: 2/minute per user

### Abusive Pattern Detection

Block automatic artifact creation if:
- User creates >10 artifacts in 1 minute
- User creates artifacts with empty/null data
- User repeatedly cancels artifact creation

---

## Confidence Scoring Formula

For rule-based gatekeeper:

```typescript
function calculateConfidence(keywordMatches: number, patternMatches: number, contextClarity: number): number {
  // Keyword matches: 0.4 weight
  // Pattern matches: 0.3 weight
  // Context clarity: 0.3 weight
  return Math.min(1.0, 
    (keywordMatches * 0.4) + 
    (patternMatches * 0.3) + 
    (contextClarity * 0.3)
  );
}
```

For LLM-based gatekeeper:

- Use LLM's confidence score if provided
- Default to 0.8 if LLM returns `shouldCreate=true` without score
- Default to 0.2 if LLM returns `shouldCreate=false` without score

---

## Fallback Behavior

1. **Gatekeeper timeout (>500ms)**: Default to chat-only
2. **LLM tool-call parse error**: Log error, continue with text response
3. **Artifact creation fails**: Show error message, fall back to text response in chat
4. **User cancels confirmation**: Continue with chat-only response

---

## Testing Strategy

### Unit Tests

- Test each keyword pattern
- Test confidence thresholds
- Test negative triggers

### Integration Tests

- End-to-end: User message → Gatekeeper → Artifact creation
- Test with real LLM responses
- Test rate limiting

### A/B Testing

- Compare Option A (pre-LLM) vs Option B (tool-calling)
- Measure accuracy, latency, user satisfaction

---

## Recommendations

**Phase 1 (MVP)**: Implement Option A (Pre-LLM Gatekeeper)
- Faster to ship
- Easier to debug
- Can iterate on rules quickly

**Phase 2 (Future)**: Evaluate Option B (Tool-Calling)
- If accuracy issues with Option A
- If users request more sophisticated triggers
- If LLM providers improve tool-calling latency
