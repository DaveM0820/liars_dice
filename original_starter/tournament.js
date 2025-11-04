/* 
  Liar’s Dice — tournament.js
  Version 202535-004
  Changes:
  - Adds per-game action history (Option B) with anonymized seat IDs (P1..Pn)
  - Adds “−1” loss markers after LIAR resolution (animated; skipped in FAST; reduced in PRM)
*/

/* ---------- Tournament placement scoring ---------- */
const PLACEMENT_POINTS = [0, 100, 55, 35, 20, 5];
function pointsForPlace(place) {
  return PLACEMENT_POINTS[Math.min(place, PLACEMENT_POINTS.length - 1)] || 0;
}

/* ---------- DOM ---------- */
const CANVAS = document.getElementById('table');
const CTX    = CANVAS.getContext('2d', { alpha: true });
const LOG    = document.getElementById('log');

const pickerEl     = document.getElementById('bot-picker');
const selectAll    = document.getElementById('select-all');
const clearAll     = document.getElementById('clear-all');
const randomFive   = document.getElementById('random-five');
const roundsEl     = document.getElementById('rounds');
const seedEl       = document.getElementById('seed');
const delayEl      = document.getElementById('turnDelay');
const showDiceEl   = document.getElementById('showDice');
const maxPlayersEl = document.getElementById('maxPlayers');
const startBtn     = document.getElementById('start');
const pauseBtn     = document.getElementById('pause');
const stepBtn      = document.getElementById('step');
const sidebar      = document.getElementById('sidebar');
const sidebarToggle= document.getElementById('sidebar-toggle');
const resultsEl    = document.getElementById('results');
let fastCounter = document.getElementById('fastCounter');

const MOVE_TIMEOUT_MS = 200;

/* ---------- Runtime flags ---------- */
let isPaused = false;
let stepOnceResolver = null;
let isRunning = false;
let abortRequested = false;

const fastEl = document.getElementById('fastSim');
let FAST = !!(fastEl && fastEl.checked);
fastEl?.addEventListener('change', e => { FAST = !!e.target.checked; });

/* ---------- RNG ---------- */
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

/* ---------- Helpers ---------- */
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function turnDelayWait() {
  if (FAST) return;
  const start = performance.now();
  while (true) {
    if (isPaused) {
      await new Promise(resolve => { stepOnceResolver = resolve; });
      stepOnceResolver = null;
    }
    const targetMs = Math.max(0, Number(delayEl.value || 0));
    const desiredEnd = start + targetMs;
    const now = performance.now();
    if (now >= desiredEnd) break;
    await sleep(Math.min(50, desiredEnd - now));
  }
}
async function pauseGate() {
  while (isPaused) {
    if (stepOnceResolver) { stepOnceResolver(); stepOnceResolver = null; break; }
    await sleep(30);
  }
}
function log(line){
  if (FAST) return;
  LOG.textContent += line + "\n";
  LOG.scrollTop = LOG.scrollHeight;
}
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function canvasCssSize() {
  const r = CANVAS.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/* ---------- Bot Picker ---------- */
function renderBotPicker(files) {
  pickerEl.innerHTML = '';
  if (!files || files.length === 0) {
    pickerEl.textContent = 'No bots found in /bots';
    return;
  }
  files.forEach((file, idx) => {
    const id = `bot_${idx}`;
    const wrap = document.createElement('label');
    wrap.className = 'chip';
    wrap.style.userSelect = 'none';
    wrap.style.cursor = 'pointer';
    wrap.title = file;

    const dot = document.createElement('span');
    dot.className = 'chip__dot';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = file;
    cb.id = id;
    cb.style.marginRight = '6px';

    const txt = document.createElement('span');
    txt.textContent = file.replace(/\.js$/,'');
    txt.style.maxWidth = '12ch';
    txt.style.overflow = 'hidden';
    txt.style.textOverflow = 'ellipsis';

    wrap.appendChild(cb);
    wrap.appendChild(dot);
    wrap.appendChild(txt);
    pickerEl.appendChild(wrap);
  });
}
function selectedBots() {
  return Array.from(pickerEl.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}
function setAllBots(checked) {
  pickerEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
}
function chooseRandom(n) {
  const items = Array.from(pickerEl.querySelectorAll('input[type="checkbox"]'));
  items.forEach(cb => cb.checked = false);
  const shuffled = items.sort(() => Math.random() - 0.5).slice(0, n);
  shuffled.forEach(cb => cb.checked = true);
}

/* ---------- Workers ---------- */
async function loadBotText(file) {
  const res = await fetch('bots/' + file, { cache: 'no-store' });
  return await res.text();
}
function parseBotName(srcText, fallback) {
  const m1 = srcText.match(/^\s*\/\/\s*BOT_NAME:\s*(.+)\s*$/m);
  if (m1) return m1[1].trim();
  const m2 = srcText.match(/\bBOT_NAME\s*=\s*["']([^"']+)["']/);
  if (m2) return m2[1].trim();
  return fallback;
}
function makeBotWorker(srcText, seed) {
  const prologue = `
    const __seed = ${seed};
    const __rng = (${makeRNG.toString()})(__seed);
    Math.random = __rng;
    self.fetch = undefined;
    self.XMLHttpRequest = undefined;
    self.WebSocket = undefined;
    self.EventSource = undefined;
    self.importScripts = undefined;
    self.navigator = undefined;
    self.document = undefined;
    self.window = undefined;
  `;
  const blob = new Blob([prologue + '\n' + srcText], { type: 'text/javascript' });
  const url  = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'classic', name: 'bot' });
  worker.__blobUrl = url;
  return worker;
}
function terminateWorker(worker) {
  try { if (worker.__blobUrl) URL.revokeObjectURL(worker.__blobUrl); } catch {}
  try { worker.terminate(); } catch {}
}
function askBot(worker, state) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) { done = true; terminateWorker(worker); resolve({ action: 'liar' }); }
    }, MOVE_TIMEOUT_MS);

    const handler = (e) => {
      if (done) return;
      done = true; clearTimeout(t);
      worker.removeEventListener('message', handler);
      resolve(e.data);
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ state });
  });
}

