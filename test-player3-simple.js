// Simple Tournament Runner for Player3 - Uses vm instead of Workers
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// RNG
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

function parseBotName(srcText, fallback) {
  const m1 = srcText.match(/^\s*\/\/\s*BOT_NAME:\s*(.+)\s*$/m);
  if (m1) return m1[1].trim();
  const m2 = srcText.match(/\bBOT_NAME\s*=\s*["']([^"']+)["']/);
  if (m2) return m2[1].trim();
  return fallback;
}

function loadBotText(file) {
  let filePath = path.join(__dirname, 'bots', file);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'competitors', file);
  }
  if (!fs.existsSync(filePath)) {
    const playerMatch = file.match(/Player(\d+)\.js/);
    if (playerMatch) {
      filePath = path.join(__dirname, 'competitors', `Player${playerMatch[1]}`, 'strategy.js');
    }
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Create bot context
function makeBotContext(srcText, seed) {
  const prologue = `
    const __seed = ${seed};
    const __rng = (${makeRNG.toString()})(__seed);
    Math.random = __rng;
  `;
  
  const fullCode = prologue + '\n' + srcText;
  
  const sandbox = {
    self: { stats: {}, belief: {}, equilibriumPolicy: {} },
    postMessage: null, // Will be set
    onmessage: null,
    Math: Math,
    console: { log: () => {}, error: () => {} },
    Array: Array,
    Object: Object,
    Number: Number,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Infinity: Infinity,
    NaN: NaN
  };
  
  try {
    const script = new vm.Script(fullCode);
    script.runInNewContext(sandbox);
  } catch (err) {
    console.error('Error loading bot:', err.message);
    sandbox.onmessage = () => {};
  }
  
  return sandbox;
}

// Ask bot
function askBot(botContext, state) {
  let response = null;
  let responded = false;
  
  botContext.postMessage = (msg) => {
    if (!responded) {
      response = msg;
      responded = true;
    }
  };
  
  try {
    if (botContext.onmessage) {
      botContext.onmessage({ data: { state } });
    }
  } catch (err) {
    // Error - default to liar
  }
  
  // Timeout check
  const start = Date.now();
  while (!responded && (Date.now() - start) < 200) {
    // Wait
  }
  
  if (!responded || !response) {
    return { action: 'liar' };
  }
  
  return response;
}

const PLACEMENT_POINTS = [0, 100, 55, 35, 20, 5];
function pointsForPlace(place) {
  return PLACEMENT_POINTS[Math.min(place, PLACEMENT_POINTS.length - 1)] || 0;
}

function makeStatsFor(botFiles) {
  const s = {};
  for (const f of botFiles) {
    s[f] = {
      name: f.replace(/\.js$/, ''),
      hands: 0, wins: 0, bids: 0, liarCalls: 0, liarCorrect: 0,
      illegal: 0, diceLost: 0, finishes: 0, totalPlace: 0, placementScore: 0
    };
  }
  return s;
}

async function playGame(botFiles, seed = 42) {
  const rng = makeRNG(seed);
  const sources = botFiles.map(loadBotText);
  const names = sources.map((txt, i) => parseBotName(txt, botFiles[i].replace(/\.js$/, '')));
  const contexts = sources.map((txt, i) => makeBotContext(txt, seed + i * 101));
  
  const seats = botFiles.map((file, i) => ({
    player: { id: 'P' + (i + 1), name: names[i], file, diceCount: 5 },
    context: contexts[i]
  }));
  
  const players = () => seats.map(s => s.player);
  const aliveCount = () => players().filter(p => p.diceCount > 0).length;
  const stats = makeStatsFor(botFiles);
  botFiles.forEach((f, i) => { stats[f].name = names[i]; });
  
  const eliminations = [];
  let stepSerial = 0;
  
  function markElims(elimSet, handNo) {
    const tag = ++stepSerial;
    for (const idx of elimSet) {
      eliminations.push({ file: seats[idx].player.file, seatIdx: idx, handNo, stepTag: tag });
    }
  }
  
  function dropDieAndCollectElims(indicesToDrop, handNo) {
    const eliminatedNow = [];
    for (const idx of indicesToDrop) {
      const pl = seats[idx].player;
      if (pl.diceCount <= 0) continue;
      pl.diceCount = Math.max(0, pl.diceCount - 1);
      stats[pl.file].diceLost++;
      if (pl.diceCount === 0) eliminatedNow.push(idx);
    }
    if (eliminatedNow.length) markElims(eliminatedNow, handNo);
  }
  
  let startIdx = 0;
  const history = [];
  const pushHistory = (rec) => {
    history.push(rec);
    if (history.length > 200) history.shift();
  };
  
  let handCount = 0;
  while (aliveCount() > 1) {
    handCount++;
    botFiles.forEach(f => stats[f].hands++);
    
    const hidden = players().map(p => rollDice(rng, p.diceCount));
    const N = seats.length;
    let turnIdx = startIdx;
    let guardSkip = 0;
    while (players()[turnIdx % N].diceCount === 0 && guardSkip++ < N) turnIdx++;
    
    let currentBid = null;
    let turnInHand = 0;
    let turnGuard = 0;
    const TURN_GUARD_MAX = 200;
    
    while (true) {
      if (turnGuard++ > TURN_GUARD_MAX) {
        let i = turnIdx % N, tries = 0;
        while (players()[i].diceCount === 0 && tries++ < N) i = (i + 1) % N;
        dropDieAndCollectElims([i], handCount);
        break;
      }
      
      const active = turnIdx % N;
      const seat = seats[active];
      const p = seat.player;
      const file = p.file;
      
      if (p.diceCount === 0) {
        turnIdx++;
        continue;
      }
      
      const state = {
        you: { id: p.id, dice: hidden[active] },
        players: players().map(q => ({ id: q.id, diceCount: q.diceCount })),
        currentBid,
        history,
        rules: { faces: [1, 2, 3, 4, 5, 6], mustIncreaseQuantityOrFace: true },
        seed: seed + handCount * 1000 + turnIdx
      };
      
      const action = askBot(seat.context, state);
      
      if (action?.action === 'liar') {
        stats[file].liarCalls++;
        pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'liar', on: currentBid });
        
        const qty = currentBid?.quantity ?? 0;
        const face = currentBid?.face ?? 1;
        const total = countFace(hidden, face);
        const claimTrue = total >= qty;
        if (claimTrue) stats[file].liarCorrect++;
        
        let losers = [];
        if (claimTrue) {
          losers = [active];
          dropDieAndCollectElims(losers, handCount);
        } else {
          const others = [];
          for (let i = 0; i < N; i++) if (i !== active && players()[i].diceCount > 0) others.push(i);
          losers = others;
          dropDieAndCollectElims(losers, handCount);
        }
        
        pushHistory({
          hand: handCount, turn: ++turnInHand, action: 'resolution',
          on: currentBid, claimTrue, losers: losers.map(i => 'P' + (i + 1))
        });
        
        startIdx = (active + 1) % N;
        break;
      } else {
        const q = (action?.quantity | 0), f = (action?.face | 0);
        const legal = currentBid
          ? ((q > currentBid.quantity) || (q === currentBid.quantity && f > currentBid.face))
          : (q >= 1 && f >= 1 && f <= 6);
        const bid = legal ? { quantity: q, face: f } : null;
        
        if (!bid) {
          stats[file].illegal++;
          pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'illegal' });
          
          const total = currentBid ? countFace(hidden, currentBid.face) : 0;
          let losers = [];
          if (currentBid && total >= currentBid.quantity) {
            losers = [active];
            dropDieAndCollectElims(losers, handCount);
          } else {
            const others = [];
            for (let i = 0; i < N; i++) if (i !== active && players()[i].diceCount > 0) others.push(i);
            losers = others;
            dropDieAndCollectElims(losers, handCount);
          }
          
          pushHistory({
            hand: handCount, turn: ++turnInHand, action: 'resolution-illegal',
            on: currentBid ?? null, losers: losers.map(i => 'P' + (i + 1))
          });
          
          startIdx = (active + 1) % N;
          break;
        }
        
        stats[file].bids++;
        currentBid = bid;
        pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'raise', quantity: q, face: f });
      }
      
      turnIdx++;
    }
  }
  
  const winner = players().find(p => p.diceCount > 0);
  if (winner) stats[winner.file].wins++;
  
  const allFiles = botFiles.slice();
  const outSet = new Set(eliminations.map(e => e.file));
  const stillAlive = allFiles.filter(f => !outSet.has(f));
  const byTag = new Map();
  for (const e of eliminations) {
    if (!byTag.has(e.stepTag)) byTag.set(e.stepTag, []);
    byTag.get(e.stepTag).push(e.file);
  }
  const orderedGroups = [...byTag.keys()].sort((a, b) => a - b).map(tag => byTag.get(tag));
  
  const placements = [];
  let remainingPlaces = allFiles.length;
  for (let gi = 0; gi < orderedGroups.length; gi++) {
    const group = orderedGroups[gi];
    const lo = remainingPlaces - group.length + 1;
    const hi = remainingPlaces;
    const sharedPoints = [];
    for (let place = lo; place <= hi; place++) sharedPoints.push(pointsForPlace(place));
    const avgPoints = sharedPoints.reduce((a, b) => a + b, 0) / sharedPoints.length;
    for (const f of group) {
      placements.push({ file: f, placeRange: [lo, hi], points: avgPoints });
    }
    remainingPlaces -= group.length;
  }
  if (stillAlive.length > 0) {
    const lo = 1, hi = remainingPlaces;
    const sharedPoints = [];
    for (let place = lo; place <= hi; place++) sharedPoints.push(pointsForPlace(place));
    const avgPoints = sharedPoints.reduce((a, b) => a + b, 0) / sharedPoints.length;
    for (const f of stillAlive) {
      placements.push({ file: f, placeRange: [lo, hi], points: avgPoints });
    }
  }
  
  return { winnerFile: winner?.file || null, stats, placements };
}

