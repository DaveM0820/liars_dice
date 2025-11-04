// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 3.1.0
// Authorship: Tournament System

// Bayesian Inference Strategy
// - Tracks beliefs about each opponent's dice distribution
// - Updates beliefs when opponents bid (they likely have the face they bid on)
// - Uses refined probability estimates for better decision-making

const FACE_PROB = 1/6;  // Base probability (prior)
const RAISE_TARGET = 0.36;  // Need at least 36% chance for our raise
const LIAR_THRESHOLD = 0.19;  // Call LIAR if current claim < 19% likely
const BELIEF_UPDATE_STRENGTH = 0.20;  // How much to update beliefs (0-1)
const MIN_BELIEF = 0.08;  // Minimum belief per face (prevents overconfidence)
const MAX_BELIEF = 0.45;  // Maximum belief per face (prevents extreme beliefs)

// Persistent belief storage (per game instance)
let beliefStore = null;
let lastHistoryLength = 0;  // Track which history entries we've processed

function initBeliefs(players) {
  // Initialize beliefs: each opponent has uniform distribution
  const beliefs = {};
  for (const p of players) {
    if (!p.id) continue;
    beliefs[p.id] = {};
    for (let face = 1; face <= 6; face++) {
      // Expected dice per face = diceCount / 6
      beliefs[p.id][face] = (p.diceCount || 5) / 6;
    }
  }
  return beliefs;
}

function updateBeliefsOnBid(beliefs, playerId, face, diceCount) {
  // When player bids on face, increase belief they have that face
  if (!beliefs[playerId] || !face || face < 1 || face > 6) return;
  
  const currentBelief = beliefs[playerId][face] || (diceCount / 6);
  
  // Bayesian update: increase belief for bid face
  // Stronger update for higher quantity bids (more confidence)
  const baseUpdate = BELIEF_UPDATE_STRENGTH * (diceCount / 6);
  const newBelief = Math.min(MAX_BELIEF, Math.max(MIN_BELIEF, currentBelief + baseUpdate));
  
  // Adjust other faces to maintain reasonable total (normalize)
  const excess = newBelief - currentBelief;
  const otherFaces = [1, 2, 3, 4, 5, 6].filter(f => f !== face);
  const reductionPerFace = excess / otherFaces.length;
  
  for (const f of otherFaces) {
    const current = beliefs[playerId][f] || (diceCount / 6);
    beliefs[playerId][f] = Math.max(MIN_BELIEF, current - reductionPerFace);
  }
  
  beliefs[playerId][face] = newBelief;
}

function getExpectedDiceForFace(beliefs, playerId, face) {
  // Get expected number of dice showing 'face' for this opponent
  if (!beliefs[playerId] || !face) return 0;
  return Math.max(0, beliefs[playerId][face] || 0);
}

function probabilityAtLeast(myFaceCounts, beliefs, players, myId, face, qty, unknownDiceCount) {
  // Calculate probability using Bayesian beliefs instead of uniform assumption
  const mySupport = myFaceCounts[face] || 0;
  const needFromUnknown = Math.max(0, qty - mySupport);
  
  if (needFromUnknown <= 0) return 1.0;
  if (needFromUnknown > unknownDiceCount) return 0.0;
  
  // Sum expected dice from all opponents based on beliefs
  let totalExpectedUnknown = 0;
  for (const p of players) {
    if (!p.id || p.id === myId) continue;
    totalExpectedUnknown += getExpectedDiceForFace(beliefs, p.id, face);
  }
  
  // Fallback to uniform if beliefs haven't been initialized properly
  if (totalExpectedUnknown <= 0) {
    totalExpectedUnknown = unknownDiceCount * FACE_PROB;
  }
  
  // Use adjusted probability based on expected value
  // Clamp to reasonable range to avoid edge cases
  const adjustedProb = Math.max(FACE_PROB * 0.5, Math.min(0.5, totalExpectedUnknown / unknownDiceCount));
  
  // Binomial tail probability
  return binomTail(unknownDiceCount, needFromUnknown, adjustedProb);
}

