# Web Application - High Priority Fixes Phase Plan

**Date:** 2025-01-27  
**Based on:** WEB_APPLICATION_AUDIT.md  
**Estimated Total Time:** 2-3 weeks

---

## Phase 1: Error Handling & Resilience (Week 1)
**Goal:** Prevent app crashes and provide better error feedback  
**Priority:** 🔴 Critical  
**Estimated Time:** 3-4 days

### 1.1 Error Boundary Implementation
**Time:** 4-6 hours

**Tasks:**
1. Create `apps/web/src/components/ErrorBoundary.tsx`
   - React error boundary component
   - Fallback UI with error message
   - Retry mechanism
   - Error logging integration

2. Wrap major sections:
   - `App.tsx` - Root level boundary
   - `MessageList.tsx` - Chat section boundary
   - `Sidebar.tsx` - Sidebar boundary
   - `Dashboard.tsx` - Dashboard boundary

3. Add error recovery:
   - "Retry" button
   - "Report Issue" link
   - Stack trace in dev mode only

**Acceptance Criteria:**
- [ ] Error boundary catches unhandled errors
- [ ] User sees friendly error message
- [ ] Retry functionality works
- [ ] Errors logged to console/service

**Files to Create:**
- `apps/web/src/components/ErrorBoundary.tsx`

**Files to Modify:**
- `apps/web/src/App.tsx`
- `apps/web/src/components/chat/MessageList.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/pages/Dashboard.tsx`

---

### 1.2 Toast Notification System
**Time:** 3-4 hours

**Tasks:**
1. Install/implement toast library (react-hot-toast or sonner)
2. Create toast context/provider
3. Replace console.logs with toasts:
   - Settings save success/error
   - Conversation deletion confirmation
   - API errors
   - Network errors

**Acceptance Criteria:**
- [ ] Toasts appear for user actions
- [ ] Success/error states clear
- [ ] Toasts auto-dismiss
- [ ] Accessible (keyboard, screen readers)

**Dependencies:**
- Error boundary (for error toasts)

**Files to Create:**
- `apps/web/src/components/ui/toast.tsx` (if building custom)
- `apps/web/src/contexts/ToastContext.tsx`

**Files to Modify:**
- `apps/web/src/components/settings/SettingsDialog.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/services/gateway.ts`
- `apps/web/src/hooks/useChatStream.ts`

---

### 1.3 Improved API Error Handling
**Time:** 4-5 hours

**Tasks:**
1. Create error utility functions:
   - Error type detection (network, auth, server, validation)
   - User-friendly error messages
   - Error mapping to toasts

2. Update gateway service:
   - Better error messages in `gateway.ts`
   - Retry logic for transient errors
   - Network error detection

3. Update components:
   - Show loading states during API calls
   - Display error states in UI
   - Add retry buttons

**Acceptance Criteria:**
- [ ] Network errors show user-friendly message
- [ ] Auth errors redirect or show login prompt
- [ ] Validation errors show specific fields
- [ ] Server errors show generic message (no stack trace)

**Files to Create:**
- `apps/web/src/lib/errors.ts`
- `apps/web/src/lib/errorMessages.ts`

**Files to Modify:**
- `apps/web/src/services/gateway.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`

---

## Phase 2: Core Functionality Fixes (Week 1-2)
**Goal:** Fix broken/incomplete core features  
**Priority:** 🔴 Critical  
**Estimated Time:** 4-5 days

### 2.1 Settings Persistence Implementation
**Time:** 6-8 hours

**Tasks:**
1. Backend API integration:
   - Create GET `/v1/settings` endpoint (if not exists)
   - Create POST `/v1/settings` endpoint
   - Update gateway service with settings API calls

2. Frontend implementation:
   - Load settings on dialog open
   - Save settings on "Save Changes"
   - Show loading state during save
   - Handle save errors
   - Show success toast

3. Default settings handling:
   - Fallback to defaults if API fails
   - Merge user settings with defaults

**Acceptance Criteria:**
- [ ] Settings load from API on dialog open
- [ ] Settings save to backend
- [ ] Settings persist across page refreshes
- [ ] Loading states shown during save/load
- [ ] Error handling for failed saves