function buildSchedule(allBots, rounds, maxPlayers, baseSeed) {
  const schedule = [];
  const K = 9973;
  for (let r = 0; r < rounds; r++) {
    const rng = makeRNG(baseSeed + r * K);
    const shuffled = allBots.slice();
    shuffleInPlace(shuffled, rng);
    const groups = [];
    for (let i = 0; i < shuffled.length; i += maxPlayers) {
      groups.push(shuffled.slice(i, i + maxPlayers));
    }
    schedule.push({ round: r + 1, groups });
  }
  return schedule;
}

async function runTournament(botFiles, rounds, baseSeed, maxPlayers) {
  const grand = makeStatsFor(botFiles);
  const schedule = buildSchedule(botFiles, rounds, Math.max(2, maxPlayers | 0), baseSeed | 0);
  
  let totalGames = 0;
  for (const entry of schedule) totalGames += entry.groups.length;
  let playedGames = 0;
  
  console.log(`\n🎮 Starting Tournament:`);
  console.log(`   Bots: ${botFiles.join(', ')}`);
  console.log(`   Rounds: ${rounds}`);
  console.log(`   Seed: ${baseSeed}`);
  console.log(`   Max Players: ${maxPlayers}`);
  console.log(`   Total Games: ${totalGames}\n`);
  
  for (const entry of schedule) {
    for (let gi = 0; gi < entry.groups.length; gi++) {
      const group = entry.groups[gi];
      playedGames++;
      
      if (playedGames % 50 === 0) {
        process.stdout.write(`\r   Progress: ${playedGames}/${totalGames} games (${Math.round(100 * playedGames / totalGames)}%)`);
      }
      
      const roundSeed = (baseSeed >>> 0) + (entry.round * 1337) + gi * 17;
      const { stats, placements } = await playGame(group, roundSeed);
      
      for (const f of Object.keys(stats)) {
        const g = grand[f], s = stats[f];
        g.name = s.name || g.name;
        g.hands += s.hands;
        g.wins += s.wins;
        g.bids += s.bids;
        g.liarCalls += s.liarCalls;
        g.liarCorrect += s.liarCorrect;
        g.illegal += s.illegal;
        g.diceLost += s.diceLost;
      }
      
      for (const p of placements) {
        const g = grand[p.file];
        g.placementScore += p.points;
        const midPlace = (p.placeRange[0] + p.placeRange[1]) / 2;
        g.totalPlace += midPlace;
        g.finishes += 1;
      }
    }
  }
  
  console.log(`\r   Progress: ${totalGames}/${totalGames} games (100%)`);
  return grand;
}