/* ---------- Rendering ---------- */
const TABLE = {
  baseSeatW: 160,
  baseSeatH: 130,
  seatGap: 22,
  topY: 90,
  maxPerRow: 8
};

function drawRoundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}
function dieSizeForWidth(n, width, gap = 6, maxSize = 28, minSize = 14) {
  const avail = width - (n - 1) * gap;
  const s = Math.floor(avail / n);
  return Math.max(minSize, Math.min(maxSize, s));
}
function drawSeat(x, y, w, h, labelTop, diceCount, highlight=0){
  CTX.save();
  CTX.lineWidth = 3;
  CTX.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--mohawk-primary').trim() || '#7A003C';
  drawRoundedRect(CTX, x - 4, y - 4, w + 8, h + 8, 18);
  CTX.stroke();
  CTX.lineWidth = 2;
  CTX.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--mohawk-accent').trim() || '#C83E00';
  drawRoundedRect(CTX, x - 8, y - 8, w + 16, h + 16, 22);
  CTX.stroke();

  CTX.shadowColor = 'rgba(0,0,0,0.25)';
  CTX.shadowBlur = 12;
  CTX.shadowOffsetY = 8;

  CTX.fillStyle = '#eeeeee';
  drawRoundedRect(CTX, x, y, w, h, 14);
  CTX.fill();

  if (highlight > 0) {
    CTX.lineWidth = 4 + 2*Math.sin(highlight*3.14);
    CTX.strokeStyle = '#FDB515';
    drawRoundedRect(CTX, x-3, y-3, w+6, h+6, 16);
    CTX.stroke();
  }
  CTX.restore();

  CTX.fillStyle = '#111';
  CTX.font = 'bold 14px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial';
  CTX.textAlign = 'center';
  CTX.textBaseline = 'top';
  const safeLabel = truncateText(CTX, labelTop || '', w - 16);
  CTX.fillText(safeLabel, x + w/2, y + 8);

  CTX.font = '12px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial';
  CTX.textBaseline = 'alphabetic';
  CTX.fillText(`${diceCount} dice`, x + w/2, y + h - 10);
}
function drawDie(x, y, size, value) {
  const r = 4;
  CTX.save();
  CTX.fillStyle = '#ffffff';
  CTX.strokeStyle = '#d1d5db';
  CTX.lineWidth = 2;
  drawRoundedRect(CTX, x, y, size, size, r);
  CTX.fill(); CTX.stroke();

  CTX.fillStyle = '#111';
  const cx = x + size/2, cy = y + size/2;
  const o = size * 0.22;
  const spots = {
    1: [[0,0]],
    2: [[-o,-o],[o,o]],
    3: [[-o,-o],[0,0],[o,o]],
    4: [[-o,-o],[o,-o],[-o,o],[o,o]],
    5: [[-o,-o],[o,-o],[0,0],[-o,o],[o,o]],
    6: [[-o,-o],[o,-o],[-o,0],[o,0],[-o,o],[o,o]],
  }[value|0] || [];
  for (const [dx,dy] of spots) {
    CTX.beginPath();
    CTX.arc(cx + dx, cy + dy, size*0.07 + 0.4, 0, Math.PI*2);
    CTX.fill();
  }
  CTX.restore();
}
function drawDiceRow(values, x, y, width, dieSize) {
  const n = values.length;
  const gap = 6;
  const total = n*dieSize + (n-1)*gap;
  let sx = x + Math.max(0, (width - total)/2);
  for (let i=0;i<n;i++) {
    drawDie(sx, y, dieSize, values[i]);
    sx += dieSize + gap;
  }
}

