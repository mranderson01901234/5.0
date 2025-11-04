# Hotfix: Artifact Pointer & Table Parser

## Problem Statement

Two critical issues were preventing the artifact pane from displaying newly created tables:

1. **Artifact Pointer Drift**: After saving an artifact to the backend, the UI still pointed to the temporary client-side ID (`msg_...`), but the artifact store had updated to the server ID (`7af2...`). This caused the right pane to show "no artifact".

2. **Table Parser Column Count**: The markdown parser was too strict with pipe handling, counting only 1 column for tables without trailing pipes or with ragged separators.

## Root Causes

### 1. Pointer Drift
- `createTableArtifact()` creates artifact with temp ID (`msg_${nanoid()}`)
- `saveArtifact()` updates the artifact ID to server ID in store
- **But** `uiStore.currentArtifactId` was never updated
- Result: UI looks for `msg_abc` but artifact is now `7af2...`

### 2. Parser Issues
- Original `splitRow()` used `.filter(Boolean)` which removed empty cells
- Didn't handle tables without leading/trailing pipes properly
- Separator detection was too strict (required exact format)

## Changes Made

### 1. artifactStore.ts

**Added `tempId` tracking:**
```typescript
export interface Artifact {
  id: string;
  type: ArtifactType;
  threadId: string;
  createdAt: number;
  tempId?: string; // Track temp ID for server sync
  data?: unknown;
}
```

**Enhanced `createTableArtifact()`:**
- Creates artifact with `msg_${nanoid()}` as ID
- Stores both `id` and `tempId` as the same value initially
- Returns the artifact so caller can track it

**Fixed `saveArtifact()` to return updated artifact:**
```typescript
saveArtifact: async (artifact: Artifact, token?: string) => Promise<Artifact | null>
```

- Finds artifact by `tempId` OR `id`
- Updates artifact with server ID, removes `tempId` marker
- Updates `current` if it matches old ID
- **Critically**: Updates `uiStore.currentArtifactId` to new server ID
- Returns the updated artifact with server ID

**Added helper method:**
```typescript
getLatestArtifactForThread: (threadId: string) => Artifact | undefined
```

### 2. useChatStream.ts

**Updated artifact creation flow:**
```typescript
// Create with temp ID
const artifact = artifactStore.createTableArtifact(tableData, newThreadId);

// Open split immediately with temp ID (no UX lag)
console.log('[useChatStream] setSplitView(true)');
uiStore.setSplitView(true);
console.log('[useChatStream] setCurrentArtifact (temp)', artifact.id);
uiStore.setCurrentArtifact(artifact.id);

// Save to backend
const saved = await artifactStore.saveArtifact(artifact, authToken);

// Critical: repoint to server ID if it changed
if (saved?.id && saved.id !== artifact.id) {
  console.log('[useChatStream] setCurrentArtifact (server)', saved.id);
  uiStore.setCurrentArtifact(saved.id);
}
```

**Console logs added for debugging:**
- `[useChatStream] setSplitView(true)` - when pane opens
- `[useChatStream] setCurrentArtifact (temp)` - with temp ID
- `[useChatStream] setCurrentArtifact (server)` - with server ID

### 3. ArtifactPane.tsx

**Added fallback mechanism:**
```typescript
// Find artifact by ID, with fallback to latest artifact for current thread
let artifact = currentArtifactId ? getArtifactById(currentArtifactId) : null;

// Fallback: if currentArtifactId is null or not found, use latest artifact for thread
if (!artifact && currentThreadId) {
  const fallbackArtifact = getLatestArtifactForThread(currentThreadId);
  if (fallbackArtifact) {
    artifact = fallbackArtifact;
    setFallbackUsed(true);
    console.log('[ArtifactPane] Fallback to latest artifact:', fallbackArtifact.id);
    setCurrentArtifact(fallbackArtifact.id);
  }
}
```

**Added fallback banner:**
```typescript
{fallbackUsed && (
  <div className="mb-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs">
    Showing latest artifact
  </div>
)}
```

### 4. tableParser.ts

**Rewrote `splitRow()` function:**
```typescript
function splitRow(line: string): string[] {
  // Normalize smart punctuation
  const normalized = line.replace(/[""]/g, '"').replace(/['']/g, "'");
  
  // Track if pipes are present
  const trimmed = normalized.trim();
  const hasLeadingPipe = trimmed.startsWith('|');
  const hasTrailingPipe = trimmed.endsWith('|');
  
  // Remove outer pipes
  let content = trimmed;
  if (hasLeadingPipe) content = content.slice(1);
  if (hasTrailingPipe) content = content.slice(0, -1);
  
  const cells = content.split('|').map(c => c.trim());
  
  // Preserve empty cells for standard format, trim edges for mixed format
  if (hasLeadingPipe && hasTrailingPipe) {
    return cells; // Keep all cells including empty ones
  } else {
    // Filter empty cells at edges only
    let start = 0, end = cells.length;
    while (start < end && cells[start] === '') start++;
    while (end > start && cells[end - 1] === '') end--;
    return cells.slice(start, end);
  }
}
```

