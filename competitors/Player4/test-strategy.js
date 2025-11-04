// Test script for Player 4 - Adaptive Risk Strategy
// Run this to test your strategy against baseline competitors
// Usage: node test-strategy.js

const fs = require('fs');
const path = require('path');

const PLAYER_NUM = 4;
const STRATEGY_NAME = 'Dice-Count Adaptive Risk Strategy';
const PLAYER_DIR = __dirname;
const STRATEGY_FILE = path.join(PLAYER_DIR, 'strategy.js');
const HIGHSCORES_FILE = path.join(PLAYER_DIR, 'highscores.json');

console.log(`\n🧪 Testing ${STRATEGY_NAME} (Player ${PLAYER_NUM})\n`);
console.log('='.repeat(60));

// Check if strategy file exists
if (!fs.existsSync(STRATEGY_FILE)) {
  console.error('❌ strategy.js not found!');
  console.error(`   Expected: ${STRATEGY_FILE}`);
  process.exit(1);
}

// Copy strategy to tournament directory (for testing)
const tournamentDir = path.join(__dirname, '..', '..', 'bots');
const tournamentFile = path.join(tournamentDir, `Player${PLAYER_NUM}.js`);

// Ensure bots directory exists
if (!fs.existsSync(tournamentDir)) {
  fs.mkdirSync(tournamentDir, { recursive: true });
}

console.log(`📋 Copying strategy to tournament...`);
fs.copyFileSync(STRATEGY_FILE, tournamentFile);
console.log(`   ✅ Copied to ${tournamentFile}`);

// Read current high scores
let highScores = { highScores: [], currentBest: { version: 1, score: 0.0, filename: 'strategy.js' } };
if (fs.existsSync(HIGHSCORES_FILE)) {
  try {
    highScores = JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf8'));
  } catch (err) {
    console.warn('⚠️  Could not read highscores.json, starting fresh');
  }
}

console.log(`\n📊 Current Best Score: ${highScores.currentBest?.score || 0.0}`);
console.log(`   Version: ${highScores.currentBest?.version || 1}`);
console.log(`   File: ${highScores.currentBest?.filename || 'strategy.js'}`);

console.log(`\n🎯 Ready to test!`);
console.log(`\n📝 Instructions:`);
console.log(`   1. Open http://localhost:8001/ in your browser`);
console.log(`   2. Select Player${PLAYER_NUM} + 4 opponents`);
console.log(`   3. Set: Seed=10185, Rounds=2500, Max Players=5, FAST=✓`);
console.log(`   4. Click "Start" and wait for results`);
console.log(`   5. Record your Average TS from the results table`);
console.log(`   6. If it's a new high score, run:`);
console.log(`      node update-highscore.js <score>`);
console.log(`\n💡 Tip: Test against different opponent combinations to find your best matchup!`);

console.log('\n' + '='.repeat(60));
console.log('✅ Test setup complete!\n');

