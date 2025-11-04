// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 3.3.0
// Authorship: Tournament System

// Bayesian Inference Strategy for Liar's Dice
// Core idea: Instead of assuming uniform distribution, we learn from opponent bids
// and update our beliefs about what faces they likely hold.

// Tunable parameters
const FACE_PROB_BASE = 1/6;           // Base probability before updates
const BELIEF_UPDATE_STRENGTH = 0.26;  // How much to trust bids (0.0-1.0) - optimized further
const BELIEF_DECAY = 0.988;           // Slight decay to prevent overconfidence (very slow)
const LIAR_THRESHOLD = 0.155;         // Call LIAR if probability < 15.5% (more aggressive)
const RAISE_TARGET = 0.27;            // Need ≥27% probability to raise confidently (more aggressive)
const OPENING_CAP_FRAC = 0.68;        // Don't open above 68% of total dice (balanced)
const MOMENTUM_FACTOR = 0.15;         // How much recent bid momentum affects decisions
const ENDGAME_AGGRESSION = 1.2;       // Multiplier for endgame LIAR calls

// Persistent belief state (across rounds within a game)
let self = null;

onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history, rules } = state;

  // Initialize belief state on first call
  if (!self) {
    self = {
      belief: {},  // belief[playerId][face] = expected probability
      opponentPatterns: {}, // Track opponent calling/raising patterns
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
  // Also consider the quantity bid - higher quantities suggest stronger hands
  // Track opponent patterns: aggressive vs conservative
  const recentHistory = history.slice(-80); // Look at more history for better patterns
  
  // Initialize opponent pattern tracking
  for (const player of players) {
    if (player.id !== self.myId && !self.opponentPatterns[player.id]) {
      self.opponentPatterns[player.id] = {
        liarCalls: 0,
        raises: 0,
        aggressiveFactor: 1.0, // 1.0 = neutral, >1.0 = aggressive, <1.0 = conservative
        recentBids: [], // Track recent bid sequence for pattern detection
        credibilityScore: 1.0 // How credible their bids are (based on history)
      };
    }
  }
  
  for (const action of recentHistory) {
    if (action.actor !== self.myId) {
      const actorId = action.actor;
      
      if (action.action === 'raise' && self.belief[actorId]) {
        const bidFace = action.face;
        const bidQty = action.quantity || 0;
        
        // Update pattern tracking
        self.opponentPatterns[actorId].raises++;
        
        // Track recent bids for this player
        if (!self.opponentPatterns[actorId].recentBids) {
          self.opponentPatterns[actorId].recentBids = [];
        }
        self.opponentPatterns[actorId].recentBids.push({ face: bidFace, quantity: bidQty });
        if (self.opponentPatterns[actorId].recentBids.length > 5) {
          self.opponentPatterns[actorId].recentBids.shift();
        }
        
        // Bayesian update with quantity weighting
        // Higher quantity bids on a face = stronger signal
        // Also consider if they're jumping to a new face (stronger signal)
        const recentBids = self.opponentPatterns[actorId].recentBids;
        const prevBid = recentBids.length >= 2 ? recentBids[recentBids.length - 2] : null;
        const faceJumpBonus = (prevBid && prevBid.face !== bidFace) ? 1.35 : 1.0;
        
        // Additional bonus if they're consistently bidding on same face (stronger signal)
        const sameFaceCount = recentBids.filter(b => b.face === bidFace).length;
        const consistencyBonus = sameFaceCount >= 2 ? 1.15 : 1.0;
        
        const quantityWeight = Math.min(1.0, bidQty / Math.max(1, totalDiceOnTable * 0.25));
        const currentBelief = self.belief[actorId][bidFace] || FACE_PROB_BASE;
        
        // Stronger update for higher quantity bids and face jumps
        const update = BELIEF_UPDATE_STRENGTH * quantityWeight * faceJumpBonus * consistencyBonus * (1 - currentBelief);
        self.belief[actorId][bidFace] = Math.min(0.90, currentBelief + update); // Cap at 90%
        
        // Apply decay to other faces and normalize
        const totalOther = self.belief[actorId].slice(1, 7).reduce((s, v, i) => 
          s + (i + 1 === bidFace ? 0 : v), 0);
        if (totalOther > 0) {
          for (let f = 1; f <= 6; f++) {
            if (f !== bidFace && self.belief[actorId][f]) {
              // Decay + proportional decrease
              self.belief[actorId][f] = Math.max(0.01, 
                self.belief[actorId][f] * BELIEF_DECAY * (1 - update / (totalOther + 0.1)));
            }
          }
        }
      } else if (action.action === 'liar') {
        // Track calling patterns
        self.opponentPatterns[actorId].liarCalls++;
        // Update aggressive factor: more calls = more aggressive
        const totalActions = self.opponentPatterns[actorId].raises + self.opponentPatterns[actorId].liarCalls;
        if (totalActions > 0) {
          const callRatio = self.opponentPatterns[actorId].liarCalls / totalActions;
          self.opponentPatterns[actorId].aggressiveFactor = 0.7 + callRatio * 0.6; // 0.7-1.3 range
        }
      }
    }
  }
  
  // Apply slight decay to all beliefs to prevent overconfidence from stale data
  for (const playerId in self.belief) {
    for (let f = 1; f <= 6; f++) {
      if (self.belief[playerId][f]) {
        // Decay towards base probability
        self.belief[playerId][f] = self.belief[playerId][f] * BELIEF_DECAY + 
                                   FACE_PROB_BASE * (1 - BELIEF_DECAY);
      }
    }
  }

  // Probability calculation using updated beliefs
  // Uses binomial distribution with non-uniform probabilities per player
  function probabilityAtLeast(face, qty) {
    // We know our own dice
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    
    if (needFromUnknown <= 0) return 1.0;
    if (needFromUnknown > unknownDiceCount) return 0.0;

    // For small numbers, use exact binomial calculation
    // For larger numbers, use normal approximation with better variance handling
    if (unknownDiceCount <= 15) {
      // Exact calculation using convolution of binomial distributions
      return exactBinomialProbability(face, needFromUnknown);
    }

    // Normal approximation for larger cases
    let expectedCount = 0;
    let varianceSum = 0;
    
    for (const player of players) {
      if (player.id === self.myId) continue;
      
      const diceCount = player.diceCount;
      let faceProb = self.belief[player.id]?.[face] || FACE_PROB_BASE;
      
      // Adjust probability based on opponent's aggressive factor
      // Aggressive opponents may bluff more, conservative ones are more truthful
      const pattern = self.opponentPatterns[player.id];
      if (pattern && pattern.aggressiveFactor) {
        // If they're aggressive (>1.0), they might be bluffing - reduce trust slightly
        // If they're conservative (<1.0), they're likely truthful - trust more
        faceProb = faceProb * (0.9 + 0.2 * (2 - pattern.aggressiveFactor));
        faceProb = Math.max(0.05, Math.min(0.95, faceProb)); // Clamp
      }
      
      // Expected count from this player
      expectedCount += diceCount * faceProb;
      
      // Variance for binomial: n * p * (1-p)
      varianceSum += diceCount * faceProb * (1 - faceProb);
    }
    
    // Normal approximation: P(X >= k) where X ~ N(μ, σ²)
    const mean = expectedCount;
    const stdDev = Math.sqrt(Math.max(0.25, varianceSum)); // Minimum variance to avoid extreme values
    
    if (stdDev < 0.01) {
      // Deterministic case
      return expectedCount >= needFromUnknown ? 1.0 : 0.0;
    }
    
    const z = (needFromUnknown - 0.5 - mean) / stdDev;
    
    // Approximate cumulative normal
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

  // Exact binomial probability calculation for small cases
  // Uses dynamic programming to compute P(X1 + X2 + ... >= k)
  function exactBinomialProbability(face, need) {
    // Collect all player probabilities
    const probs = [];
    for (const player of players) {
      if (player.id === self.myId) continue;
      const diceCount = player.diceCount;
      const faceProb = self.belief[player.id]?.[face] || FACE_PROB_BASE;
      for (let i = 0; i < diceCount; i++) {
        probs.push(faceProb);
      }
    }
    
    if (probs.length === 0) return need <= 0 ? 1.0 : 0.0;
    
    // DP: dp[i][j] = probability of exactly j successes in first i dice
    const n = probs.length;
    const dp = Array(n + 1).fill(null).map(() => Array(need + 1).fill(0));
    dp[0][0] = 1.0;
    
    for (let i = 1; i <= n; i++) {
      const p = probs[i - 1];
      for (let j = 0; j <= need; j++) {
        // j successes from i dice
        dp[i][j] = dp[i - 1][j] * (1 - p); // No success on ith die
        if (j > 0) {
          dp[i][j] += dp[i - 1][j - 1] * p; // Success on ith die
        }
      }
    }
    
    // Sum probabilities for j >= need
    let sum = 0;
    for (let j = need; j <= n; j++) {
      sum += dp[n][j];
    }
    
    return Math.max(0, Math.min(1, sum));
  }

  // Opening move: bid on our best face with reasonable probability
  // Consider game phase and opponent patterns for better opening
  if (!currentBid) {
    // Find our strongest face(s) - prefer higher faces if tied
    let bestFace = 6, bestCount = -1;
    let secondBestFace = 6, secondBestCount = -1;
    for (let f = 6; f >= 1; f--) {
      if (myFaceCounts[f] >= bestCount) {
        secondBestCount = bestCount;
        secondBestFace = bestFace;
        bestCount = myFaceCounts[f];
        bestFace = f;
      } else if (myFaceCounts[f] >= secondBestCount) {
        secondBestCount = myFaceCounts[f];
        secondBestFace = f;
      }
    }

    // Game phase awareness: early game vs late game
    const totalDice = totalDiceOnTable;
    const gamePhase = totalDice > 20 ? 'early' : totalDice > 10 ? 'mid' : 'late';
    
    // Adjust opening based on phase
    let expectedMultiplier = 0.92;
    if (gamePhase === 'late') {
      expectedMultiplier = 0.88; // More conservative in late game
    } else if (gamePhase === 'early') {
      expectedMultiplier = 0.95; // Slightly more aggressive early
    }

    // Calculate expected count using initial beliefs (uniform at start)
    const expectedUnknown = unknownDiceCount * FACE_PROB_BASE;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown * expectedMultiplier));

    // Consider if we have a strong hand (multiple of same face)
    if (bestCount >= 2) {
      // With multiple dice of same face, we can be more aggressive
      qty = Math.max(qty, bestCount + 1);
    }

    // Cap opening bid
    const openingCap = Math.min(totalDiceOnTable, Math.ceil(totalDiceOnTable * OPENING_CAP_FRAC));
    qty = Math.min(qty, openingCap);

    // Push quantity up while still meeting our target probability
    while (qty + 1 <= openingCap && probabilityAtLeast(bestFace, qty + 1) >= RAISE_TARGET) {
      qty++;
    }

    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  // Reacting to a bid
  const { quantity: prevQty, face: prevFace } = currentBid;
  
  // Calculate bid momentum (how fast quantity is increasing)
  let bidMomentum = 0;
  if (history.length >= 2) {
    const recentBids = history.slice(-5).filter(a => a.action === 'raise');
    if (recentBids.length >= 2) {
      const qtyChange = recentBids[recentBids.length - 1].quantity - recentBids[0].quantity;
      bidMomentum = qtyChange / Math.max(1, recentBids.length);
    }
  }
  
  const probPrevTrue = probabilityAtLeast(prevFace, prevQty);

  // Adaptive threshold based on game state
  // If we're behind (fewer dice), be more aggressive in calling LIAR
  const myDiceCount = myDice.length;
  const avgOpponentDice = players
    .filter(p => p.id !== self.myId)
    .reduce((sum, p) => sum + p.diceCount, 0) / Math.max(1, players.length - 1);
  
  // Also consider how many players are left (fewer players = more aggressive)
  const remainingPlayers = players.filter(p => p.diceCount > 0).length;
  const playerCountFactor = remainingPlayers <= 2 ? 1.15 : remainingPlayers <= 3 ? 1.12 : remainingPlayers <= 4 ? 1.05 : 1.0;
  
  // Adjust threshold based on bid momentum (high momentum = more skeptical)
  const momentumAdjustment = 1.0 + (bidMomentum > 2 ? 0.10 : bidMomentum > 1 ? 0.05 : 0);
  
  // Endgame adjustment: when total dice are very low, be more aggressive
  const endgameFactor = totalDiceOnTable <= 10 ? ENDGAME_AGGRESSION : 1.0;
  
  // Consider the current bidder's specific pattern
  const currentBidder = history.length > 0 ? history[history.length - 1]?.actor : null;
  let bidderAdjustment = 1.0;
  if (currentBidder && self.opponentPatterns[currentBidder]) {
    const bidderPattern = self.opponentPatterns[currentBidder];
    // If this bidder is very aggressive, be more skeptical
    if (bidderPattern.aggressiveFactor > 1.15) {
      bidderAdjustment = 1.08;
    } else if (bidderPattern.aggressiveFactor < 0.85) {
      // Conservative bidders are more trustworthy - be slightly more lenient
      bidderAdjustment = 0.96;
    }
  }
  
  const adaptiveLiarThreshold = ((myDiceCount < avgOpponentDice 
    ? LIAR_THRESHOLD * 1.15  // More aggressive when behind
    : LIAR_THRESHOLD * 0.93) * playerCountFactor * momentumAdjustment * endgameFactor) / bidderAdjustment;

  // If current bid is very unlikely, call LIAR
  if (probPrevTrue < adaptiveLiarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }

  // Try to find a legal raise that meets our probability target
  // Prefer quantity increases (safer) over face increases, but be smart about it
  const raiseCandidates = [
    { quantity: prevQty + 1, face: prevFace, cost: 1, type: 'qty' }  // Increase quantity (cheapest)
  ];
  // Add face increases at same quantity (slightly riskier)
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseCandidates.push({ quantity: prevQty, face: f, cost: 2, type: 'face' });
  }
  
  // Also consider face increases with quantity+1 if we have strong support
  if (myFaceCounts[prevFace] >= 1) {
    for (let f = prevFace + 1; f <= 6; f++) {
      if (myFaceCounts[f] >= myFaceCounts[prevFace]) {
        raiseCandidates.push({ quantity: prevQty + 1, face: f, cost: 3, type: 'both' });
      }
    }
  }

  // Find the best raise that meets our target
  // Prefer higher probability raises, but also consider our own dice
  let chosenRaise = null;
  let bestScore = -1;
  for (const r of raiseCandidates) {
    const p = probabilityAtLeast(r.face, r.quantity);
    if (p >= RAISE_TARGET) {
      // Score combines probability and our own support
      const mySupport = myFaceCounts[r.face] || 0;
      const score = p * 0.7 + (mySupport / Math.max(1, r.quantity)) * 0.3 - r.cost * 0.05;
      if (score > bestScore) {
        chosenRaise = r;
        bestScore = score;
      }
    }
  }

  if (chosenRaise) {
    postMessage({ action: 'raise', quantity: chosenRaise.quantity, face: chosenRaise.face });
    return;
  }

  // No confident raise available, but current bid is plausible
  // Check if minimal raise is still reasonable
  const minimalRaiseProb = probabilityAtLeast(prevFace, prevQty + 1);
  
  // In endgame (few dice), be more willing to call LIAR even on marginal cases
  const endgameThreshold = totalDiceOnTable <= 10 ? adaptiveLiarThreshold * 1.3 : adaptiveLiarThreshold * 1.5;
  
  if (minimalRaiseProb >= endgameThreshold) {
    // Safe enough to nudge
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
  } else {
    // Too risky, call LIAR
    // But in endgame with very few dice, be more aggressive
    if (totalDiceOnTable <= 8 && probPrevTrue < adaptiveLiarThreshold * 1.2) {
      postMessage({ action: 'liar' });
    } else if (probPrevTrue < adaptiveLiarThreshold) {
      postMessage({ action: 'liar' });
    } else {
      // Last resort: minimal raise even if risky
      postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    }
  }
};
