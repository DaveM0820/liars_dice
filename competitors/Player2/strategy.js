// BOT_NAME: Monte Carlo Simulation Planner
// Strategy: Monte Carlo Simulation - Simulates many possible dice distributions
// Version: 1.6.0
// Authorship: Tournament System
// Improvements: Fine-tuned thresholds for better late-game survival, optimized raise selection

onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history } = state;

  const myDice = you.dice || [];
  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;
  const myDiceCount = myDice.length;

  // Count my faces
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Survival mode: be more conservative when dice count is low
  // Calculate average opponent dice count
  const opponentCounts = players.filter(p => p.id !== you.id && p.diceCount > 0).map(p => p.diceCount);
  const avgOpponentDice = opponentCounts.length > 0 
    ? opponentCounts.reduce((a, b) => a + b, 0) / opponentCounts.length 
    : 5;
  const minOpponentDice = opponentCounts.length > 0 ? Math.min(...opponentCounts) : 5;
  
  // More nuanced survival logic
  // Only go into survival mode if we're significantly behind
  const isLowDice = myDiceCount <= 2 && myDiceCount < avgOpponentDice;
  const isVeryLowDice = myDiceCount <= 1;
  const isAhead = myDiceCount > avgOpponentDice * 1.2; // Be more aggressive when ahead

  // Adaptive simulation count based on game state and time budget
  // Early game: more simulations (more unknown dice, more uncertainty)
  // Late game: fewer simulations (less unknown, faster decisions needed)
  // Balance: more sims = better accuracy, but must stay under 200ms
  const baseSims = 1000;
  const adaptiveSims = Math.min(baseSims, Math.max(300, Math.floor(baseSims * Math.min(1, unknownDiceCount / 18))));
  const N = adaptiveSims;

  // Fast random number generator (seeded Math.random is available)
  // For Monte Carlo, we'll use Math.random() which is deterministic when seeded

  // Simulate dice distribution for unknown dice
  function simulateUnknownDice() {
    const simulated = [];
    for (let i = 0; i < unknownDiceCount; i++) {
      simulated.push(1 + Math.floor(Math.random() * 6));
    }
    return simulated;
  }

  // Count face in simulated + my dice
  function countFaceInSimulation(simulatedDice, face) {
    let count = myFaceCounts[face] || 0;
    for (const d of simulatedDice) {
      if (d === face) count++;
    }
    return count;
  }

  // Evaluate calling LIAR on current bid
  function evaluateLiarCall(simulatedDice) {
    if (!currentBid) return { win: false, value: 0 };
    const { quantity: q, face: f } = currentBid;
    const actualCount = countFaceInSimulation(simulatedDice, f);
    const isTrue = actualCount >= q;
    
    // If bid is false, caller wins (bidder loses die)
    // If bid is true, caller loses (caller loses die)
    return {
      win: !isTrue,
      value: isTrue ? -1 : 1, // -1 for losing die, +1 for opponent losing die
      actualCount,
      claimed: q
    };
  }

  // Evaluate a raise option
  function evaluateRaise(simulatedDice, quantity, face) {
    const actualCount = countFaceInSimulation(simulatedDice, face);
    const isTrue = actualCount >= quantity;
    
    // Value: higher if true (more likely to survive challenge)
    // But also consider the risk: if false, we lose a die
    // Better raises are ones that are more likely to be true
      // Penalty for false raises is higher when we have few dice (survival mode)
      // But when ahead, we can take more risks
      const falsePenalty = isVeryLowDice ? -0.8 : (isLowDice ? -0.5 : (isAhead ? -0.25 : -0.3));
    return {
      isTrue,
      value: isTrue ? 0.5 : falsePenalty,
      actualCount,
      claimed: quantity
    };
  }

  // OPENING MOVE
  if (!currentBid) {
    // Find best face to open on (one we have most of)
    let bestFace = 1;
    let bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestCount = myFaceCounts[f];
        bestFace = f;
      }
    }

    // Quick probability estimate to narrow candidates (fast approximation)
    const expectedUnknown = unknownDiceCount * (1/6);
    const expectedTotal = bestCount + expectedUnknown;
    
    // Generate smart candidate quantities (not all, just promising ones)
    const candidateQuantities = [];
    const minQty = Math.max(1, bestCount);
    const maxQty = Math.min(totalDiceOnTable, Math.ceil(expectedTotal * 1.3));
    
    // Sample candidates: start, expected, and a few above
    candidateQuantities.push(minQty);
    candidateQuantities.push(Math.max(minQty, Math.floor(expectedTotal)));
    candidateQuantities.push(Math.max(minQty, Math.ceil(expectedTotal)));
    
    // Add a few more strategic candidates
    for (let q = Math.ceil(expectedTotal) + 1; q <= maxQty && candidateQuantities.length < 8; q += Math.max(1, Math.floor((maxQty - Math.ceil(expectedTotal)) / 5))) {
      candidateQuantities.push(q);
    }

    let bestQty = minQty;
    let bestScore = -Infinity;

    // Evaluate each candidate quantity with shared simulations for efficiency
    for (const qty of candidateQuantities) {
      let trueCount = 0;
      let totalValue = 0;

      // Use slightly fewer sims for opening (more candidates to evaluate)
      const openingSims = Math.floor(N * 0.7);
      for (let i = 0; i < openingSims; i++) {
        const sim = simulateUnknownDice();
        const eval = evaluateRaise(sim, qty, bestFace);
        if (eval.isTrue) trueCount++;
        totalValue += eval.value;
      }

      const trueRate = trueCount / openingSims;
      const avgValue = totalValue / openingSims;
      
      // Score: favor higher true rate and positive value
      // In survival mode, be more conservative
      // When ahead, can be slightly more aggressive
      const minTrueRate = isLowDice ? 0.43 : (isAhead ? 0.36 : 0.38);
      const scoreWeight = isLowDice ? 0.72 : (isAhead ? 0.60 : 0.65);
      const score = trueRate * scoreWeight + avgValue * (1 - scoreWeight);
      
      if (score > bestScore && trueRate >= minTrueRate) {
        bestScore = score;
        bestQty = qty;
      }
    }
    
    // Fallback: if no good candidate, use expected value
    if (bestScore === -Infinity) {
      bestQty = Math.max(minQty, Math.floor(expectedTotal));
    }

    postMessage({ action: 'raise', quantity: bestQty, face: bestFace });
    return;
  }

  // RESPONDING TO A BID
  const { quantity: prevQty, face: prevFace } = currentBid;

  // Evaluate calling LIAR
  let liarWins = 0;
  let liarTotalValue = 0;
  for (let i = 0; i < N; i++) {
    const sim = simulateUnknownDice();
    const eval = evaluateLiarCall(sim);
    if (eval.win) liarWins++;
    liarTotalValue += eval.value;
  }
  const liarWinRate = liarWins / N;
  const liarAvgValue = liarTotalValue / N;

  // Generate legal raise options
  const raiseOptions = [];
  
  // Option 1: Increase quantity by 1 (same face)
  raiseOptions.push({ quantity: prevQty + 1, face: prevFace });
  
  // Option 2: Same quantity, higher face(s)
  for (let f = prevFace + 1; f <= 6; f++) {
    raiseOptions.push({ quantity: prevQty, face: f });
  }

  // Evaluate each raise option
  const raiseEvaluations = [];
  for (const option of raiseOptions) {
    let trueCount = 0;
    let totalValue = 0;

    for (let i = 0; i < N; i++) {
      const sim = simulateUnknownDice();
      const eval = evaluateRaise(sim, option.quantity, option.face);
      if (eval.isTrue) trueCount++;
      totalValue += eval.value;
    }

    const trueRate = trueCount / N;
    const avgValue = totalValue / N;
    
    // Score: prefer safer raises (higher true rate) but also consider value
    const score = trueRate * 0.6 + avgValue * 0.4;
    
    raiseEvaluations.push({
      option,
      trueRate,
      avgValue,
      score
    });
  }

  // Find best raise option - smarter sorting
  raiseEvaluations.sort((a, b) => {
    // Primary: by score
    if (Math.abs(b.score - a.score) > 0.005) return b.score - a.score;
    // Secondary: prefer face bumps (usually safer than quantity increases)
    if (a.option.face > b.option.face && a.option.quantity === b.option.quantity) return -1;
    if (b.option.face > a.option.face && a.option.quantity === b.option.quantity) return 1;
    // Tertiary: prefer lower quantity (more conservative)
    return a.option.quantity - b.option.quantity;
  });
  const bestRaise = raiseEvaluations[0];

  // Decision: Call LIAR if it's significantly better than raising
  // Adaptive thresholds based on survival mode and position
  // When low on dice, be more conservative (higher thresholds)
  // When ahead, can be slightly more aggressive
  const baseLiarThreshold = 0.24;
  const liarThreshold = isVeryLowDice ? 0.32 : (isLowDice ? 0.28 : (isAhead ? 0.22 : baseLiarThreshold));
  const liarValueThreshold = isVeryLowDice ? 0.18 : (isLowDice ? 0.14 : 0.12);
  const baseRaiseThreshold = 0.38;
  const raiseThreshold = isVeryLowDice ? 0.48 : (isLowDice ? 0.43 : (isAhead ? 0.36 : baseRaiseThreshold));

  // Compare LIAR vs best raise
  const liarBetter = liarWinRate >= liarThreshold || (liarWinRate >= 0.20 && liarAvgValue >= liarValueThreshold);
  const raiseBetter = bestRaise && bestRaise.trueRate >= raiseThreshold;

  if (liarBetter) {
    // Call LIAR if it's clearly better OR if raise is weak
    if (!raiseBetter || liarWinRate > bestRaise.trueRate || liarAvgValue > bestRaise.avgValue) {
      postMessage({ action: 'liar' });
      return;
    }
  }

  // Otherwise, make the best raise if it's credible
  if (raiseBetter) {
    postMessage({ 
      action: 'raise', 
      quantity: bestRaise.option.quantity, 
      face: bestRaise.option.face 
    });
    return;
  }

  // Fallback: if no good raise, call LIAR (better than making a bad raise)
  // But in survival mode, be even more conservative
  const fallbackLiarThreshold = isVeryLowDice ? 0.25 : (isLowDice ? 0.22 : 0.18);
  if (liarWinRate >= fallbackLiarThreshold) {
    postMessage({ action: 'liar' });
  } else {
    // Last resort: try to find any reasonable raise before giving up
    // Check if there's a face bump that's safer
    let safeFaceBump = null;
    for (const eval of raiseEvaluations) {
      if (eval.option.face > prevFace && eval.option.quantity === prevQty && eval.trueRate >= 0.30) {
        safeFaceBump = eval.option;
        break;
      }
    }
    
    if (safeFaceBump) {
      postMessage({ action: 'raise', quantity: safeFaceBump.quantity, face: safeFaceBump.face });
    } else if (isVeryLowDice && liarWinRate >= 0.15) {
      // In very low dice, prefer calling LIAR even if slightly risky
      postMessage({ action: 'liar' });
    } else {
      // Minimal raise (quantity +1, same face)
      postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    }
  }
};
