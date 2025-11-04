// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 3.0.0
// Authorship: Tournament System

// Core idea: Instead of assuming all unseen dice are uniformly random,
// we learn from each bid and refine our probability estimates about
// what faces each opponent likely holds.

// ---- Tunable Parameters ----
const FACE_PROB = 1/6;                    // Base probability for each face
const BELIEF_UPDATE_STRENGTH = 0.15;      // How much to trust bids (0-1)
const MIN_BELIEF = 0.05;                  // Minimum belief for any face
const MAX_BELIEF = 0.50;                  // Maximum belief for any face (prevents overconfidence)
const RAISE_TARGET = 0.35;                // Need at least 35% chance for our raise
const LIAR_THRESHOLD = 0.20;              // Call LIAR if current claim < 20% likely
const OPENING_CAP_FRAC = 0.75;            // Don't open above 75% of total dice
const BELIEF_DECAY = 0.98;                // Decay beliefs slightly each hand (forgetfulness)

// Initialize persistent state (survives across hands within a game)
if (!self.belief) {
  self.belief = {};  // belief[playerId][face] = probability player has this face
}

if (!self.beliefVersion) {
  self.beliefVersion = {};  // Track which hand we last updated each player
}

onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history } = state;

  // ---- 1) Unpack the round state ----
  const myDice = you.dice || [];
  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  const currentHand = history.length > 0 ? history[history.length - 1].hand || 1 : 1;

  // ---- 2) Count my own dice by face ----
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // ---- 3) Initialize/decay beliefs for current hand ----
  for (const p of players) {
    if (p.id === you.id) continue;  // Skip ourselves
    
    if (!self.belief[p.id]) {
      self.belief[p.id] = {};
      self.beliefVersion[p.id] = 0;
    }
    
    // If this is a new hand, apply slight decay (forgetfulness)
    if (self.beliefVersion[p.id] < currentHand) {
      for (let f = 1; f <= 6; f++) {
        if (!self.belief[p.id][f]) {
          self.belief[p.id][f] = FACE_PROB;  // Initialize to uniform
        } else {
          // Decay towards uniform (but keep some memory)
          self.belief[p.id][f] = self.belief[p.id][f] * BELIEF_DECAY + FACE_PROB * (1 - BELIEF_DECAY);
        }
      }
      self.beliefVersion[p.id] = currentHand;
    }
    
    // Ensure all faces initialized
    for (let f = 1; f <= 6; f++) {
      if (!self.belief[p.id][f]) {
        self.belief[p.id][f] = FACE_PROB;
      }
    }
  }

  // ---- 4) Update beliefs from recent history ----
  // Look at recent raises in this hand to update beliefs
  const recentRaises = history.filter(h => 
    h.action === 'raise' && 
    h.hand === currentHand &&
    h.actor !== you.id
  );
  
  for (const raise of recentRaises) {
    const actorId = raise.actor;
    const face = raise.face;
    
    if (self.belief[actorId] && face >= 1 && face <= 6) {
      // When a player bids on a face, they likely have at least one
      // Update belief: increase probability they have this face
      const currentBelief = self.belief[actorId][face] || FACE_PROB;
      const newBelief = currentBelief + BELIEF_UPDATE_STRENGTH * (1 - currentBelief);
      self.belief[actorId][face] = Math.max(MIN_BELIEF, Math.min(MAX_BELIEF, newBelief));
      
      // Also slightly decrease other faces (they can't have infinite dice)
      const decrease = BELIEF_UPDATE_STRENGTH * 0.3 / 5;  // Distribute decrease across 5 other faces
      for (let f = 1; f <= 6; f++) {
        if (f !== face && self.belief[actorId][f]) {
          self.belief[actorId][f] = Math.max(MIN_BELIEF, 
            self.belief[actorId][f] - decrease);
        }
      }
      
      // Normalize to keep probabilities reasonable
      let sum = 0;
      for (let f = 1; f <= 6; f++) sum += self.belief[actorId][f];
      if (sum > 1.5) {  // If beliefs got too high, normalize
        for (let f = 1; f <= 6; f++) {
          self.belief[actorId][f] = self.belief[actorId][f] / sum * 1.2;  // Slight over-normalization
        }
      }
    }
  }

  // ---- 5) Probability helpers using updated beliefs ----
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    let coeff = 1;
    for (let i = 1; i <= k; i++) {
      coeff = coeff * (n - (k - i)) / i;
    }
    return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }

  function binomTail(n, k, p) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    let term = binomPMF(n, k, p), sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-12) break;
    }
    return clamp01(sum);
  }

  // Calculate probability using updated beliefs instead of uniform assumption
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    
    if (needFromUnknown <= 0) return 1.0;
    
    // For each opponent, calculate expected dice of this face using updated beliefs
    let expectedUnknown = 0;
    
    for (const p of players) {
      if (p.id === you.id) continue;
      
      const belief = self.belief[p.id] ? (self.belief[p.id][face] || FACE_PROB) : FACE_PROB;
      expectedUnknown += p.diceCount * belief;
    }
    
    // Use weighted binomial: each opponent contributes based on their belief
    // This is more accurate than uniform assumption
    // For simplicity and accuracy, use the average probability weighted by dice count
    const avgProb = expectedUnknown / unknownDiceCount;
    if (avgProb <= 0 || avgProb >= 1) {
      return avgProb >= 1 ? 1.0 : 0.0;
    }
    
    // Use binomial with the weighted average probability
    return binomTail(unknownDiceCount, needFromUnknown, avgProb);
  }

  // ---- 6) Decide opening vs reacting ----
  
  // 6A) Opening: bid on the face I hold most, using updated beliefs
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }

    // Calculate expected total using updated beliefs
    let expectedUnknown = 0;
    for (const p of players) {
      if (p.id === you.id) continue;
      const belief = self.belief[p.id] ? (self.belief[p.id][bestFace] || FACE_PROB) : FACE_PROB;
      expectedUnknown += p.diceCount * belief;
    }
    
    let q = Math.max(1, Math.floor(bestCount + expectedUnknown));

    const openingCap = Math.min(totalDiceOnTable, Math.ceil(totalDiceOnTable * OPENING_CAP_FRAC));
    q = Math.min(q, openingCap);

    // Push upward while still meeting our target probability
    while (q + 1 <= openingCap && probabilityAtLeast(bestFace, q + 1) >= RAISE_TARGET) {
      q++;
    }

    postMessage({ action: 'raise', quantity: q, face: bestFace });
    return;
  }

  // 6B) Reacting: evaluate current bid and decide
  const { quantity: prevQty, face: prevFace } = currentBid;
  const probPrevTrue = probabilityAtLeast(prevFace, prevQty);

  // Construct minimal legal raise options
  const raiseCandidates = [{ quantity: prevQty + 1, face: prevFace }];
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseCandidates.push({ quantity: prevQty, face: f });
  }

  // Pick the cheapest raise that clears the target probability
  let chosenRaise = null;
  for (const r of raiseCandidates) {
    const p = probabilityAtLeast(r.face, r.quantity);
    if (p >= RAISE_TARGET) {
      chosenRaise = r;
      break;
    }
  }

  if (chosenRaise) {
    postMessage({ action: 'raise', quantity: chosenRaise.quantity, face: chosenRaise.face });
    return;
  }

  // No credible raise: call LIAR if the current bid is sufficiently unlikely
  if (probPrevTrue < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }

  // Otherwise, make the absolute minimal nudge (keeps the hand moving)
  const nudge = { quantity: prevQty + 1, face: prevFace };
  postMessage({ action: 'raise', quantity: nudge.quantity, face: nudge.face });
};
