# Cleanup Note

The `bots/` directory has been replaced by `competitors/`. 

## ✅ Current Status

- ✅ Starter bots copied to `competitors/`: Baseline.js, ProbabilityTuned.js, MomentumAdaptive.js, AggroBluffer.js, template.js
- ✅ Player strategies in `competitors/Player*/strategy.js`
- ✅ Server.js configured to serve from `competitors/` when tournament requests `bots/`
- ✅ Server stopped and ready to restart
- ⚠️ `bots/` directory may still exist with locked Player1 folder (can be safely ignored - system works without it!)

## System Works Without bots/

The tournament system works perfectly fine even if `bots/` exists or is removed. The `server.js` automatically routes all requests:
- `bots/Player1.js` → `competitors/Player1/strategy.js`
- `bots/Baseline.js` → `competitors/Baseline.js`
- etc.

## To Complete Cleanup (Optional)

If `bots/` directory still exists and you want to remove it:
1. Close any file explorer windows showing that directory
2. Close any IDEs/editors that might have it open
3. Restart your computer if needed (to release file locks)
4. Then: `Remove-Item -Path bots -Recurse -Force`

**Note:** This is optional - the system works fine with or without `bots/` directory!

## How It Works

When `tournament.js` requests `bots/Player1.js`:
- `server.js` intercepts the request
- Looks for `competitors/Player1/strategy.js`
- Serves that file instead

When `tournament.js` requests `bots/Baseline.js`:
- `server.js` intercepts the request  
- Looks for `competitors/Baseline.js`
- Serves that file instead

All files are now in `competitors/` directory!

