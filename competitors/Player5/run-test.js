// Test script to validate Player5 strategy
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const strategyCode = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');

// Create a test worker
function createTestWorker() {
  const workerCode = `
    const { parentPort } = require('worker_threads');
    
    // Mock postMessage to capture responses
    let lastResponse = null;
    global.postMessage = (msg) => {
      lastResponse = msg;
      parentPort.postMessage({ type: 'response', data: msg });
    };
    
    // Mock self for equilibrium policy
    global.self = { equilibriumPolicy: {} };
    
    ${strategyCode}
    
    // Listen for test messages
    parentPort.on('message', (msg) => {
      if (msg.type === 'test') {
        lastResponse = null;
        // Simulate the onmessage event
        onmessage({ data: msg.state });
        // Send response after a short delay
        setTimeout(() => {
          parentPort.postMessage({ type: 'done', response: lastResponse });
        }, 10);
      }
    });
  `;
  
  return new Worker(workerCode, { eval: true });
}

// Test cases
const tests = [
  {
    name: "Opening bid - should bid on best face",
    state: {
      state: {
        you: { id: 'P1', dice: [2, 2, 3, 4, 5] },
        players: [
          { id: 'P1', diceCount: 5 },
          { id: 'P2', diceCount: 5 },
          { id: 'P3', diceCount: 5 },
          { id: 'P4', diceCount: 5 },
          { id: 'P5', diceCount: 5 }
        ],
        currentBid: null,
        history: [],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12345
      }
    },
    validate: (response) => {
      return response && response.action === 'raise' && response.quantity > 0 && response.face >= 1 && response.face <= 6;
    }
  },
  {
    name: "Responding to plausible bid - should raise",
    state: {
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
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12345
      }
    },
    validate: (response) => {
      return response && (response.action === 'raise' || response.action === 'liar');
    }
  },
  {
    name: "Responding to impossible bid - should call LIAR",
    state: {
      state: {
        you: { id: 'P1', dice: [1, 1, 1, 2, 3] },
        players: [
          { id: 'P1', diceCount: 5 },
          { id: 'P2', diceCount: 5 },
          { id: 'P3', diceCount: 5 },
          { id: 'P4', diceCount: 5 },
          { id: 'P5', diceCount: 5 }
        ],
        currentBid: { quantity: 20, face: 6 },
        history: [
          { action: 'raise', quantity: 20, face: 6, actor: 'P2' }
        ],
        rules: { faces: [1,2,3,4,5,6] },
        seed: 12345
      }
    },
    validate: (response) => {
      // Should likely call LIAR on such an impossible bid
      return response && response.action === 'liar';
    }
  }
];

async function runTest(test) {
  return new Promise((resolve, reject) => {
    const worker = createTestWorker();
    let response = null;
    
    worker.on('message', (msg) => {
      if (msg.type === 'response') {
        response = msg.data;
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve(msg.response || response);
      }
    });
    
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });
    
    // Send test message
    worker.postMessage({ type: 'test', state: test.state });
    
    // Timeout after 100ms
    setTimeout(() => {
      if (!response) {
        worker.terminate();
        reject(new Error('Timeout'));
      }
    }, 100);
  });
}

async function runAllTests() {
  console.log('🧪 Testing Player5 Strategy\n');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    process.stdout.write(`\n📋 ${test.name}... `);
    try {
      const response = await runTest(test);
      if (test.validate(response)) {
        console.log('✅ PASSED');
        console.log(`   Response: ${response.action}${response.quantity ? ` (${response.quantity}×${response.face})` : ''}`);
        passed++;
      } else {
        console.log('❌ FAILED');
        console.log(`   Got: ${JSON.stringify(response)}`);
        failed++;
      }
    } catch (error) {
      console.log('❌ ERROR');
      console.log(`   ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All tests passed! Strategy is ready for tournament.');
    return 0;
  } else {
    console.log('❌ Some tests failed. Please review the strategy.');
    return 1;
  }
}

// Run tests
runAllTests().then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
