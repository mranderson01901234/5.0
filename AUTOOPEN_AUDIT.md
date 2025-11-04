# Auto-Open Artifact Audit

**Date**: Generated during audit phase  
**Goal**: Diagnose auto-open artifact flow and identify race conditions, ID drift issues, and blocking factors.

---

## 1. Call Sites Analysis

### `setSplitView()` Call Sites

#### `apps/web/src/hooks/useChatStream.ts:388`
```typescript
uiStore.openArtifactPane(artifact.id);
```
- **Location**: After artifact creation (line 388)
- **Context**: Uses `openArtifactPane()` which atomically sets both `splitView: true` and `currentArtifactId`
- **Timing**: Immediately after `createTableArtifact()` returns (local temp ID)

#### `apps/web/src/layouts/MainChatLayout.tsx:226`
```typescript
if (viewParam === "split" && !splitView) {
  setSplitView(true);
}
```
- **Location**: URL query param sync (line 226)
- **Context**: Syncs URL `?view=split` to state
- **Timing**: On URL param change

#### `apps/web/src/layouts/MainChatLayout.tsx:234`
```typescript
else if (viewParam === "chat" && splitView) {
  setSplitView(false);
}
```
- **Location**: URL query param sync (line 234)
- **Context**: Syncs URL `?view=chat` to state
- **Timing**: On URL param change

#### `apps/web/src/layouts/MainChatLayout.tsx:259`
```typescript
setSplitView(newState);
```
- **Location**: Keyboard shortcut handler (Ctrl+Alt+S) (line 259)
- **Context**: Toggle split view hotkey
- **Timing**: User-initiated

#### `apps/web/src/layouts/MainChatLayout.tsx:269`
```typescript
setSplitView(false);
```
- **Location**: Escape key handler (line 269)
- **Context**: Close artifact pane
- **Timing**: User-initiated

#### `apps/web/src/layouts/MainChatLayout.tsx:290`
```typescript
setSplitView(false);
```
- **Location**: Auto-close effect when `currentArtifactId` is null (line 290)
- **Context**: Closes split view when no artifact selected
- **Timing**: With 100ms delay after `currentArtifactId` becomes null
- **⚠️ ISSUE**: May race with artifact creation if artifact ID changes (temp → server)

#### `apps/web/src/components/ArtifactPane.tsx:45`
```typescript
setSplitView(false);
```
- **Location**: Close button handler (line 45)
- **Context**: User clicks X button
- **Timing**: User-initiated

#### `apps/web/src/components/ArtifactPane.tsx:481`
```typescript
setSplitView(false);
```
- **Location**: Empty state close handler (line 481)
- **Context**: Close button in empty state
- **Timing**: User-initiated

---

### `setCurrentArtifact()` Call Sites

#### `apps/web/src/hooks/useChatStream.ts:402`
```typescript
if (saved?.id && saved.id !== artifact.id) {
  uiStore.setCurrentArtifact(saved.id);
}
```
- **Location**: After `saveArtifact()` completes (line 402)
- **Context**: Repoints selection from temp ID to server ID
- **Timing**: Async, after backend save completes
- **⚠️ RACE CONDITION**: Gap between `openArtifactPane(artifact.id)` (temp ID) and this repoint (server ID)

#### `apps/web/src/store/artifactStore.ts:146`
```typescript
if (uiStore.currentArtifactId === oldId) {
  uiStore.setCurrentArtifact(saved.id);
}
```
- **Location**: Inside `saveArtifact()` (line 146)
- **Context**: Repoints selection if `currentArtifactId` matches old ID
- **Timing**: Synchronous during store update
- **✅ GOOD**: Handles repointing in store update

#### `apps/web/src/components/ArtifactPane.tsx:36`
```typescript
setCurrentArtifact(fallbackArtifact.id);
```
- **Location**: Fallback effect when artifact not found (line 36)
- **Context**: Falls back to latest artifact for thread if `currentArtifactId` is invalid
- **Timing**: On artifact lookup failure

#### `apps/web/src/components/ArtifactPane.tsx:44`
```typescript
setCurrentArtifact(null);
```
- **Location**: Close button handler (line 44)
- **Context**: User closes artifact pane
- **Timing**: User-initiated

#### `apps/web/src/layouts/MainChatLayout.tsx:268`
```typescript
useUIStore.getState().setCurrentArtifact(null);
```
- **Location**: Escape key handler (line 268)
- **Context**: Clear artifact selection on Escape
- **Timing**: User-initiated

---

### `openArtifactPane()` Call Sites

