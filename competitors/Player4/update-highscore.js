// Update high score script for Player 4
// Usage: node update-highscore.js <score>
// Example: node update-highscore.js 45.23

const fs = require('fs');
const path = require('path');

const PLAYER_NUM = 4;
const STRATEGY_NAME = 'Dice-Count Adaptive Risk Strategy';
const PLAYER_DIR = __dirname;
const STRATEGY_FILE = path.join(PLAYER_DIR, 'strategy.js');
const HIGHSCORES_FILE = path.join(PLAYER_DIR, 'highscores.json');

// Get score from command line
const newScore = parseFloat(process.argv[2]);

if (isNaN(newScore) || newScore < 0) {
  console.error('❌ Invalid score!');
  console.error('Usage: node update-highscore.js <score>');
  console.error('Example: node update-highscore.js 45.23');
  process.exit(1);
}

// Read current high scores
let highScores = { highScores: [], currentBest: { version: 1, score: 0.0, filename: 'strategy.js' }, strategy: STRATEGY_NAME, player: `Player${PLAYER_NUM}` };
if (fs.existsSync(HIGHSCORES_FILE)) {
  try {
    highScores = JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf8'));
  } catch (err) {
    console.warn('⚠️  Could not read highscores.json, starting fresh');
  }
}

const currentBest = highScores.currentBest?.score || 0.0;

if (newScore <= currentBest) {
  console.log(`\n⚠️  Score ${newScore} is not higher than current best: ${currentBest}`);
  console.log(`   No update needed.\n`);
  process.exit(0);
}

// New high score!
const newVersion = (highScores.currentBest?.version || 1) + 1;
const timestamp = new Date().toISOString();
// Format score: match example format (strategy_v2_score45.23.js)
// Keep up to 2 decimal places, remove trailing zeros
const scoreStr = newScore % 1 === 0 
  ? newScore.toString() 
  : parseFloat(newScore.toFixed(2)).toString();
const backupFilename = `strategy_v${newVersion}_score${scoreStr}.js`;

console.log(`\n🎉 NEW HIGH SCORE!`);
console.log(`   Previous: ${currentBest}`);
console.log(`   New: ${newScore}`);
console.log(`   Version: ${newVersion}\n`);

// Create backup copy
const backupPath = path.join(PLAYER_DIR, backupFilename);
fs.copyFileSync(STRATEGY_FILE, backupPath);
console.log(`✅ Created backup: ${backupFilename}`);

// Update high scores
const newEntry = {
  version: newVersion,
  score: newScore,
  timestamp: timestamp,
  changes: `Improved from version ${newVersion - 1}`,
  filename: backupFilename
};

if (!highScores.highScores) highScores.highScores = [];
highScores.highScores.push(newEntry);
highScores.currentBest = {
  version: newVersion,
  score: newScore,
  filename: backupFilename
};

// Ensure metadata
highScores.strategy = STRATEGY_NAME;
highScores.player = `Player${PLAYER_NUM}`;

// Write updated high scores
fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(highScores, null, 2));
console.log(`✅ Updated ${HIGHSCORES_FILE}`);

console.log(`\n📊 Updated High Scores:`);
console.log(`   Current Best: ${newScore} (Version ${newVersion})`);
console.log(`   Backup File: ${backupFilename}`);
console.log(`\n🚀 Keep improving! Try to beat ${newScore}!\n`);

