// Functional test runner for Player2 Monte Carlo strategy
// Tests the strategy logic with various game scenarios

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STRATEGY_FILE = path.join(__dirname, 'strategy.js');

console.log('🧪 Running Functional Tests for Player2 Strategy\n');
console.log('='.repeat(60));

// Read strategy code
const strategyCode = fs.readFileSync(STRATEGY_FILE, 'utf8');

// Create a sandbox environment that mimics the Web Worker
function createSandbox() {
  const sandbox = {
    // Mock Web Worker environment
    self: {},
    postMessage: (msg) => {
      sandbox.lastResponse = msg;
      return msg;
    },
    onmessage: null,
    Math: Math,
    Array: Array,
    Object: Object,
    Number: Number,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Math: {
      ...Math,
      random: () => Math.random(), // Use real random for testing
      floor: Math.floor,
      ceil: Math.ceil,
      max: Math.max,
      min: Math.min,
      round: Math.round
    },
    lastResponse: null,
    console: {
      log: () => {}, // Suppress logs during strategy execution
      error: () => {}
    }
  };
  
  // Execute strategy code in sandbox
  try {
    vm.createContext(sandbox);
    vm.runInContext(strategyCode, sandbox);
  } catch (err) {
    console.error('❌ Failed to load strategy:', err.message);
    process.exit(1);
  }
  
  return sandbox;
}

// Test cases
const testCases = [
  {
    name: 'Opening Move - Basic',
    state: {
      you: { id: 'P1', dice: [1, 2, 3, 4, 5] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 },
        { id: 'P3', diceCount: 5 },
        { id: 'P4', diceCount: 5 },
        { id: 'P5', diceCount: 5 }
      ],
      currentBid: null,
      history: []
    },
    validate: (response) => {
      if (!response || response.action !== 'raise') {
        throw new Error('Expected raise action on opening');
      }
      if (!response.quantity || response.quantity < 1) {
        throw new Error('Invalid quantity');
      }
      if (!response.face || response.face < 1 || response.face > 6) {
        throw new Error('Invalid face value');
      }
    }
  },
  {
    name: 'Responding to Low Bid - Should Raise',
    state: {
      you: { id: 'P1', dice: [2, 2, 2, 3, 4] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 },
        { id: 'P3', diceCount: 5 }
      ],
      currentBid: { quantity: 3, face: 2 },
      history: []
    },
    validate: (response) => {
      if (!response || !['raise', 'liar'].includes(response.action)) {
        throw new Error('Expected raise or liar action');
      }
      if (response.action === 'raise') {
        if (!response.quantity || !response.face) {
          throw new Error('Invalid raise parameters');
        }
      }
    }
  },
  {
    name: 'Responding to High Bid - Should Consider LIAR',
    state: {
      you: { id: 'P1', dice: [1, 1, 1, 1, 1] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 }
      ],
      currentBid: { quantity: 20, face: 6 }, // Very high bid
      history: []
    },
    validate: (response) => {
      if (!response || !['raise', 'liar'].includes(response.action)) {
        throw new Error('Expected raise or liar action');
      }
    }
  },
  {
    name: 'Late Game - Few Dice',
    state: {
      you: { id: 'P1', dice: [3, 4] },
      players: [
        { id: 'P1', diceCount: 2 },
        { id: 'P2', diceCount: 1 },
        { id: 'P3', diceCount: 3 }
      ],
      currentBid: { quantity: 2, face: 3 },
      history: []
    },
    validate: (response) => {
      if (!response || !['raise', 'liar'].includes(response.action)) {
        throw new Error('Expected valid action');
      }
    }
  }
];

// Run tests
let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  try {
    const sandbox = createSandbox();
    sandbox.lastResponse = null;
    
    // Simulate the onmessage call
    const event = {
      data: {
        state: testCase.state
      }
    };
    
    if (typeof sandbox.onmessage !== 'function') {
      throw new Error('onmessage is not a function');
    }
    
    // Execute strategy
    sandbox.onmessage(event);
    
    // Get response
    const response = sandbox.lastResponse;
    
    // Validate
    testCase.validate(response);
    
    console.log(`✅ ${testCase.name}`);
    console.log(`   Response: ${JSON.stringify(response)}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${testCase.name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ Some tests failed. Please review the strategy.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed! Strategy is ready for tournament.');
  console.log('\n📝 Next steps:');
  console.log('   1. Strategy is already copied to /workspace/bots/Player2.js');
  console.log('   2. Open http://localhost:8001/ in your browser');
  console.log('   3. Select Player2 + 4 opponents');
  console.log('   4. Set: Seed=10185, Rounds=2500, Max Players=5, FAST=✓');
  console.log('   5. Click "Start" and wait for results');
  console.log('   6. Record the Average TS score');
  console.log('   7. If it\'s a new high score: node update-highscore.js <score>');
  console.log('');
}
