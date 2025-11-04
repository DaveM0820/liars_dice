// BOT_NAME: Enhanced Bayesian Inference Strategy
// Strategy: Advanced Bayesian Inference + Opponent Modeling + Exact Probability
// Version: 2.0.0
// Authorship: Tournament System (Enhanced)

onmessage = (e) => {
  const { you, players, currentBid, history } = e.data.state;
  const myDice = you.dice;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDice.length;
  const myDiceCount = myDice.length;
  
  // ===== EXACT BINOMIAL CALCULATIONS (from ProbabilityTuned) =====
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  
  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    let coeff = 1;
    for (let i = 1; i <= k; i++) coeff = coeff * (n - (k - i)) / i;
    return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  
  function binomTail(n, k, p) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    let term = binomPMF(n, k, p), sum = term;
    for (let x = k + 1; x <= n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-12) break;
    }
    return clamp01(sum);
  }
  
  // ===== ENHANCED BAYESIAN BELIEF SYSTEM =====
  // belief[playerId][face] = estimated count of 'face' dice that player holds
  if (!self.belief) {
    self.belief = {};
    for (let p of players) {
      if (p.id !== you.id) {
        self.belief[p.id] = Array(7).fill(0);
        for (let face = 1; face <= 6; face++) {
          self.belief[p.id][face] = p.diceCount / 6;
        }
      }
    }
  }
  
  // ===== OPPONENT MODELING (from Player3) =====
  if (!self.stats) {
    self.stats = {};
  }
  
  // Update opponent stats from history
  if (history.length > 0) {
    const lastAction = history[history.length - 1];
    
    // Track opponent behavior
    if (!self.stats[lastAction.actor]) {
      self.stats[lastAction.actor] = { raises: 0, liars: 0, totalActions: 0, bluffFails: 0 };
    }
    
    if (lastAction.action === 'raise') {
      self.stats[lastAction.actor].raises += 1;
      self.stats[lastAction.actor].totalActions += 1;
      
      // Enhanced belief update: when opponent bids on face F, update belief
      const bidder = lastAction.actor;
      const { quantity: q, face: f } = lastAction;
      
      if (bidder !== you.id && self.belief[bidder]) {
        const bidderPlayer = players.find(p => p.id === bidder);
        if (bidderPlayer) {
          // More sophisticated update: increase belief based on bid strength
          // High quantity bids suggest stronger holdings
          const bidStrength = q / bidderPlayer.diceCount;
          const beliefIncrease = Math.min(1.5, 0.5 + bidStrength * 0.5);
          
          // Update belief for the bid face
          self.belief[bidder][f] = Math.min(
            bidderPlayer.diceCount,
            Math.max(self.belief[bidder][f], beliefIncrease)
          );
          
          // Slightly decrease beliefs for other faces (normalization)
          const totalOther = bidderPlayer.diceCount - self.belief[bidder][f];
          const otherFaces = 5;
          for (let face = 1; face <= 6; face++) {
            if (face !== f) {
              self.belief[bidder][face] = Math.max(0, totalOther / otherFaces);
            }
          }
        }
      }
    } else if (lastAction.action === 'liar') {
      self.stats[lastAction.actor].liars += 1;
      self.stats[lastAction.actor].totalActions += 1;
    }
    
    // Track bluff failures
    if (lastAction.action === 'resolution' || lastAction.action === 'resolution-illegal') {
      if (!lastAction.claimTrue && lastAction.losers && lastAction.losers.length > 0) {
        const recentRaises = history.slice().reverse();
        for (let h of recentRaises) {
          if (h.action === 'raise' && h.on && lastAction.on && 
              h.quantity === lastAction.on.quantity && h.face === lastAction.on.face) {
            if (self.stats[h.actor]) {
              self.stats[h.actor].bluffFails += 1;
            }
            break;
          }
        }
      }
    }
  }
  
  // ===== PROBABILITY CALCULATION WITH BELIEFS =====
  function probabilityBidTrue(qty, face) {
    const myCount = myDice.filter(d => d === face).length;
    const need = qty - myCount;
    if (need <= 0) return 1;
    
    // Calculate expected count from beliefs
    let expectedUnknown = 0;
    let maxPossible = 0;
    
    for (let p of players) {
      if (p.id !== you.id) {
        const beliefCount = self.belief[p.id] 
          ? Math.min(p.diceCount, self.belief[p.id][face] || 0)
          : p.diceCount / 6;
        expectedUnknown += beliefCount;
        maxPossible += p.diceCount;
      }
    }
    
    // Use exact binomial with belief-adjusted probability
    // Estimate p based on expected count vs total unknown dice
    const estimatedP = unknownDiceCount > 0 
      ? Math.max(1/6, Math.min(5/6, expectedUnknown / unknownDiceCount))
      : 1/6;
    
    // Use exact binomial tail calculation
    return binomTail(unknownDiceCount, need, estimatedP);
  }
  
  // ===== ADAPTIVE THRESHOLDS (from Player4 + Player3) =====
  // Determine relative rank by dice count
  const sortedCounts = players.map(p => p.diceCount).sort((a, b) => b - a);
  const myRank = sortedCounts.indexOf(myDiceCount) + 1;
  const maxDice = sortedCounts[0];
  const minDice = sortedCounts[sortedCounts.length - 1];
  
  // Base thresholds
  let liarThreshold = 0.22;
  let raiseThreshold = 0.40;
  
  // Adjust based on dice count (from Player4)
  if (myDiceCount === maxDice) {
    // Leading: be more cautious
    liarThreshold = 0.18;
    raiseThreshold = 0.50;
  } else if (myDiceCount === minDice) {
    // Trailing: be more aggressive
    liarThreshold = 0.28;
    raiseThreshold = 0.35;
  }
  
  // Adjust for game stage
  if (totalDice < 10) {
    // Late game: be more careful
    raiseThreshold = Math.max(raiseThreshold, 0.50);
    liarThreshold = Math.max(liarThreshold, 0.25);
  }
  
  // Adjust based on opponent behavior (from Player3)
  if (currentBid && history.length > 0) {
    const lastRaise = history.slice().reverse().find(h => h.action === 'raise');
    const prevBidderId = lastRaise ? lastRaise.actor : null;
    
    if (prevBidderId && self.stats[prevBidderId]) {
      const oppStats = self.stats[prevBidderId];
      const raiseRate = oppStats.raises / Math.max(1, oppStats.totalActions);
      const liarRate = oppStats.liars / Math.max(1, oppStats.totalActions);
      const bluffFailRate = oppStats.bluffFails / Math.max(1, oppStats.raises);
      
      // If opponent bluffs a lot, be more skeptical
      if (raiseRate > 0.7 || bluffFailRate > 0.3) {
        liarThreshold = Math.min(0.30, liarThreshold + 0.05);
      }
      // If opponent is honest (high liar rate), be more lenient
      if (liarRate > 0.5) {
        liarThreshold = Math.max(0.15, liarThreshold - 0.05);
      }
    }
  }
  
  // ===== OPENING BID =====
  if (!currentBid) {
    const counts = Array(7).fill(0);
    myDice.forEach(d => counts[d]++);
    let bestFace = 1;
    for (let f = 1; f <= 6; f++) {
      if (counts[f] > counts[bestFace]) bestFace = f;
    }
    
    // Calculate expected total using beliefs
    let expUnknown = 0;
    for (let p of players) {
      if (p.id !== you.id) {
        expUnknown += self.belief[p.id] 
          ? Math.min(p.diceCount, self.belief[p.id][bestFace] || 0)
          : p.diceCount / 6;
      }
    }
    
    const expTotal = counts[bestFace] + expUnknown;
    let openQty = Math.max(1, Math.floor(expTotal));
    
    // Push up while still meeting raise threshold
    while (probabilityBidTrue(openQty + 1, bestFace) >= raiseThreshold && openQty < totalDice) {
      openQty++;
    }
    
    postMessage({ action: 'raise', quantity: openQty, face: bestFace });
    return;
  }
  
  // ===== REACTING TO BID =====
  const { quantity: currQ, face: currF } = currentBid;
  const claimProb = probabilityBidTrue(currQ, currF);
  
  // Call liar if probability is too low
  if (claimProb < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Find best raise option
  const raiseOptions = [{q: currQ + 1, f: currF}];
  if (currF < 6) raiseOptions.push({q: currQ, f: currF + 1});
  
  // Try to find a raise that meets our threshold
  for (let opt of raiseOptions) {
    if (probabilityBidTrue(opt.q, opt.f) >= raiseThreshold) {
      postMessage({ action: 'raise', quantity: opt.q, face: opt.f });
      return;
    }
  }
  
  // If no safe raise but current claim is somewhat plausible, minimal nudge
  if (claimProb >= 0.30) {
    postMessage({ action: 'raise', quantity: currQ + 1, face: currF });
  } else {
    // Otherwise call liar
    postMessage({ action: 'liar' });
  }
};