#### `apps/web/src/hooks/useChatStream.ts:388`
```typescript
uiStore.openArtifactPane(artifact.id);
```
- **Location**: After artifact creation (line 388)
- **Context**: Opens split view and sets artifact ID atomically
- **Timing**: Immediately after `createTableArtifact()` returns (temp ID)
- **⚠️ ISSUE**: Uses temp ID; must repoint after server save

---

## 2. Artifact Creation & Save Flow

### Creation Flow (`useChatStream.ts`)

1. **Line 376**: `createTableArtifact(tableData, newThreadId)` creates artifact with temp ID (`msg_${nanoid()}`)
2. **Line 388**: `openArtifactPane(artifact.id)` sets `splitView: true` and `currentArtifactId: tempId`
3. **Line 393**: `saveArtifact(artifact, authToken)` saves to backend (async)
4. **Line 400-402**: If server returns different ID, repoints `currentArtifactId` to server ID

### Save Flow (`artifactStore.ts`)

1. **Line 107-167**: `saveArtifact()`:
   - Calls `createArtifact()` API
   - Receives `saved.id` from server
   - If `saved.id !== artifact.id`, updates store artifact ID
   - **Line 144-147**: Updates `uiStore.currentArtifactId` if it matches old ID
   - Returns updated artifact

### Race Conditions Identified

#### Race #1: Temp ID → Server ID Repoint Window
- **Timing Gap**: Between `openArtifactPane(tempId)` (line 388) and `setCurrentArtifact(serverId)` (line 402)
- **Risk**: If UI renders during this window, `currentArtifactId` points to temp ID that may not exist in store after save
- **Impact**: ArtifactPane may show empty state or fallback during repoint

#### Race #2: Auto-Close Effect vs. Repoint
- **Location**: `MainChatLayout.tsx:282-298`
- **Issue**: Effect closes split view if `currentArtifactId` is null with 100ms delay
- **Risk**: If repoint happens after delay starts but before execution, may close split view prematurely
- **Impact**: Split view closes even though artifact exists

#### Race #3: URL Param Override vs. Auto-Open
- **Location**: `MainChatLayout.tsx:217-250`
- **Issue**: URL param `?view=chat` can force-close split view
- **Risk**: If user has `?view=chat` and artifact is created, auto-open may be blocked
- **Impact**: Artifact created but split view stays closed

---

## 3. Feature Flags

### Feature Flag Definitions (`apps/llm-gateway/src/featureFlags.ts`)

```typescript
export interface ArtifactFeatureFlags {
  artifactFeatureEnabled: boolean;      // env.ARTIFACT_FEATURE_ENABLED === 'true'
  gatekeeperEnabled: boolean;           // env.GATEKEEPER_ENABLED !== 'false' (default: true)
  artifactCreationEnabled: boolean;     // env.ARTIFACT_CREATION_ENABLED !== 'false' (default: true)
  exportEnabled: boolean;              // env.EXPORT_ENABLED !== 'false' (default: true)
  splitViewEnabled: boolean;           // env.SPLIT_VIEW_ENABLED !== 'false' (default: true)
}
```

### Read Paths

1. **Backend**: `apps/llm-gateway/src/routes.ts:248` - Checks flags before calling gatekeeper
2. **Frontend**: No direct checks found in frontend code
3. **Default Behavior**: All flags default to `true` except `artifactFeatureEnabled` (requires `'true'`)

### Impact on Auto-Open

- **`splitViewEnabled`**: If `false`, split view functionality disabled (backend flag, not checked in frontend)
- **`artifactFeatureEnabled`**: If `false`, gatekeeper disabled, so artifacts won't be created
- **`gatekeeperEnabled`**: If `false`, gatekeeper disabled, artifacts won't be created
- **Frontend**: No feature flag checks found; auto-open happens regardless of backend flags

**⚠️ FINDING**: Frontend auto-open logic does not check feature flags. If backend flags disable artifacts, frontend may still attempt to open split view (though no artifacts will be created).

---

## 4. ID Repointing Logic

### Current Implementation

#### `artifactStore.ts:saveArtifact()` (Lines 119-147)
```typescript
const oldId = artifact.tempId || artifact.id;
// ... update store ...
if (uiStore.currentArtifactId === oldId) {
  uiStore.setCurrentArtifact(saved.id);
}
```

**✅ GOOD**: Handles repointing in store update

#### `useChatStream.ts:400-402`
```typescript
if (saved?.id && saved.id !== artifact.id) {
  uiStore.setCurrentArtifact(saved.id);
}
```

**⚠️ ISSUE**: Double repoint (once in store, once in hook). May cause redundant updates.

### `createdAt` Field

