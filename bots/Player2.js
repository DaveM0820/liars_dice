// BOT_NAME: Monte Carlo Simulation Planner
// Strategy: Monte Carlo Simulation - Simulates many possible dice distributions
// Version: 1.0.0
// Authorship: Tournament System

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
    return {
      isTrue,
      value: isTrue ? 0.5 : -0.3, // True raise is safer, false is risky
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
      // Prefer raises that are likely (≥40%) but also aggressive enough
      const score = trueRate * 0.65 + avgValue * 0.35;
      
      if (score > bestScore && trueRate >= 0.38) { // Only consider if ≥38% likely
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

  // Find best raise option
  raiseEvaluations.sort((a, b) => b.score - a.score);
  const bestRaise = raiseEvaluations[0];

  // Decision: Call LIAR if it's significantly better than raising
  // Learned from baseline strategies: optimal thresholds around 0.22-0.28
  const liarThreshold = 0.24; // Call LIAR if win rate >= 24%
  const liarValueThreshold = 0.12; // Or if value is positive enough

  // Compare LIAR vs best raise
  const liarBetter = liarWinRate >= liarThreshold || (liarWinRate >= 0.20 && liarAvgValue >= liarValueThreshold);
  const raiseBetter = bestRaise && bestRaise.trueRate >= 0.38; // Raise threshold: 38% (learned from baselines)

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
  if (liarWinRate >= 0.18) {
    postMessage({ action: 'liar' });
  } else {
    // Last resort: minimal raise (quantity +1, same face)
    postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
  }
};
