// BOT_NAME: Dice-Count Adaptive Risk Strategy
// Strategy: Adapts risk-taking based on dice counts and game stage
// Version: 1.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;

// Base thresholds
const BASE_LIAR_THRESHOLD = 0.20;
const BASE_RAISE_THRESHOLD = 0.40;

// Position-based adjustments
const LEADING_LIAR_THRESHOLD = 0.15;   // Conservative when ahead
const LEADING_RAISE_THRESHOLD = 0.50;  // Only raise on high confidence
const TRAILING_LIAR_THRESHOLD = 0.30;  // Aggressive when behind
const TRAILING_RAISE_THRESHOLD = 0.30; // Take more risks

// Late game adjustments (when total dice < 10)
const LATE_GAME_LIAR_THRESHOLD = 0.25;  // Minimum threshold in late game
const LATE_GAME_RAISE_THRESHOLD = 0.50; // Minimum raise threshold in late game

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  const myDiceCount = myDice.length;

  // Count my faces
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Probability helpers
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
    let term = binomPMF(n, k, p);
    let sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-12) break;
    }
    return clamp01(sum);
  }

  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
  }

  // Determine position and adjust thresholds
  function getAdjustedThresholds() {
    // Find dice counts of all players
    const diceCounts = players.map(p => p.diceCount).filter(count => count > 0);
    const maxDice = Math.max(...diceCounts);
    const minDice = Math.min(...diceCounts);
    const avgDice = diceCounts.reduce((sum, c) => sum + c, 0) / diceCounts.length;
    
    let liarThreshold = BASE_LIAR_THRESHOLD;
    let raiseThreshold = BASE_RAISE_THRESHOLD;

    // More nuanced position detection
    const diceAbove = diceCounts.filter(c => c > myDiceCount).length;
    const diceBelow = diceCounts.filter(c => c < myDiceCount).length;
    const isLeading = myDiceCount === maxDice && diceCounts.filter(c => c === maxDice).length === 1;
    const isTrailing = myDiceCount === minDice && diceCounts.filter(c => c === minDice).length === 1;
    const isAboveAvg = myDiceCount > avgDice;
    const leadMargin = maxDice - myDiceCount;
    const trailMargin = myDiceCount - minDice;

    // Position-based adjustment with gradient
    if (isLeading) {
      // Leading: be conservative
      liarThreshold = LEADING_LIAR_THRESHOLD;
      raiseThreshold = LEADING_RAISE_THRESHOLD;
    } else if (isTrailing) {
      // Trailing: be aggressive
      liarThreshold = TRAILING_LIAR_THRESHOLD;
      raiseThreshold = TRAILING_RAISE_THRESHOLD;
    } else if (isAboveAvg) {
      // Above average: slightly conservative
      liarThreshold = BASE_LIAR_THRESHOLD - 0.02;
      raiseThreshold = BASE_RAISE_THRESHOLD + 0.05;
    } else {
      // Below average: slightly aggressive
      liarThreshold = BASE_LIAR_THRESHOLD + 0.03;
      raiseThreshold = BASE_RAISE_THRESHOLD - 0.05;
    }

    // Late game adjustment (total dice < 10)
    if (totalDiceOnTable < 10) {
      liarThreshold = Math.max(liarThreshold, LATE_GAME_LIAR_THRESHOLD);
      raiseThreshold = Math.max(raiseThreshold, LATE_GAME_RAISE_THRESHOLD);
    }

    // Ensure thresholds are within valid ranges
    liarThreshold = Math.max(0.10, Math.min(0.35, liarThreshold));
    raiseThreshold = Math.max(0.25, Math.min(0.60, raiseThreshold));

    return { liarThreshold, raiseThreshold };
  }

  // Opening move
  if (!currentBid) {
    // Pick the face we hold most
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }

    const { raiseThreshold } = getAdjustedThresholds();
    const expectedUnknown = unknownDiceCount * FACE_PROB;
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown * 0.9)); // Start slightly conservative

    // Push quantity up while still meeting our raise threshold
    while (qty + 1 <= totalDiceOnTable && probabilityAtLeast(bestFace, qty + 1) >= raiseThreshold) {
      qty++;
    }

    // Ensure we don't open with an absurdly high bid
    const maxReasonableOpening = Math.ceil(totalDiceOnTable * 0.75);
    qty = Math.min(qty, maxReasonableOpening);

    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  // Reacting to current bid
  const { quantity: prevQty, face: prevFace } = currentBid;
  const { liarThreshold, raiseThreshold } = getAdjustedThresholds();
  
  const claimLikely = probabilityAtLeast(prevFace, prevQty);

  // Call LIAR if claim is too unlikely
  if (claimLikely < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }

  // Try to find a legal raise that meets our raise threshold
  // Option 1: Increase quantity (same face) - preferred if good
  const raiseQty = { quantity: prevQty + 1, face: prevFace };
  const raiseQtyProb = probabilityAtLeast(raiseQty.face, raiseQty.quantity);
  if (raiseQtyProb >= raiseThreshold) {
    postMessage({ action: 'raise', quantity: raiseQty.quantity, face: raiseQty.face });
    return;
  }

  // Option 2: Same quantity, higher face - find best option
  let bestFaceRaise = null;
  let bestFaceProb = 0;
  for (let f = prevFace + 1; f <= 6; f++) {
    const prob = probabilityAtLeast(f, prevQty);
    if (prob >= raiseThreshold && prob > bestFaceProb) {
      bestFaceRaise = f;
      bestFaceProb = prob;
    }
  }
  if (bestFaceRaise) {
    postMessage({ action: 'raise', quantity: prevQty, face: bestFaceRaise });
    return;
  }

  // No raise meets threshold, but claim is plausible
  // If we're close to threshold, make minimal raise anyway
  if (raiseQtyProb >= raiseThreshold * 0.85) {
    postMessage({ action: 'raise', quantity: raiseQty.quantity, face: raiseQty.face });
    return;
  }

  // Try face bump as fallback
  if (prevFace < 6) {
    const faceBumpProb = probabilityAtLeast(prevFace + 1, prevQty);
    if (faceBumpProb >= raiseThreshold * 0.80) {
      postMessage({ action: 'raise', quantity: prevQty, face: prevFace + 1 });
      return;
    }
  }

  // Last resort: minimal legal raise
  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