/* seats render; stores rects for overlays */
function drawTable(players, currentBid, activeIdx = -1, pulseT = 0, revealedDice = null) {
  if (FAST) return;

  const { w: canvasW, h: canvasH } = canvasCssSize();
  CTX.clearRect(0, 0, canvasW, canvasH);

  const n = players.length;
  const perRow = Math.min(TABLE.maxPerRow, n);
  const rows = Math.ceil(n / perRow);

  const totalGaps = (perRow - 1) * TABLE.seatGap;
  const seatW = Math.min(TABLE.baseSeatW, Math.floor((canvasW - totalGaps - 40) / perRow));
  const seatH = TABLE.baseSeatH;

  const startY = TABLE.topY;
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    const countInRow = Math.min(perRow, n - r * perRow);
    const rowWidth = countInRow * seatW + (countInRow - 1) * TABLE.seatGap;
    let x = Math.floor((canvasW - rowWidth) / 2);
    const y = startY + r * (seatH + 28);

    for (let c = 0; c < countInRow; c++, idx++) {
      const p = players[idx];
      const hlt = (idx === activeIdx) ? (0.5 + 0.5 * Math.sin(pulseT * 6.283)) : 0;

      drawSeat(x, y, seatW, seatH, p.name ?? p.id, p.diceCount, hlt);

      if (revealedDice && revealedDice[idx] && revealedDice[idx].length) {
        const dieCount = revealedDice[idx].length;
        const ds = dieSizeForWidth(dieCount, seatW - 24, 6, 28, 14);
        drawDiceRow(revealedDice[idx], x + 12, y + 44, seatW - 24, ds);
      }

      p.__seatCenter = { x: x + seatW / 2, y: y };
      p.__seatRect   = { x, y, w: seatW, h: seatH };
      x += seatW + TABLE.seatGap;
    }
  }

  if (currentBid) {
    CTX.fillStyle = '#0a0';
    CTX.font = '600 18px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial';
    CTX.textAlign = 'center';
    CTX.textBaseline = 'top';
    const gridHeight = rows * (seatH + 28);
    const bidY = startY + gridHeight + 8;
    CTX.fillText(`Bid: ${currentBid.quantity} × ${currentBid.face}`, canvasW / 2, bidY);
  }
}

/* animated speech bubble (skipped in FAST) */
function drawSpeechBubble(text, px, py) {
  const { w: cssW, h: cssH } = canvasCssSize();
  const padX = 10, padY = 6;
  CTX.font = 'bold 16px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial';
  const metrics = CTX.measureText(text);
  const w = metrics.width + padX*2;
  const h = 28 + padY*2;
  const x = clamp(px - w/2, 10, cssW - w - 10);
  const y = clamp(py - h - 16, 10, cssH - h - 10);

  CTX.save();
  CTX.globalAlpha = 0.96;
  CTX.fillStyle = '#ffffff';
  CTX.strokeStyle = '#d1d5db';
  drawRoundedRect(CTX, x, y, w, h, 10);
  CTX.fill();
  CTX.lineWidth = 2;
  CTX.stroke();

  CTX.beginPath();
  CTX.moveTo(px, py-6);
  CTX.lineTo(px-8, y+h);
  CTX.lineTo(px+8, y+h);
  CTX.closePath();
  CTX.fill();
  CTX.stroke();
  CTX.restore();

  CTX.fillStyle = '#111';
  CTX.textAlign = 'center';
  CTX.textBaseline = 'middle';
  CTX.fillText(text, x + w/2, y + h/2);
}
async function animateDiceShake(players, durationMs = 400) {
  if (FAST) return;
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    await pauseGate();
    const t = (performance.now() - start) / durationMs;
    drawTable(players, null, -1, t, null);
    await sleep(16);
  }
}
async function showBubble(players, idx, text, ms = 600, revealedDice = null) {
  if (FAST) return;
  const start = performance.now();
  while (performance.now() - start < ms) {
    await pauseGate();
    const t = (performance.now() - start) / ms;
    drawTable(players, null, idx, t, revealedDice);
    const seat = players[idx].__seatCenter;
    drawSpeechBubble(text, seat.x, seat.y + TABLE.baseSeatH + 20);
    await sleep(16);
  }
}

