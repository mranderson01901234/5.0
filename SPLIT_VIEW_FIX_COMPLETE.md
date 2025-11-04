# Split View Auto-Open Completely Disabled ✅

## Issue: 
Input box kept moving to the left when artifacts were created.

## Root Causes Found:
1. ✅ `useAutoOpenArtifact` hook (FIXED)
2. ✅ `useChatStream` calling `openArtifactPane()` (FIXED)

## Files Changed:

### 1. `/home/dp/Desktop/2.0/apps/web/src/hooks/useAutoOpenArtifact.ts`
- Disabled entire hook (made it a no-op)

### 2. `/home/dp/Desktop/2.0/apps/web/src/hooks/useChatStream.ts` (Line 385-398)
**Before:**
```typescript
const uiStore = useUIStore.getState();
console.log('[autoopen] openArtifactPane (temp)', artifact.id);
uiStore.openArtifactPane(artifact.id);  // <-- This was opening split view!
```

**After:**
```typescript
// DISABLED: Split view disabled - artifacts show inline in chat
console.log('[artifact] Created artifact (inline display)', artifact.id);
// All split view code commented out
```

## Result:
- ✅ Input box stays in place
- ✅ Artifacts display inline in chat
- ✅ No split view activation at all
- ✅ No layout shifts
- ✅ Smooth user experience

## Testing:
Create a table artifact - the input box should NOT move at all.

## Logs You'll See:
```
[artifact] Created artifact (inline display) <artifact-id>
```
Instead of:
```
[autoopen] openArtifactPane (temp) <artifact-id>
```

## Split View Status:
- Keyboard shortcut (Ctrl+Alt+S) still exists but does nothing visual
- Split view rendering is disabled in MainChatLayout
- All auto-open logic is disabled
- Artifacts show inline only
