// BOT_NAME: Monte Carlo Simulation Planner
// Strategy: Monte Carlo Simulation - Simulates many possible dice distributions to evaluate moves
// Version: 1.0.0 (Starter)
// Authorship: Tournament System

onmessage = (e) => {
  const { you, players, currentBid } = e.data.state;
  const myDice = you.dice;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDice.length;
  
  // Helper: simulate a random assignment of all unknown dice
  function randomUnknownDice() {
    // Create an array representing all unknown dice (not including mine)
    const unknown = [];
    for (let p of players) {
      if (p.id !== you.id) {
        // assign random faces for each of this player's dice
        for (let i = 0; i < p.diceCount; i++) {
          // Using deterministic seeded Math.random provided by framework
          const face = Math.floor(Math.random() * 6) + 1;
          unknown.push(face);
        }
      }
    }
    return unknown;
  }
  
  // Count occurrences of a face in an array of dice
  function countFace(diceArray, face) {
    return diceArray.filter(d => d === face).length;
  }
  
  // Decide an opening bid if no bid yet (choose a reasonable starting bid)
  if (!currentBid) {
    // Open with my highest-count face at roughly average quantity
    const counts = Array(7).fill(0);
    myDice.forEach(d => counts[d]++);
    let bestFace = counts.indexOf(Math.max(...counts.slice(1)));
    if (bestFace < 1) bestFace = 1;
    
    const expUnknown = unknownDiceCount / 6; // expected count of bestFace in unknown
    const openQty = Math.max(1, Math.round(counts[bestFace] + expUnknown));
    postMessage({ action: 'raise', quantity: openQty, face: bestFace });
    return;
  }
  
  const { quantity: currQ, face: currF } = currentBid;
  
  // Simulation parameters
  const N = 1000; // number of simulations (tune based on 200ms budget)
  let liarWins = 0, liarTotal = 0;
  let raiseWins = 0, raiseTotal = 0;
  
  for (let t = 0; t < N; t++) {
    const unknown = randomUnknownDice();
    
    // Current bid outcome if we call liar:
    liarTotal++;
    const actualCount = countFace(unknown.concat(myDice), currF);
    const claimTrue = (actualCount >= currQ);
    if (!claimTrue) {
      // Claim was false, calling liar would win (opponent loses a die)
      liarWins++;
    }
    // else claim was true, calling liar would lose (we lose a die)
    
    // Outcome if we raise minimally (quantity+1 of same face):
    // We assume that if our new bid is false, eventually someone will call and we'll lose;
    // if it's true, either it goes through or a liar call fails, meaning we survive or someone else loses.
    raiseTotal++;
    const newBidQ = currQ + 1;
    const newBidF = currF;
    const actualCountNew = countFace(unknown.concat(myDice), newBidF);
    const newClaimTrue = (actualCountNew >= newBidQ);
    if (newClaimTrue) {
      // Our raise could be upheld (good outcome for us, not losing a die in this round)
      raiseWins++;
    }
    // if false, assume we'll eventually be caught and lose (so no increment to raiseWins)
  }
  
  // Estimate success probabilities
  const p_callWin = liarWins / Math.max(1, liarTotal); // probability we win by calling liar
  const p_raiseWin = raiseWins / Math.max(1, raiseTotal); // probability we come out safe by raising
  
  // Decision: choose action with higher chance to avoid losing a die
  if (p_callWin > p_raiseWin) {
    postMessage({ action: 'liar' });
  } else {
    // Here we choose the minimal raise; could also simulate other raise options similarly
    postMessage({ action: 'raise', quantity: currQ + 1, face: currF });
  }
};

