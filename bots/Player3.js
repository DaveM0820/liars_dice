// BOT_NAME: Opponent Modeling Strategy
// Strategy: Tracks opponent behavior and adapts thresholds
// Version: 1.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;
const BASE_LIAR_THRESHOLD = 0.22;
const BASE_RAISE_THRESHOLD = 0.40;

// Initialize stats if not exists
if (!self.stats) self.stats = {};

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;
  const history = state.history || [];

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Initialize stats for each player
  for (const p of players) {
    if (!self.stats[p.id]) {
      self.stats[p.id] = { raises: 0, liars: 0, totalActions: 0, bluffFails: 0 };
    }
  }

  // Update stats from history
  for (const h of history.slice(-50)) {
    if (h.actor && h.action) {
      const stats = self.stats[h.actor];
      if (stats) {
        stats.totalActions++;
        if (h.action === 'raise') stats.raises++;
        if (h.action === 'liar') stats.liars++;
        if (h.action === 'resolution' && !h.claimTrue && h.actor === h.losers?.[0]) {
          stats.bluffFails++;
        }
      }
    }
  }

  // Profile opponents and adjust thresholds
  function getAdjustedThresholds() {
    let liarThreshold = BASE_LIAR_THRESHOLD;
    let raiseThreshold = BASE_RAISE_THRESHOLD;

    // Find previous bidder (if any)
    if (currentBid && history.length > 0) {
      const lastRaise = history.slice().reverse().find(h => h.action === 'raise');
      if (lastRaise && lastRaise.actor) {
        const prevStats = self.stats[lastRaise.actor];
        if (prevStats) {
          const bluffRate = prevStats.totalActions > 0 ? prevStats.bluffFails / prevStats.totalActions : 0;
          const raiseRate = prevStats.totalActions > 0 ? prevStats.raises / prevStats.totalActions : 0.5;
          
          // More skeptical of frequent bluffers
          if (bluffRate > 0.2 || raiseRate > 0.7) {
            liarThreshold = Math.min(0.30, BASE_LIAR_THRESHOLD + 0.05);
          }
        }
      }
    }

    return { liarThreshold, raiseThreshold };
  }

  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const need = Math.max(0, qty - mySupport);
    if (need <= 0) return 1;
    if (need > unknownDiceCount) return 0;
    
    // Binomial approximation
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
    const qty = Math.max(1, Math.floor(bestCount + expectedUnknown));
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  const { quantity: prevQty, face: prevFace } = currentBid;
  const { liarThreshold, raiseThreshold } = getAdjustedThresholds();
  const claimProb = probabilityAtLeast(prevFace, prevQty);

  if (claimProb < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }

  const raiseQtyProb = probabilityAtLeast(prevFace, prevQty + 1);
  if (raiseQtyProb >= raiseThreshold) {
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    return;
  }

  for (let f = prevFace + 1; f <= 6; f++) {
    if (probabilityAtLeast(f, prevQty) >= raiseThreshold) {
      postMessage({ action: 'raise', quantity: prevQty, face: f });
      return;
    }
  }

  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
