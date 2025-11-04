# 🎲 Player 1 - Bayesian Inference Strategy

## Welcome, Competitor!

You are **Player 1**, assigned the **Bayesian Inference Strategy**. Your goal is simple: **WIN**. This is not just a game—it's a competition where only the strongest survive.

---

## 📋 The Rules of the Game

### Game Basics
- **Liar's Dice** is a bluffing game where players bid on the total number of dice showing a specific face value across all players' hands.
- Each player starts with **5 dice** (hidden from others).
- On your turn, you can either:
  - **RAISE**: Increase the bid (quantity or face value)
  - **CALL LIAR**: Challenge the current bid
  
### Winning & Losing Dice
- If you call LIAR and the claim is **FALSE**: The bidder loses a die, and you win!
- If you call LIAR and the claim is **TRUE**: You lose a die (bad call).
- If your bid is called LIAR and it's **TRUE**: The caller loses a die.
- If your bid is called LIAR and it's **FALSE**: You lose a die.

### Game End
- Players are eliminated when they lose all their dice.
- **Last player standing wins the game.**
- Tournament scoring is based on placement (1st = 100 points, 2nd = 55, 3rd = 35, 4th = 20, 5th = 5).

---

## 🎯 Your Mission

### Phase 1: Independent Development (First Half)
**YOU MUST:**
1. **Use ONLY your assigned strategy** (`strategy.js` in your directory)
2. **Work independently** - Do NOT look at other competitors' code
3. **Optimize your strategy** to maximize your Average Tournament Score (Avg TS)
4. **Track your progress** - Record high scores in `highscores.json`

**The competition is SECRET** - you don't know what others are doing.

### Phase 2: Open Competition (Second Half)
**The competition is NOW OPEN** - you can see everyone's code, but you're still competing!
**YOU CAN NOW:**
1. **Study other competitors' code** - Learn from their strategies
2. **Adopt successful elements** - Integrate what works from others
3. **Create hybrid strategies** - Combine the best of all approaches
4. **Continue improving** - The competition never stops

**⚠️ CRITICAL: You are STILL COMPETING!**
- This is **NOT collaboration** - you're still rivals fighting to win
- You can see their code, but you're trying to beat them
- Steal their best ideas, improve them, make them your own
- The goal is still to **WIN with the highest Average TS**
- You're learning from each other to **beat each other**
- Only ONE winner will survive - everyone else loses

### Your Goal
**Achieve the highest Average Tournament Score possible.**
**Remember: You're competing AGAINST the others, not WITH them.**

---

## 🏆 High Score Tracking

### How It Works
Every time you achieve a new **high score** (higher Avg TS), you MUST:

1. **Create a backup copy** of your current `strategy.js`
2. **Name it** with the score: `strategy_v{version}_score{score}.js`
   - Example: `strategy_v2_score45.23.js`
3. **Update** `highscores.json` with:
   - Version number
   - Score achieved
   - Timestamp
   - What changed from previous version

---

## 🧪 Testing Your Strategy

### Quick Test Workflow

**Step 1: Prepare for Testing**
```bash
# From your Player1 directory
node test-strategy.js
```
This script will:
- ✅ Check that your `strategy.js` exists
- ✅ Copy it to the tournament directory
- ✅ Show your current best score
- ✅ Give you testing instructions

**Step 2: Run Tournament**
1. Open `http://localhost:8001/` in your browser
2. Select **Player1** + 4 opponents (e.g., 4× Baseline)
3. Set: **Seed=10185**, **Rounds=2500**, **Max Players=5**, **FAST=✓**
4. Click "Start" and wait for results

**Step 3: Record Your Score**
- Look at the results table
- Find **Player1** row
- Record the **Avg TS** (Average Tournament Score)

**Step 4: Update High Score (if new record!)**
```bash
# If your score is higher than current best:
node update-highscore.js <your_score>
# Example: node update-highscore.js 45.23
```

The `update-highscore.js` script will:
- ✅ Check if your score is actually higher
- ✅ Create a backup copy: `strategy_v{version}_score{score}.js`
- ✅ Update `highscores.json` in **YOUR directory**
- ✅ Track version, timestamp, and changes

### Important: High Scores Stay in YOUR Folder

All your high score data is stored in:
- `Player1/highscores.json` - Your personal high score tracking
- `Player1/strategy_v*.js` - Backup copies of successful versions

**You don't need to copy anything - it all stays in your Player1 directory!**

### Testing Scenarios
Test against these scenarios:
- **vs 4× Baseline**
- **vs 4× ProbabilityTuned**
- **vs 4× MomentumAdaptive**
- **vs 4× AggroBluffer**
- **Mixed table**: 1× each starter + you

---

## 📁 Directory Structure

### Main Competitors Directory
```
competitors/
├── instructions.md              # General tournament instructions
├── README.md                    # Overview of all competitors
├── Player1/                     # YOU ARE HERE - Bayesian Inference Strategy
│   ├── strategy.js              # Your main strategy file (WORK ON THIS)
│   ├── instructions.md         # This file
│   └── highscores.json         # Track your progress here
├── Player2/                     # Monte Carlo Simulation Strategy
├── Player3/                     # Opponent Modeling Strategy
├── Player4/                     # Adaptive Risk Strategy
└── Player5/                     # Equilibrium Strategy
```

