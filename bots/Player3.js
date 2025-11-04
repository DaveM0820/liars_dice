// BOT_NAME: Enhanced Opponent Modeling & Exploitation
// Strategy: Advanced opponent profiling + Bayesian beliefs + exact probability + multi-dimensional behavior tracking + momentum detection
// Version: 3.1.0
// Authorship: Tournament System (Enhanced)

onmessage = (e) => {
  const { you, players, currentBid, history } = e.data.state;
  const myDice = you.dice;
  const totalDice = players.reduce((sum, p) => sum + p.diceCount, 0);
  const unknownDiceCount = totalDice - myDice.length;
  const myDiceCount = myDice.length;
  
  // ===== EXACT BINOMIAL CALCULATIONS =====
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
  
  // ===== BAYESIAN BELIEF SYSTEM =====
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
  
  // ===== ENHANCED OPPONENT MODELING =====
  if (!self.stats) self.stats = {};
  
  // Enhanced stats per opponent: behavior patterns + bid analysis
  if (history.length > 0) {
    const last = history[history.length - 1];
    if (!self.stats[last.actor]) {
      self.stats[last.actor] = {
        raises: 0, liars: 0, totalActions: 0, bluffFails: 0,
        bidStrengths: [], recentBids: [], callsCorrect: 0, callsTotal: 0
      };
    }
    
    if (last.action === 'raise') {
      self.stats[last.actor].raises += 1;
      self.stats[last.actor].totalActions += 1;
      
      // Track bid strength (quantity relative to expected)
      if (last.quantity && last.face) {
        const expected = totalDice / 6;
        const bidStrength = last.quantity / expected;
        self.stats[last.actor].bidStrengths.push(bidStrength);
        self.stats[last.actor].recentBids.push({ q: last.quantity, f: last.face });
        if (self.stats[last.actor].recentBids.length > 10) {
          self.stats[last.actor].recentBids.shift();
          self.stats[last.actor].bidStrengths.shift();
        }
      }
      
      // Update Bayesian belief: when opponent bids on face F, increase belief
      const bidder = last.actor;
      const { quantity: q, face: f } = last;
      
      if (bidder !== you.id && self.belief[bidder]) {
        const bidderPlayer = players.find(p => p.id === bidder);
        if (bidderPlayer) {
          // More sophisticated update: increase belief based on bid strength
          // Higher bids = stronger evidence they have that face
          const expectedCount = bidderPlayer.diceCount / 6;
          const bidStrength = q / expectedCount;
          
          // Exponential scaling: very high bids are strong evidence
          const confidence = Math.min(1.0, 0.3 + bidStrength * 0.35);
          const beliefIncrease = Math.min(
            bidderPlayer.diceCount * 0.8,  // Cap at 80% of their dice
            expectedCount + (bidderPlayer.diceCount - expectedCount) * confidence
          );
          
          // Update belief for the bid face
          self.belief[bidder][f] = Math.min(
            bidderPlayer.diceCount,
            Math.max(self.belief[bidder][f], beliefIncrease)
          );
          
          // Normalize other faces proportionally
          const totalBelief = self.belief[bidder].slice(1).reduce((a, b) => a + b, 0);
          const remaining = bidderPlayer.diceCount - self.belief[bidder][f];
          if (remaining > 0 && totalBelief > self.belief[bidder][f]) {
            const scale = remaining / (totalBelief - self.belief[bidder][f] + 0.01);
            for (let face = 1; face <= 6; face++) {
              if (face !== f) {
                self.belief[bidder][face] = Math.max(0, self.belief[bidder][face] * scale);
              }
            }
          }
        }
      }
    } else if (last.action === 'liar') {
      self.stats[last.actor].liars += 1;
      self.stats[last.actor].totalActions += 1;
      self.stats[last.actor].callsTotal += 1;
    }
    
    // Track bluff failures and call accuracy
    if (last.action === 'resolution' || last.action === 'resolution-illegal') {
      if (last.action === 'resolution') {
        const caller = history.slice().reverse().find(h => h.action === 'liar' && h.on && 
          h.on.quantity === last.on.quantity && h.on.face === last.on.face);
        if (caller && self.stats[caller.actor]) {
          if (!last.claimTrue) {
            self.stats[caller.actor].callsCorrect += 1;
          }
        }
      }
      
      if (!last.claimTrue && last.losers && last.losers.length > 0) {
        const recentRaises = history.slice().reverse();
        for (let h of recentRaises) {
          if (h.action === 'raise' && h.on && last.on && 
              h.quantity === last.on.quantity && h.face === last.on.face) {
            if (self.stats[h.actor]) {
              self.stats[h.actor].bluffFails += 1;
            }
            break;
          }
        }
      }
    }
  }
  
  // ===== PROBABILITY WITH BELIEFS =====
  function probabilityAtLeast(face, qty) {
    const myCount = myDice.filter(d => d === face).length;
    const need = Math.max(0, qty - myCount);
    if (need <= 0) return 1;
    if (need > unknownDiceCount) return 0;
    
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
    const estimatedP = unknownDiceCount > 0 
      ? Math.max(1/6, Math.min(5/6, expectedUnknown / unknownDiceCount))
      : 1/6;
    
    return binomTail(unknownDiceCount, need, estimatedP);
  }
  
  // ===== MOMENTUM DETECTION =====
  function calculateMomentum() {
    if (!currentBid || history.length < 2) return 0;
    
    // Look at last few raises to detect momentum
    const recentRaises = history.slice().reverse().filter(h => h.action === 'raise').slice(0, 3);
    if (recentRaises.length < 2) {
      // Simple momentum: compare current bid to expectation
      const expected = unknownDiceCount / 6;
      return Math.max(0, currentBid.quantity - expected);
    }
    
    // Calculate total quantity jump over last few raises
    let totalJump = 0;
    for (let i = 0; i < recentRaises.length - 1; i++) {
      const prev = recentRaises[i + 1];
      const curr = recentRaises[i];
      totalJump += Math.max(0, curr.quantity - prev.quantity);
    }
    return totalJump;
  }
  
  const momentum = calculateMomentum();
  const MOM_HIGH = 4;
  const MOM_LOW = 1;
  
  // ===== ADAPTIVE THRESHOLDS =====
  const sortedCounts = players.map(p => p.diceCount).sort((a, b) => b - a);
  const myRank = sortedCounts.indexOf(myDiceCount) + 1;
  const maxDice = sortedCounts[0];
  const minDice = sortedCounts[sortedCounts.length - 1];
  const isLeading = myDiceCount === maxDice;
  const isTrailing = myDiceCount === minDice;
  const alivePlayers = players.filter(p => p.diceCount > 0).length;
  const gameStage = totalDice < 10 ? 'late' : totalDice < 15 ? 'mid' : 'early';
  
  // Base thresholds - optimized based on performance
  let liarThreshold = 0.21;  // Slightly more aggressive
  let raiseThreshold = 0.42;  // Slightly higher confidence needed
  
  // Adjust for momentum
  if (momentum >= MOM_HIGH) {
    // High momentum: be more skeptical
    liarThreshold = Math.min(0.30, liarThreshold + 0.07);
    raiseThreshold = Math.max(raiseThreshold, 0.48);
  } else if (momentum <= MOM_LOW && currentBid) {
    // Low momentum: be friendlier
    liarThreshold = Math.max(0.17, liarThreshold - 0.05);
  }
  
  // Adjust based on dice position
  if (isLeading) {
    liarThreshold = 0.17;  // More conservative when leading
    raiseThreshold = 0.52;  // Higher bar for raises
  } else if (isTrailing) {
    liarThreshold = 0.27;  // More aggressive when trailing
    raiseThreshold = 0.33;  // Lower bar for raises
  }
  
  // Adjust for game stage
  if (gameStage === 'late') {
    raiseThreshold = Math.max(raiseThreshold, 0.52);
    liarThreshold = Math.max(liarThreshold, 0.24);
  } else if (gameStage === 'early') {
    raiseThreshold = Math.min(raiseThreshold, 0.40);
  }
  
  // Adjust for number of players remaining
  if (alivePlayers <= 3) {
    // Few players: be more careful
    raiseThreshold = Math.max(raiseThreshold, 0.48);
    liarThreshold = Math.max(liarThreshold, 0.22);
  } else if (alivePlayers >= 4) {
    // More players: can be slightly more aggressive early
    if (gameStage === 'early') {
      raiseThreshold = Math.min(raiseThreshold, 0.38);
    }
  }
  
  // ===== OPPONENT-SPECIFIC ADJUSTMENTS =====
  let prevBidderId = null;
  if (currentBid && history.length) {
    const lastRaise = history.slice().reverse().find(h => h.action === 'raise');
    prevBidderId = lastRaise ? lastRaise.actor : null;
  }
  
  let myIndex = players.findIndex(p => p.id === you.id);
  let nextPlayerId = players[(myIndex + 1) % players.length].id;
  if (nextPlayerId === you.id) {
    nextPlayerId = players[(myIndex + 2) % players.length]?.id;
  }
  
  // Adjust thresholds based on previous bidder's behavior
  if (prevBidderId && self.stats[prevBidderId]) {
    const oppStats = self.stats[prevBidderId];
    const raiseRate = oppStats.raises / Math.max(1, oppStats.totalActions);
    const liarRate = oppStats.liars / Math.max(1, oppStats.totalActions);
    const bluffFailRate = oppStats.bluffFails / Math.max(1, oppStats.raises);
    const avgBidStrength = oppStats.bidStrengths.length > 0
      ? oppStats.bidStrengths.reduce((a, b) => a + b, 0) / oppStats.bidStrengths.length
      : 1.0;
    const callAccuracy = oppStats.callsTotal > 0
      ? oppStats.callsCorrect / oppStats.callsTotal
      : 0.5;
    
    // Multi-dimensional profiling
    if (raiseRate > 0.7 && avgBidStrength > 1.2) {
      liarThreshold = Math.min(0.30, liarThreshold + 0.08);
    }
    if (raiseRate < 0.4 && liarRate > 0.5) {
      liarThreshold = Math.max(0.15, liarThreshold - 0.07);
    }
    if (bluffFailRate > 0.3) {
      liarThreshold = Math.min(0.30, liarThreshold + 0.05);
    }
    if (callAccuracy > 0.7 && liarRate > 0.4) {
      liarThreshold = Math.max(0.15, liarThreshold - 0.05);
    }
  }
  
  // Adjust raise threshold based on next player's behavior
  if (self.stats[nextPlayerId]) {
    const nextStats = self.stats[nextPlayerId];
    const nextCallRate = nextStats.liars / Math.max(1, nextStats.totalActions);
    const nextRaiseRate = nextStats.raises / Math.max(1, nextStats.totalActions);
    const nextCallAccuracy = nextStats.callsTotal > 0
      ? nextStats.callsCorrect / nextStats.callsTotal
      : 0.5;
    
    if (nextCallRate > 0.5 && nextCallAccuracy > 0.6) {
      raiseThreshold = 0.65;
    } else if (nextCallRate > 0.5 && nextCallAccuracy < 0.4) {
      raiseThreshold = 0.45;
    } else if (nextCallRate < 0.2 && nextRaiseRate < 0.5) {
      raiseThreshold = 0.25;
    } else if (nextCallRate > 0.5) {
      raiseThreshold = 0.55;
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
    
    let qty = Math.max(1, Math.floor(counts[bestFace] + expUnknown));
    
    // Push up while still meeting raise threshold
    while (probabilityAtLeast(bestFace, qty + 1) >= raiseThreshold && qty < totalDice) {
      qty++;
    }
    
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }
  
  // ===== REACTING TO BID =====
  const { quantity: currQ, face: currF } = currentBid;
  const claimProb = probabilityAtLeast(currF, currQ);
  
  // Call liar if probability is too low
  if (claimProb < liarThreshold) {
    postMessage({ action: 'liar' });
    return;
  }
  
  // Find best raise option - consider all legal raises, pick the one with best probability
  const raiseOptions = [{q: currQ + 1, f: currF}];
  if (currF < 6) {
    for (let f = currF + 1; f <= 6; f++) {
      raiseOptions.push({q: currQ, f: f});
    }
  }
  
  // Sort by probability (best first)
  raiseOptions.sort((a, b) => {
    const probA = probabilityAtLeast(a.f, a.q);
    const probB = probabilityAtLeast(b.f, b.q);
    return probB - probA;
  });
  
  // Try to find a raise that meets our confidence threshold
  for (let opt of raiseOptions) {
    if (probabilityAtLeast(opt.f, opt.q) >= raiseThreshold) {
      postMessage({ action: 'raise', quantity: opt.q, face: opt.f });
      return;
    }
  }
  
  // If no safe raise but current claim is somewhat plausible, evaluate options
  if (claimProb >= 0.28) {
    // Use the best available raise option
    const bestOption = raiseOptions[0];
    const bestProb = probabilityAtLeast(bestOption.f, bestOption.q);
    
    // Smart fallback logic: consider multiple factors
    const shouldRaise = 
      (bestProb >= 0.25 && claimProb >= 0.30) ||  // Good enough probability
      (bestProb >= 0.20 && claimProb >= 0.35 && momentum <= MOM_LOW) ||  // Low momentum, decent odds
      (bestProb >= 0.22 && claimProb >= 0.32 && !isLeading);  // Not leading, can take risk
    
    // But if momentum is very high, be more cautious
    if (momentum >= MOM_HIGH && bestProb < 0.23) {
      // High momentum and low probability - call liar instead
      postMessage({ action: 'liar' });
    } else if (shouldRaise) {
      postMessage({ action: 'raise', quantity: bestOption.q, face: bestOption.f });
    } else {
      // Borderline case - call liar if claim is weak
      if (claimProb < 0.32) {
        postMessage({ action: 'liar' });
      } else {
        // Last resort: minimal raise
        postMessage({ action: 'raise', quantity: bestOption.q, face: bestOption.f });
      }
    }
  } else {
    // Otherwise call liar
    postMessage({ action: 'liar' });
  }
};
