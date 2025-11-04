# Split View Temporarily Disabled

## Status: DISABLED

The 50/50 split view has been temporarily disabled due to persistent scrolling issues.

## What was changed:

### `/home/dp/Desktop/2.0/apps/web/src/layouts/MainChatLayout.tsx`
Line 509-515: Split view now just shows the ChatPanel (no artifact pane)

```typescript
) : splitView ? (
  /* SPLIT VIEW DISABLED - Show artifact inline in chat instead */
  <ChatPanel
    hasMessages={hasMessages}
    currentThreadId={currentThreadId}
    currentView={currentView}
  />
```

## Current Behavior:
- Split view toggle (Ctrl+Alt+S) does nothing visually
- Artifacts are NOT displayed anywhere currently
- Chat works normally

## To Re-enable:
You'll need to fix the scrolling architecture. Options:
1. Use CSS Grid instead of Flexbox
2. Use iframe for complete isolation
3. Redesign the layout system from scratch

## Next Steps:
Either:
1. **Keep it disabled** - Remove split view feature entirely
2. **Show artifacts inline in chat** - Add artifact rendering to MessageItem
3. **Use a modal/overlay** - Show artifacts in a popup instead of split view
4. **Fix the scroll issue properly** - Requires architectural changes

## Time Spent on Scroll Debugging: ~2 hours

