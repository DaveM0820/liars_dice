// BOT_NAME: Monte Carlo Simulation Strategy
// Strategy: Uses Monte Carlo simulation to evaluate moves
// Version: 1.0.0
// Authorship: Tournament System

const FACE_PROB = 1/6;
const SIMULATIONS = 500; // Reduced for speed

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d >= 1 && d <= 6) myFaceCounts[d]++;

  // Monte Carlo simulation
  function simulateOutcome(face, qty) {
    let successes = 0;
    const mySupport = myFaceCounts[face] || 0;
    const need = Math.max(0, qty - mySupport);

    for (let s = 0; s < SIMULATIONS; s++) {
      let count = mySupport;
      for (let i = 0; i < unknownDiceCount; i++) {
        if (Math.random() < FACE_PROB) count++;
      }
      if (count >= qty) successes++;
    }
    return successes / SIMULATIONS;
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
    let qty = Math.max(1, Math.floor(bestCount + expectedUnknown));
    while (qty + 1 <= totalDiceOnTable && simulateOutcome(bestFace, qty + 1) >= 0.40) qty++;
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  const { quantity: prevQty, face: prevFace } = currentBid;
  
  // Evaluate calling LIAR
  const liarProb = simulateOutcome(prevFace, prevQty);
  
  // Evaluate raising
  const raiseQtyProb = simulateOutcome(prevFace, prevQty + 1);
  let raiseFaceProb = 0;
  let bestFaceRaise = null;
  for (let f = prevFace + 1; f <= 6; f++) {
    const prob = simulateOutcome(f, prevQty);
    if (prob > raiseFaceProb) {
      raiseFaceProb = prob;
      bestFaceRaise = f;
    }
  }

  // Decision: choose action with higher expected value
  if (liarProb < 0.20) {
    postMessage({ action: 'liar' });
    return;
  }

  if (raiseQtyProb >= 0.40 || raiseFaceProb >= 0.40) {
    if (raiseQtyProb >= raiseFaceProb) {
      postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
    } else {
      postMessage({ action: 'raise', quantity: prevQty, face: bestFaceRaise });
    }
    return;
  }

  postMessage({ action: 'raise', quantity: prevQty + 1, face: prevFace });
};
