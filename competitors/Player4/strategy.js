// BOT_NAME: Dice-Count Adaptive Risk Strategy
// Strategy: Adapts risk-taking based on dice counts and game stage
// Version: 1.0.0 (Starter)
// Authorship: Tournament System

onmessage = (e) => {
  const { you, players, currentBid } = e.data.state;
  const myDiceCount = you.dice.length;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDiceCount;
  
  // Determine relative rank by dice count
  const sortedCounts = players.map(p => p.diceCount).sort((a, b) => b - a);
  const myRank = sortedCounts.indexOf(myDiceCount) + 1; // 1 = highest dice count
  const maxDice = sortedCounts[0];
  const minDice = sortedCounts[sortedCounts.length - 1];
  
  // Base thresholds
  let liarThreshold = 0.20; // base probability below which to call liar
  let raiseThreshold = 0.40; // base probability needed to raise
  
  // Adjust thresholds based on stack rank
  if (myDiceCount === maxDice) {
    // I'm one of the leaders: be more cautious (harder to call liar, safer raises)
    liarThreshold = 0.15; // require claim <15% likely to call liar
    raiseThreshold = 0.50; // need ≥50% chance for a raise to be made
  }
  if (myDiceCount === minDice) {
    // I'm at the bottom: be more aggressive (call more, bluff more)
    liarThreshold = 0.30; // call if claim <30% likely
    raiseThreshold = 0.30; // only need 30% chance to attempt a raise
  }
  
  // Adjust for overall game stage (fewer dice => be more truthful and selective)
  if (totalDice < 10) { // late game scenario, very few dice left
    // Reduce bluffing because outcomes are more certain with fewer dice
    raiseThreshold = Math.max(raiseThreshold, 0.50);
    // Possibly increase liar calls slightly since big claims are easier to catch
    liarThreshold = Math.max(liarThreshold, 0.25);
  }
  
  // Probability function (binomial tail approximation)
  function probabilityAtLeast(face, qty) {
    let have = 0;
    for (let d of you.dice) {
      if (d === face) have++;
    }
    const need = Math.max(0, qty - have);
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
    // Opening bid: conservative if leading, aggressive if trailing
    // Choose face I have most of. Quantity: if I'm trailing, round up expectation; if leading, round down.
    const myFaceCounts = Array(7).fill(0);
    for (let d of you.dice) myFaceCounts[d]++;
    let bestFace = 1, bestCount = -1;
    for (let f = 1; f <= 6; f++) {
      if (myFaceCounts[f] > bestCount) {
        bestFace = f;
        bestCount = myFaceCounts[f];
      }
    }
    
    const expectedUnknown = unknownDiceCount * (1/6);
    let qty = bestCount;
    if (myDiceCount === minDice) {
      // behind - be a bit bolder
      qty = Math.max(1, Math.ceil(bestCount + expectedUnknown));
    } else {
      // ahead or normal - be a bit conservative
      qty = Math.max(1, Math.floor(bestCount + expectedUnknown) - 1);
    }
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }
  
  const { quantity: currQ, face: currF } = currentBid;
  const claimProb = probabilityAtLeast(currF, currQ);
  
  // Liar call decision
  if (claimProb < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Raise decision: find a minimal raise meeting raiseThreshold
  const options = [{ q: currQ+1, f: currF }];
  if (currF < 6) options.push({ q: currQ, f: currF+1 });
  
  for (let opt of options) {
    if (probabilityAtLeast(opt.f, opt.q) >= raiseThreshold) {
      postMessage({ action: 'raise', quantity: opt.q, face: opt.f });
      return;
    }
  }
  
  // If no raise is safe and we also aren't confident enough to call liar, nudge up minimally
  postMessage({ action: 'raise', quantity: currQ+1, face: currF });
};

