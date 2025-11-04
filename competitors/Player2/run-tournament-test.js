// Headless tournament runner for Player2 Monte Carlo strategy
// Tests against baseline bots and reports results

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('🏆 Running Tournament Test for Player2 (v1.1.0)\n');
console.log('='.repeat(60));

// Configuration
const ROUNDS = 500;
const SEED = 10185;

// Load bot files
const botsDir = path.join(__dirname, '../../bots');
const botFiles = ['Player2.js', 'Baseline.js', 'ProbabilityTuned.js', 'MomentumAdaptive.js', 'AggroBluffer.js'];

// Check if bots exist
for (const file of botFiles) {
  if (!fs.existsSync(path.join(botsDir, file))) {
    console.error(`❌ Missing bot: ${file}`);
    process.exit(1);
  }
}

console.log('✅ All bots found\n');

// RNG
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

function countFace(allDice, face) {
  let c = 0;
  for (const xs of allDice) {
    for (const d of xs) {
      if (d === face) c++;
    }
  }
  return c;
}

function legalRaise(prev, q, f) {
  if (!prev) return true;
  const { quantity, face } = prev;
  return (q > quantity) || (q === quantity && f > face);
}

// Create bot worker
function createBotWorker(botCode, seed) {
  const sandbox = {
    Math: {
      ...Math,
      random: makeRNG(seed),
      floor: Math.floor,
      ceil: Math.ceil,
      max: Math.max,
      min: Math.min,
      round: Math.round,
      pow: Math.pow,
      sqrt: Math.sqrt,
      abs: Math.abs
    },
    Array: Array,
    Object: Object,
    Number: Number,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    postMessage: (msg) => { sandbox.lastResponse = msg; },
    onmessage: null,
    self: {},
    lastResponse: null,
    console: { log: () => {}, error: () => {} }
  };

  try {
    vm.createContext(sandbox);
    vm.runInContext(botCode, sandbox);
  } catch (err) {
    throw new Error(`Failed to load bot: ${err.message}`);
  }

  return {
    ask: (state) => {
      sandbox.lastResponse = null;
      const event = { data: { state } };
      if (typeof sandbox.onmessage === 'function') {
        try {
          sandbox.onmessage(event);
        } catch (err) {
          return null;
        }
      }
      return sandbox.lastResponse;
    }
  };
}