/* NEW: “−1” loss markers after resolution */
const mediaPrefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
async function showLossMarkers(players, loserIdxs, ms = 1000) {
  if (FAST) return; // no effects in fast mode
  if (!loserIdxs || loserIdxs.length === 0) return;

  const start = performance.now();
  const drawFrame = () => {
    drawTable(players, null);
    // overlay markers
    for (const idx of loserIdxs) {
      const rect = players[idx].__seatRect;
      if (!rect) continue;
      const cx = rect.x + rect.w - 22;
      const cy = rect.y + 22;

      CTX.save();
      // animation: fade/scale unless PRM
      let alpha = 1, scale = 1;
      if (!mediaPrefersReducedMotion) {
        const t = clamp((performance.now() - start) / ms, 0, 1);
        alpha = 1 - t;
        scale = 1 + 0.15 * (1 - t);
      }
      CTX.globalAlpha = alpha;
      CTX.translate(cx, cy);
      CTX.scale(scale, scale);

      // red circle
      CTX.beginPath();
      CTX.arc(0, 0, 14, 0, Math.PI*2);
      CTX.fillStyle = '#d90429';
      CTX.fill();
      // text
      CTX.font = 'bold 14px system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial';
      CTX.fillStyle = '#ffffff';
      CTX.textAlign = 'center';
      CTX.textBaseline = 'middle';
      CTX.fillText('−1', 0, 1);
      CTX.restore();
    }
  };

  if (mediaPrefersReducedMotion) {
    drawFrame();
    await sleep(200);
    return;
  }

  while (performance.now() - start < ms) {
    await pauseGate();
    drawFrame();
    await sleep(16);
  }
}

/* ---------- Rules ---------- */
function legalRaise(prev, q, f) {
  if (!prev) return true;
  const { quantity, face } = prev;
  return (q > quantity) || (q === quantity && f > face);
}
function isValidBid(q, f) {
  return Number.isFinite(q) && Number.isFinite(f) && q >= 1 && f >= 1 && f <= 6;
}
function rollDice(rng, n) {
  const dice = [];
  for (let i=0;i<n;i++) dice.push(1 + Math.floor(rng()*6));
  return dice;
}
function countFace(allDice, face) {
  let c = 0; for (const xs of allDice) for (const d of xs) if (d === face) c++;
  return c;
}

/* ---------- Stats scaffolding ---------- */
function makeStatsFor(botFiles){
  const s = {};
  for (const f of botFiles) {
    s[f] = {
      name: f.replace(/\.js$/,''),
      hands: 0, wins: 0,
      bids: 0, liarCalls: 0, liarCorrect: 0, illegal: 0, diceLost: 0,
      finishes: 0, totalPlace: 0, placementScore: 0
    };
  }
  return s;
}

