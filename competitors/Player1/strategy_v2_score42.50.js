// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 2.0.0
// Authorship: Tournament System
// High Score: 42.5

// Bayesian Inference Strategy for Liar's Dice
// Core idea: Instead of assuming uniform distribution, we learn from opponent bids
// and update our beliefs about what faces they likely hold.

// Tunable parameters
const FACE_PROB_BASE = 1/6;           // Base probability before updates
const BELIEF_UPDATE_STRENGTH = 0.20;  // How much to trust bids (0.0-1.0)
const BELIEF_DECAY = 0.98;            // Slight decay to prevent overconfidence
const LIAR_THRESHOLD = 0.20;          // Call LIAR if probability < 20%
const RAISE_TARGET = 0.35;            // Need ≥35% probability to raise confidently
const OPENING_CAP_FRAC = 0.70;        // Don't open above 70% of total dice

// Persistent belief state (across rounds within a game)
let self = null;

onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history, rules } = state;

  // Initialize belief state on first call
  if (!self) {
    self = {
      belief: {},  // belief[playerId][face] = expected probability
      myId: you.id
    };
  }

  const myDice = you.dice || [];
  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  // Count my own dice by face
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Initialize beliefs for all players (uniform distribution)
  for (const player of players) {
    if (player.id === self.myId) continue;
    if (!self.belief[player.id]) {
      self.belief[player.id] = Array(7).fill(FACE_PROB_BASE);
    }
  }

  // Update beliefs from recent history
  // When an opponent bids on face F, increase our belief they have F
  const recentHistory = history.slice(-50); // Look at last 50 actions
  for (const action of recentHistory) {
    if (action.action === 'raise' && action.actor !== self.myId) {
      const bidderId = action.actor;
      const bidFace = action.face;
      const bidQty = action.quantity || 0;
      
      if (self.belief[bidderId]) {
        // Bayesian update with quantity weighting
        const quantityWeight = Math.min(1.0, bidQty / Math.max(1, totalDiceOnTable * 0.3));
        const currentBelief = self.belief[bidderId][bidFace] || FACE_PROB_BASE;
        
        // Update for higher quantity bids
        const update = BELIEF_UPDATE_STRENGTH * quantityWeight * (1 - currentBelief);
        self.belief[bidderId][bidFace] = Math.min(0.85, currentBelief + update);
        
        // Normalize: decrease other faces
        const totalOther = self.belief[bidderId].slice(1, 7).reduce((s, v, i) => 
          s + (i + 1 === bidFace ? 0 : v), 0);
        if (totalOther > 0) {
          for (let f = 1; f <= 6; f++) {
            if (f !== bidFace && self.belief[bidderId][f]) {
              self.belief[bidderId][f] = Math.max(0.01, 
                self.belief[bidderId][f] * BELIEF_DECAY * (1 - update / (totalOther + 0.1)));
            }
          }
        }
      }
    }
  }
  
  // Apply slight decay to all beliefs
  for (const playerId in self.belief) {
    for (let f = 1; f <= 6; f++) {
      if (self.belief[playerId][f]) {
        self.belief[playerId][f] = self.belief[playerId][f] * BELIEF_DECAY + 
                                   FACE_PROB_BASE * (1 - BELIEF_DECAY);
      }
    }
  }

  // Probability calculation using updated beliefs
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    
    if (needFromUnknown <= 0) return 1.0;
    if (needFromUnknown > unknownDiceCount) return 0.0;

    // Normal approximation
    let expectedCount = 0;
    let varianceSum = 0;
    
    for (const player of players) {
      if (player.id === self.myId) continue;
      
      const diceCount = player.diceCount;
      const faceProb = self.belief[player.id]?.[face] || FACE_PROB_BASE;
      
      expectedCount += diceCount * faceProb;
      varianceSum += diceCount * faceProb * (1 - faceProb);
    }
    
    const mean = expectedCount;
    const stdDev = Math.sqrt(Math.max(0.25, varianceSum));
    
    if (stdDev < 0.01) {
      return expectedCount >= needFromUnknown ? 1.0 : 0.0;
    }
    
    const z = (needFromUnknown - 0.5 - mean) / stdDev;
    
    // Normal CDF approximation
    function normalCDF(z) {
      const sign = z < 0 ? -1 : 1;
      z = Math.abs(z);
      if (z > 6) return z < 0 ? 0 : 1;
      const a1 =  0.254829592;
      const a2 = -0.284496736;
      const a3 =  1.421413741;
      const a4 = -1.453152027;
      const a5 =  1.061405429;
      const p  =  0.3275911;
      const t = 1.0 / (1.0 + p * z);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
      return 0.5 * (1.0 + sign * y);
    }
    
    const prob = 1.0 - normalCDF(z);
    return Math.max(0, Math.min(1, prob));
  }

  // Opening move
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestCount = myFaceCounts[f];
        bestFace = f;
      }
    }

    const expectedUnknown = unknownDiceCount * FACE_PROB_BASE;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown));

    const openingCap = Math.min(totalDiceOnTable, Math.ceil(totalDiceOnTable * OPENING_CAP_FRAC));
    qty = Math.min(qty, openingCap);

    while (qty + 1 <= openingCap && probabilityAtLeast(bestFace, qty + 1) >= RAISE_TARGET) {
      qty++;
    }

    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  // Reacting to a bid
  const { quantity: prevQty, face: prevFace } = currentBid;
  const probPrevTrue = probabilityAtLeast(prevFace, prevQty);

  // If current bid is very unlikely, call LIAR
  if (probPrevTrue < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }

  // Try to find a legal raise that meets our target
  const raiseCandidates = [
    { quantity: prevQty + 1, face: prevFace }
  ];
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseCandidates.push({ quantity: prevQty, face: f });
  }

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

  // No confident raise, make minimal nudge
  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
