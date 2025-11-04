# GO/NO-GO_CHECKS.md

## Boolean Checklist

### Scroll Ownership

#### ✅ There is exactly one scroll owner now (chat)
**Status**: FALSE

**Evidence**: 
- Chat scroll owner: `.chat-container` (MainChatLayout.tsx:87)
- Artifact scroll owner: `#artifact-scroll` (ArtifactPane.tsx:133)
- **Result**: TWO scroll owners (one for chat, one for artifact - INTENDED)

**File Reference**: CONTAINER_AUDIT.md "Current Scroll Owners"

---

#### ✅ Artifact column has any node with overflow-y auto
**Status**: TRUE

**Evidence**:
- `#artifact-scroll` has `overflow-y: auto` (ArtifactPane.tsx:133)
- CSS: `index.css:539` also sets `overflow-y: auto !important`

**File Reference**: ARTIFACT_CONTAINER_AUDIT.md "Scroll Container"

---

#### ✅ Any inline overflow:hidden on Artifact subtree
**Status**: FALSE (inline styles: none found)

**Locations**:
- No inline `overflow: hidden` styles found
- All `overflow-hidden` comes from CSS classes:
  - `.artifact-pane` (ArtifactPane.tsx:101) - CSS class
  - `index.css:533` - CSS rule

**File Reference**: ARTIFACT_CONTAINER_AUDIT.md "Overflow-Hidden Locations"

---

#### ✅ Any JS altering artifact scrollTop or intercepting wheel/touchmove
**Status**: TRUE (JS altering scrollTop, but wrong target)

**Locations**:

1. **JS altering scrollTop (WRONG TARGET)**:
   - `apps/web/src/hooks/useAutoOpenArtifact.ts:86-89`
     - Code: `artifactPane.scrollTop = 0`
     - Target: `.artifact-pane` (overflow-hidden - cannot scroll)
     - Effect: No-op (silently fails)

   - `apps/web/src/hooks/useChatStream.ts:394-397`
     - Code: `artifactPane.scrollTop = 0`
     - Target: `.artifact-pane` (overflow-hidden - cannot scroll)
     - Effect: No-op (silently fails)

2. **JS altering scrollTop (CORRECT TARGET)**:
   - `apps/web/src/hooks/useAutoFocusArtifact.ts:18,22`
     - Code: `containerRef.current.scrollIntoView()` and `scrollTo()`
     - Target: `scrollRef.current` (`#artifact-scroll`)
     - Effect: Works correctly

3. **Event listeners**:
   - `apps/web/src/components/ArtifactPane.tsx:64`
     - Event: `scroll`
     - Target: `#artifact-scroll`
     - Purpose: Track scrollTop for dev overlay
     - Interception: No (passive listener, doesn't prevent scroll)

4. **Wheel/touchmove interception**:
   - None found in artifact-related code

**File Reference**: ARTIFACT_CONTAINER_AUDIT.md "JavaScript Scroll Manipulation"

---

#### ✅ Any ancestor fixed height (calc(100vh-…)) containing BOTH chat and artifact
**Status**: TRUE

**Locations**:
- `apps/web/src/layouts/MainChatLayout.tsx:511`
  - Element: `main#main`
  - Style: `height: calc(100vh - 64px)`
  - Contains: Both chat and artifact (via SplitContainer)

**File Reference**: CONTAINER_AUDIT.md "Critical Height Constraints"

---

## Additional Checks

### ✅ Artifact scroll container exists and is configured correctly
**Status**: TRUE

**Evidence**:
- Element: `#artifact-scroll` (ArtifactPane.tsx:130-133)
- CSS: `overflow-y: auto` (className + index.css:539)
- Height: `flex: 1` (fills remaining space after header)
- Min-height: `min-h-0` (allows flex scrolling)

**File Reference**: ARTIFACT_CONTAINER_AUDIT.md "Scroll Container"

---

### ✅ Artifact pane has overflow-hidden (blocks pane-level scroll)
**Status**: TRUE

**Evidence**:
- Element: `.artifact-pane` (ArtifactPane.tsx:101)
- CSS: `overflow-hidden` (className + index.css:533)
- Effect: Blocks pane-level scroll (allows child `#artifact-scroll` to scroll)

**File Reference**: ARTIFACT_CONTAINER_AUDIT.md "Overflow-Hidden Locations"

---

### ✅ Chat and artifact are independent scroll containers
**Status**: TRUE

**Evidence**:
- Chat: `.chat-container` (MainChatLayout.tsx:87) - `overflow-y: auto`
- Artifact: `#artifact-scroll` (ArtifactPane.tsx:133) - `overflow-y: auto`
- Both are separate scroll owners with independent scroll behavior

**File Reference**: CONTAINER_AUDIT.md "Current Scroll Owners"

---

### ✅ SplitContainer has overflow-hidden (blocks split-level scroll)
**Status**: TRUE

**Evidence**:
- Element: SplitContainer root (SplitContainer.tsx:29)
- CSS: `overflow-hidden` (className)
- Effect: Blocks split-level scroll (allows child containers to scroll)

**File Reference**: CONTAINER_AUDIT.md "Overflow Blockers"

---

## Summary

### Critical Issues:
1. ❌ **JS scroll manipulation targets wrong element** (useAutoOpenArtifact.ts, useChatStream.ts)
   - Targets `.artifact-pane` (overflow-hidden)
   - Should target `#artifact-scroll` (overflow-y-auto)

2. ✅ **Artifact scroll container exists** (`#artifact-scroll`)
   - Correctly configured with `overflow-y: auto`
   - Properly nested within `overflow-hidden` parent

3. ✅ **Chat scroll container exists** (`.chat-container`)
   - Correctly configured with `overflow-y: auto`
   - Independent from artifact scroll

4. ⚠️ **Fixed height container** (`main#main`)
   - `height: calc(100vh - 64px)` constrains layout
   - May cause issues if content exceeds viewport

### Non-Critical:
- Nested `overflow-hidden` containers (intentional scroll isolation)
- Duplicate CSS rules (maintenance issue, not functional problem)

## Conclusion

**Primary Issue**: JavaScript scroll manipulation fails because it targets `.artifact-pane` (overflow-hidden) instead of `#artifact-scroll` (overflow-y-auto).

**Secondary Issue**: Fixed height container may constrain layout flexibility.

**Tertiary Issue**: Duplicate CSS rules (maintenance issue only).

**Scroll Isolation**: Working as designed - nested overflow-hidden containers create scroll isolation, allowing independent scrolling in chat and artifact columns.
