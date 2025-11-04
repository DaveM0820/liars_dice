// BOT_NAME: Equilibrium Strategy
// Strategy: Game-theoretic equilibrium approach (currently with baseline fallback)
// Version: 1.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;
const LIAR_THRESHOLD = 0.20;
const RAISE_THRESHOLD = 0.40;

// Initialize policy if not exists
if (!self.equilibriumPolicy) self.equilibriumPolicy = {};

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Create state key for policy lookup
  const myDiceSorted = [...myDice].sort().join(',');
  const currentBidStr = currentBid ? `${currentBid.quantity}x${currentBid.face}` : 'null';
  const diceCounts = players.map(p => p.diceCount).join(',');
  const stateKey = `${myDiceSorted}|${currentBidStr}|${diceCounts}`;

  // Check if we have a policy for this state (currently empty, so always falls back)
  const policy = self.equilibriumPolicy[stateKey];

  // Fallback to probability-based strategy
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const need = Math.max(0, qty - mySupport);
    if (need <= 0) return 1;
    if (need > unknownDiceCount) return 0;
    
    // Binomial tail approximation
    const mean = unknownDiceCount * FACE_PROB;
    const variance = mean * (1 - FACE_PROB);
    const stddev = Math.sqrt(variance) || 1;
    if (need <= mean) return 1;
    const z = (need - mean) / stddev;
    return Math.max(0, Math.min(1, Math.exp(-0.5 * z * z)));
  }

  // Opening move
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }
    const expectedUnknown = unknownDiceCount * FACE_PROB;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown));
    while (qty + 1 <= totalDiceOnTable && probabilityAtLeast(bestFace, qty + 1) >= RAISE_THRESHOLD) qty++;
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  const { quantity: prevQty, face: prevFace } = currentBid;
  const claimProb = probabilityAtLeast(prevFace, prevQty);

  if (claimProb < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }

  const raiseQtyProb = probabilityAtLeast(prevFace, prevQty + 1);
  if (raiseQtyProb >= RAISE_THRESHOLD) {
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    return;
  }

  for (let f = prevFace + 1; f <= 6; f++) {
    if (probabilityAtLeast(f, prevQty) >= RAISE_THRESHOLD) {
      postMessage({ action: 'raise', quantity: prevQty, face: f });
      return;
    }
  }

  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
