# FINDINGS_TABLE.md

## Findings Summary

| Symptom | Root Location (file:line) | DOM Node / Selector | CSS/JS Cause | Severity | Evidence ref |
|---------|---------------------------|---------------------|--------------|----------|--------------|
| Artifact scroll broken - JS targets wrong element | apps/web/src/hooks/useAutoOpenArtifact.ts:86-89 | `.artifact-pane` | `artifactPane.scrollTop = 0` targets element with `overflow-hidden` | HIGH | ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation" |
| Artifact scroll broken - JS targets wrong element | apps/web/src/hooks/useChatStream.ts:394-397 | `.artifact-pane` | `artifactPane.scrollTop = 0` targets element with `overflow-hidden` | HIGH | ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation" |
| Artifact pane has overflow-hidden blocking scroll | apps/web/src/components/ArtifactPane.tsx:101 | `.artifact-pane` | `className="... overflow-hidden"` + `index.css:533` | MEDIUM | ARTIFACT_CONTAINER_AUDIT.md "Overflow-Hidden Locations" |
| Fixed height container constrains layout | apps/web/src/layouts/MainChatLayout.tsx:511 | `main#main` | `style={{ height: 'calc(100vh - 64px)' }}` | MEDIUM | CONTAINER_AUDIT.md "Critical Height Constraints" |
| SplitContainer has overflow-hidden | apps/web/src/components/SplitContainer.tsx:29 | `.flex.h-full` (SplitContainer root) | `className="... overflow-hidden"` | LOW | CONTAINER_AUDIT.md "Overflow Blockers" |
| Chat container uses absolute positioning | apps/web/src/layouts/MainChatLayout.tsx:88 | `.chat-container` | `style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}` | LOW | CONTAINER_AUDIT.md "Chat Scroll Owner" |
| Duplicate CSS rules for scroll containers | apps/web/src/index.css:39,471,539 | `.chat-container`, `#artifact-scroll` | Multiple `overflow-y: auto !important` rules | LOW | CSS_OVERFLOW_MAP.md "Critical Conflicts" |
| Artifact scroll container exists but JS doesn't target it | apps/web/src/components/ArtifactPane.tsx:130-133 | `#artifact-scroll` | `className="... overflow-y-auto"` (correct scroll owner) | INFO | ARTIFACT_CONTAINER_AUDIT.md "Scroll Container" |
| useAutoFocusArtifact correctly targets scroll container | apps/web/src/hooks/useAutoFocusArtifact.ts:18,22 | `scrollRef.current` (`#artifact-scroll`) | `scrollIntoView()` and `scrollTo()` work correctly | INFO | ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation" |
| Chat scroll owner correctly configured | apps/web/src/layouts/MainChatLayout.tsx:87 | `.chat-container` | `overflow-y: auto` + absolute positioning | INFO | CONTAINER_AUDIT.md "Chat Scroll Owner" |
| Artifact scroll owner correctly configured | apps/web/src/components/ArtifactPane.tsx:133 | `#artifact-scroll` | `overflow-y: auto` + flex: 1 | INFO | CONTAINER_AUDIT.md "Artifact Scroll Owner" |
| Sticky header in artifact pane | apps/web/src/components/ArtifactPane.tsx:108 | `<header className="sticky top-0">` | `position: sticky` - works correctly | INFO | ARTIFACT_CONTAINER_AUDIT.md "Sticky Header" |
| Scroll event listener tracks scroll position | apps/web/src/components/ArtifactPane.tsx:64 | `#artifact-scroll` | `addEventListener('scroll', handleScroll)` for dev overlay | INFO | ARTIFACT_CONTAINER_AUDIT.md "Event Listeners" |

## Detailed Findings

### HIGH Severity

#### 1. JS Scroll Manipulation Targets Wrong Element (useAutoOpenArtifact.ts)

**Location**: `apps/web/src/hooks/useAutoOpenArtifact.ts:86-89`

**Code:**
```javascript
const artifactPane = document.querySelector('.artifact-pane') as HTMLElement;
if (artifactPane) {
  artifactPane.scrollTop = 0;  // WRONG: .artifact-pane has overflow-hidden
  const contentSection = artifactPane.querySelector('section[data-artifact-id]') as HTMLElement;
  if (contentSection) {
    contentSection.scrollTop = 0;  // WRONG: section is not scrollable
  }
}
```

**Problem**: 
- `.artifact-pane` has `overflow-hidden` (ArtifactPane.tsx:101 + index.css:533)
- Cannot scroll an element with `overflow-hidden`
- Should target `#artifact-scroll` instead

**Fix**: Change to `document.querySelector('#artifact-scroll')`

**Evidence**: ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation"

---

#### 2. JS Scroll Manipulation Targets Wrong Element (useChatStream.ts)

**Location**: `apps/web/src/hooks/useChatStream.ts:394-397`

**Code:**
```javascript
const artifactPane = document.querySelector('.artifact-pane') as HTMLElement;
if (artifactPane) {
  artifactPane.scrollTop = 0;  // WRONG: .artifact-pane has overflow-hidden
  const contentSection = artifactPane.querySelector('section[data-artifact-id]') as HTMLElement;
  if (contentSection) {
    contentSection.scrollTop = 0;  // WRONG: section is not scrollable
  }
}
```

**Problem**: Same as above - wrong target element

**Fix**: Change to `document.querySelector('#artifact-scroll')`