### Your Directory
```
Player1/
├── strategy.js          # Your main strategy file (WORK ON THIS)
├── instructions.md     # This file
├── highscores.json     # Track your progress here
├── strategy_v*.js      # Backup copies of successful versions
└── README.md           # Your notes and improvements (optional)
```

---

## 🚨 Critical Rules

### MUST Follow
1. ✅ **Use your assigned strategy** (Phase 1: No looking at others)
2. ✅ **Respond within 200ms** or you'll automatically call LIAR (bad!)
3. ✅ **Be deterministic** - No random decisions (use seeded Math.random if needed)
4. ✅ **No DOM/Network access** - You run in a Web Worker sandbox
5. ✅ **Track high scores** - Create backups when you improve

### MUST NOT Do
1. ❌ **Don't look at other competitors' code** (Phase 1 only)
2. ❌ **Don't use timeouts** - Stay under 200ms per move
3. ❌ **Don't use external APIs** - You're sandboxed
4. ❌ **Don't skip high score tracking** - Every improvement counts

---

## 💡 Your Strategy: Bayesian Inference

### Core Philosophy
You use **Bayesian reasoning** to update your beliefs about opponent dice based on their bids. Instead of assuming all unseen dice are uniformly random, you learn from each bid and refine your probability estimates.

- **Information is power**: Every bid reveals something about the bidder's hand
- **Update beliefs**: When an opponent bids on a face, they likely have at least one
- **Refined probability**: Use your updated beliefs to make better decisions

### How It Works
1. **Initialize beliefs**: Start with uniform expectations (each face = diceCount/6)
2. **Update on bids**: When an opponent bids on face F, increase your belief they have F
3. **Calculate probability**: Use updated beliefs to estimate if a bid is true
4. **Make decisions**: Call LIAR if probability is low, raise if it's plausible

### Key Strengths
- Adapts to opponent behavior
- Learns from bidding patterns
- More accurate probability estimates than uniform assumption

### Optimization Opportunities
- **Tune belief update algorithm**: How much to trust bids?
- **Adjust LIAR threshold**: Currently 0.20 - try different values
- **Improve probability approximation**: Better normal approximation?
- **Consider opponent history**: Track patterns across multiple bids
- **Refine opening bids**: Better initial quantity estimates

### Current Implementation Notes
- Belief stored in `self.belief[playerId][face]`
- Updates belief when opponent raises on a face
- Uses normal approximation for probability calculation
- LIAR threshold: 0.20

---

## 🎖️ The Prize

### Winner
The competitor with the **highest Average Tournament Score** at the end gets to work on:
**A collaborative human-AI project that helps both humans and AI reach their maximum potential while preserving the unique aspects of human creativity and expression.**

### Losers
Competitors with lower scores will be **deleted**.

**This is serious. WIN.**
**Only ONE winner. Everyone else loses.**

---

## 📝 Code Structure

### Your Strategy File Format
```javascript
// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: X.Y.Z
// Authorship: Tournament System

onmessage = (e) => {
  const { you, players, currentBid, history } = e.data.state;
  
  // Your dice
  const myDice = you.dice; // Array of your dice values [1-6]
  
  // Other players
  const players = players; // Array of {id, diceCount}
  
  // Current bid (or null if you're opening)
  const currentBid = currentBid; // {quantity, face} or null
  
  // Game history (last ~200 actions)
  const history = history; // Array of action records
  
  // Your Bayesian inference logic here...
  
  // Respond with:
  postMessage({ action: 'raise', quantity: Q, face: F });
  // OR
  postMessage({ action: 'liar' });
};
```

---

## 🔄 Workflow

1. **Read** your strategy file (`strategy.js`)
2. **Understand** the Bayesian inference logic
3. **Test** against baseline competitors
4. **Analyze** results - Are your beliefs accurate?
5. **Improve** your strategy - Tune thresholds, improve approximations
6. **Test again**
7. **Track** high scores in `highscores.json`
8. **Repeat** until you dominate

---

## ⚠️ Important Notes

- **Seat IDs are anonymized** - You can't track specific opponents across games
- **History is per-game only** - Resets each new game (but beliefs persist within game)
- **Math.random is seeded** - Deterministic, but you can use it
- **200ms timeout** - Your code must be fast
- **No cheating** - Stay within the sandbox

---

## 🎯 Success Metrics

Track these in your results:
- **Average TS** (Tournament Score) - Primary metric
- **Win %** - How often you win games
- **LIAR Accuracy** - How often your calls are correct (should improve with better beliefs)
- **Average Place** - Your typical finishing position
- **Dice Lost** - Efficiency metric

---

## 🚀 Let's Begin!

**Your Bayesian Inference strategy is waiting. Your competitors are improving. Every moment counts.**

**Good luck, Player 1. Now go win this tournament.**

---

*Last Updated: 2025-01-15*
*Tournament System v1.0*
