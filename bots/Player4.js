// BOT_NAME: Dice-Count Adaptive Risk Strategy
// Strategy: Adapts risk-taking based on dice counts and game stage
// Version: 1.3.0
// Authorship: Tournament System

const FACE_PROB = 1/6;

// Base thresholds - tuned for better performance
const BASE_LIAR_THRESHOLD = 0.18;  // Slightly more aggressive base
const BASE_RAISE_THRESHOLD = 0.38; // Slightly lower base raise threshold

// Position-based adjustments - optimized
const LEADING_LIAR_THRESHOLD = 0.14;   // Conservative when ahead
const LEADING_RAISE_THRESHOLD = 0.48;  // Only raise on high confidence
const TRAILING_LIAR_THRESHOLD = 0.32;  // More aggressive when behind
const TRAILING_RAISE_THRESHOLD = 0.28; // Take more risks when trailing

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
    if (k === n) return Math.pow(p, n);
    let term = binomPMF(n, k, p);
    let sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-15) break; // More precise
    }
    return clamp01(sum);
  }

  // Enhanced probability calculation with better approximation
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    
    if (needFromUnknown <= 0) return 1;
    if (needFromUnknown > unknownDiceCount) return 0;
    if (unknownDiceCount === 0) return needFromUnknown === 0 ? 1 : 0;
    
    // Use exact binomial for small cases (more accurate)
    if (unknownDiceCount <= 20) {
      return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
    }
    
    // For larger cases, use normal approximation with continuity correction
    const mean = unknownDiceCount * FACE_PROB;
    const variance = unknownDiceCount * FACE_PROB * (1 - FACE_PROB);
    const stddev = Math.sqrt(variance);
    
    if (stddev < 0.1) {
      // Very small variance, use exact calculation
      return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
    }
    
    // Continuity correction: P(X >= k) ≈ P(X > k - 0.5)
    const z = (needFromUnknown - 0.5 - mean) / stddev;
    
    // Use complementary error function approximation
    // P(X >= k) ≈ 0.5 * erfc(-z / sqrt(2))
    // erfc(-x) ≈ 1 - (1/sqrt(2π)) * exp(-x²/2) * (1 - x²/3 + x⁴/15)
    if (z <= -3) return 1;
    if (z >= 3) return 0;
    
    const expTerm = Math.exp(-0.5 * z * z);
    const erfApprox = 1 - (expTerm / Math.sqrt(2 * Math.PI)) * (1 - z*z/3 + z*z*z*z/15);
    return clamp01(0.5 + 0.5 * erfApprox);
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
    
    // Calculate position strength (0-1 scale)
    const positionStrength = diceCounts.length > 1 
      ? (diceAbove) / (diceCounts.length - 1)
      : 0.5;

    // Position-based adjustment - balanced approach
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
    
    // Fine-tune based on position strength (more subtle)
    const strengthAdjustment = (0.5 - positionStrength) * 0.03;
    liarThreshold += strengthAdjustment;
    raiseThreshold -= strengthAdjustment * 0.8; // Less impact on raise threshold

    // Late game adjustment (total dice < 10)
    if (totalDiceOnTable < 10) {
      // In late game, be more conservative overall (fewer dice = more certain outcomes)
      if (isTrailing) {
        // But still aggressive if trailing
        liarThreshold = Math.max(liarThreshold, 0.28);
        raiseThreshold = Math.min(raiseThreshold, 0.35);
      } else {
        liarThreshold = Math.max(liarThreshold, LATE_GAME_LIAR_THRESHOLD);
        raiseThreshold = Math.max(raiseThreshold, LATE_GAME_RAISE_THRESHOLD);
      }
    }

    // Ensure thresholds are within valid ranges
    liarThreshold = Math.max(0.12, Math.min(0.30, liarThreshold));
    raiseThreshold = Math.max(0.30, Math.min(0.55, raiseThreshold));

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
    
    // More aggressive opening based on position
    const diceCounts = players.map(p => p.diceCount);
    const myRank = diceCounts.filter(c => c > myDiceCount).length;
    const isTrailing = myDiceCount === Math.min(...diceCounts);
    
    // Adjust opening based on position - more nuanced
    let openingMultiplier = 0.92;
    if (isTrailing) {
      openingMultiplier = 1.05; // More aggressive when trailing
    } else if (myRank === 0) {
      openingMultiplier = 0.88; // More conservative when leading
    } else if (myRank === 1) {
      openingMultiplier = 0.95; // Slightly aggressive when second
    }
    
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown * openingMultiplier));

    // Push quantity up while still meeting our raise threshold
    while (qty + 1 <= totalDiceOnTable && probabilityAtLeast(bestFace, qty + 1) >= raiseThreshold) {
      qty++;
    }

    // Ensure we don't open with an absurdly high bid
    const maxReasonableOpening = Math.ceil(totalDiceOnTable * 0.78);
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
  // Smarter fallback logic based on position
  const diceCounts = players.map(p => p.diceCount).filter(count => count > 0);
  const isTrailing = myDiceCount === Math.min(...diceCounts);
  const isLeading = myDiceCount === Math.max(...diceCounts) && diceCounts.filter(c => c === myDiceCount).length === 1;
  
  // If we're close to threshold, make minimal raise anyway (more aggressive when trailing)
  const closeThreshold = isTrailing ? raiseThreshold * 0.80 : raiseThreshold * 0.85;
  if (raiseQtyProb >= closeThreshold) {
    postMessage({ action: 'raise', quantity: raiseQty.quantity, face: raiseQty.face });
    return;
  }

  // Try face bump as fallback (more aggressive when trailing)
  if (prevFace < 6) {
    const faceBumpProb = probabilityAtLeast(prevFace + 1, prevQty);
    const faceBumpThreshold = isTrailing ? raiseThreshold * 0.75 : raiseThreshold * 0.80;
    if (faceBumpProb >= faceBumpThreshold) {
      postMessage({ action: 'raise', quantity: prevQty, face: prevFace + 1 });
      return;
    }
  }

  // Last resort: if trailing, be more willing to raise; if leading, consider calling LIAR
  if (isTrailing && claimLikely >= liarThreshold * 1.2) {
    // When trailing, take more risks even if below threshold
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    return;
  }
  
  if (isLeading && claimLikely < liarThreshold * 1.1) {
    // When leading, be more conservative - call LIAR if claim is borderline
    postMessage({ action: 'liar' });
    return;
  }

  // Default: minimal legal raise
  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
