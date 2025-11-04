// Validation test for Player2 Monte Carlo strategy
// This tests basic functionality and edge cases

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const STRATEGY_FILE = path.join(__dirname, 'strategy.js');

console.log('🧪 Validating Player2 Monte Carlo Strategy\n');
console.log('='.repeat(60));

// Read strategy file
const strategyCode = fs.readFileSync(STRATEGY_FILE, 'utf8');

// Create a test worker (simulate the tournament environment)
function createTestWorker() {
  return new Promise((resolve, reject) => {
    const workerCode = `
      ${strategyCode}
      
      // Test helper - expose to main thread
      self.addEventListener('message', (e) => {
        if (e.data.type === 'test') {
          const { state } = e.data;
          try {
            // Simulate the tournament's onmessage handler
            const event = { data: { state } };
            onmessage(event);
          } catch (err) {
            self.postMessage({ error: err.message, stack: err.stack });
          }
        }
      });
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data);
      }
    };
    
    worker.onerror = (err) => reject(err);
    
    setTimeout(() => {
      worker.terminate();
      reject(new Error('Test timeout'));
    }, 5000);
  });
}

// Since we can't easily test Web Workers in Node.js, let's do syntax validation
// and create a simpler functional test

console.log('✅ Strategy file exists');
console.log('✅ Strategy file is readable');

// Basic syntax check
try {
  // Create a minimal test environment
  const testCode = `
    const onmessage = ${strategyCode.match(/onmessage\s*=\s*function[^{]*\{[\s\S]*\}/)?.[0] || 'null'};
    
    // Test basic structure
    if (typeof onmessage !== 'function') {
      throw new Error('onmessage is not a function');
    }
    
    // Test with minimal state
    const testState = {
      you: { id: 'P1', dice: [1, 2, 3, 4, 5] },
      players: [
        { id: 'P1', diceCount: 5 },
        { id: 'P2', diceCount: 5 }
      ],
      currentBid: null,
      history: []
    };
    
    let response = null;
    const originalPostMessage = postMessage;
    postMessage = (msg) => { response = msg; };
    
    try {
      onmessage({ data: { state: testState } });
    } catch (err) {
      throw new Error('Strategy execution failed: ' + err.message);
    }
    
    if (!response) {
      throw new Error('Strategy did not respond');
    }
    
    if (response.action !== 'raise' && response.action !== 'liar') {
      throw new Error('Invalid action: ' + response.action);
    }
    
    if (response.action === 'raise' && (!response.quantity || !response.face)) {
      throw new Error('Invalid raise: missing quantity or face');
    }
    
    console.log('✅ Basic functionality test passed');
    console.log('   Response:', JSON.stringify(response));
  `;
  
  eval(testCode);
} catch (err) {
  console.error('❌ Validation failed:', err.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Strategy validation complete!');
console.log('\n📝 Next steps:');
console.log('   1. Run: node test-strategy.js');
console.log('   2. Open http://localhost:8001/');
console.log('   3. Select Player2 + opponents');
console.log('   4. Run tournament and record score');
console.log('');
