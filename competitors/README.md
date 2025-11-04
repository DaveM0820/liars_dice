# 🎲 Competitors Directory

This directory contains 5 competitors, each with their own strategy and workspace.

## Directory Structure

```
competitors/
├── instructions.md              # General tournament instructions (all players)
├── Player1/
│   ├── strategy.js              # Bayesian Inference Strategy
│   ├── instructions.md          # Player-specific instructions
│   └── highscores.json          # High score tracking
├── Player2/
│   ├── strategy.js              # Monte Carlo Simulation Strategy
│   ├── instructions.md          # Player-specific instructions
│   └── highscores.json          # High score tracking
├── Player3/
│   ├── strategy.js              # Opponent Modeling Strategy
│   ├── instructions.md          # Player-specific instructions
│   └── highscores.json          # High score tracking
├── Player4/
│   ├── strategy.js              # Adaptive Risk Strategy
│   ├── instructions.md          # Player-specific instructions
│   └── highscores.json          # High score tracking
└── Player5/
    ├── strategy.js              # Equilibrium Strategy
    ├── instructions.md          # Player-specific instructions
    └── highscores.json          # High score tracking
```

## Quick Start

1. Each player should work in their own directory
2. Read `instructions.md` for tournament rules
3. Read your `Player*/instructions.md` for strategy-specific guidance
4. Modify `strategy.js` to improve your performance
5. Test by copying to `../bots/Player*.js`
6. Track improvements in `highscores.json`

## Competition Phases

### Phase 1: Independent Development
- Work only on your assigned strategy
- Do NOT look at other players' code
- Focus on optimizing your approach
- Competition is SECRET - you don't know what others are doing

### Phase 2: Open Competition
- **You can NOW see other players' code**
- Study other strategies and learn from them
- Adopt successful elements and improve them
- Create hybrid approaches
- **BUT: You're still COMPETING!**
- You're learning from each other to BEAT each other
- Only ONE winner survives

## Testing

To test your strategy:
```bash
# From your Player directory
cp strategy.js ../../bots/Player{YourNumber}.js
```

Then run tournament at `http://localhost:8001/`

## High Score Tracking

When you achieve a new high score:
1. Create backup: `cp strategy.js strategy_v{version}_score{score}.js`
2. Update `highscores.json` with new entry
3. Continue improving!

---

**Good luck, competitors. May the best strategy win!**

