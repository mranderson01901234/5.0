# Phase 6 UI Testing Guide

## Prerequisites

1. **Start all services**:
   ```bash
   # Terminal 1: LLM Gateway (with Redis)
   cd apps/llm-gateway
   REDIS_URL=redis://localhost:6379 pnpm dev

   # Terminal 2: Web App
   cd apps/web
   pnpm dev

   # Terminal 3: Redis (if not running)
   redis-server
   ```

2. **Ensure Redis is running**:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

---

## Test 1: Telemetry Dashboard

### Steps:
1. Navigate to `http://localhost:5173/dashboard/telemetry` (or your dev port)
2. **Verify dashboard loads**:
   - ✅ Title "Telemetry Dashboard" appears
   - ✅ Metrics panel shows 5 cards (Artifacts Created, Saved, Exports Started, Completed, Failed)
   - ✅ Export Chart section visible
   - ✅ Event Stream section visible

3. **Check connection status**:
   - ✅ Connection indicator shows "Connected" (green dot)
   - ✅ If disconnected, shows "Disconnected" (red dot) and auto-reconnects

### Expected Result:
Dashboard loads with all components visible. Connection status shows "Connected".

---

## Test 2: Export Status Polling

### Steps:
1. **Create a test artifact** (if you don't have one):
   - Use the chat to create a table artifact
   - Example: "Create a table comparing iPhone models with columns: Model, Price, Storage"

2. **Export the artifact**:
   - Open the artifact pane (should show on the right)
   - Click one of the export buttons (PDF, DOCX, or XLSX)

3. **Observe status changes**:
   - ✅ Button immediately shows "Queued..." with spinner
   - ✅ After 1-2 seconds, changes to "Processing..." 
   - ✅ When complete, button returns to normal (PDF/DOCX/XLSX)
   - ✅ Download window opens automatically

4. **Check console** (F12 → Console):
   - ✅ Should see polling requests every second
   - ✅ No errors

### Expected Result:
Export button shows progress states: Queued → Processing → Completed. Download opens automatically.

---

## Test 3: Real-time Telemetry Events

### Steps:
1. **Open Telemetry Dashboard** (`/dashboard/telemetry`)

2. **Create an artifact**:
   - Go back to chat
   - Create a new table artifact
   - **Watch the dashboard** (keep it open in another tab)

3. **Verify events appear**:
   - ✅ Event Stream shows `artifact_created` event
   - ✅ Event Stream shows `artifact_saved` event
   - ✅ Metrics panel counters increment

4. **Export the artifact**:
   - Click export button
   - **Watch the dashboard**:
     - ✅ `export_started` event appears
     - ✅ `export_job_completed` event appears (when done)
     - ✅ Export counters increment
     - ✅ Export chart updates

### Expected Result:
Events appear in real-time in the Event Stream. Metrics update automatically. Chart shows new data points.

---

## Test 4: Export Chart Visualization

### Steps:
1. **Open Telemetry Dashboard**
2. **Perform multiple exports**:
   - Export 2-3 artifacts in different formats
   - Wait for all to complete

3. **Check Export Chart**:
   - ✅ Chart shows data points
   - ✅ Lines for "Started", "Completed", "Failed" visible
   - ✅ X-axis shows hours
   - ✅ Y-axis shows counts

### Expected Result:
Chart displays export events grouped by hour. All three lines (started, completed, failed) are visible.

---

## Test 5: Error Handling

### Steps:
1. **Stop Redis** (to simulate queue unavailability):
   ```bash
   redis-cli shutdown
   ```

2. **Try to export**:
   - Click export button
   - ✅ Should show error message or fail gracefully

3. **Check dashboard**:
   - ✅ Connection status may show "Disconnected"
   - ✅ No crashes or blank screens

4. **Restart Redis**:
   ```bash
   redis-server
   ```

5. **Verify recovery**:
   - ✅ Dashboard reconnects automatically
   - ✅ Export works again

### Expected Result:
System handles Redis unavailability gracefully. No crashes. Auto-recovery when Redis comes back.

---

## Test 6: Multiple Concurrent Exports

### Steps:
1. **Create a table artifact**
2. **Export in all 3 formats simultaneously**:
   - Click PDF button
   - Immediately click DOCX button
   - Immediately click XLSX button

3. **Observe**:
   - ✅ All three buttons show "Queued..." then "Processing..."
   - ✅ Each tracks its own status independently
   - ✅ Downloads open as each completes

### Expected Result:
Multiple exports can be queued and processed concurrently. Each button shows its own status.

---

## Test 7: Event Stream Filtering

### Steps:
1. **Open Telemetry Dashboard**
2. **Perform various actions**:
   - Create artifacts
   - Export artifacts
   - (If you have other telemetry events, trigger them)

3. **Check Event Stream**:
   - ✅ Shows last 100 events
   - ✅ Events color-coded:
     - Blue: Created/Started events
     - Green: Completed/Saved events
     - Red: Failed/Error events
   - ✅ Timestamps displayed correctly
   - ✅ Scrollable list

### Expected Result:
Event Stream displays events with proper formatting, colors, and timestamps. List scrolls smoothly.

---

## Test 8: Metrics Accuracy

### Steps:
1. **Note initial metrics**:
   - Artifacts Created: X
   - Exports Started: Y

2. **Perform actions**:
   - Create 1 artifact
   - Export 2 artifacts

3. **Check metrics**:
   - ✅ Artifacts Created increments by 1
   - ✅ Exports Started increments by 2
   - ✅ Metrics update in real-time (no page refresh needed)

### Expected Result:
Metrics accurately reflect actions performed. Updates happen in real-time.

---

## Troubleshooting

### Dashboard won't connect:
- Check browser console for errors
- Verify authentication (Clerk session)
- Check network tab for SSE connection
- Verify `/api/telemetry/stream` endpoint is accessible

### Exports stuck in "Queued":
- Check Redis is running: `redis-cli ping`
- Check gateway logs for worker errors
- Verify export worker started: Look for "Export worker initialized" in logs

### No events in dashboard:
- Verify telemetry events are being logged
- Check gateway logs for telemetry events
- Try creating a new artifact to trigger events

### Chart not updating:
- Check browser console for errors
- Verify Recharts library loaded correctly
- Check if events are being received (look at Event Stream)

---

## Quick Test Checklist

- [ ] Dashboard loads at `/dashboard/telemetry`
- [ ] Metrics panel shows 5 counters
- [ ] Export chart renders
- [ ] Event stream shows connection status
- [ ] Export button shows "Queued..." then "Processing..."
- [ ] Download opens automatically when export completes
- [ ] Events appear in Event Stream in real-time
- [ ] Metrics update without page refresh
- [ ] Chart updates with new export events
- [ ] Multiple concurrent exports work
- [ ] System handles Redis unavailability gracefully

---

## Success Criteria

✅ **All tests pass**:
- Dashboard loads and displays correctly
- Exports work asynchronously with status tracking
- Telemetry events stream in real-time
- Metrics and charts update automatically
- No crashes or errors in console

If all tests pass, Phase 6 UI is working correctly! 🎉