**Dependencies:**
- Toast notification system (Phase 1.2)

**Files to Modify:**
- `apps/web/src/components/settings/SettingsDialog.tsx`
- `apps/web/src/services/gateway.ts`

**Backend Requirements:**
- Verify settings endpoints exist in gateway
- If not, coordinate with backend team or implement

---

### 2.2 Input Sanitization & Security
**Time:** 3-4 hours

**Tasks:**
1. Install DOMPurify:
   ```bash
   pnpm add dompurify
   pnpm add -D @types/dompurify
   ```

2. Create sanitization utility:
   - Function to sanitize user content
   - Whitelist safe HTML tags
   - Preserve math notation

3. Update MessageContent:
   - Sanitize user messages before rendering
   - Validate URLs before creating links
   - Escape special characters properly

**Acceptance Criteria:**
- [ ] User content sanitized before rendering
- [ ] Math notation preserved
- [ ] URLs validated before creating links
- [ ] XSS attacks prevented

**Files to Create:**
- `apps/web/src/lib/sanitize.ts`

**Files to Modify:**
- `apps/web/src/components/chat/MessageList.tsx`
- `package.json`

---

### 2.3 Dashboard Route & Navigation
**Time:** 2-3 hours

**Tasks:**
1. Add dashboard navigation to Sidebar:
   - Add "Dashboard" button/icon
   - Update view switching logic

2. Update App.tsx routing:
   - Ensure dashboard view renders correctly
   - Test navigation flow

**Acceptance Criteria:**
- [ ] Dashboard accessible from sidebar
- [ ] Dashboard view renders correctly
- [ ] Navigation works between views