/* ---------- One Game (many hands) — with per-hand HISTORY ---------- */
async function playHand(botFiles, seed = 42, showDice = false) {
  const rng = makeRNG(seed);

  // Load sources/workers and names
  const sources = await Promise.all(botFiles.map(loadBotText));
  const names   = sources.map((txt, i) => parseBotName(txt, botFiles[i].replace(/\.js$/,'')));
  const workers = sources.map((txt, i) => makeBotWorker(txt, seed + i * 101));

  // Seats are anonymized per game: P1..Pn in table order
  const seats = botFiles.map((file, i) => ({
    player: { id: 'P' + (i + 1), name: names[i], file, diceCount: 5 },
    worker: workers[i]
  }));
  const players = () => seats.map(s => s.player);
  const aliveCount = () => players().filter(p => p.diceCount > 0).length;

  // Per-file in-game stats
  const stats = makeStatsFor(botFiles);
  botFiles.forEach((f, i) => { stats[f].name = names[i]; });

  // Elimination tracking (for placements)
  const eliminations = [];
  let stepSerial = 0;
  function markElims(elimSet, handNo){
    const tag = ++stepSerial;
    for (const idx of elimSet) {
      const pl = seats[idx].player;
      eliminations.push({ file: pl.file, seatIdx: idx, handNo, stepTag: tag });
    }
  }
  function dropDieAndCollectElims(indicesToDrop, handNo){
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

  // Game loop
  drawTable(players(), null);
  let startIdx = 0; // starter rotates to caller+1 after each hand

  // Rolling action history (exposed to bots). Keep recent ~200 actions.
  const history = [];
  const pushHistory = (rec) => {
    history.push(rec);
    if (history.length > 200) history.shift();
  };

  let handCount = 0;
  while (aliveCount() > 1) {
    handCount++;
    botFiles.forEach(f => stats[f].hands++);

    log(`-- Hand ${handCount} --`);
    await animateDiceShake(players(), 350);

    const hidden = players().map(p => rollDice(rng, p.diceCount));

    // find first active seat starting from startIdx
    const N = seats.length;
    let turnIdx = startIdx;
    let guardSkip = 0;
    while (players()[turnIdx % N].diceCount === 0 && guardSkip++ < N) { turnIdx++; }

    let currentBid = null;
    let turnInHand = 0;

    let turnGuard = 0;
    const TURN_GUARD_MAX = 200;

    while (true) {
      await pauseGate();

      if (turnGuard++ > TURN_GUARD_MAX) {
        log(`Turn guard tripped — forcing progress.`);
        let i = turnIdx % N, tries = 0;
        while (players()[i].diceCount === 0 && tries++ < N) i = (i + 1) % N;
        dropDieAndCollectElims([i], handCount);
        pushHistory({ hand: handCount, turn: ++turnInHand, action: 'guard-drop', targets: ['P'+(i+1)] });
        break;
      }

      const active = turnIdx % N;
      const seat   = seats[active];
      const p      = seat.player;
      const file   = p.file;

      if (p.diceCount === 0) { turnIdx++; continue; }

      drawTable(players(), currentBid, active, performance.now()/1000, showDice ? players().map(()=>[]) : null);
      await turnDelayWait();

      // Worker state (Option B): anonymized per-game IDs, ordered by table seats
      const state = {
        you: { id: p.id, dice: hidden[active] },
        players: players().map(q => ({ id: q.id, diceCount: q.diceCount })),
        currentBid,
        // NEW: rolling action history (recent 200 entries across hands in this game)
        history, 
        rules: { faces:[1,2,3,4,5,6], mustIncreaseQuantityOrFace: true,
                 callRule: "if-true:caller-loses-1; if-false:others-lose-1" },
        seed: seed + handCount * 1000 + turnIdx
      };

      const action = await askBot(seat.worker, state);

      if (action?.action === 'liar') {
        stats[file].liarCalls++;
        pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'liar', on: currentBid });

        await showBubble(players(), active, 'LIAR!', 650, showDice ? hidden : null);

        const qty   = currentBid?.quantity ?? 0;
        const face  = currentBid?.face ?? 1;
        const total = countFace(hidden, face);
        const claimTrue = total >= qty;
        if (claimTrue) stats[file].liarCorrect++;

        log(`${p.id} calls LIAR on ${qty}×${face} — total=${total} → ${claimTrue ? 'TRUE' : 'FALSE'}`);

        // figure losers
        let losers = [];
        if (claimTrue) {
          losers = [active];
          dropDieAndCollectElims(losers, handCount);
        } else {
          const others = [];
          for (let i=0;i<N;i++) if (i !== active && players()[i].diceCount > 0) others.push(i);
          losers = others;
          dropDieAndCollectElims(losers, handCount);
        }

        // history: resolution
        pushHistory({
          hand: handCount, turn: ++turnInHand, action: 'resolution',
          on: currentBid, claimTrue, losers: losers.map(i=>'P'+(i+1))
        });

        // show −1 markers
        await showLossMarkers(players(), losers, 1000);

        drawTable(players(), null);
        await turnDelayWait();

        startIdx = (active + 1) % N; // next hand starts to the left of caller
        break; // end of hand
      } else {
        // normalize raise
        const q = (action?.quantity | 0), f = (action?.face | 0);
        const legal = currentBid
          ? ((q > currentBid.quantity) || (q === currentBid.quantity && f > currentBid.face))
          : (q >= 1 && f >= 1 && f <= 6);
        const bid = legal ? { quantity: q, face: f } : null;

        if (!bid) {
          stats[file].illegal++;
          pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'illegal' });
          await showBubble(players(), active, 'Illegal bid → LIAR', 700, showDice ? hidden : null);

          const total = currentBid ? countFace(hidden, currentBid.face) : 0;
          let losers = [];
          if (currentBid && total >= currentBid.quantity) {
            losers = [active];
            dropDieAndCollectElims(losers, handCount);
          } else {
            const others = [];
            for (let i=0;i<N;i++) if (i !== active && players()[i].diceCount > 0) others.push(i);
            losers = others;
            dropDieAndCollectElims(losers, handCount);
          }

          pushHistory({
            hand: handCount, turn: ++turnInHand, action: 'resolution-illegal',
            on: currentBid ?? null,
            losers: losers.map(i=>'P'+(i+1))
          });

          await showLossMarkers(players(), losers, 1000);

          drawTable(players(), null);
          await turnDelayWait();

          startIdx = (active + 1) % N;
          break;
        }

        // legal raise
        stats[file].bids++;
        currentBid = bid;
        pushHistory({ hand: handCount, turn: ++turnInHand, actor: p.id, pos: active, action: 'raise', quantity: q, face: f });

        log(`${p.id} raises to ${bid.quantity}×${bid.face}`);
        await showBubble(players(), active, `${bid.quantity} × ${bid.face}`, 600, showDice ? hidden : null);
        drawTable(players(), currentBid, active, performance.now()/1000, showDice ? hidden : null);
      }

      turnIdx++;
    } // turn loop
  } // while >1 alive

  drawTable(players(), null);
  const winner = players().find(p => p.diceCount > 0);
  if (winner) {
    stats[winner.file].wins++;
    log(`Winner: ${winner.name || winner.id}`);
  } else {
    log(`Winner: None`);
  }

  // placements with simultaneous elims
  const allFiles = botFiles.slice();
  const outSet = new Set(eliminations.map(e => e.file));
  const stillAlive = allFiles.filter(f => !outSet.has(f));
  const byTag = new Map();
  for (const e of eliminations) {
    if (!byTag.has(e.stepTag)) byTag.set(e.stepTag, []);
    byTag.get(e.stepTag).push(e.file);
  }
  const orderedGroups = [...byTag.keys()].sort((a,b)=>a-b).map(tag => byTag.get(tag));

  const placements = [];
  let remainingPlaces = allFiles.length;
  for (let gi=0; gi<orderedGroups.length; gi++) {
    const group = orderedGroups[gi];
    const lo = remainingPlaces - group.length + 1;
    const hi = remainingPlaces;
    const sharedPoints = [];
    for (let place=lo; place<=hi; place++) sharedPoints.push(pointsForPlace(place));
    const avgPoints = sharedPoints.reduce((a,b)=>a+b,0) / sharedPoints.length;
    for (const f of group) {
      placements.push({ file: f, placeRange: [lo, hi], points: avgPoints });
    }
    remainingPlaces -= group.length;
  }
  if (stillAlive.length > 0) {
    const lo = 1;
    const hi = remainingPlaces;
    const sharedPoints = [];
    for (let place=lo; place<=hi; place++) sharedPoints.push(pointsForPlace(place));
    const avgPoints = sharedPoints.reduce((a,b)=>a+b,0) / sharedPoints.length;
    for (const f of stillAlive) {
      placements.push({ file: f, placeRange: [lo, hi], points: avgPoints });
    }
  }

  // Cleanup workers
  for (const w of workers) terminateWorker(w);

  return { winnerFile: winner?.file || null, stats, placements };
}

