# Assignment Compliance Check

## ✅ Files Status

### Original Tournament Files (UNCHANGED - as required)
- ✅ `index.php` - Restored from original starter zip
- ✅ `tournament.js` - Restored from original starter zip  
- ✅ `style.css` - Restored from original starter zip

### Starter Bots (in /bots/)
- ✅ `Baseline.js` - Probabilistic Baseline
- ✅ `ProbabilityTuned.js` - Probability Tuned
- ✅ `MomentumAdaptive.js` - Momentum Adaptive
- ✅ `AggroBluffer.js` - Aggro Bluffer
- ✅ `template.js` - Template for creating new bots

### Additional Files (for testing/development)
- ✅ `server.js` - Node.js server to run tournament (not part of assignment)
- ✅ `strats.txt` - Strategy documentation for 5 advanced strategies

## ✅ Assignment Requirements Met

### Bot API Compliance
- ✅ Bots run in Web Worker sandbox (no DOM, no network)
- ✅ 200ms timeout per move enforced
- ✅ Deterministic behavior (fixed seed)
- ✅ Proper message format: `{ action: "raise", quantity: Q, face: F }` or `{ action: "liar" }`
- ✅ History array available (last ~200 events)

### Tournament Settings
- ✅ Seed: 10185 (default in index.php, can be changed)
- ✅ Rounds: 2500 (configurable in UI)
- ✅ Max Players: 5 (configurable in UI, max 20)
- ✅ FAST simulate: Available (checkbox in UI)

### File Structure
- ✅ All starter bots in `/bots/` directory
- ✅ Template available for creating new bots
- ✅ Original tournament files preserved

## 🎯 Next Steps for Assignment

1. **Create your bot** based on `template.js` or one of the strategies in `strats.txt`
2. **Place bot in `/bots/`** directory
3. **Test scenarios**:
   - You vs 4× Baseline
   - You vs 4× ProbabilityTuned
   - You vs 4× MomentumAdaptive
   - You vs 4× AggroBluffer
   - Mixed table: 1× each starter + you
4. **Run with settings**:
   - Seed: 10185
   - Rounds: 2500
   - Max Players: 5
   - FAST: checked
5. **Record results** (Avg TS per scenario)

## 📝 Notes

- `server.js` is a helper to run the tournament without PHP (for testing)
- Original tournament files are preserved and unchanged
- All starter bots are present and functional
- The tournament system matches the assignment specification exactly

## ⚠️ Important Reminders

- **DO NOT** modify `index.php`, `tournament.js`, or `style.css`
- Bots must respond within 200ms
- Bots must be deterministic (no internal randomness)
- Include authorship statement in bot file header
- Submit bot file as `.js.txt` extension

