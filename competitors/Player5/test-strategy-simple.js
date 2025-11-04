// Simple test script to validate strategy logic
const fs = require('fs');
const path = require('path');

const strategyCode = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');

// Create a mock worker environment
const mockSelf = {
  equilibriumPolicy: {}
};

// Mock global functions
global.self = mockSelf;
global.postMessage = (msg) => {
  console.log('✅ Strategy responded:', JSON.stringify(msg, null, 2));
  return msg;
};

// Test cases
const testCases = [
  {
    name: "Opening bid test",
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
      history: [],
      rules: { faces: [1,2,3,4,5,6], mustIncreaseQuantityOrFace: true },
      seed: 12345
    }
  },
  {
    name: "Responding to low bid test",
    state: {
      you: { id: 'P1', dice: [2, 2, 4, 5, 6] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 },
        { id: 'P3', diceCount: 5 },
        { id: 'P4', diceCount: 5 },
        { id: 'P5', diceCount: 5 }
      ],
      currentBid: { quantity: 3, face: 2 },
      history: [
        { action: 'raise', quantity: 3, face: 2, actor: 'P2' }
      ],
      rules: { faces: [1,2,3,4,5,6], mustIncreaseQuantityOrFace: true },
      seed: 12345
    }
  },
  {
    name: "Responding to high bid (likely LIAR) test",
    state: {
      you: { id: 'P1', dice: [1, 1, 1, 2, 3] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 },
        { id: 'P3', diceCount: 5 },
        { id: 'P4', diceCount: 5 },
        { id: 'P5', diceCount: 5 }
      ],
      currentBid: { quantity: 15, face: 6 },
      history: [
        { action: 'raise', quantity: 15, face: 6, actor: 'P2' }
      ],
      rules: { faces: [1,2,3,4,5,6], mustIncreaseQuantityOrFace: true },
      seed: 12345
    }
  }
];

console.log('🧪 Testing Player5 Strategy Logic\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n📋 Test: ${testCase.name}`);
  
  try {
    // Create a new worker context for each test
    const workerCode = `
      ${strategyCode}
    `;
    
    // Execute in a new function context
    const fn = new Function('onmessage', `
      ${strategyCode}
    `);
    
    // Create mock postMessage
    let result = null;
    const mockPostMessage = (msg) => {
      result = msg;
    };
    
    // Override postMessage in the strategy's scope
    global.postMessage = mockPostMessage;
    
    // Execute the strategy
    fn({
      data: { state: testCase.state }
    });
    
    if (result) {
      console.log(`   ✅ Passed - Response: ${result.action}`);
      if (result.quantity) console.log(`      Quantity: ${result.quantity}, Face: ${result.face}`);
      passed++;
    } else {
      console.log(`   ❌ Failed - No response`);
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log(`      ${error.stack.split('\n')[1]}`);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('✅ All tests passed! Strategy is ready.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the strategy.');
  process.exit(1);
}
