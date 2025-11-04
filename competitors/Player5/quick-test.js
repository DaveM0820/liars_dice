// Quick test to validate Player5 strategy works
const fs = require('fs');
const path = require('path');

console.log('🧪 Quick Test: Player5 Strategy\n');
console.log('='.repeat(60));

// Check strategy file exists
const strategyPath = path.join(__dirname, 'strategy.js');
if (!fs.existsSync(strategyPath)) {
  console.error('❌ strategy.js not found!');
  process.exit(1);
}

// Check syntax
try {
  const code = fs.readFileSync(strategyPath, 'utf8');
  require('vm').createScript(code);
  console.log('✅ Syntax check passed');
} catch (err) {
  console.error('❌ Syntax error:', err.message);
  process.exit(1);
}

// Check key features
const code = fs.readFileSync(strategyPath, 'utf8');
const checks = [
  { name: 'Has onmessage handler', test: /onmessage\s*=/ },
  { name: 'Has postMessage', test: /postMessage/ },
  { name: 'Has probability calculations', test: /binom|probability/i },
  { name: 'Has adaptive thresholds', test: /threshold|THRESHOLD/i },
  { name: 'Has opponent modeling', test: /opponent|behavior|history/i },
  { name: 'Version 2.0.0', test: /Version:\s*2\.0\.0/ }
];

console.log('\n📋 Feature Checks:');
let allPassed = true;
for (const check of checks) {
  const passed = check.test.test(code);
  console.log(`  ${passed ? '✅' : '❌'} ${check.name}`);
  if (!passed) allPassed = false;
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ All checks passed! Strategy is ready.');
  console.log('\n🎯 Next steps:');
  console.log('   1. Run: node test-strategy.js');
  console.log('   2. Open http://localhost:8001/ in browser');
  console.log('   3. Select Player5 + 4 opponents');
  console.log('   4. Run tournament with Seed=10185, Rounds=2500');
} else {
  console.log('❌ Some checks failed. Review the strategy.');
  process.exit(1);
}
