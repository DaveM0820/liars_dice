// Functional test - simulate actual game decisions
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const strategyCode = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');

function createWorker() {
  const code = `
    const { parentPort } = require('worker_threads');
    let response = null;
    global.postMessage = (msg) => {
      response = msg;
      parentPort.postMessage({ type: 'response', data: msg });
    };
    global.self = { equilibriumPolicy: {} };
    ${strategyCode}
    parentPort.on('message', (msg) => {
      if (msg.type === 'test') {
        response = null;
        onmessage({ data: msg.state });
        setTimeout(() => parentPort.postMessage({ type: 'done', data: response }), 10);
      }
    });
  `;
  return new Worker(code, { eval: true });
}

async function testDecision(state) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    let result = null;
    worker.on('message', (msg) => {
      if (msg.type === 'response') result = msg.data;
      if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.data || result);
      }
    });
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    worker.postMessage({ type: 'test', state });
    setTimeout(() => {
      if (!result) {
        worker.terminate();
        reject(new Error('Timeout'));
      }
    }, 50);
  });
}

async function runFunctionalTests() {
  console.log('🎮 Functional Test: Player5 Strategy\n');
  console.log('='.repeat(60));
  
  const tests = [];
  
  // Test 1: Opening bid
  console.log('\n📋 Test 1: Opening Bid');
  try {
    const state = {
      state: {
        you: { id: 'P1', dice: [2, 2, 3, 4, 5] },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: null,
        history: [],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12345
      }
    };
    const result = await testDecision(state);
    console.log(`   ✅ Response: ${result.action}${result.quantity ? ` (${result.quantity}×${result.face})` : ''}`);
    tests.push({ name: 'Opening', passed: result && result.action === 'raise' });
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    tests.push({ name: 'Opening', passed: false });
  }
  
  // Test 2: Respond to plausible bid
  console.log('\n📋 Test 2: Respond to Plausible Bid');
  try {
    const state = {
      state: {
        you: { id: 'P1', dice: [2, 2, 4, 5, 6] },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: { quantity: 3, face: 2 },
        history: [{ action: 'raise', quantity: 3, face: 2, actor: 'P2' }],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12346
      }
    };
    const result = await testDecision(state);
    console.log(`   ✅ Response: ${result.action}${result.quantity ? ` (${result.quantity}×${result.face})` : ''}`);
    tests.push({ name: 'Plausible Bid', passed: result && (result.action === 'raise' || result.action === 'liar') });
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    tests.push({ name: 'Plausible Bid', passed: false });
  }
  
  // Test 3: Respond to impossible bid
  console.log('\n📋 Test 3: Respond to Impossible Bid');
  try {
    const state = {
      state: {
        you: { id: 'P1', dice: [1, 1, 1, 2, 3] },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: { quantity: 20, face: 6 },
        history: [{ action: 'raise', quantity: 20, face: 6, actor: 'P2' }],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12347
      }
    };
    const result = await testDecision(state);
    console.log(`   ✅ Response: ${result.action}`);
    tests.push({ name: 'Impossible Bid', passed: result && result.action === 'liar' });
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    tests.push({ name: 'Impossible Bid', passed: false });
  }
  
  // Test 4: With history (opponent modeling)
  console.log('\n📋 Test 4: With Game History');
  try {
    const state = {
      state: {
        you: { id: 'P1', dice: [2, 3, 4, 5, 6] },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: { quantity: 5, face: 2 },
        history: [
          { action: 'raise', quantity: 3, face: 2, actor: 'P2' },
          { action: 'raise', quantity: 4, face: 2, actor: 'P3' },
          { action: 'raise', quantity: 5, face: 2, actor: 'P4' },
          { action: 'liar', actor: 'P5' },
          { action: 'resolution', claimTrue: false }
        ],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12348
      }
    };
    const result = await testDecision(state);
    console.log(`   ✅ Response: ${result.action}${result.quantity ? ` (${result.quantity}×${result.face})` : ''}`);
    tests.push({ name: 'With History', passed: !!result });
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    tests.push({ name: 'With History', passed: false });
  }
  
  // Test 5: Late game (fewer players)
  console.log('\n📋 Test 5: Late Game Scenario');
  try {
    const state = {
      state: {
        you: { id: 'P1', dice: [3, 4, 5] },
        players: [
          { id: 'P1', diceCount: 3 },
          { id: 'P2', diceCount: 2 },
          { id: 'P3', diceCount: 1 }
        ],
        currentBid: { quantity: 2, face: 3 },
        history: [],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12349
      }
    };
    const result = await testDecision(state);
    console.log(`   ✅ Response: ${result.action}${result.quantity ? ` (${result.quantity}×${result.face})` : ''}`);
    tests.push({ name: 'Late Game', passed: !!result });
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    tests.push({ name: 'Late Game', passed: false });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;
  console.log(`\n📊 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('✅ All functional tests passed!');
    console.log('\n🎯 Strategy is ready for tournament competition!');
    return 0;
  } else {
    console.log('❌ Some tests failed.');
    return 1;
  }
}

runFunctionalTests().then(code => process.exit(code)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
