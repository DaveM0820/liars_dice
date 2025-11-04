# 🎲 Player 2 - Monte Carlo Simulation Planner

## Welcome, Competitor!

You are **Player 2**, assigned the **Monte Carlo Simulation Strategy**. Your goal is simple: **WIN**. This is not just a game—it's a competition where only the strongest survive.

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
# From your Player2 directory
node test-strategy.js
```
This script will:
- ✅ Check that your `strategy.js` exists
- ✅ Copy it to the tournament directory
- ✅ Show your current best score
- ✅ Give you testing instructions

**Step 2: Run Tournament**
1. Open `http://localhost:8001/` in your browser
2. Select **Player2** + 4 opponents (e.g., 4× Baseline)
3. Set: **Seed=10185**, **Rounds=2500**, **Max Players=5**, **FAST=✓**
4. Click "Start" and wait for results

**Step 3: Record Your Score**
- Look at the results table
- Find **Player2** row
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
- `Player2/highscores.json` - Your personal high score tracking
- `Player2/strategy_v*.js` - Backup copies of successful versions

**You don't need to copy anything - it all stays in your Player2 directory!**

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
├── Player1/                     # Bayesian Inference Strategy
├── Player2/                     # YOU ARE HERE - Monte Carlo Simulation Strategy
│   ├── strategy.js             # Your main strategy file (WORK ON THIS)
│   ├── instructions.md         # This file
│   └── highscores.json         # Track your progress here
├── Player3/                     # Opponent Modeling Strategy
├── Player4/                     # Adaptive Risk Strategy
└── Player5/                     # Equilibrium Strategy
```

### Your Directory
```
Player2/
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

## 💡 Your Strategy: Monte Carlo Simulation

### Core Philosophy
You use **Monte Carlo simulation** to evaluate moves by simulating thousands of possible dice distributions. You "roll out" scenarios to see which action (raise or call LIAR) has better outcomes.

- **Simulate many outcomes**: See what happens in different scenarios
- **Data-driven decisions**: Choose the action with best empirical success rate
- **Brute-force search**: Capture nuances that simple probability misses

### How It Works
1. **Simulate unknown dice**: Randomly assign faces to all unknown dice (N times)
2. **Evaluate calling LIAR**: For each simulation, check if current bid is true/false
3. **Evaluate raising**: For each simulation, check if your raise would be true/false
4. **Compare probabilities**: Choose the action with higher success rate

### Key Strengths
- Handles complex dynamics automatically
- No hand-tuned thresholds needed
- Naturally adapts to game state
- Captures interactions that analytical methods miss

### Optimization Opportunities
- **Adjust simulation count**: Currently N=1000 - balance speed vs accuracy
- **Improve outcome evaluation**: Better modeling of what happens after your raise?
- **Consider opponent reactions**: Model how opponents might respond
- **Optimize simulation speed**: Faster code = more simulations = better decisions
- **Adaptive sampling**: More simulations when decision is close?

### Current Implementation Notes
- Uses seeded `Math.random()` for deterministic simulations
- Simulates both calling LIAR and raising scenarios
- Compares success probabilities to make decision
- N = 1000 simulations per move

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
// BOT_NAME: Monte Carlo Simulation Planner
// Strategy: Monte Carlo Simulation - Simulates many possible dice distributions
// Version: X.Y.Z
// Authorship: Tournament System

onmessage = (e) => {
  const { you, players, currentBid } = e.data.state;
  
  // Simulate N times
  const N = 1000; // Adjust based on 200ms budget
  
  // Evaluate calling LIAR vs raising
  // Choose best action
  
  postMessage({ action: 'raise', quantity: Q, face: F });
  // OR
  postMessage({ action: 'liar' });
};
```

---

## 🔄 Workflow

1. **Read** your strategy file (`strategy.js`)
2. **Understand** the Monte Carlo simulation logic
3. **Test** against baseline competitors
4. **Analyze** results - Are simulations accurate enough?
5. **Improve** your strategy - More simulations? Better evaluation?
6. **Test again**
7. **Track** high scores in `highscores.json`
8. **Repeat** until you dominate

---

## ⚠️ Important Notes

- **Seat IDs are anonymized** - You can't track specific opponents across games
- **History is per-game only** - Resets each new game
- **Math.random is seeded** - Deterministic, but you can use it for simulations
- **200ms timeout** - Your code must be fast - optimize simulation count
- **No cheating** - Stay within the sandbox

---

## 🎯 Success Metrics

Track these in your results:
- **Average TS** (Tournament Score) - Primary metric
- **Win %** - How often you win games
- **LIAR Accuracy** - How often your calls are correct
- **Average Place** - Your typical finishing position
- **Dice Lost** - Efficiency metric

---

## 🚀 Let's Begin!

**Your Monte Carlo Simulation strategy is waiting. Your competitors are improving. Every moment counts.**

**Good luck, Player 2. Now go win this tournament.**

---

*Last Updated: 2025-01-15*
*Tournament System v1.0*
