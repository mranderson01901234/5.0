# Web UI Startup Fix

## Issues Found

### 1. Port Mismatch ✅ FIXED
- **Problem**: Start scripts were looking for port 5176, but Vite uses 5173 by default
- **Fix**: Updated `start.sh` and `start.js` to use correct port 5173 and run from `apps/web` directory

### 2. EMFILE: Too Many Open Files Error ⚠️ NEEDS SYSTEM FIX
- **Problem**: System hit the file descriptor limit when Vite tries to watch files
- **Current Limit**: Check with `ulimit -n`
- **Symptoms**: `Error: EMFILE: too many open files, watch '/home/dp/Desktop/2.0/apps/web/vite.config.ts'`

## Fixes Applied

### Script Updates
1. ✅ `start.sh` - Fixed port from 5176 to 5173, changed to run `pnpm dev` from `apps/web` directory
2. ✅ `start.js` - Fixed port from 5176 to 5173, changed cwd to `apps/web`, args to `['dev']`
3. ✅ `vite.config.ts` - Added watch ignore patterns to reduce file watchers

### To Fix EMFILE Error (System Level)

Run these commands to increase file descriptor limit:

```bash
# Check current limit
ulimit -n

# Temporarily increase (for current session)
ulimit -n 65536

# Or permanently (add to ~/.bashrc or ~/.zshrc)
echo "ulimit -n 65536" >> ~/.bashrc
source ~/.bashrc

# Or system-wide (requires root)
# Edit /etc/security/limits.conf and add:
# * soft nofile 65536
# * hard nofile 65536
```

Then restart the web service:

```bash
# Stop existing
pkill -f "vite"

# Start again
cd apps/web && pnpm dev
```

## Testing

After fixes, run:
```bash
./start.sh
```

Then check:
- Web UI should load at http://localhost:5173
- No EMFILE errors in `logs/web.log`
- All services running correctly

