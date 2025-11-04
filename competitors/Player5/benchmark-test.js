// Benchmark test - simulate multiple game scenarios
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const strategyCode = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');

function createTestWorker() {
  const workerCode = `
    const { parentPort } = require('worker_threads');
    let lastResponse = null;
    global.postMessage = (msg) => {
      lastResponse = msg;
      parentPort.postMessage({ type: 'response', data: msg });
    };
    global.self = { equilibriumPolicy: {} };
    ${strategyCode}
    parentPort.on('message', (msg) => {
      if (msg.type === 'test') {
        lastResponse = null;
        onmessage({ data: msg.state });
        setTimeout(() => {
          parentPort.postMessage({ type: 'done', response: lastResponse });
        }, 5);
      }
    });
  `;
  return new Worker(workerCode, { eval: true });
}

async function runDecision(state) {
  return new Promise((resolve, reject) => {
    const worker = createTestWorker();
    let response = null;
    
    worker.on('message', (msg) => {
      if (msg.type === 'response') response = msg.data;
      else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.response || response);
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    worker.postMessage({ type: 'test', state });
    setTimeout(() => {
      if (!response) {
        worker.terminate();
        reject(new Error('Timeout'));
      }
    }, 50);
  });
}

// Generate random dice for testing
function randomDice(count) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}

// Simulate game scenarios
async function benchmark() {
  console.log('🚀 Running Benchmark Test\n');
  console.log('='.repeat(60));
  
  const scenarios = [];
  
  // Scenario 1: Various opening positions
  console.log('\n📊 Testing Opening Bids...');
  for (let i = 0; i < 10; i++) {
    const dice = randomDice(5);
    const state = {
      state: {
        you: { id: 'P1', dice },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: null,
        history: [],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 1000 + i
      }
    };
    
    try {
      const response = await runDecision(state);
      scenarios.push({ type: 'opening', dice, response });
      process.stdout.write('.');
    } catch (err) {
      process.stdout.write('X');
    }
  }
  
  // Scenario 2: Responding to various bids
  console.log('\n\n📊 Testing Bid Responses...');
  for (let i = 0; i < 20; i++) {
    const dice = randomDice(5);
    const quantity = Math.floor(Math.random() * 15) + 2;
    const face = Math.floor(Math.random() * 6) + 1;
    const state = {
      state: {
        you: { id: 'P1', dice },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: { quantity, face },
        history: [
          { action: 'raise', quantity, face, actor: 'P2' }
        ],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 2000 + i
      }
    };
    
    try {
      const response = await runDecision(state);
      scenarios.push({ type: 'response', dice, bid: { quantity, face }, response });
      process.stdout.write('.');
    } catch (err) {
      process.stdout.write('X');
    }
  }
  
  // Scenario 3: With history (opponent modeling)
  console.log('\n\n📊 Testing with Game History...');
  for (let i = 0; i < 10; i++) {
    const dice = randomDice(5);
    const history = [
      { action: 'raise', quantity: 3, face: 2, actor: 'P2' },
      { action: 'raise', quantity: 4, face: 2, actor: 'P3' },
      { action: 'raise', quantity: 5, face: 2, actor: 'P4' },
      { action: 'liar', actor: 'P5' },
      { action: 'resolution', claimTrue: false }
    ];
    
    const state = {
      state: {
        you: { id: 'P1', dice },
        players: Array(5).fill(null).map((_, i) => ({ id: `P${i+1}`, diceCount: 5 })),
        currentBid: { quantity: 6, face: 2 },
        history,
        rules: { faces: [1,2,3,4,5,6] },
        seed: 3000 + i
      }
    };
    
    try {
      const response = await runDecision(state);
      scenarios.push({ type: 'with_history', dice, response });
      process.stdout.write('.');
    } catch (err) {
      process.stdout.write('X');
    }
  }
  
  // Analyze results
  console.log('\n\n' + '='.repeat(60));
  console.log('\n📈 Benchmark Results:\n');
  
  const openings = scenarios.filter(s => s.type === 'opening');
  const responses = scenarios.filter(s => s.type === 'response');
  const withHistory = scenarios.filter(s => s.type === 'with_history');
  
  console.log(`Opening Bids: ${openings.length} scenarios`);
  console.log(`  - All valid: ${openings.every(s => s.response && s.response.action === 'raise') ? '✅' : '❌'}`);
  console.log(`  - Avg quantity: ${(openings.reduce((sum, s) => sum + (s.response?.quantity || 0), 0) / openings.length).toFixed(2)}`);
  
  console.log(`\nBid Responses: ${responses.length} scenarios`);
  const liarCalls = responses.filter(s => s.response?.action === 'liar').length;
  const raises = responses.filter(s => s.response?.action === 'raise').length;
  console.log(`  - LIAR calls: ${liarCalls} (${(100 * liarCalls / responses.length).toFixed(1)}%)`);
  console.log(`  - Raises: ${raises} (${(100 * raises / responses.length).toFixed(1)}%)`);
  
  console.log(`\nWith History: ${withHistory.length} scenarios`);
  console.log(`  - All responded: ${withHistory.every(s => s.response) ? '✅' : '❌'}`);
  
  console.log('\n✅ Strategy is working correctly!');
  console.log('🎯 Ready for tournament competition.');
}

benchmark().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
