# SCROLL HIERARCHY AUDIT

## Current Structure (Root → Chat Container):

1. **html, body**: `height: 100%; overflow: hidden` ✅ Prevents page scroll
2. **App.tsx root div**: `h-screen overflow-hidden` ✅ Prevents page scroll  
3. **MainChatLayout root div**: `min-h-screen flex flex-col` ✅ No overflow constraint
4. **main element**: `flex-1 flex flex-col min-h-0` + `height: calc(100vh - 64px)` ✅ No overflow constraint
5. **SplitContainer** (split view): `flex h-full w-full min-h-0` ✅ No overflow constraint
6. **Left panel wrapper**: `flex-shrink-0 h-full min-h-0 flex flex-col` ✅ No overflow constraint
7. **ChatPanel wrapper** (line 67): `flex-1 flex flex-col h-full min-h-0 overflow-hidden relative` ❌ **BLOCKING**
8. **Inner chat wrapper** (line 85): `flex-1 flex flex-col min-h-0 overflow-hidden` ❌ **BLOCKING**
9. **Chat container** (line 87): `flex-1 overflow-y-auto chat-container relative` ✅ Should scroll

## PROBLEM IDENTIFIED:

**Line 67**: ChatPanel wrapper has `overflow-hidden` - This constrains height ✓ BUT prevents scrolling ✗
**Line 85**: Inner chat wrapper ALSO has `overflow-hidden` - Redundant and blocking ✗

## SOLUTION:

For scrolling to work properly:
- ONE parent needs `overflow-hidden` to constrain height (create scrollable area)
- The scrollable child needs `overflow-y-auto`
- NO intermediate containers should have `overflow-hidden` between the constraining parent and scrollable child

**Fix**: Remove `overflow-hidden` from line 85 (inner chat wrapper), keep it only on line 67 (ChatPanel wrapper)

