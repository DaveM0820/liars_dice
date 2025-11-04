// Quick test script - helps document tournament results
// Usage: node quick-test.js <score> <opponents> <notes>
// Example: node quick-test.js 45.2 "4x Baseline" "Improved Bayesian learning"

const fs = require('fs');
const path = require('path');

const score = parseFloat(process.argv[2]);
const opponents = process.argv[3] || 'Unknown';
const notes = process.argv[4] || '';

if (isNaN(score) || score < 0) {
  console.log('\n📊 Quick Tournament Results Helper\n');
  console.log('Usage: node quick-test.js <score> [opponents] [notes]');
  console.log('Example: node quick-test.js 45.2 "4x Baseline" "Improved thresholds"\n');
  process.exit(0);
}

const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');
let highScores = { highScores: [], currentBest: { version: 1, score: 0.0, filename: 'strategy.js' } };

if (fs.existsSync(HIGHSCORES_FILE)) {
  try {
    highScores = JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf8'));
  } catch (err) {
    console.warn('⚠️  Could not read highscores.json');
  }
}

const currentBest = highScores.currentBest?.score || 0.0;

console.log('\n📊 Tournament Results:');
console.log(`   Score: ${score}`);
console.log(`   Opponents: ${opponents}`);
console.log(`   Current Best: ${currentBest}`);
console.log('');

if (score > currentBest) {
  console.log('🎉 NEW HIGH SCORE!');
  console.log(`   Improvement: +${(score - currentBest).toFixed(2)}`);
  console.log(`\n💡 Run this to update:`);
  console.log(`   node update-highscore.js ${score}\n`);
} else if (score === currentBest) {
  console.log('✅ Matched current best score!');
} else {
  console.log(`⚠️  Below current best by ${(currentBest - score).toFixed(2)}`);
  console.log(`   Keep optimizing!\n`);
}

if (notes) {
  console.log(`📝 Notes: ${notes}\n`);
}