/* ---------- Schedule ---------- */
function buildSchedule(allBots, rounds, maxPlayers, baseSeed) {
  const schedule = [];
  const K = 9973;
  for (let r=0; r<rounds; r++) {
    const rng = makeRNG(baseSeed + r*K);
    const shuffled = allBots.slice();
    shuffleInPlace(shuffled, rng);
    const groups = [];
    for (let i=0; i<shuffled.length; i += maxPlayers) {
      groups.push(shuffled.slice(i, i+maxPlayers));
    }
    schedule.push({ round: r+1, groups });
  }
  return schedule;
}

/* ---------- Results ---------- */
function renderResultsTable(grandStats, containerId = 'results') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const rows = Object.entries(grandStats).map(([file, g]) => {
    const games = g.finishes | 0;
    const wins  = g.wins | 0;
    const winPct = games ? (100 * wins / games) : 0;
    const liarCalls = g.liarCalls | 0;
    const liarAcc = liarCalls ? (100 * (g.liarCorrect|0) / liarCalls) : 0;
    const avgPlace = games ? (g.totalPlace / games) : null;
    const tScore = Math.round(g.placementScore || 0);
    const avgTS  = games ? (g.placementScore / games) : 0;

    return {
      file,
      name: g.name || file.replace(/\.js$/,''),
      hands: g.hands | 0,
      games,
      wins,
      winPct,
      bids: g.bids | 0,
      liarCalls,
      liarAcc,
      illegal: g.illegal | 0,
      diceLost: g.diceLost | 0,
      tScore,
      avgTS,
      avgPlace
    };
  });

  // Default sort: TS desc, Avg Place asc, Win% desc
  rows.sort((a,b)=>{
    if (b.tScore !== a.tScore) return b.tScore - a.tScore;
    if (a.avgPlace !== b.avgPlace) {
      if (a.avgPlace == null) return 1;
      if (b.avgPlace == null) return -1;
      return a.avgPlace - b.avgPlace;
    }
    return b.winPct - a.winPct;
  });

  const table = document.createElement('table');
  table.className = 'results-table';

  const headers = [
    { key:'name',      label:'Bot',              align:'left',  fmt:v=>v },
    { key:'games',     label:'Games',            align:'right', fmt:v=>v },
    { key:'wins',      label:'Wins',             align:'right', fmt:v=>v },
    { key:'winPct',    label:'Win %',            align:'right', fmt:v=> (v? v.toFixed(1)+'%' : '—') },
    { key:'hands',     label:'Hands',            align:'right', fmt:v=>v },
    { key:'bids',      label:'Bids',             align:'right', fmt:v=>v },
    { key:'liarCalls', label:'LIAR Calls',       align:'right', fmt:v=>v },
    { key:'liarAcc',   label:'LIAR Accuracy',    align:'right', fmt:v=> (isFinite(v)&&v>0? v.toFixed(1)+'%' : '—') },
    { key:'illegal',   label:'Illegal',          align:'right', fmt:v=>v },
    { key:'diceLost',  label:'Dice Lost',        align:'right', fmt:v=>v },
    { key:'tScore',    label:'Tournament Score', align:'right', fmt:v=>v },
    { key:'avgTS',     label:'Avg TS',           align:'right', fmt:v=> (isFinite(v)? v.toFixed(2) : '—') },
    { key:'avgPlace',  label:'Avg Place',        align:'right', fmt:v=> (v==null ? '—' : v.toFixed(2)) },
  ];

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach((h)=>{
    const th = document.createElement('th');
    th.textContent = h.label;
    th.style.textAlign = h.align === 'right' ? 'right' : 'left';
    th.style.cursor = 'pointer';
    th.dataset.key = h.key;
    th.addEventListener('click', () => {
      const key = h.key;
      const currentDir = th.dataset.dir || 'desc';
      const nextDir = currentDir === 'desc' ? 'asc' : 'desc';
      rows.sort((a,b)=>{
        const av = a[key]; const bv = b[key];
        if (av == null && bv != null) return 1;
        if (bv == null && av != null) return -1;
        let cmp;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        return nextDir === 'asc' ? cmp : -cmp;
      });
      thead.querySelectorAll('th').forEach(x => { if (x!==th) x.dataset.dir=''; });
      th.dataset.dir = nextDir;
      renderBody();
    });
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  function cell(val, align, fmt) {
    const td = document.createElement('td');
    td.style.textAlign = align === 'right' ? 'right' : 'left';
    td.textContent = fmt(val);
    return td;
  }
  function renderBody() {
    tbody.innerHTML = '';
    rows.forEach(r=>{
      const tr = document.createElement('tr');
      headers.forEach(h=>{
        tr.appendChild(cell(r[h.key], h.align, h.fmt));
      });
      tbody.appendChild(tr);
    });
  }
  renderBody();
  table.appendChild(tbody);

  el.innerHTML = '<h2>Overall Results</h2>';
  el.appendChild(table);
}

/* ---------- Tournament runner ---------- */
async function runTournament(botFiles, rounds, baseSeed, maxPlayers, showDice = false) {
  if (!botFiles || botFiles.length < 2) {
    log('Need at least two bots selected.');
    return;
  }

  const grand = makeStatsFor(botFiles);
  resultsEl && (resultsEl.innerHTML = '');
  LOG.textContent = '';

  const schedule = buildSchedule(botFiles, rounds, Math.max(2, maxPlayers|0), baseSeed|0);

  // FAST progress counter
  let totalGames = 0;
  for (const entry of schedule) totalGames += entry.groups.length;
  let playedGames = 0;
  if (!fastCounter) {
    fastCounter = document.createElement('div');
    fastCounter.id = 'fastCounter';
    fastCounter.style.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial';
    fastCounter.style.margin = '6px 0';
    fastCounter.style.opacity = '0.9';
    (resultsEl?.parentElement || document.body).insertBefore(fastCounter, resultsEl || null);
  }
  fastCounter.textContent = FAST ? `Game 0 / ${totalGames}` : '';

  for (const entry of schedule) {
    if (abortRequested) break;
    log(`=== Round ${entry.round}/${rounds} ===`);
    for (let gi = 0; gi < entry.groups.length; gi++) {
      if (abortRequested) break;
      const group = entry.groups[gi];
      log(`Group ${gi+1}/${entry.groups.length}: ${group.map(s => s.replace(/\.js$/,'')).join(', ')}`);

      const roundSeed = (baseSeed >>> 0) + (entry.round * 1337) + gi * 17;

      if (FAST) {
        playedGames++;
        fastCounter.textContent = `Game ${playedGames} / ${totalGames}`;
      }

      const { stats, placements } = await playHand(group, roundSeed, !!showDice);

      for (const f of Object.keys(stats)) {
        const g = grand[f], s = stats[f];
        g.name         = s.name || g.name;
        g.hands       += s.hands;
        g.wins        += s.wins;
        g.bids        += s.bids;
        g.liarCalls   += s.liarCalls;
        g.liarCorrect += s.liarCorrect;
        g.illegal     += s.illegal;
        g.diceLost    += s.diceLost;
      }

      for (const p of placements) {
        const g = grand[p.file];
        g.placementScore += p.points;
        const midPlace = (p.placeRange[0] + p.placeRange[1]) / 2;
        g.totalPlace += midPlace;
        g.finishes   += 1;
      }
    }
    log(`=== End of Round ${entry.round} ===`);
  }

  renderResultsTable(grand);
}

/* ---------- Pause / Resume / Step ---------- */
pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  pauseBtn.setAttribute('aria-pressed', String(isPaused));
  pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  startBtn.disabled = !isPaused && isRunning;
});
stepBtn.addEventListener('click', () => {
  if (!isPaused) return;
  if (stepOnceResolver) stepOnceResolver();
});