**Improved separator detection:**
```typescript
function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every(cell => /^:?-{1,}:?$/.test(cell.trim()));
}
```
- Accepts any number of dashes (not just 3+)
- Handles alignment markers (`:`)
- More lenient with spacing

### 5. tableParser.test.ts

**Added regression tests:**

1. **Table without trailing pipes:**
```typescript
test('parses table without trailing pipes', () => {
  const input = `| Language | Popularity | Year
|----------|------------|-----
| Python | 95 | 1991
| JavaScript | 92 | 1995`;
  // Expects 3 columns, not 1
});
```

2. **Ragged separator:**
```typescript
test('parses table with ragged separator', () => {
  const input = `| Name | Age | City |
|---|-----|---|
| John | 25 | NYC |`;
  // Expects 3 columns
});
```

3. **Smart quotes:**
```typescript
test('handles smart quotes in surrounding content', () => {
  const input = `Here's a "table" with smart quotes:
| Name | Age |
|------|-----|
| John | 25 |`;
  // Should parse correctly
});
```

4. **No outer pipes:**
```typescript
test('parses table completely without outer pipes', () => {
  const input = `Name | Age | City
----|-----|-----
John | 25 | NYC`;
  // Expects 3 columns
});
```

5. **Mixed pipe styles:**
```typescript
test('handles mixed pipe styles in same table', () => {
  const input = `| Language | Popularity | Year |
|---|-----|---
Python | 95 | 1991 |
| JavaScript | 92 | 1995`;
  // All rows parse successfully with 3 columns
});
```

## Verification Steps

### 1. Run Tests
```bash
cd apps/web
npm test -- tableParser.test.ts --run
```
✅ All 23 tests pass

### 2. Type Check
```bash
npm run typecheck
```
✅ No errors in modified files

### 3. Manual Test
1. Send chat message: "Create a table showing the top 5 programming languages with columns Language, Popularity Score, Year Created. Return as Markdown only."

2. Expected console logs:
```
[useChatStream] setSplitView(true)
[useChatStream] setCurrentArtifact (temp) msg_abc123
[artifactStore] Updating currentArtifactId from msg_abc123 to 7af2...
[useChatStream] setCurrentArtifact (server) 7af2...
```

3. Expected behavior:
   - Split pane opens immediately
   - Table displays with 3 columns
   - Hotkey (Cmd+K) works and shows same artifact
   - No "no artifact" message

## Impact

### Before
- ❌ Split pane opens but shows "no artifact"
- ❌ Tables parsed with 1 column instead of 3
- ❌ Hotkey doesn't work (points to wrong ID)

### After
- ✅ Split pane opens and displays table immediately
- ✅ Tables parse with correct column count
- ✅ Hotkey reveals the correct artifact
- ✅ Graceful fallback if ID mismatch occurs

## Files Modified

1. `apps/web/src/store/artifactStore.ts` - ID sync logic
2. `apps/web/src/hooks/useChatStream.ts` - Pointer update after save
3. `apps/web/src/components/ArtifactPane.tsx` - Fallback mechanism
4. `apps/web/src/utils/tableParser.ts` - Robust markdown parsing
5. `apps/web/src/utils/__tests__/tableParser.test.ts` - Regression tests

## Technical Details

### ID Flow
```
1. User sends message
2. createTableArtifact() → { id: "msg_abc", tempId: "msg_abc", ... }
3. setSplitView(true)
4. setCurrentArtifact("msg_abc") 
5. saveArtifact() → backend returns { id: "7af2..." }
6. Store updates: { id: "7af2...", tempId: undefined }
7. Store updates: uiStore.currentArtifactId = "7af2..."
8. setCurrentArtifact("7af2...")
9. Pane renders artifact with ID "7af2..."
```

### Fallback Logic
```
1. UI has currentArtifactId = "7af2..."
2. getArtifactById("7af2...") → returns artifact
3. If returns null:
   - getLatestArtifactForThread(currentThreadId)
   - Update currentArtifactId to fallback.id
   - Show banner "Showing latest artifact"
```

## Acceptance Criteria

✅ Split auto-opens on table creation  
✅ Artifact pane renders the latest table without manual intervention  
✅ Column count matches the Markdown header (3 for example)  
✅ Console shows two `setCurrentArtifact` logs (temp, then server)  
✅ Hotkey reveals same artifact  
✅ All tests pass  
✅ No TypeScript errors in modified files

## Notes

- The fallback mechanism is defensive programming - ideally the pointer update should prevent needing it
- Console logs can be removed in production if desired
- The `tempId` field is cleaned up after save (set to `undefined`)
- Empty cells in tables are preserved (important for data integrity)

