# Scroll Fix Test Script

## Current State After Changes

### Changes Made:
1. ✅ `index.css` (lines 519-532): Removed global `.artifact-pane *` overflow blocking
2. ✅ `SplitContainer.tsx` (line 43): Removed `overflow-hidden` from right panel wrapper  
3. ✅ `ArtifactPane.tsx` (line 133): Changed `overflow-hidden` to `overflow-y-auto`

### Expected Scroll Behavior:
- **Chat container** (`.chat-container`): Should scroll with `overflow-y-auto` 
- **Artifact pane** (`#artifact-scroll`): Should scroll independently with `overflow-y-auto !important`

## Browser Console Test Script

Paste this into the browser console to diagnose the issue:

```javascript
// Test 1: Find all scrollable containers
console.log('=== SCROLLABLE CONTAINERS ===');
const scrollable = [...document.querySelectorAll('*')].filter(e => {
  const cs = getComputedStyle(e);
  return /(auto|scroll)/.test(cs.overflowY);
}).map(e => ({
  tag: e.tagName,
  id: e.id || 'N/A',
  className: e.className.substring(0, 60),
  overflowY: getComputedStyle(e).overflowY,
  height: e.clientHeight,
  scrollHeight: e.scrollHeight,
  canScroll: e.scrollHeight > e.clientHeight
}));

console.table(scrollable);
console.log('Found', scrollable.length, 'scrollable containers');

// Test 2: Check chat container specifically
console.log('\n=== CHAT CONTAINER ===');
const chatContainer = document.querySelector('.chat-container');
if (chatContainer) {
  const cs = getComputedStyle(chatContainer);
  console.log({
    found: true,
    overflowY: cs.overflowY,
    height: chatContainer.clientHeight,
    scrollHeight: chatContainer.scrollHeight,
    canScroll: chatContainer.scrollHeight > chatContainer.clientHeight
  });
} else {
  console.error('Chat container not found!');
}

// Test 3: Check artifact scroll container
console.log('\n=== ARTIFACT SCROLL ===');
const artifactScroll = document.getElementById('artifact-scroll');
if (artifactScroll) {
  const cs = getComputedStyle(artifactScroll);
  console.log({
    found: true,
    overflowY: cs.overflowY,
    height: artifactScroll.clientHeight,
    scrollHeight: artifactScroll.scrollHeight,
    canScroll: artifactScroll.scrollHeight > artifactScroll.clientHeight,
    touchAction: cs.touchAction
  });
} else {
  console.log('Artifact scroll not found (split view may not be open)');
}

// Test 4: Check .artifact-pane rules
console.log('\n=== ARTIFACT PANE ===');
const artifactPane = document.querySelector('.artifact-pane');
if (artifactPane) {
  const cs = getComputedStyle(artifactPane);
  console.log({
    found: true,
    overflow: cs.overflow,
    overflowY: cs.overflowY,
    overscrollBehavior: cs.overscrollBehavior
  });
} else {
  console.log('Artifact pane not found (split view may not be open)');
}

// Test 5: Check for any remaining overflow:hidden blocks
console.log('\n=== CHECKING FOR OVERFLOW BLOCKS ===');
const blocked = [...document.querySelectorAll('.artifact-pane, .artifact-pane *')].filter(e => {
  const cs = getComputedStyle(e);
  return cs.overflow === 'hidden' || cs.overflowY === 'hidden';
});
console.log('Found', blocked.length, 'elements with overflow:hidden in artifact pane');
if (blocked.length > 0) {
  console.log('First 5:', blocked.slice(0, 5).map(e => ({
    tag: e.tagName,
    id: e.id,
    className: e.className.substring(0, 40)
  })));
}
```

## Manual Test Steps

1. **Start the dev server** (if not running):
   ```bash
   cd apps/web && npm run dev
   ```

2. **Open browser** to http://localhost:5173

3. **Check chat scroll**:
   - Send multiple messages to create overflow
   - Try to scroll the chat area
   - Expected: Chat should scroll smoothly

4. **Check artifact scroll**:
   - Create a table artifact (or open split view with Ctrl+Alt+S)
   - Create a large table with many rows
   - Try to scroll within the artifact pane
   - Expected: Artifact pane should scroll independently

5. **Run the console test** above and check results

## Troubleshooting

### If chat doesn't scroll:
- Check that `.chat-container` has `overflow-y-auto` class
- Check MainChatLayout.tsx line 87
- Look for conflicting parent overflow rules

### If artifact doesn't scroll:
- Check that `#artifact-scroll` has CSS `overflow-y: auto !important`
- Check index.css lines 526-532
- Verify split view is actually open

### If neither scrolls:
- Check browser console for CSS errors
- Verify Tailwind is compiling correctly
- Check if there's a build cache issue (try clearing)

