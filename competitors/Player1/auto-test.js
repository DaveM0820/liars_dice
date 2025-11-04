// Automated test script for Player1 strategy
// Tests strategy by simulating web worker environment

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STRATEGY_FILE = path.join(__dirname, 'strategy.js');

// Simple RNG for testing
function makeRNG(seed) {
  let s = seed >>> 0;
  return function rand() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function rollDice(rng, n) {
  const dice = [];
  for (let i = 0; i < n; i++) dice.push(1 + Math.floor(rng() * 6));
  return dice;
}

// Create a mock web worker environment
function createMockWorker(strategyCode) {
  let capturedMessage = null;
  let messageHandler = null;
  
  // Create object with getter/setter for onmessage
  const onmessageObj = {
    _handler: null,
    get onmessage() {
      return this._handler;
    },
    set onmessage(handler) {
      this._handler = handler;
      messageHandler = handler;
    }
  };
  
  // Mock postMessage to capture responses
  const mockPostMessage = (msg) => {
    capturedMessage = msg;
  };
  
  // Create sandbox with worker-like globals
  const sandbox = {
    self: {
      get onmessage() { return onmessageObj.onmessage; },
      set onmessage(handler) { onmessageObj.onmessage = handler; },
      postMessage: mockPostMessage
    },
    get onmessage() { return onmessageObj.onmessage; },
    set onmessage(handler) { onmessageObj.onmessage = handler; },
    postMessage: mockPostMessage,
    console: console,
    Math: Math,
    Array: Array,
    Number: Number,
    Object: Object,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  
  try {
    // Execute strategy code in sandbox
    vm.createContext(sandbox);
    vm.runInContext(strategyCode, sandbox);
    
    return {
      send: (state) => {
        capturedMessage = null;
        // Trigger the handler
        if (messageHandler || onmessageObj._handler) {
          const handler = messageHandler || onmessageObj._handler;
          try {
            handler({ data: { state } });
          } catch (e) {
            throw new Error(`Handler error: ${e.message}`);
          }
        }
        return capturedMessage;
      }
    };
  } catch (e) {
    throw new Error(`Strategy execution error: ${e.message}`);
  }
}

// Test a single turn
function testTurn(worker, state) {
  const startTime = Date.now();
  try {
    const response = worker.send(state);
    const elapsed = Date.now() - startTime;
    
    if (!response) {
      return { error: 'No response', elapsed };
    }
    
    if (response.action !== 'raise' && response.action !== 'liar') {
      return { error: `Invalid action: ${response.action}`, elapsed };
    }
    
    if (response.action === 'raise') {
      if (!Number.isInteger(response.quantity) || response.quantity < 1) {
        return { error: `Invalid quantity: ${response.quantity}`, elapsed };
      }
      if (!Number.isInteger(response.face) || response.face < 1 || response.face > 6) {
        return { error: `Invalid face: ${response.face}`, elapsed };
      }
    }
    
    if (elapsed > 200) {
      return { error: `Too slow: ${elapsed}ms`, elapsed, response };
    }
    
    return { success: true, response, elapsed };
  } catch (e) {
    return { error: e.message, elapsed: Date.now() - startTime };
  }
}

// Run comprehensive tests
async function runTests() {
  console.log('🚀 Starting automated strategy tests...\n');
  
  const strategyCode = fs.readFileSync(STRATEGY_FILE, 'utf8');
  const worker = createMockWorker(strategyCode);
  const rng = makeRNG(10185);
  
  let passed = 0;
  let failed = 0;
  const results = [];
  
  // Test 1: Opening move
  console.log('Test 1: Opening move (no current bid)...');
  const state1 = {
    you: { id: 'P1', dice: rollDice(rng, 5) },
    players: [
      { id: 'P1', diceCount: 5 },
      { id: 'P2', diceCount: 5 },
      { id: 'P3', diceCount: 5 },
      { id: 'P4', diceCount: 5 },
      { id: 'P5', diceCount: 5 }
    ],
    currentBid: null,
    history: [],
    rules: {}
  };
  const result1 = testTurn(worker, state1);
  if (result1.success && result1.response.action === 'raise') {
    console.log(`  ✅ Passed (${result1.elapsed}ms) - ${result1.response.action} ${result1.response.quantity}x${result1.response.face}`);
    passed++;
  } else {
    console.log(`  ❌ Failed: ${result1.error || 'Invalid response'}`);
    failed++;
  }
  results.push(result1);
  
  // Test 2: Responding to low bid
  console.log('\nTest 2: Responding to low bid...');
  const state2 = {
    you: { id: 'P1', dice: [3, 3, 3, 5, 6] },
    players: [
      { id: 'P1', diceCount: 5 },
      { id: 'P2', diceCount: 5 },
      { id: 'P3', diceCount: 5 },
      { id: 'P4', diceCount: 5 },
      { id: 'P5', diceCount: 5 }
    ],
    currentBid: { quantity: 2, face: 3 },
    history: [
      { hand: 1, turn: 1, action: 'raise', actor: 'P2', quantity: 2, face: 3 }
    ],
    rules: {}
  };
  const result2 = testTurn(worker, state2);
  if (result2.success) {
    console.log(`  ✅ Passed (${result2.elapsed}ms) - ${result2.response.action}`);
    passed++;
  } else {
    console.log(`  ❌ Failed: ${result2.error}`);
    failed++;
  }
  results.push(result2);
  
  // Test 3: Responding to high bid (should call LIAR)
  console.log('\nTest 3: Responding to high bid (should call LIAR)...');
  const state3 = {
    you: { id: 'P1', dice: [1, 2, 3, 4, 5] },
    players: [
      { id: 'P1', diceCount: 5 },
      { id: 'P2', diceCount: 5 },
      { id: 'P3', diceCount: 5 },
      { id: 'P4', diceCount: 5 },
      { id: 'P5', diceCount: 5 }
    ],
    currentBid: { quantity: 20, face: 6 },
    history: [
      { hand: 1, turn: 1, action: 'raise', actor: 'P2', quantity: 20, face: 6 }
    ],
    rules: {}
  };
  const result3 = testTurn(worker, state3);
  if (result3.success) {
    console.log(`  ✅ Passed (${result3.elapsed}ms) - ${result3.response.action}`);
    passed++;
  } else {
    console.log(`  ❌ Failed: ${result3.error}`);
    failed++;
  }
  results.push(result3);
  
  // Test 4: With history (Bayesian learning)
  console.log('\nTest 4: With bidding history (Bayesian learning)...');
  const history = [];
  for (let i = 0; i < 15; i++) {
    history.push({
      hand: 1,
      turn: i + 1,
      action: 'raise',
      actor: `P${(i % 5) + 1}`,
      quantity: 2 + Math.floor(i / 5),
      face: 1 + (i % 6)
    });
  }
  const state4 = {
    you: { id: 'P1', dice: rollDice(rng, 5) },
    players: [
      { id: 'P1', diceCount: 5 },
      { id: 'P2', diceCount: 4 },
      { id: 'P3', diceCount: 3 },
      { id: 'P4', diceCount: 5 },
      { id: 'P5', diceCount: 4 }
    ],
    currentBid: { quantity: 5, face: 2 },
    history: history,
    rules: {}
  };
  const result4 = testTurn(worker, state4);
  if (result4.success) {
    console.log(`  ✅ Passed (${result4.elapsed}ms) - ${result4.response.action}`);
    passed++;
  } else {
    console.log(`  ❌ Failed: ${result4.error}`);
    failed++;
  }
  results.push(result4);
  
  // Test 5: Performance test (multiple quick calls)
  console.log('\nTest 5: Performance (10 rapid calls)...');
  let perfPassed = true;
  let totalPerfTime = 0;
  for (let i = 0; i < 10; i++) {
    const perfState = {
      you: { id: 'P1', dice: rollDice(rng, 5) },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 },
        { id: 'P3', diceCount: 5 },
        { id: 'P4', diceCount: 5 },
        { id: 'P5', diceCount: 5 }
      ],
      currentBid: i === 0 ? null : { quantity: 2 + i, face: 3 },
      history: [],
      rules: {}
    };
    const perfResult = testTurn(worker, perfState);
    totalPerfTime += perfResult.elapsed;
    if (!perfResult.success || perfResult.elapsed > 200) {
      perfPassed = false;
      break;
    }
  }
  if (perfPassed) {
    console.log(`  ✅ Passed - Average: ${(totalPerfTime / 10).toFixed(1)}ms`);
    passed++;
  } else {
    console.log(`  ❌ Failed - Some calls too slow or failed`);
    failed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  const avgTime = results.reduce((sum, r) => sum + (r.elapsed || 0), 0) / results.length;
  console.log(`   Average Response Time: ${avgTime.toFixed(1)}ms`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed! Strategy is ready for tournament.');
    console.log('\n💡 Next steps:');
    console.log('   1. Run: node test-strategy.js');
    console.log('   2. Test in browser at http://localhost:8001/');
    console.log('   3. Run tournament with Seed=10185, Rounds=2500');
    return 0;
  } else {
    console.log('\n⚠️  Some tests failed. Review the errors above.');
    return 1;
  }
}

// Run tests
runTests().catch((err) => {
  console.error('❌ Test execution error:', err);
  process.exit(1);
});