/* ---------- Wire Controls ---------- */
selectAll.addEventListener('click', () => setAllBots(true));
clearAll.addEventListener('click', () => setAllBots(false));
randomFive.addEventListener('click', () => chooseRandom(5));
sidebarToggle?.addEventListener('click', () => {
  const collapsed = sidebar.classList.toggle('is-collapsed');
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.textContent = collapsed ? 'Show' : 'Hide';
});

startBtn.addEventListener('click', async () => {
  if (isPaused && isRunning) {
    abortRequested = true;
    await sleep(50);
  }
  if (isRunning) return;

  isPaused = false;
  pauseBtn.setAttribute('aria-pressed', 'false');
  pauseBtn.textContent = 'Pause';

  const picked     = selectedBots();
  const rounds     = Math.max(1, Number(roundsEl.value || 1));
  const seed       = Number(seedEl.value || 42);
  const maxPlayers = Math.max(2, Number(maxPlayersEl.value || 6));
  const showDice   = !!showDiceEl.checked;

  isRunning = true;
  abortRequested = false;
  startBtn.disabled = true;

  try {
    await runTournament(picked, rounds, seed, maxPlayers, showDice);
  } finally {
    isRunning = false;
    startBtn.disabled = false;
    if (isPaused) startBtn.disabled = false;
  }
});

