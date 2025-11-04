// Headless tournament test for Player4
// Simulates the tournament engine without browser

const fs = require('fs');
const path = require('path');

// RNG
function makeRNG(seed) {
  let s = seed >>> 0;
  return function rand() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function rollDice(rng, count) {
  const dice = [];
  for (let i = 0; i < count; i++) {
    dice.push(Math.floor(rng() * 6) + 1);
  }
  return dice;
}

function countFace(hidden, face) {
  let total = 0;
  for (const hand of hidden) {
    for (const die of hand) {
      if (die === face) total++;
    }
  }
  return total;
}

// Adapt bot code to work as a function (not Worker)
function adaptBot(botCode) {
  // Create a sandboxed context
  const onmessage = null;
  const postMessage = null;
  
  // Wrap the bot code to execute as a function
  const wrapped = `
    (function() {
      let resolved = null;
      const postMessage = (msg) => { resolved = msg; };
      ${botCode}
      return function(state) {
        resolved = null;
        onmessage({ data: { state } });
        return resolved;
      };
    })()
  `;
  
  try {
    return eval(wrapped);
  } catch (e) {
    // Fallback: try direct execution
    const botFunc = new Function('state', `
      let result = null;
      const postMessage = (msg) => { result = msg; };
      const onmessage = ${botCode.match(/onmessage\s*=\s*[^;]+/)?.[0] || ''};
      onmessage({ data: { state } });
      return result;
    `);
    return botFunc;
  }
}

// Better approach: extract bot logic
function createBotFunction(botCode) {
  // Create a function that mimics the Worker API
  return function(state) {
    let result = null;
    const postMessage = (msg) => { result = msg; };
    
    // Create self context for Worker-like environment
    const self = {
      belief: {},
      stats: {},
      equilibriumPolicy: {},
      onmessage: null
    };
    
    // Execute bot code in a sandboxed way
    try {
      const vm = require('vm');
      const context = vm.createContext({
        self: self,
        postMessage: postMessage,
        onmessage: null,
        Math: Math,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        console: { error: () => {}, log: () => {} }
      });
      
      vm.runInContext(botCode, context);
      
      if (context.onmessage && typeof context.onmessage === 'function') {
        context.onmessage({ data: { state } });
      } else if (self.onmessage && typeof self.onmessage === 'function') {
        self.onmessage({ data: { state } });
      } else {
        throw new Error('Handler not found');
      }
    } catch (e) {
      // Fallback: try direct eval with self
      try {
        const wrapped = `
          (function(postMessage, self, state) {
            let onmessage;
            ${botCode}
            if (typeof onmessage === 'function') {
              onmessage({ data: { state } });
            } else if (typeof self.onmessage === 'function') {
              self.onmessage({ data: { state } });
            }
          })
        `;
        const fn = eval(wrapped);
        fn(postMessage, self, state);
      } catch (e2) {
        // Silently fail and return default
        return { action: 'liar' };
      }
    }
    
    return result || { action: 'raise', quantity: 1, face: 1 };
  };
}

// Load bot from file
function loadBot(filepath) {
  const code = fs.readFileSync(filepath, 'utf8');
  return createBotFunction(code);
}

// Play one hand
function playHand(bots, seed = 42) {
  const rng = makeRNG(seed);
  const N = bots.length;
  
  // Initialize players
  const players = bots.map((bot, i) => ({
    id: `P${i+1}`,
    name: bot.name,
    diceCount: 5,
    bot: bot.func
  }));
  
  const aliveCount = () => players.filter(p => p.diceCount > 0).length;
  let startIdx = 0;
  let handCount = 0;
  const history = [];
  
  while (aliveCount() > 1) {
    handCount++;
    
    // Roll dice
    const hidden = players.map(p => rollDice(rng, p.diceCount));
    
    // Find first active player
    let turnIdx = startIdx;
    while (players[turnIdx % N].diceCount === 0) turnIdx++;
    
    let currentBid = null;
    let turnInHand = 0;
    const TURN_GUARD_MAX = 200;
    let turnGuard = 0;
    
    while (true) {
      if (turnGuard++ > TURN_GUARD_MAX) {
        // Force elimination on timeout
        const active = turnIdx % N;
        players[active].diceCount = Math.max(0, players[active].diceCount - 1);
        break;
      }
      
      const active = turnIdx % N;
      const player = players[active];
      
      if (player.diceCount === 0) {
        turnIdx++;
        continue;
      }
      
      // Prepare state
      const state = {
        you: { id: player.id, dice: hidden[active] },
        players: players.map(p => ({ id: p.id, diceCount: p.diceCount })),
        currentBid,
        history: history.slice(-200),
        rules: { faces: [1,2,3,4,5,6], mustIncreaseQuantityOrFace: true },
        seed: seed + handCount * 1000 + turnIdx
      };
      
      // Ask bot (with timeout simulation)
      let action;
      try {
        action = player.bot(state);
      } catch (e) {
        action = { action: 'liar' };
      }
      
      if (!action || !action.action) {
        action = { action: 'liar' };
      }
      
      if (action.action === 'liar') {
        if (!currentBid) {
          // Can't call liar on nothing - illegal
          players[active].diceCount = Math.max(0, players[active].diceCount - 1);
          break;
        }
        
        const qty = currentBid.quantity;
        const face = currentBid.face;
        const total = countFace(hidden, face);
        const claimTrue = total >= qty;
        
        history.push({
          hand: handCount,
          turn: ++turnInHand,
          actor: player.id,
          action: 'liar',
          on: currentBid
        });
        
        // Determine losers
        if (claimTrue) {
          // Caller loses
          players[active].diceCount = Math.max(0, players[active].diceCount - 1);
        } else {
          // Others lose
          for (let i = 0; i < N; i++) {
            if (i !== active && players[i].diceCount > 0) {
              players[i].diceCount = Math.max(0, players[i].diceCount - 1);
            }
          }
        }
        
        startIdx = (active + 1) % N;
        break;
      } else {
        // Raise
        const q = action.quantity || 0;
        const f = action.face || 0;
        
        const legal = currentBid
          ? ((q > currentBid.quantity) || (q === currentBid.quantity && f > currentBid.face))
          : (q >= 1 && f >= 1 && f <= 6);
        
        if (!legal) {
          // Illegal bid - lose dice
          const total = currentBid ? countFace(hidden, currentBid.face) : 0;
          if (currentBid && total >= currentBid.quantity) {
            players[active].diceCount = Math.max(0, players[active].diceCount - 1);
          } else {
            for (let i = 0; i < N; i++) {
              if (i !== active && players[i].diceCount > 0) {
                players[i].diceCount = Math.max(0, players[i].diceCount - 1);
              }
            }
          }
          startIdx = (active + 1) % N;
          break;
        }
        
        currentBid = { quantity: q, face: f };
        history.push({
          hand: handCount,
          turn: ++turnInHand,
          actor: player.id,
          action: 'raise',
          quantity: q,
          face: f
        });
      }
      
      turnIdx++;
    }
  }
  
  // Determine winner
  const winner = players.find(p => p.diceCount > 0);
  return winner ? winner.name : null;
}

// Run tournament
function runTournament(botFiles, rounds = 100, seed = 10185) {
  const bots = botFiles.map(file => {
    const filepath = path.join(__dirname, 'bots', file);
    return {
      name: file.replace(/\.js$/, ''),
      func: loadBot(filepath)
    };
  });
  
  const stats = {};
  botFiles.forEach(f => {
    stats[f] = { name: f.replace(/\.js$/, ''), wins: 0, games: 0 };
  });
  
  console.log(`\n🏆 Running tournament: ${rounds} rounds, seed=${seed}`);
  console.log(`Players: ${bots.map(b => b.name).join(', ')}\n`);
  
  for (let round = 0; round < rounds; round++) {
    const roundSeed = seed + round;
    const winner = playHand(bots, roundSeed);
    
    if (winner) {
      const botFile = botFiles.find(f => f.replace(/\.js$/, '') === winner);
      if (botFile) {
        stats[botFile].wins++;
      }
    }
    
    botFiles.forEach(f => stats[f].games++);
    
    if ((round + 1) % (rounds / 10) === 0) {
      process.stdout.write(`\rProgress: ${round + 1}/${rounds} rounds...`);
    }
  }
  
  console.log('\n\n📊 Results:');
  console.log('='.repeat(60));
  
  const sorted = botFiles
    .map(f => ({ ...stats[f], file: f }))
    .sort((a, b) => b.wins - a.wins);
  
  sorted.forEach((s, i) => {
    const winRate = (s.wins / s.games * 100).toFixed(2);
    console.log(`${i+1}. ${s.name.padEnd(20)} ${s.wins.toString().padStart(4)}/${s.games} wins (${winRate}%)`);
  });
  
  // Calculate tournament scores
  const PLACEMENT_POINTS = [0, 100, 55, 35, 20, 5];
  const avgScores = {};
  
  sorted.forEach((s, i) => {
    const place = i + 1;
    const points = PLACEMENT_POINTS[Math.min(place, PLACEMENT_POINTS.length - 1)] || 0;
    avgScores[s.file] = points;
  });
  
  console.log('\n📈 Average Tournament Score (per game):');
  console.log('-'.repeat(60));
  sorted.forEach((s, i) => {
    const score = avgScores[s.file];
    console.log(`${i+1}. ${s.name.padEnd(20)} ${score.toFixed(2)} points`);
  });
  
  return stats;
}

// Main
if (require.main === module) {
  const args = process.argv.slice(2);
  const testType = args[0] || 'players';
  
  let testBots;
  if (testType === 'baseline') {
    testBots = ['Player4.js', 'Baseline.js', 'Baseline.js', 'Baseline.js', 'Baseline.js'];
  } else if (testType === 'mixed') {
    testBots = ['Player4.js', 'ProbabilityTuned.js', 'MomentumAdaptive.js', 'AggroBluffer.js', 'Baseline.js'];
  } else if (testType === 'players') {
    testBots = ['Player4.js', 'Player1.js', 'Player2.js', 'Player3.js', 'Player5.js'];
  } else {
    testBots = ['Player4.js', 'Baseline.js', 'Baseline.js', 'Baseline.js', 'Baseline.js'];
  }
  
  runTournament(testBots, 2500, 10185);
}

module.exports = { runTournament, playHand, loadBot };
