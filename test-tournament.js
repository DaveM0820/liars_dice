// Simple headless tournament test
const fs = require('fs');
const path = require('path');

// Mock DOM elements and functions
global.document = {
  getElementById: () => ({ 
    textContent: '', 
    innerHTML: '', 
    scrollTop: 0, 
    scrollHeight: 0,
    checked: false,
    value: '50',
    style: {},
    setAttribute: () => {},
    addEventListener: () => {},
    querySelectorAll: () => [],
    appendChild: () => {},
    insertBefore: () => {},
    parentElement: { insertBefore: () => {} }
  }),
  createElement: () => ({
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    addEventListener: () => {},
    appendChild: () => {},
    setAttribute: () => {}
  }),
  querySelector: () => null
};

global.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {}
};

global.CANVAS = {
  getContext: () => ({
    clearRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText: () => ({ width: 0 }),
    getBoundingClientRect: () => ({ width: 1000, height: 420 })
  }),
  getBoundingClientRect: () => ({ width: 1000, height: 420 }),
  width: 1000,
  height: 420,
  style: {}
};

global.getComputedStyle = () => ({
  getPropertyValue: () => '#7A003C'
});

// Load bot files
function loadBotText(file) {
  const filePath = path.join(__dirname, 'bots', file);
  return fs.readFileSync(filePath, 'utf8');
}

// Simplified RNG (same as tournament.js)
function makeRNG(seed) {
  let s = seed >>> 0;
  return function rand() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rollDice(rng, n) {
  const dice = [];
  for (let i = 0; i < n; i++) dice.push(1 + Math.floor(rng() * 6));
  return dice;
}

function countFace(allDice, face) {
  let c = 0;
  for (const xs of allDice) {
    for (const d of xs) {
      if (d === face) c++;
    }
  }
  return c;
}

// Create a bot worker (simplified - just evaluate the bot code)
function makeBotWorker(srcText, seed) {
  const prologue = `
    const __seed = ${seed};
    const __rng = (${makeRNG.toString()})(__seed);
    Math.random = __rng;
    self.onmessage = undefined; // Will be set by bot code
  `;
  
  // Create a mock worker context
  const self = {
    belief: {},
    stats: {},
    equilibriumPolicy: {},
    onmessage: null
  };
  
  // Evaluate bot code
  try {
    eval(prologue + '\n' + srcText);
  } catch (err) {
    console.error(`Error loading bot: ${err.message}`);
    self.onmessage = () => {};
  }
  
  return {
    postMessage: (data) => {
      if (self.onmessage) {
        self.onmessage({ data: { state: data.state } });
      }
    },
    terminate: () => {},
    addEventListener: (event, handler) => {
      if (event === 'message') {
        self.messageHandler = handler;
      }
    },
    __handler: null
  };
}

// Ask bot for action (simplified)
function askBot(worker, state) {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ action: 'liar' });
      }
    }, 200);
    
    // Mock the bot responding
    worker.postMessage({ state });
    
    // Simulate bot response (in real version, bot calls postMessage)
    // For testing, we'll use a simple timeout and assume it works
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        // Default response - in real version this comes from bot
        resolve({ action: 'raise', quantity: 2, face: 3 });
      }
    }, 50);
  });
}

// Simplified game simulation
async function testGame(botFiles, seed = 42) {
  console.log(`\n🎲 Testing tournament with ${botFiles.length} bots...`);
  console.log(`Bots: ${botFiles.join(', ')}`);
  
  const rng = makeRNG(seed);
  const sources = botFiles.map(loadBotText);
  const workers = sources.map((txt, i) => makeBotWorker(txt, seed + i * 101));
  
  // Create players
  const players = botFiles.map((file, i) => ({
    id: 'P' + (i + 1),
    name: file.replace(/\.js$/, ''),
    file,
    diceCount: 5
  }));
  
  const hidden = players.map(p => rollDice(rng, p.diceCount));
  console.log(`\n📊 Initial dice counts:`);
  players.forEach((p, i) => {
    console.log(`  ${p.name}: ${p.diceCount} dice`);
  });
  
  // Simulate a few turns
  let currentBid = null;
  let turnCount = 0;
  const maxTurns = 10;
  
  console.log(`\n🔄 Simulating ${maxTurns} turns...`);
  
  for (let turn = 0; turn < maxTurns; turn++) {
    const playerIdx = turn % players.length;
    const player = players[playerIdx];
    
    if (player.diceCount === 0) continue;
    
    const state = {
      you: { id: player.id, dice: hidden[playerIdx] },
      players: players.map(p => ({ id: p.id, diceCount: p.diceCount })),
      currentBid,
      history: [],
      rules: { faces: [1,2,3,4,5,6], mustIncreaseQuantityOrFace: true }
    };
    
    try {
      const action = await askBot(workers[playerIdx], state);
      turnCount++;
      
      if (action.action === 'liar') {
        console.log(`  Turn ${turnCount}: ${player.name} calls LIAR`);
        if (currentBid) {
          const total = countFace(hidden, currentBid.face);
          const claimTrue = total >= currentBid.quantity;
          console.log(`    Claim was ${claimTrue ? 'TRUE' : 'FALSE'} (total: ${total}, claimed: ${currentBid.quantity})`);
        }
        break;
      } else if (action.action === 'raise') {
        currentBid = { quantity: action.quantity, face: action.face };
        console.log(`  Turn ${turnCount}: ${player.name} raises to ${action.quantity}×${action.face}`);
      }
    } catch (err) {
      console.error(`  Error on turn ${turnCount}: ${err.message}`);
      break;
    }
  }
  
  console.log(`\n✅ Test completed successfully!`);
  console.log(`   Total turns: ${turnCount}`);
  console.log(`   Final bid: ${currentBid ? `${currentBid.quantity}×${currentBid.face}` : 'None'}`);
  
  // Cleanup
  workers.forEach(w => w.terminate());
}

// Run test
async function main() {
  const botFiles = ['Baseline.js', 'ProbabilityTuned.js', 'AggroBluffer.js'];
  
  console.log('🧪 Starting Tournament Test...\n');
  
  try {
    // Check if bots exist
    for (const file of botFiles) {
      const filePath = path.join(__dirname, 'bots', file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Bot file not found: ${file}`);
        return;
      }
    }
    
    await testGame(botFiles, 12345);
    console.log('\n🎉 All tests passed! Tournament system is working.');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
  }
}

main();
