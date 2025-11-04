// BOT_NAME: Probability Tuned
// Version 202535-001

// Summary: Uses simple probability to judge if a claim is likely. Raises when "likely enough",
//          otherwise calls LIAR. Calm opener on the face we hold most.
//
// Glossary:
// - totalDiceOnTable = dice across all players this hand
// - unknownDiceCount = dice you can't see (everyone else's)
// - myFaceCounts[f]  = how many dice you personally have showing face f (1..6)
//
// Rules assumed (your engine):
// - Legal raise = (quantity increases) OR (same quantity and face increases)
// - No wilds; face probability = 1/6
// - Time budget: < 200ms

const FACE_PROB = 1/6;
const OPENING_CONFIDENCE = 0.40;  // Only open/raise if ≥ 40% chance it's true
const CALL_LIAR_BELOW    = 0.22;  // Call LIAR if current claim has < 22% chance

onmessage = (e) => {
  const { state } = e.data;

  // ---------- Unpack the round state ----------
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  // ---------- Count your own dice by face ----------
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // ---------- Probability helpers ----------
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  // Binomial: probability of exactly k successes in n tries with prob p
  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    let coeff = 1;
    for (let i = 1; i <= k; i++) coeff = coeff * (n - (k - i)) / i;
    return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }

  // Probability of "at least k" successes
  function binomTail(n, k, p) {
    if (k <= 0) return 1;
    if (k > n)  return 0;
    let term = binomPMF(n, k, p), sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-12) break; // tiny add-ons — stop early
    }
    return clamp01(sum);
  }

  // Chance the table has at least `qty` of `face`
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
  }

  // ---------- Opening move ----------
  if (!currentBid) {
    // Start on the face we hold most, near the expectation
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) if (myFaceCounts[f] > bestCount) { bestFace = f; bestCount = myFaceCounts[f]; }

    const expectedUnknown = unknownDiceCount * FACE_PROB;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown));

    // push qty up while still "likely enough"
    while (probabilityAtLeast(bestFace, qty + 1) >= OPENING_CONFIDENCE) qty++;

    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  // ---------- Responding move ----------
  const { quantity: prevQty, face: prevFace } = currentBid;
  const claimLikely = probabilityAtLeast(prevFace, prevQty);

  // Try the *cheapest* legal raise that is still "likely enough"
  const raiseOptions = [{ quantity: prevQty + 1, face: prevFace }];
  for (let f = prevFace + 1; f <= 6; f++) raiseOptions.push({ quantity: prevQty, face: f });

  for (const r of raiseOptions) {
    const ok = probabilityAtLeast(r.face, r.quantity) >= OPENING_CONFIDENCE;
    if (ok) { postMessage({ action: 'raise', quantity: r.quantity, face: r.face }); return; }
  }

  // If the current claim is very unlikely, call LIAR; otherwise nudge minimally
  if (claimLikely < CALL_LIAR_BELOW) {
    postMessage({ action: 'liar' });
  } else {
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
  }
};
