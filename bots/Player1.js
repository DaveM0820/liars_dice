// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 1.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;
const LIAR_THRESHOLD = 0.20;

// Initialize beliefs if not exists
if (!self.belief) self.belief = {};

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;
  const history = state.history || [];

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  const myDiceCount = myDice.length;

  // Count my faces
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Initialize beliefs for each player
  for (const p of players) {
    if (!self.belief[p.id]) {
      self.belief[p.id] = Array(7).fill(0);
      // Initial belief: uniform distribution
      for (let f = 1; f <= 6; f++) {
        self.belief[p.id][f] = p.diceCount / 6;
      }
    }
  }

  // Update beliefs from history
  for (const h of history.slice(-50)) {
    if (h.action === 'raise' && h.actor && h.face) {
      const actorId = h.actor;
      const face = h.face;
      if (self.belief[actorId]) {
        // Increase belief that this player has this face
        self.belief[actorId][face] = Math.min(self.belief[actorId][face] + 0.3, players.find(p => p.id === actorId)?.diceCount || 5);
      }
    }
  }

  // Probability calculation using beliefs
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    
    if (needFromUnknown <= 0) return 1;
    if (needFromUnknown > unknownDiceCount) return 0;

    // Calculate expected count from beliefs
    let expectedCount = 0;
    for (const p of players) {
      if (p.id !== state.you.id) {
        expectedCount += self.belief[p.id]?.[face] || (p.diceCount / 6);
      }
    }

    // Normal approximation
    const mean = expectedCount;
    const variance = mean * (1 - FACE_PROB);
    const stddev = Math.sqrt(variance) || 1;
    
    if (needFromUnknown <= mean) return 1;
    const z = (needFromUnknown - mean) / stddev;
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

  // Reacting
  const { quantity: prevQty, face: prevFace } = currentBid;
  const claimProb = probabilityAtLeast(prevFace, prevQty);

  if (claimProb < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }

  // Try to raise
  const raiseQty = { quantity: prevQty + 1, face: prevFace };
  if (probabilityAtLeast(raiseQty.face, raiseQty.quantity) >= 0.40) {
    postMessage({ action: 'raise', quantity: raiseQty.quantity, face: raiseQty.face });
    return;
  }

  for (let f = prevFace + 1; f <= 6; f++) {
    if (probabilityAtLeast(f, prevQty) >= 0.40) {
      postMessage({ action: 'raise', quantity: prevQty, face: f });
      return;
    }
  }

  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
