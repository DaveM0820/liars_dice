// BOT_NAME: Bayesian Inference Strategy
// Strategy: Bayesian Inference - Updates beliefs about opponent dice based on their bids
// Version: 1.0.0 (Starter)
// Authorship: Tournament System

onmessage = (e) => {
  const { you, players, currentBid, history } = e.data.state;
  const myDice = you.dice;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDice.length;
  
  // Belief model: initialize uniform probabilities for unseen dice
  // belief[playerId][face] = estimated count of 'face' dice that player holds.
  if (!self.belief) {
    self.belief = {};
    for (let p of players) {
      if (p.id !== you.id) {
        self.belief[p.id] = Array(7).fill(0);
        // Start with expected count = (p.diceCount * 1/6) for each face
        for (let face = 1; face <= 6; face++) {
          self.belief[p.id][face] = p.diceCount / 6;
        }
      }
    }
  }
  
  // Update beliefs based on the latest bid in history (if any new info)
  if (history.length > 0) {
    const lastAction = history[history.length - 1];
    if (lastAction.action === 'raise') {
      const bidder = lastAction.actor;
      const { quantity: q, face: f } = lastAction;
      // If an opponent raised on face f, assume they likely have at least one f.
      if (bidder !== you.id && self.belief[bidder]) {
        // Increase belief that this bidder holds face f (up to their dice count)
        const bidderPlayer = players.find(p => p.id === bidder);
        if (bidderPlayer) {
          self.belief[bidder][f] = Math.min(
            bidderPlayer.diceCount,
            Math.max(self.belief[bidder][f], 1)
          );
        }
      }
    }
  }
  
  // Helper: calculate probability current bid (qty of face) is true under beliefs
  function probabilityBidTrue(qty, face) {
    let have = myDice.filter(d => d === face).length;
    let need = qty - have;
    if (need < 0) return 1; // I alone exceed the bid
    
    // Estimate expected count of `face` among unknown dice using beliefs
    let expectedUnknown = 0;
    for (let p of players) {
      if (p.id !== you.id) {
        // use belief or default 1/6 expectation for this face
        expectedUnknown += self.belief[p.id]
          ? Math.min(p.diceCount, self.belief[p.id][face] || 0)
          : p.diceCount / 6;
      }
    }
    
    // Use a binomial-tail approximation around the expectedUnknown
    const mean = expectedUnknown;
    const variance = expectedUnknown * (5/6); // rough variance assuming binary outcome per die
    const stddev = Math.sqrt(variance);
    
    // Approximate probability at least `need` successes (Chebyshev bound or normal approx)
    let prob = 0;
    if (need <= mean) {
      prob = 1; // if need is below expected, assume highly likely
    } else {
      // if need > mean, estimate probability with tail of normal distribution
      const z = (need - mean) / (stddev || 1);
      // simple normal tail approximation
      prob = Math.exp(-0.5 * z * z);
    }
    return Math.max(0, Math.min(1, prob));
  }
  
  if (!currentBid) {
    // Opening bid: choose face I have the most of, quantity near expectation
    const counts = Array(7).fill(0);
    myDice.forEach(d => counts[d]++);
    let bestFace = counts.indexOf(Math.max(...counts.slice(1)));
    if (bestFace < 1) bestFace = 1;
    
    // expected total of bestFace = my count + expected others
    let expTotal = counts[bestFace] + (unknownDiceCount * (1/6));
    let openQty = Math.max(1, Math.floor(expTotal));
    postMessage({ action: 'raise', quantity: openQty, face: bestFace });
    return;
  }
  
  const { quantity: currQ, face: currF } = currentBid;
  const claimProb = probabilityBidTrue(currQ, currF);
  
  // Decide to call liar or raise
  const LIAR_THRESH = 0.20; // base threshold for calling liar
  
  // If our belief-adjusted probability of truth is very low, call liar
  if (claimProb < LIAR_THRESH) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Otherwise, attempt a minimal credible raise
  // Find the smallest legal raise (either +1 quantity or higher face)
  const raiseOptions = [{q: currQ + 1, f: currF}].concat(
    currF < 6 ? [{q: currQ, f: currF + 1}] : []
  );
  
  for (let opt of raiseOptions) {
    if (probabilityBidTrue(opt.q, opt.f) >= LIAR_THRESH) {
      postMessage({ action: 'raise', quantity: opt.q, face: opt.f });
      return;
    }
  }
  
  // If no safe raise, just call liar as last resort
  postMessage({ action: 'liar' });
};

