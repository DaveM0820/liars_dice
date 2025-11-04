// Tournament simulator - run actual games and compute scores
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const strategyCode = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');
const baselineCode = fs.readFileSync(path.join(__dirname, '../../Baseline.js'), 'utf8');

// Load bot strategies
function loadBotCode(file) {
  if (file === 'Player5.js') return strategyCode;
  if (file === 'Baseline.js') return baselineCode;
  return fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
}

function createWorker(code, seed) {
  const workerCode = `
    const { parentPort } = require('worker_threads');
    let response = null;
    global.postMessage = (msg) => {
      response = msg;
      parentPort.postMessage({ type: 'response', data: msg });
    };
    global.self = { equilibriumPolicy: {} };
    ${code}
    parentPort.on('message', (msg) => {
      if (msg.type === 'test') {
        response = null;
        onmessage({ data: msg.state });
        setTimeout(() => parentPort.postMessage({ type: 'done', data: response }), 5);
      }
    });
  `;
  return new Worker(workerCode, { eval: true });
}

async function getDecision(worker, state) {
  return new Promise((resolve) => {
    let result = null;
    const handler = (msg) => {
      if (msg.type === 'response') result = msg.data;
      if (msg.type === 'done') {
        worker.removeListener('message', handler);
        resolve(msg.data || result);
      }
    };
    worker.on('message', handler);
    worker.postMessage({ type: 'test', state });
    setTimeout(() => {
      if (!result) {
        worker.removeListener('message', handler);
        resolve({ action: 'liar' }); // Timeout = LIAR
      }
    }, 50);
  });
}

// Simple RNG
function makeRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function rollDice(rng, n) {
  return Array.from({ length: n }, () => 1 + Math.floor(rng() * 6));
}

function countFace(allDice, face) {
  let c = 0;
  for (const dice of allDice) {
    for (const d of dice) {
      if (d === face) c++;
    }
  }
  return c;
}

function legalRaise(prev, q, f) {
  if (!prev) return true;
  return (q > prev.quantity) || (q === prev.quantity && f > prev.face);
}

// PLACEMENT_POINTS from tournament.js
const PLACEMENT_POINTS = [0, 100, 55, 35, 20, 5];

async function playGame(botFiles, seed) {
  const rng = makeRNG(seed);
  const workers = botFiles.map(file => ({
    file,
    worker: createWorker(loadBotCode(file), seed),
    player: { id: `P${botFiles.indexOf(file) + 1}`, diceCount: 5 }
  }));
  
  const players = () => workers.map(w => w.player);
  const history = [];
  
  let handCount = 0;
  let startIdx = 0;
  
  while (players().filter(p => p.diceCount > 0).length > 1) {
    handCount++;
    if (handCount > 100) break; // Safety limit
    
    const hidden = players().map(p => rollDice(rng, p.diceCount));
    let turnIdx = startIdx;
    let currentBid = null;
    
    while (true) {
      const active = turnIdx % workers.length;
      const worker = workers[active];
      const player = worker.player;
      
      if (player.diceCount === 0) {
        turnIdx++;
        continue;
      }
      
      const state = {
        state: {
          you: { id: player.id, dice: hidden[active] },
          players: players().map(p => ({ id: p.id, diceCount: p.diceCount })),
          currentBid,
          history: history.slice(-200),
          rules: { faces: [1,2,3,4,5,6] },
          seed: seed + handCount * 1000 + turnIdx
        }
      };
      
      try {
        const decision = await getDecision(worker.worker, state);
        
        if (decision.action === 'liar') {
          if (!currentBid) {
            // Invalid - must have bid to call LIAR
            player.diceCount = Math.max(0, player.diceCount - 1);
            break;
          }
          
          const total = countFace(hidden, currentBid.face);
          const claimTrue = total >= currentBid.quantity;
          
          if (claimTrue) {
            // Caller loses
            player.diceCount = Math.max(0, player.diceCount - 1);
          } else {
            // Bidder loses - find who made the bid
            const bidderIdx = (active - 1 + workers.length) % workers.length;
            workers[bidderIdx].player.diceCount = Math.max(0, workers[bidderIdx].player.diceCount - 1);
          }
          
          history.push({ action: 'resolution', claimTrue });
          startIdx = (active + 1) % workers.length;
          break;
        } else if (decision.action === 'raise') {
          const { quantity, face } = decision;
          if (!legalRaise(currentBid, quantity, face)) {
            // Illegal bid
            player.diceCount = Math.max(0, player.diceCount - 1);
            break;
          }
          currentBid = { quantity, face };
          history.push({ action: 'raise', quantity, face, actor: player.id });
          turnIdx++;
        } else {
          // Invalid action
          player.diceCount = Math.max(0, player.diceCount - 1);
          break;
        }
      } catch (err) {
        // Error - player loses die
        player.diceCount = Math.max(0, player.diceCount - 1);
        break;
      }
    }
  }
  
  // Cleanup
  workers.forEach(w => w.worker.terminate());
  
  // Determine winner and placements
  const alive = players().filter(p => p.diceCount > 0);
  const winner = alive.length > 0 ? alive[0] : null;
  
  // Simple placement: winner = 1st, others by elimination order
  const placements = {};
  if (winner) {
    placements[winner.id] = 1;
    let place = 2;
    for (const p of players()) {
      if (p.id !== winner.id && p.diceCount === 0) {
        placements[p.id] = place++;
      }
    }
  }
  
  return { winner: winner?.id, placements, workers: workers.map(w => ({ file: w.file, id: w.player.id })) };
}

