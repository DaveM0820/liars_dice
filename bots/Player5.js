// BOT_NAME: Game-Theoretic Equilibrium Strategy
// Strategy: Equilibrium-based approach with adaptive opponent modeling
// Version: 2.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;

// Adaptive thresholds based on game state
const BASE_RAISE_THRESHOLD = 0.38;      // Base confidence to raise
const BASE_LIAR_THRESHOLD = 0.24;       // Base confidence to call LIAR
const AGGRESSIVE_RAISE_THRESHOLD = 0.32; // When we're ahead
const CONSERVATIVE_RAISE_THRESHOLD = 0.45; // When we're behind

// Opponent modeling parameters
const HISTORY_WINDOW = 20;              // Look at last N actions
const BLUFF_DETECTION_WINDOW = 10;      // Recent bluffs to consider

onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history } = state;
  
  const myDice = you.dice || [];
  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  
  // Count my faces
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;
  
  // Probability helpers with improved accuracy
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  
  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
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
    let term = binomPMF(n, k, p), sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-15) break; // Numerical stability
    }
    return clamp01(sum);
  }
  
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
  }
  
  // Opponent behavior modeling
  function analyzeOpponentBehavior() {
    if (!history || history.length === 0) {
      return { avgBluffRate: 0.15, avgAggression: 0.5, recentBluffs: 0, liarCallRate: 0.2 };
    }
    
    const recent = history.slice(-HISTORY_WINDOW);
    let totalRaises = 0;
    let totalActions = 0;
    let veryHighBids = 0; // Bids that are likely bluffs
    let liarCalls = 0;
    let successfulLiars = 0; // LIAR calls that were correct
    
    // Track resolutions to see LIAR call outcomes
    const resolutions = [];
    const liarCallsBeforeResolution = [];
    
    for (let i = 0; i < recent.length; i++) {
      const action = recent[i];
      if (action.action === 'raise') {
        totalActions++;
        totalRaises++;
        // Estimate if this was likely a bluff (high quantity relative to expected)
        if (action.quantity && action.face) {
          const expected = totalDiceOnTable * FACE_PROB;
          if (action.quantity > expected * 1.25) {
            veryHighBids++;
          }
        }
      } else if (action.action === 'liar') {
        totalActions++;
        liarCalls++;
        // Track that we saw a LIAR call - check next resolution
        liarCallsBeforeResolution.push(i);
      } else if (action.action === 'resolution') {
        // Resolution shows if claim was true or false
        resolutions.push({ idx: i, claimTrue: action.claimTrue });
      }
    }
    
    // Match LIAR calls with their resolutions
    for (const liarIdx of liarCallsBeforeResolution) {
      // Find the next resolution after this LIAR call
      const nextResolution = resolutions.find(r => r.idx > liarIdx);
      if (nextResolution && nextResolution.claimTrue === false) {
        successfulLiars++;
      }
    }
    
    const avgBluffRate = totalActions > 0 ? veryHighBids / totalActions : 0.15;
    const avgAggression = totalActions > 0 ? totalRaises / totalActions : 0.5;
    const liarCallRate = totalActions > 0 ? liarCalls / totalActions : 0.2;
    const liarAccuracy = liarCalls > 0 ? successfulLiars / liarCalls : 0.5;
    
    // Recent bluffs in last window
    const veryRecent = history.slice(-BLUFF_DETECTION_WINDOW);
    let recentBluffs = 0;
    for (const action of veryRecent) {
      if (action.action === 'raise' && action.quantity && action.face) {
        const expected = currentTableDice * FACE_PROB;
        if (action.quantity > expected * 1.25) {
          recentBluffs++;
        }
      }
    }
    
    return { avgBluffRate, avgAggression, recentBluffs, liarCallRate, liarAccuracy };
  }
  
  // Game state analysis
  function getGameState() {
    const myDiceCount = myDice.length;
    const avgDiceCount = players.reduce((sum, p) => sum + p.diceCount, 0) / players.length;
    const maxDiceCount = Math.max(...players.map(p => p.diceCount));
    
    // Are we ahead or behind?
    let position = 'neutral';
    if (myDiceCount > avgDiceCount * 1.2) position = 'ahead';
    else if (myDiceCount < avgDiceCount * 0.8) position = 'behind';
    else if (myDiceCount === maxDiceCount) position = 'ahead';
    
    // How many players left?
    const activePlayers = players.filter(p => p.diceCount > 0).length;
    
    return { position, myDiceCount, activePlayers, avgDiceCount };
  }
  
  // Adaptive threshold calculation
  function getAdaptiveThresholds() {
    const behavior = analyzeOpponentBehavior();
    const gameState = getGameState();
    
    let raiseThreshold = BASE_RAISE_THRESHOLD;
    let liarThreshold = BASE_LIAR_THRESHOLD;
    
    // Adjust based on position
    if (gameState.position === 'ahead') {
      raiseThreshold = AGGRESSIVE_RAISE_THRESHOLD; // More aggressive when ahead
      liarThreshold = BASE_LIAR_THRESHOLD * 0.9; // Slightly more willing to call
    } else if (gameState.position === 'behind') {
      raiseThreshold = CONSERVATIVE_RAISE_THRESHOLD; // More conservative when behind
      liarThreshold = BASE_LIAR_THRESHOLD * 1.15; // More cautious about calling
    }
    
    // Adjust based on opponent bluffs
    if (behavior.recentBluffs >= 3) {
      // Opponents are bluffing a lot - be more skeptical
      liarThreshold = BASE_LIAR_THRESHOLD * 0.85;
      raiseThreshold = BASE_RAISE_THRESHOLD * 0.95; // Slightly more willing to raise
    } else if (behavior.avgBluffRate < 0.1) {
      // Opponents are conservative - we can be more aggressive
      raiseThreshold = BASE_RAISE_THRESHOLD * 0.9;
    }
    
    // Adjust based on LIAR call patterns
    if (behavior.liarAccuracy > 0.7 && behavior.liarCallRate > 0.25) {
      // Opponents are calling LIAR accurately and often - be more conservative
      raiseThreshold *= 1.1;
    } else if (behavior.liarAccuracy < 0.4) {
      // Opponents are calling LIAR poorly - we can bluff more
      raiseThreshold *= 0.92;
    }
    
    // Adjust for late game (fewer players)
    if (gameState.activePlayers <= 2) {
      raiseThreshold *= 0.95; // More aggressive in heads-up
      liarThreshold *= 0.9; // More willing to call
    }
    
    return { raiseThreshold, liarThreshold };
  }
  
  // Opening strategy
  if (!currentBid) {
    // Find best face (most frequent)
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }
    
    // Calculate expected value
    const expectedUnknown = unknownDiceCount * FACE_PROB;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown));
    
    // Use adaptive threshold
    const { raiseThreshold } = getAdaptiveThresholds();
    
    // Push quantity up while still meeting threshold
    const maxQty = Math.min(totalDiceOnTable, Math.ceil(totalDiceOnTable * 0.75));
    while (qty + 1 <= maxQty && probabilityAtLeast(bestFace, qty + 1) >= raiseThreshold) {
      qty++;
    }
    
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }
  
  // Responding strategy
  const { quantity: prevQty, face: prevFace } = currentBid;
  const { raiseThreshold, liarThreshold } = getAdaptiveThresholds();
  
  const claimProbability = probabilityAtLeast(prevFace, prevQty);
  
  // Check if we should call LIAR
  if (claimProbability < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Find best legal raise option
  const raiseOptions = [
    { quantity: prevQty + 1, face: prevFace }, // Increase quantity
  ];
  
  // Add face increases at same quantity
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseOptions.push({ quantity: prevQty, face: f });
  }
  
  // Find the best raise that meets our threshold
  // Prefer quantity increases (cheaper) over face increases
  let bestRaise = null;
  let bestScore = -1;
  
  for (const option of raiseOptions) {
    const prob = probabilityAtLeast(option.face, option.quantity);
    if (prob >= raiseThreshold) {
      // Score: prefer quantity increases, and higher probability
      const isQuantityIncrease = option.face === prevFace;
      const score = (isQuantityIncrease ? 10 : 0) + prob * 5;
      if (score > bestScore) {
        bestScore = score;
        bestRaise = option;
      }
    }
  }
  
  if (bestRaise) {
    postMessage({ action: 'raise', quantity: bestRaise.quantity, face: bestRaise.face });
    return;
  }
  
  // No good raise - make minimal safe raise if claim is plausible, else call LIAR
  if (claimProbability >= liarThreshold * 1.2) {
    // Claim is somewhat plausible - make minimal nudge
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
  } else {
    // Even the current claim is weak - call LIAR
    postMessage({ action: 'liar' });
  }
};
