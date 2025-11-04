# Auto Split View Disabled

## Issue Fixed: ✅
Input box was moving to the left when artifacts were created.

## Root Cause:
The `useAutoOpenArtifact` hook was automatically triggering split view when new artifacts were created, which moved the input box.

## Solution:
Disabled the `useAutoOpenArtifact` hook completely.

## File Changed:
`/home/dp/Desktop/2.0/apps/web/src/hooks/useAutoOpenArtifact.ts`

**Before:** Hook automatically opened split view when artifacts were created
**After:** Hook is now a no-op (does nothing)

## Result:
- ✅ Input box stays in place when artifacts are created
- ✅ Artifacts display inline in chat (working as intended)
- ✅ No split view activation
- ✅ No layout shifts

## Code:
```typescript
export default function useAutoOpenArtifact(threadId: string | null) {
  // DISABLED: Split view is not active, artifacts show inline in chat
  useEffect(() => {
    // No-op - artifacts show inline in messages
  }, [threadId]);
}
```

Hook is kept as a no-op to avoid breaking imports in MainChatLayout.
When split view is re-enabled, restore the original implementation.