- **Line 65**: `createdAt: Date.now()` set in `createTableArtifact()`
- **✅ GOOD**: All artifacts have `createdAt` timestamp

---

## 5. URL Param Precedence

### Current Implementation (`MainChatLayout.tsx:217-250`)

- **URL → State**: If URL says `?view=chat` and state says `splitView: true`, state is updated to `false`
- **State → URL**: If state changes, URL is updated
- **⚠️ ISSUE**: No precedence for recent artifact creation. URL param can override auto-open.

**Example Race**:
1. User navigates to `?view=chat`
2. Artifact is created → `openArtifactPane()` sets `splitView: true`
3. URL sync effect runs → sees `?view=chat` but `splitView: true` → forces `splitView: false`

---

## 6. ArtifactPane Stability

### Current Fallback (`ArtifactPane.tsx:30-41`)

```typescript
React.useEffect(() => {
  if (!artifact && currentThreadId) {
    const fallbackArtifact = getLatestArtifactForThread(currentThreadId);
    if (fallbackArtifact) {
      setCurrentArtifact(fallbackArtifact.id);
    }
  }
}, [artifact, currentThreadId, ...]);
```

**✅ GOOD**: Has fallback to latest artifact
**⚠️ ISSUE**: Uses `useEffect` (runs after render). May cause flicker if artifact not found during repoint window.

---

## 7. Call Graph

```
useChatStream.send()
  └─> classifyArtifactIntent()
      └─> intent.shouldCreate === true
          └─> createTableArtifact(tempId)
              └─> artifactStore.createTableArtifact()
                  └─> { id: tempId, createdAt: Date.now(), ... }
          └─> openArtifactPane(tempId)  [ATOMIC]
              └─> uiStore.openArtifactPane()
                  └─> set({ splitView: true, currentArtifactId: tempId })
          └─> saveArtifact(artifact, token) [ASYNC]
              └─> artifactStore.saveArtifact()
                  └─> createArtifact() API call
                      └─> { id: serverId } response
                  └─> Update store artifact: tempId → serverId
                  └─> if (currentArtifactId === tempId) setCurrentArtifact(serverId)
              └─> if (saved.id !== artifact.id) setCurrentArtifact(serverId) [REDUNDANT]
```

**Race Points**:
1. Between `openArtifactPane(tempId)` and `saveArtifact()` completion
2. Between store repoint and hook repoint
3. Between repoint and URL param sync effect

---

## 8. Identified Issues Summary

### Critical Issues

1. **Double Repoint**: Both `artifactStore.saveArtifact()` and `useChatStream.ts` repoint `currentArtifactId`
2. **URL Param Override**: URL `?view=chat` can force-close split view even after artifact creation
3. **Auto-Close Race**: Auto-close effect (100ms delay) may close split view during repoint window

### Moderate Issues

4. **No Debounce Close**: User closes split view, then artifact created → immediately reopens (no debounce)
5. **No Feature Flag Checks**: Frontend doesn't check feature flags before auto-opening
6. **ArtifactPane Flicker**: Fallback effect runs after render, may cause empty state flash

### Minor Issues

7. **Missing Telemetry**: No logs for auto-open decisions
8. **No Thread Filtering**: Auto-open doesn't filter by `threadId` (though artifacts are thread-scoped)

---

## 9. Recommendations

### Immediate Fixes

1. **Add `lastSplitCloseTs` to `uiStore`**: Track when user manually closes split view
2. **Debounce Close Window**: Don't auto-open within 3s of manual close
3. **Consolidate Repoint**: Remove redundant repoint in `useChatStream.ts`, rely on store logic
4. **URL Param Precedence**: Don't force-close if artifact created in last 2s

### Hook-Based Solution

5. **Create `useAutoOpenArtifact` hook**: Watch artifacts array, auto-open newest artifact for current thread
6. **Thread Filtering**: Only auto-open artifacts for `currentThreadId`
7. **Guard Against Manual Close**: Check `lastSplitCloseTs` before auto-opening

### Stability Improvements

8. **Immediate Open on Create**: Call `openArtifactPane()` immediately after `createTableArtifact()` (already done)
9. **RequestAnimationFrame Fallback**: Use `requestAnimationFrame` for ArtifactPane fallback to avoid render flicker
10. **Keep Last Valid ID**: Never clear `currentArtifactId` to `null` during repoint; keep previous valid ID until new one is confirmed

---

## 10. Next Steps

1. ✅ Audit complete
2. ⏭️ Implement fixes (PHASE 2)
3. ⏭️ Add tests (PHASE 3)
4. ⏭️ Validate (PHASE 4)