**Files to Modify:**
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/App.tsx` (verify routing)

---

## Phase 3: Performance Optimizations (Week 2)
**Goal:** Improve rendering performance and reduce unnecessary re-renders  
**Priority:** 🟡 High  
**Estimated Time:** 3-4 days

### 3.1 React Optimization Hooks
**Time:** 6-8 hours

**Tasks:**
1. Memoize MessageContent:
   - Wrap with `React.memo()`
   - Use `useMemo()` for expensive regex operations
   - Memoize `detectInlineMath` results

2. Optimize MessageList:
   - Memoize message items
   - Use `useCallback()` for event handlers
   - Optimize scroll handlers

3. Optimize Sidebar:
   - Memoize conversation list
   - Memoize delete handler
   - Optimize hover handlers

4. Optimize CenterComposer:
   - Memoize send handler
   - Debounce textarea resize

**Acceptance Criteria:**
- [ ] MessageContent only re-renders when content changes
- [ ] MessageList doesn't re-render entire list on single message
- [ ] Sidebar optimizations reduce re-renders
- [ ] Performance metrics improve (measured)

**Files to Modify:**
- `apps/web/src/components/chat/MessageList.tsx`
- `apps/web/src/components/home/CenterComposer.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`

---

### 3.2 Fix Dependency Arrays
**Time:** 1-2 hours

**Tasks:**
1. Audit all useEffect hooks
2. Fix missing dependencies in App.tsx
3. Verify no stale closures
4. Test for infinite loops

**Acceptance Criteria:**
- [ ] All useEffect dependencies correct
- [ ] No stale closures
- [ ] No infinite loops
- [ ] ESLint warnings resolved

**Files to Modify:**
- `apps/web/src/App.tsx`
- Review all files with useEffect

---

### 3.3 Remove Console Logs & Create Logging Utility
**Time:** 2-3 hours

**Tasks:**
1. Create logging utility:
   - Environment-based log levels
   - Different methods (log, warn, error)
   - Production mode suppression

2. Replace console.logs:
   - Update gateway.ts
   - Update useChatStream.ts
   - Update Sidebar.tsx
   - Update other components

**Acceptance Criteria:**
- [ ] All console.logs replaced with utility
- [ ] Logs suppressed in production
- [ ] Error logs still work in production

**Files to Create:**
- `apps/web/src/lib/logger.ts`

**Files to Modify:**
- All files with console.log statements

---

## Phase 4: Code Quality & Developer Experience (Week 2-3)
**Goal:** Improve codebase maintainability  
**Priority:** 🟡 High  
**Estimated Time:** 2-3 days

### 4.1 Type Safety Improvements
**Time:** 2-3 hours

**Tasks:**
1. Replace `any` types:
   - Fix useChatStream.ts (line 108)
   - Add proper types for SSE events
   - Add types for API responses

2. Add null checks:
   - Gateway service
   - Chat store operations
   - Component props

3. Enable stricter TypeScript:
   - Check tsconfig.json
   - Enable strictNullChecks if not enabled

**Acceptance Criteria:**
- [ ] No `any` types in production code
- [ ] All null/undefined properly handled
- [ ] TypeScript strict mode enabled

**Files to Modify:**
- `apps/web/src/hooks/useChatStream.ts`
- `apps/web/src/services/gateway.ts`
- `apps/web/tsconfig.json`

---

### 4.2 Consolidate Vite Config
**Time:** 30 minutes - 1 hour

**Tasks:**
1. Compare vite.config.js and vite.config.ts
2. Merge configurations
3. Remove duplicate file
4. Test build process

**Acceptance Criteria:**
- [ ] Single vite config file
- [ ] All configurations preserved
- [ ] Build still works

**Files to Modify:**
- Remove `apps/web/vite.config.js`
- Keep `apps/web/vite.config.ts` (or vice versa)

---

### 4.3 Environment Variable Validation
**Time:** 1-2 hours

**Tasks:**
1. Create env validation utility
2. Validate on app startup
3. Show clear error if missing vars

**Acceptance Criteria:**
- [ ] App validates env vars on startup
- [ ] Clear error message if vars missing
- [ ] Documentation of required vars

**Files to Create:**
- `apps/web/src/lib/env.ts`

**Files to Modify:**
- `apps/web/src/main.tsx`

---

## Phase 5: Testing Infrastructure (Week 3)
**Goal:** Add testing to prevent regressions  
**Priority:** 🟡 High  
**Estimated Time:** 3-4 days

### 5.1 Test Setup
**Time:** 2-3 hours

**Tasks:**
1. Install testing dependencies:
   ```bash
   pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
   ```

2. Configure Jest:
   - Create jest.config.js
   - Setup module mocks
   - Configure test environment

3. Create test utilities:
   - Custom render with providers
   - Mock hooks
   - Test data factories

**Acceptance Criteria:**
- [ ] Jest configured and working
- [ ] Can run `pnpm test`
- [ ] Test utilities ready

**Files to Create:**
- `apps/web/jest.config.js`
- `apps/web/src/test-utils.tsx`
- Update `package.json` with test script

---

### 5.2 Unit Tests for Critical Components
**Time:** 8-10 hours

**Tasks:**
1. Test ErrorBoundary:
   - Error catching
   - Fallback rendering
   - Retry functionality

2. Test MessageContent:
   - Math equation detection
   - Code block rendering
   - Markdown parsing
   - Domain link rendering

3. Test ChatStore:
   - State updates
   - Conversation management
   - Message operations

4. Test SettingsDialog:
   - Settings loading
   - Settings saving
   - Form interactions

**Acceptance Criteria:**
- [ ] ErrorBoundary tests pass
- [ ] MessageContent tests cover edge cases
- [ ] ChatStore tests verify state changes
- [ ] SettingsDialog tests verify save/load
- [ ] Minimum 70% coverage on critical paths

**Files to Create:**
- `apps/web/src/components/ErrorBoundary.test.tsx`
- `apps/web/src/components/chat/MessageList.test.tsx`
- `apps/web/src/store/chatStore.test.ts`
- `apps/web/src/components/settings/SettingsDialog.test.tsx`

---

## Phase 6: Accessibility Improvements (Week 3)
**Goal:** Improve accessibility compliance  
**Priority:** 🟢 Medium  
**Estimated Time:** 2-3 days

### 6.1 ARIA Labels & Semantic HTML
**Time:** 3-4 hours

**Tasks:**
1. Audit all interactive elements
2. Add missing aria-labels
3. Fix form labels (settings sliders)
4. Add aria-describedby where needed

**Acceptance Criteria:**
- [ ] All buttons have aria-labels
- [ ] All form inputs have labels
- [ ] Screen reader testing passes

**Files to Modify:**
- `apps/web/src/components/settings/SettingsDialog.tsx`
- `apps/web/src/components/chat/MessageList.tsx`
- `apps/web/src/components/home/CenterComposer.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`

---

### 6.2 Keyboard Navigation
**Time:** 2-3 hours

**Tasks:**
1. Implement focus traps in modals
2. Add Escape key handlers
3. Test tab order
4. Add keyboard shortcuts documentation

**Acceptance Criteria:**
- [ ] Modal focus traps work
- [ ] Escape closes modals
- [ ] Tab order is logical
- [ ] Keyboard-only navigation possible

**Files to Modify:**
- `apps/web/src/components/settings/SettingsDialog.tsx`
- Any other modal components

---

## Implementation Timeline

### Week 1 (Days 1-5)
- **Day 1-2:** Phase 1.1 - Error Boundaries
- **Day 2-3:** Phase 1.2 - Toast Notifications
- **Day 3-4:** Phase 1.3 - API Error Handling
- **Day 4-5:** Phase 2.1 - Settings Persistence

### Week 2 (Days 6-10)
- **Day 6-7:** Phase 2.2 - Input Sanitization
- **Day 7:** Phase 2.3 - Dashboard Route
- **Day 8-9:** Phase 3.1 - React Optimizations
- **Day 9:** Phase 3.2 - Dependency Arrays
- **Day 10:** Phase 3.3 - Logging Utility

### Week 3 (Days 11-15)
- **Day 11:** Phase 4.1 - Type Safety
- **Day 11:** Phase 4.2 - Vite Config
- **Day 12:** Phase 4.3 - Env Validation
- **Day 13:** Phase 5.1 - Test Setup
- **Day 14-15:** Phase 5.2 - Unit Tests
- **Day 15:** Phase 6.1-6.2 - Accessibility

---

## Dependencies & Prerequisites

### External Dependencies Needed:
1. **Toast Library:** Choose one:
   - `react-hot-toast` (lightweight)
   - `sonner` (modern, shadcn-style)
   - Custom implementation

2. **DOMPurify:**
   - `dompurify` + `@types/dompurify`

3. **Testing:**
   - Jest + React Testing Library

### Backend Coordination:
- Verify settings API endpoints exist
- Coordinate error response formats
- Ensure consistent error codes

---

## Risk Mitigation

### High Risk Items:
1. **Settings API:** If backend doesn't exist, need to implement or delay
2. **Breaking Changes:** Error boundaries might change error handling flow
3. **Performance:** Optimizations need testing to ensure no regressions

### Mitigation Strategies:
1. **Settings API:** Check with backend team first, have fallback plan
2. **Testing:** Comprehensive testing at each phase
3. **Incremental:** Deploy phases incrementally, not all at once

---

## Success Metrics

### Phase 1 (Error Handling):
- [ ] Zero unhandled error crashes
- [ ] All errors show user-friendly messages
- [ ] 100% of API errors have user feedback

### Phase 2 (Core Functionality):
- [ ] Settings persist across sessions
- [ ] Zero XSS vulnerabilities (security audit)
- [ ] All navigation routes accessible

### Phase 3 (Performance):
- [ ] MessageList render time <50ms for 100 messages
- [ ] Reduce unnecessary re-renders by 70%+
- [ ] Lighthouse performance score >90

### Phase 4 (Code Quality):
- [ ] Zero `any` types
- [ ] TypeScript strict mode enabled
- [ ] All ESLint errors resolved

### Phase 5 (Testing):
- [ ] Minimum 70% code coverage
- [ ] All critical paths tested
- [ ] Tests run in CI/CD

### Phase 6 (Accessibility):
- [ ] WCAG 2.1 AA compliance
- [ ] Lighthouse accessibility score >95
- [ ] Screen reader testing passes

---

## Next Steps

1. **Review & Approve Plan:** Get stakeholder approval
2. **Set Up Project Board:** Create tickets for each task
3. **Assign Resources:** Determine who works on what
4. **Start Phase 1:** Begin with error boundaries
5. **Daily Standups:** Track progress, adjust timeline

---

**Plan Created:** 2025-01-27  
**Last Updated:** 2025-01-27  
**Estimated Completion:** 2-3 weeks from start date