async function runTournament(rounds = 50) {
  console.log('🏆 Tournament Simulator - Player5 vs 4× Baseline\n');
  console.log('='.repeat(60));
  console.log(`Running ${rounds} rounds...\n`);
  
  const botFiles = ['Player5.js', 'Baseline.js', 'Baseline.js', 'Baseline.js', 'Baseline.js'];
  const stats = {};
  botFiles.forEach(f => {
    stats[f] = { wins: 0, placements: [], points: 0 };
  });
  
  for (let r = 0; r < rounds; r++) {
    const seed = 10185 + r * 9973;
    try {
      const result = await playGame(botFiles, seed);
      
      if (result.winner) {
        const winnerFile = result.workers.find(w => w.id === result.winner)?.file;
        if (winnerFile) stats[winnerFile].wins++;
      }
      
      // Record placements
      for (const [id, place] of Object.entries(result.placements)) {
        const file = result.workers.find(w => w.id === id)?.file;
        if (file) {
          stats[file].placements.push(place);
          stats[file].points += PLACEMENT_POINTS[place] || 0;
        }
      }
      
      if ((r + 1) % 10 === 0) {
        process.stdout.write(`Completed ${r + 1}/${rounds} rounds...\r`);
      }
    } catch (err) {
      console.error(`Error in round ${r + 1}:`, err.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Tournament Results:\n');
  
  for (const [file, s] of Object.entries(stats)) {
    const avgPlace = s.placements.length > 0 
      ? s.placements.reduce((a, b) => a + b, 0) / s.placements.length 
      : 0;
    const avgPoints = rounds > 0 ? s.points / rounds : 0;
    const winPct = rounds > 0 ? (100 * s.wins / rounds) : 0;
    
    console.log(`${file}:`);
    console.log(`  Wins: ${s.wins}/${rounds} (${winPct.toFixed(1)}%)`);
    console.log(`  Avg Place: ${avgPlace.toFixed(2)}`);
    console.log(`  Avg Tournament Score: ${avgPoints.toFixed(2)}`);
    console.log('');
    
    if (file === 'Player5.js') {
      return avgPoints;
    }
  }
  
  return 0;
}

// Run tournament
runTournament(50).then(avgTS => {
  console.log('='.repeat(60));
  if (avgTS > 0) {
    console.log(`\n🎯 Player5 Average Tournament Score: ${avgTS.toFixed(2)}`);
    console.log('\n💡 To update high score, run:');
    console.log(`   node update-highscore.js ${avgTS.toFixed(2)}`);
  }
  process.exit(0);
}).catch(err => {
  console.error('Tournament error:', err);
  process.exit(1);
});