**Evidence**: ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation"

---

### MEDIUM Severity

#### 3. Artifact Pane Has Overflow-Hidden

**Location**: `apps/web/src/components/ArtifactPane.tsx:101`

**Code:**
```tsx
<div className="artifact-pane h-full min-h-0 flex flex-col ... overflow-hidden">
```

**Problem**: 
- `overflow-hidden` blocks pane-level scrolling (intended)
- But JS code tries to scroll this element (unintended)
- Child `#artifact-scroll` is the actual scroll container

**Impact**: 
- JS scroll manipulation fails silently
- User expects artifact to scroll to top when created/opened

**Evidence**: ARTIFACT_CONTAINER_AUDIT.md "Overflow-Hidden Locations"

---

#### 4. Fixed Height Container Constrains Layout

**Location**: `apps/web/src/layouts/MainChatLayout.tsx:511`

**Code:**
```tsx
<main id="main" className="..." style={{ height: 'calc(100vh - 64px)', position: 'relative' }}>
```

**Problem**: 
- Fixed height `calc(100vh - 64px)` constrains entire chat/artifact area
- No flexibility for dynamic content
- May cause issues if TopBar height changes

**Impact**: 
- Layout is rigid
- Could cause scrolling issues if content exceeds viewport

**Evidence**: CONTAINER_AUDIT.md "Critical Height Constraints"

---

### LOW Severity

#### 5. SplitContainer Has Overflow-Hidden

**Location**: `apps/web/src/components/SplitContainer.tsx:29`

**Code:**
```tsx
<div className="flex h-full w-full min-h-0 overflow-hidden relative">
```

**Problem**: 
- `overflow-hidden` blocks split-level scrolling (intended)
- Creates nested scroll isolation (may be intentional)

**Impact**: 
- Low - this is likely intentional for scroll isolation
- But adds complexity to scroll debugging

**Evidence**: CONTAINER_AUDIT.md "Overflow Blockers"

---

#### 6. Chat Container Uses Absolute Positioning

**Location**: `apps/web/src/layouts/MainChatLayout.tsx:88`

**Code:**
```tsx
<div className="flex-1 overflow-y-auto chat-container" 
     style={{ paddingBottom: '200px', position: 'absolute', 
             top: 0, left: 0, right: 0, bottom: 0 }}>
```

**Problem**: 
- Absolute positioning removes from normal flow
- May cause layout issues if parent changes

**Impact**: 
- Low - works correctly for chat scrolling
- But unusual pattern (absolute + overflow-y-auto)

**Evidence**: CONTAINER_AUDIT.md "Chat Scroll Owner"

---

#### 7. Duplicate CSS Rules

**Location**: `apps/web/src/index.css:39,471,539`

**Problem**: 
- Line 39: `.chat-container, #artifact-scroll { overflow-y: auto !important; }`
- Line 471: `.chat-container { overflow-y: auto !important; }`
- Line 539: `#artifact-scroll { overflow-y: auto !important; }`

**Impact**: 
- Low - rules don't conflict (same values)
- Maintenance issue - redundant rules

**Evidence**: CSS_OVERFLOW_MAP.md "Critical Conflicts"

---

### INFO (Not Problems)

#### 8. Artifact Scroll Container Exists and Works

**Location**: `apps/web/src/components/ArtifactPane.tsx:130-133`

**Code:**
```tsx
<div id="artifact-scroll" ref={scrollRef}
     className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
```

**Status**: Correctly configured scroll container
- Has `overflow-y: auto`
- Has `flex: 1` to fill space
- Has `min-h-0` for flex scrolling

**Evidence**: ARTIFACT_CONTAINER_AUDIT.md "Scroll Container"

---

#### 9. useAutoFocusArtifact Works Correctly

**Location**: `apps/web/src/hooks/useAutoFocusArtifact.ts:18,22`

**Code:**
```javascript
containerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
// or
containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
```

**Status**: Correctly targets `scrollRef.current` which points to `#artifact-scroll`

**Evidence**: ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation"

---

## Root Cause Summary

**Primary Issue**: JavaScript scroll manipulation targets wrong element
- Two hooks (`useAutoOpenArtifact.ts`, `useChatStream.ts`) try to scroll `.artifact-pane`
- `.artifact-pane` has `overflow-hidden` (cannot scroll)
- Should target `#artifact-scroll` instead

**Secondary Issue**: Nested overflow-hidden containers
- Multiple containers have `overflow-hidden` (main, SplitContainer, artifact-pane)
- Creates scroll isolation (may be intentional but adds complexity)

**Tertiary Issue**: Fixed height container
- `main#main` has `height: calc(100vh - 64px)` (rigid layout)

## Recommendations

1. **Fix JS scroll targets** (HIGH priority)
   - Change `useAutoOpenArtifact.ts:86` to target `#artifact-scroll`
   - Change `useChatStream.ts:394` to target `#artifact-scroll`

2. **Verify scroll isolation** (MEDIUM priority)
   - Confirm nested `overflow-hidden` is intentional
   - Document scroll isolation strategy

3. **Consolidate CSS rules** (LOW priority)
   - Remove duplicate `overflow-y: auto` rules in index.css
   - Keep single rule per selector

4. **Consider flexible height** (LOW priority)
   - Evaluate if `main#main` fixed height is necessary
   - Consider `min-height` instead of `height`