function loadBotCode(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Play one hand
function playHand(botFiles, botCodes, seed) {
  const rng = makeRNG(seed);
  const workers = botCodes.map((code, i) => createBotWorker(code, seed + i * 101));

  const players = botFiles.map((file, i) => ({
    id: 'P' + (i + 1),
    name: file.replace('.js', ''),
    file,
    diceCount: 5,
    worker: workers[i]
  }));

  const playersArray = () => players.map(p => ({ id: p.id, diceCount: p.diceCount }));
  let startIdx = 0;
  let handCount = 0;

  while (players.filter(p => p.diceCount > 0).length > 1) {
    handCount++;
    const hidden = players.map(p => rollDice(rng, p.diceCount));
    let turnIdx = startIdx;
    let currentBid = null;
    let turnGuard = 0;

    while (turnGuard++ < 200) {
      const active = turnIdx % players.length;
      const player = players[active];

      if (player.diceCount === 0) {
        turnIdx++;
        continue;
      }

      const state = {
        you: { id: player.id, dice: hidden[active] },
        players: playersArray(),
        currentBid,
        history: [],
        rules: { faces: [1, 2, 3, 4, 5, 6], mustIncreaseQuantityOrFace: true },
        seed: seed + handCount * 1000 + turnIdx
      };

      const action = player.worker.ask(state);

      if (!action || !action.action) {
        player.diceCount = Math.max(0, player.diceCount - 1);
        if (player.diceCount === 0) {
          startIdx = (active + 1) % players.length;
          break;
        }
        turnIdx++;
        continue;
      }

      if (action.action === 'liar') {
        if (!currentBid) {
          player.diceCount = Math.max(0, player.diceCount - 1);
        } else {
          const { quantity: q, face: f } = currentBid;
          const total = countFace(hidden, f);
          const claimTrue = total >= q;
          if (claimTrue) {
            player.diceCount = Math.max(0, player.diceCount - 1);
          } else {
            const others = players.filter((p, i) => i !== active && p.diceCount > 0);
            others.forEach(p => p.diceCount = Math.max(0, p.diceCount - 1));
          }
        }
        startIdx = (active + 1) % players.length;
        break;
      } else if (action.action === 'raise') {
        const { quantity: q, face: f } = action;
        if (!legalRaise(currentBid, q, f)) {
          player.diceCount = Math.max(0, player.diceCount - 1);
          if (player.diceCount === 0) {
            startIdx = (active + 1) % players.length;
            break;
          }
          turnIdx++;
          continue;
        }
        currentBid = { quantity: q, face: f };
        turnIdx++;
      } else {
        turnIdx++;
      }
    }

    if (turnGuard >= 200) {
      const firstAlive = players.findIndex(p => p.diceCount > 0);
      if (firstAlive >= 0) players[firstAlive].diceCount = 0;
    }
  }

  const alive = players.filter(p => p.diceCount > 0);
  const winner = alive[0];
  const placements = {};
  if (winner) placements[winner.file] = 1;
  const eliminated = players.filter(p => p.diceCount === 0);
  let place = players.length;
  for (const p of eliminated) {
    placements[p.file] = place--;
  }

  return { winner: winner?.file, placements, handCount };
}

// Scoring
const PLACEMENT_POINTS = [0, 100, 55, 35, 20, 5];
function pointsForPlace(place) {
  return PLACEMENT_POINTS[Math.min(place, PLACEMENT_POINTS.length - 1)] || 0;
}

// Run tournament
async function runTournament() {
  console.log(`📊 Running ${ROUNDS} rounds with seed ${SEED}\n`);
  console.log('Competitors:');
  console.log('  - Player2 (Monte Carlo v1.1.0 - with survival logic)');
  console.log('  - Baseline');
  console.log('  - ProbabilityTuned');
  console.log('  - MomentumAdaptive');
  console.log('  - AggroBluffer\n');

  const botCodes = botFiles.map(file => loadBotCode(path.join(botsDir, file)));
  const stats = {};
  botFiles.forEach(file => {
    stats[file] = { wins: 0, totalPoints: 0, placements: Array(6).fill(0) };
  });

  const startTime = Date.now();

  for (let round = 1; round <= ROUNDS; round++) {
    const seed = SEED + round * 1000;
    const result = playHand(botFiles, botCodes, seed);

    if (result.winner) stats[result.winner].wins++;
    for (const [file, place] of Object.entries(result.placements)) {
      if (stats[file]) {
        stats[file].placements[place]++;
        stats[file].totalPoints += pointsForPlace(place);
      }
    }

    if (round % 50 === 0) {
      process.stdout.write(`\r⏳ Progress: ${round}/${ROUNDS} rounds...`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\r✅ Completed ${ROUNDS} rounds in ${elapsed}s\n`);

  console.log('='.repeat(60));
  console.log('📊 TOURNAMENT RESULTS');
  console.log('='.repeat(60));
  console.log('\nRank | Bot Name              | Avg TS | Wins | Win %');
  console.log('-'.repeat(60));

  const results = botFiles.map(file => ({
    file,
    name: file.replace('.js', ''),
    avgTS: stats[file].totalPoints / ROUNDS,
    wins: stats[file].wins,
    winPct: (stats[file].wins / ROUNDS * 100).toFixed(1)
  }));

  results.sort((a, b) => b.avgTS - a.avgTS);

  results.forEach((r, i) => {
    const rank = (i + 1).toString().padStart(2);
    const name = r.name.padEnd(20);
    const avgTS = r.avgTS.toFixed(2).padStart(7);
    const wins = r.wins.toString().padStart(4);
    const winPct = r.winPct.padStart(5);
    console.log(` ${rank}  | ${name} | ${avgTS} | ${wins} | ${winPct}%`);
  });

  console.log('\n' + '='.repeat(60));

  const player2Result = results.find(r => r.file === 'Player2.js');
  if (player2Result) {
    const rank = results.findIndex(r => r.file === 'Player2.js') + 1;
    console.log(`\n🎯 Player2 Results:`);
    console.log(`   Rank: ${rank}/${results.length}`);
    console.log(`   Average TS: ${player2Result.avgTS.toFixed(2)}`);
    console.log(`   Wins: ${player2Result.wins}/${ROUNDS} (${player2Result.winPct}%)`);

    if (rank === 1) {
      console.log(`\n🏆 Player2 is WINNING!`);
    } else {
      const leader = results[0];
      const gap = leader.avgTS - player2Result.avgTS;
      const improvement = player2Result.avgTS - 42.05; // Previous score
      console.log(`\n📈 Gap to leader: ${gap.toFixed(2)} points`);
      console.log(`   Leader: ${leader.name} (${leader.avgTS.toFixed(2)} avg TS)`);
      if (improvement > 0) {
        console.log(`   ✅ Improvement: +${improvement.toFixed(2)} points from v1.0.0`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  return results;
}

runTournament().catch(err => {
  console.error('\n❌ Tournament failed:', err);
  process.exit(1);
});
