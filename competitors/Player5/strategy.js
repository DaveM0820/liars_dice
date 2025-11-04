// BOT_NAME: Game-Theoretic Equilibrium Strategy
// Strategy: Uses precomputed equilibrium policy (simplified - falls back to baseline)
// Version: 1.0.0 (Starter)
// Authorship: Tournament System

onmessage = (e) => {
  const state = e.data.state;
  const { you, players, currentBid } = state;
  const myDice = you.dice;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDice.length;
  
  // Construct a simplified state representation that indexes into our policy table
  const myDiceSorted = [...myDice].sort().join(''); // e.g. "146" if dice are [1,4,6]
  const currentBidStr = currentBid
    ? `${currentBid.quantity}${currentBid.face}`
    : "none";
  
  // Compose an information-set key (simplified; real strategy might use more detail)
  const infoKey = `${myDiceSorted}|${currentBidStr}|${players.map(p => p.diceCount).join(',')}`;
  
  // Lookup the recommended action from the equilibrium policy map (precomputed offline)
  // For now, we use a simplified baseline strategy since we don't have a precomputed policy
  // In a real implementation, this would be loaded from a trained model
  let actionRec;
  if (self.equilibriumPolicy && self.equilibriumPolicy[infoKey]) {
    actionRec = self.equilibriumPolicy[infoKey];
  } else {
    // Fallback: use a baseline probability strategy
    // This is a simplified version - a real equilibrium strategy would have a comprehensive policy table
    
    // Probability helper
    function probabilityAtLeast(face, qty) {
      const myCount = myDice.filter(d => d === face).length;
      const need = Math.max(0, qty - myCount);
      const p = 1/6;
      
      if (need <= 0) return 1;
      if (need > unknownDiceCount) return 0;
      
      // Simple binomial approximation
      const mean = unknownDiceCount * p;
      const variance = unknownDiceCount * p * (1 - p);
      const stddev = Math.sqrt(variance);
      
      if (need <= mean) return 1;
      
      // Normal approximation for tail
      const z = (need - mean) / (stddev || 1);
      return Math.max(0, Math.min(1, Math.exp(-0.5 * z * z)));
    }
    
    if (!currentBid) {
      // Opening bid
      const counts = Array(7).fill(0);
      myDice.forEach(d => counts[d]++);
      let bestFace = counts.indexOf(Math.max(...counts.slice(1)));
      if (bestFace < 1) bestFace = 1;
      const expTotal = counts[bestFace] + (unknownDiceCount * (1/6));
      const openQty = Math.max(1, Math.floor(expTotal));
      actionRec = { action: 'raise', quantity: openQty, face: bestFace };
    } else {
      const { quantity: currQ, face: currF } = currentBid;
      const claimProb = probabilityAtLeast(currF, currQ);
      
      if (claimProb < 0.22) {
        actionRec = { action: 'liar', quantity: null, face: null };
      } else {
        // Try minimal raise
        const raiseOpts = [{q: currQ + 1, f: currF}].concat(
          currF < 6 ? [{q: currQ, f: currF + 1}] : []
        );
        let found = false;
        for (let opt of raiseOpts) {
          if (probabilityAtLeast(opt.f, opt.q) >= 0.40) {
            actionRec = { action: 'raise', quantity: opt.q, face: opt.f };
            found = true;
            break;
          }
        }
        if (!found) {
          actionRec = { action: 'raise', quantity: currQ + 1, face: currF };
        }
      }
    }
  }
  
  // Deterministic choice: pick the action (highest probability in mixed strategy)
  let finalAction;
  if (actionRec.mixProb) {
    // Choose argmax of mixProb (deterministic choice of the most favored action)
    let bestAct = actionRec.action;
    finalAction = { action: bestAct, quantity: actionRec.quantity, face: actionRec.face };
  } else {
    finalAction = { action: actionRec.action, quantity: actionRec.quantity, face: actionRec.face };
  }
  
  // Output the chosen action
  postMessage(finalAction);
};