/* ---------- Init / responsive canvas ---------- */
(function init() {
  renderBotPicker(window.BOT_FILES || []);

  if (!fastCounter) {
    fastCounter = document.createElement('div');
    fastCounter.id = 'fastCounter';
    fastCounter.style.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial';
    fastCounter.style.margin = '6px 0';
    fastCounter.style.opacity = '0.9';
    (resultsEl?.parentElement || document.body).insertBefore(fastCounter, resultsEl || null);
  }
  fastCounter.textContent = '';

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resizeCanvas() {
    const stage = document.getElementById('stage');
    const cssWidth = Math.min(1100, (stage ? stage.clientWidth : CANVAS.parentElement.clientWidth) - 24);
    const baseRatio = 420 / 1000;
    CANVAS.width  = Math.floor(cssWidth * dpr);
    CANVAS.height = Math.floor(cssWidth * baseRatio * dpr);
    CANVAS.style.width  = cssWidth + 'px';
    CANVAS.style.height = (cssWidth*baseRatio) + 'px';
    CTX.setTransform(dpr, 0, 0, dpr, 0, 0);

    const previewPlayers = (window.BOT_FILES||[]).slice(0,6).map((f,i)=>({id:'P'+(i+1), name:f.replace(/\.js$/,''), diceCount:5}));
    drawTable(previewPlayers, null);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
})();