function printResults(grandStats) {
  const rows = Object.entries(grandStats).map(([file, g]) => {
    const games = g.finishes | 0;
    const wins = g.wins | 0;
    const winPct = games ? (100 * wins / games) : 0;
    const liarCalls = g.liarCalls | 0;
    const liarAcc = liarCalls ? (100 * (g.liarCorrect | 0) / liarCalls) : 0;
    const avgPlace = games ? (g.totalPlace / games) : null;
    const tScore = Math.round(g.placementScore || 0);
    const avgTS = games ? (g.placementScore / games) : 0;
    
    return {
      file, name: g.name || file.replace(/\.js$/, ''), games, wins, winPct,
      hands: g.hands | 0, bids: g.bids | 0, liarCalls, liarAcc, illegal: g.illegal | 0,
      diceLost: g.diceLost | 0, tScore, avgTS, avgPlace
    };
  });
  
  rows.sort((a, b) => {
    if (b.tScore !== a.tScore) return b.tScore - a.tScore;
    if (a.avgPlace !== b.avgPlace) {
      if (a.avgPlace == null) return 1;
      if (b.avgPlace == null) return -1;
      return a.avgPlace - b.avgPlace;
    }
    return b.winPct - a.winPct;
  });
  
  console.log('\n' + '='.repeat(100));
  console.log('📊 TOURNAMENT RESULTS');
  console.log('='.repeat(100));
  console.log(
    `${'Bot'.padEnd(20)} ${'Games'.padStart(6)} ${'Wins'.padStart(5)} ${'Win%'.padStart(6)} ` +
    `${'Avg TS'.padStart(8)} ${'TS'.padStart(6)} ${'Avg Pl'.padStart(7)} ${'LIAR Acc'.padStart(9)}`
  );
  console.log('-'.repeat(100));
  
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(20)} ${String(r.games).padStart(6)} ${String(r.wins).padStart(5)} ` +
      `${r.winPct.toFixed(1).padStart(5)}% ${r.avgTS.toFixed(2).padStart(8)} ${String(r.tScore).padStart(6)} ` +
      `${(r.avgPlace == null ? '—' : r.avgPlace.toFixed(2)).padStart(7)} ` +
      `${(isFinite(r.liarAcc) && r.liarAcc > 0 ? r.liarAcc.toFixed(1) + '%' : '—').padStart(9)}`
    );
  }
  
  console.log('='.repeat(100));
  
  const player3 = rows.find(r => r.file.includes('Player3') || r.name.includes('Player3'));
  if (player3) {
    console.log(`\n🎯 Player3 Results:`);
    console.log(`   Average Tournament Score: ${player3.avgTS.toFixed(2)}`);
    console.log(`   Win Rate: ${player3.winPct.toFixed(1)}%`);
    console.log(`   Average Place: ${player3.avgPlace ? player3.avgPlace.toFixed(2) : '—'}`);
    console.log(`   LIAR Accuracy: ${isFinite(player3.liarAcc) && player3.liarAcc > 0 ? player3.liarAcc.toFixed(1) + '%' : '—'}`);
  }
}

async function main() {
  const botFiles = ['Player3.js', 'Baseline.js'];
  const rounds = 2500;
  const seed = 99999;  // Different seed to test variance
  const maxPlayers = 5;
  
  console.log('🚀 Player3 Tournament Test');
  console.log('='.repeat(100));
  
  try {
    const grandStats = await runTournament(botFiles, rounds, seed, maxPlayers);
    printResults(grandStats);
  } catch (err) {
    console.error('\n❌ Tournament failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

