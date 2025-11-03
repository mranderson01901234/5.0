# Quick Start: Pipeline Optimization Testing

**Phases Completed:** 1, 2, 4  
**Status:** Ready for testing

---

## 🚀 Start Testing (5 minutes)

### 1. Start Services
```bash
cd /home/dp/Desktop/2.0
./start-hybrid-rag.sh
```

Wait for all services to be healthy.

### 2. Access Dashboard
Open in browser:
```
http://localhost:5173/dashboard
```

Or click the "Dashboard" button in the sidebar (bottom section).

### 3. Verify API Endpoint
```bash
curl http://localhost:8787/v1/performance/report | jq
```

Should return:
```json
{
  "overview": {
    "totalRequests": 0,
    "averageLatency": 0,
    "cacheHitRate": 0,
    "errorRate": 0,
    "p95Latency": 0
  },
  "modelPerformance": {},
  "recommendations": []
}
```

---

## ✅ What's Working

1. **Dashboard UI** - Real-time metrics, model performance, recommendations
2. **Performance API** - `/v1/performance/report` and `/v1/performance/health`
3. **Pipeline Components** - Orchestrator, Cache, Analyzer (ready to use)
4. **Sidebar Integration** - Dashboard button added

---

## 📊 What to Test

### Dashboard Features
- ✅ Refresh button (updates metrics every 10s)
- ✅ Metric cards (latency, cache, requests, errors)
- ✅ Model performance table
- ✅ Recommendations panel
- ✅ Health status indicator

### Cache Performance
The IntelligentCache is **ready but not yet active**. To enable:

1. Make some chat requests
2. Make duplicate requests
3. Check cache hit rate should increase

### Recommendations Engine
As metrics accumulate:
- High latency → recommendation to optimize
- Low cache hits → recommendation to improve caching
- Model performance issues → recommendation to adjust routing

---

## 🔧 Integration Options

### Quick Win: Just Testing
✅ **Already working!** Dashboard shows real-time metrics.

### Medium Effort: Enable Cache
Add cache integration to chat flow (see `INTEGRATION_GUIDE.md`).

### Advanced: Enable PipelineOrchestrator
Full orchestration with feature flags (see `INTEGRATION_GUIDE.md`).

---

## 📈 Expected Results

### Initial State
- All metrics at 0 (no traffic yet)
- Empty model performance table
- No recommendations

### After Some Traffic
- Total requests increasing
- Average latency displayed
- Cache hit rate (if cache enabled)
- Model performance data
- Recommendations if thresholds exceeded

---

## 🐛 Troubleshooting

### Dashboard Not Loading
Check:
```bash
# 1. Is gateway running?
curl http://localhost:8787/health

# 2. Is web app running?
curl http://localhost:5173

# 3. Check gateway logs
tail -f logs/gateway.log
```

### Empty Metrics
**Expected!** Metrics accumulate as traffic increases. Make some chat requests first.

### API Errors
Verify auth token:
```bash
# Get token from browser dev tools > Application > Cookies > __session
curl http://localhost:8787/v1/performance/report \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Success Criteria

✅ Dashboard loads without errors  
✅ API returns valid JSON  
✅ Metrics update after traffic  
✅ Recommendations appear when thresholds exceeded  

**Status: Ready to test!** 🚀