function binomPMF(n, k, p) {
  if (k < 0 || k > n || p <= 0 || p >= 1) return 0;
  if (k === 0) return Math.pow(1 - p, n);
  if (k === n) return Math.pow(p, n);
  
  let coeff = 1;
  for (let i = 1; i <= k; i++) {
    coeff = coeff * (n - (k - i)) / i;
  }
  return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function binomTail(n, k, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  
  let term = binomPMF(n, k, p);
  let sum = term;
  
  for (let x = k + 1; x <= n; x++) {
    term = term * ((n - (x - 1)) / x) * (p / (1 - p));
    sum += term;
    if (term < 1e-12) break;
  }
  
  return Math.max(0, Math.min(1, sum));
}

onmessage = (e) => {
  const { state } = e.data;
  
  const myDice = state.you.dice || [];
  const myId = state.you.id;
  const players = state.players || [];
  const currentBid = state.currentBid || null;
  const history = state.history || [];
  
  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  
  // Initialize or retrieve beliefs (reset if players changed)
  if (!beliefStore) {
    beliefStore = initBeliefs(players);
    lastHistoryLength = 0;
  }
  
  // Check if we need to update beliefs from new history entries
  if (history.length > lastHistoryLength) {
    // Process only new history entries
    const newBids = history.slice(lastHistoryLength).filter(h => 
      h.action === 'raise' && h.actor && h.actor !== myId && h.face
    );
    
    for (const bid of newBids) {
      const player = players.find(p => p.id === bid.actor);
      if (player && bid.face && bid.quantity) {
        updateBeliefsOnBid(beliefStore, bid.actor, bid.face, player.diceCount);
      }
    }
    
    lastHistoryLength = history.length;
  }
  
  // Also update beliefs when currentBid exists (it's the most recent bid)
  if (currentBid && currentBid.face) {
    // Try to find who made the current bid from recent history
    const recentHistory = history.slice(-5);
    const currentBidder = recentHistory.find(h => 
      h.action === 'raise' && 
      h.face === currentBid.face && 
      h.quantity === currentBid.quantity &&
      h.actor !== myId
    );
    
    if (currentBidder && currentBidder.actor) {
      const player = players.find(p => p.id === currentBidder.actor);
      if (player) {
        updateBeliefsOnBid(beliefStore, currentBidder.actor, currentBid.face, player.diceCount);
      }
    }
  }
  
  // Count my own dice by face
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) {
    if (d >= 1 && d <= 6) myFaceCounts[d]++;
  }
  
  // Opening move
  if (!currentBid) {
    // Find best face (most dice)
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }
    
    // Calculate expected total using beliefs
    let expectedTotal = bestCount;
    for (const p of players) {
      if (p.id !== myId) {
        expectedTotal += getExpectedDiceForFace(beliefStore, p.id, bestFace);
      }
    }
    
    // Start near expectation, but be conservative
    let qty = Math.max(1, Math.floor(expectedTotal * 0.85));
    
    // Push up while still meeting target probability
    while (qty + 1 <= totalDiceOnTable && 
           probabilityAtLeast(myFaceCounts, beliefStore, players, myId, bestFace, qty + 1, unknownDiceCount) >= RAISE_TARGET) {
      qty++;
    }
    
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }
  
  // Reacting to current bid
  const { quantity: prevQty, face: prevFace } = currentBid;
  
  // Update beliefs about the current bidder (if we can identify them)
  // Note: In the history, we might not know who made currentBid, so we skip this update
  // But we can still use the bid information in our probability calculation
  
  // Calculate probability of current bid being true
  const claimProb = probabilityAtLeast(myFaceCounts, beliefStore, players, myId, prevFace, prevQty, unknownDiceCount);
  
  // If very unlikely, call LIAR
  if (claimProb < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Try to find a legal raise that meets our target probability
  const raiseCandidates = [
    { quantity: prevQty + 1, face: prevFace }  // Increase quantity
  ];
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseCandidates.push({ quantity: prevQty, face: f });  // Increase face
  }
  
  // Find cheapest raise that meets target
  for (const r of raiseCandidates) {
    const prob = probabilityAtLeast(myFaceCounts, beliefStore, players, myId, r.face, r.quantity, unknownDiceCount);
    if (prob >= RAISE_TARGET) {
      postMessage({ action: 'raise', quantity: r.quantity, face: r.face });
      return;
    }
  }
  
  // No good raise found, but current bid is plausible
  // Make minimal raise to keep the game going
  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
