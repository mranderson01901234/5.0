# Critical Bugs Found in Memory System

## Issue 1: Gateway DB Path Mismatch ❌

**Problem:** Memory service can't find gateway database for audit jobs

**Location:** `apps/memory-service/src/server.ts` line 29

**Current:**
```typescript
const GATEWAY_DB_PATH = process.env.GATEWAY_DB_PATH || './gateway.db';
```

**Actual Path:** `apps/llm-gateway/gateway.db`

**Impact:** Audit jobs can't fetch messages from gateway DB, so automatic memory saves may not work correctly

**Fix:** Update default path to correct location

---

## Issue 2: Indentation Bug in Recall Query ❌

**Problem:** Indentation issue may cause the query promise to fail silently

**Location:** `apps/memory-service/src/routes.ts` line 406-408

**Current:** Improper indentation
```typescript
const queryPromise = new Promise<any[]>((resolve) => {
  try {
    // Extract keywords...
  const queryKeywords: string[] = []; // WRONG INDENT
```

**Fix:** Fixed indentation

---

## Issue 3: User ID Mismatch ⚠️

**Problem:** Test uses fake user ID, but real Clerk user ID is different

**Real Clerk User ID:** `user_34raS72kWHEYo1UonuS9x0rscg5` (for dparker918@yahoo.com)

**Test User ID:** `test-user-dparker918`

**Impact:** Memories saved with test ID won't be recalled for real user

**Solution:** Use real Clerk user ID from JWT token in production

---

## Issue 4: Recall Query Filtering Too Aggressive ⚠️

**Problem:** Post-processing deduplication may be filtering out valid memories

**Location:** `apps/memory-service/src/routes.ts` lines 502-567

**Issue:** The deduplication logic only keeps memories that match specific patterns like "my [attribute] is [value]". If a memory doesn't match these patterns exactly, it gets filtered out.

**Example:**
- Memory: "my favorite color is blue" ✅ (matches pattern)
- Memory: "I prefer blue for my favorite color" ❌ (doesn't match pattern, gets filtered)

**Fix Needed:** Make pattern matching more flexible OR don't filter if no topic detected

---

## Issue 5: Deadline Too Short ❌ (FIXED)

**Problem:** Default deadline was 30ms, too short for database queries

**Status:** ✅ Fixed - increased to 200ms default, 500ms max

---

## Testing Results

### Services ✅
- Gateway: Running on port 8787
- Memory Service: Running on port 3001  
- Web App: Running on port 5173

### Environment ✅
- CLERK_SECRET_KEY: Set
- ANTHROPIC_API_KEY: Set
- All required vars present

### Databases ✅
- Gateway DB: Exists (624 KB)
- Memory DB: Exists (148 KB)
- **BUT:** Memory service can't find gateway DB due to path mismatch

### Memory Save ✅
- Test save worked: `test-user-dparker918` memory saved

### Memory Recall ❌
- Returns 0 memories even when memories exist
- Likely due to:
  1. User ID mismatch (test vs real)
  2. Aggressive filtering in post-processing
  3. Pattern matching too strict

---

## Recommended Fixes (Priority Order)

### 1. Fix Gateway DB Path (CRITICAL)
```typescript
// apps/memory-service/src/server.ts line 29
const GATEWAY_DB_PATH = process.env.GATEWAY_DB_PATH || './apps/llm-gateway/gateway.db';
```

### 2. Fix Recall Filtering (HIGH)
Make pattern matching optional - don't filter if no pattern match, just return all matching memories

### 3. Add Better Error Logging (MEDIUM)
Log SQL queries and results for debugging

### 4. Verify User ID Flow (HIGH)
Ensure real Clerk user ID is used consistently in production

---

## Next Steps

1. Fix gateway DB path
2. Test with real Clerk user ID
3. Make recall filtering less aggressive
4. Add comprehensive logging
5. Test end-to-end with real user (dparker918@yahoo.com)

