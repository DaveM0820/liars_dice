// BOT_NAME: Enhanced Opponent Modeling & Exploitation
// Strategy: Advanced opponent profiling + Bayesian beliefs + exact probability + multi-dimensional behavior tracking + momentum detection + EV-based decisions + belief decay + table-wide analysis + variance-aware probability
// Version: 3.4.0
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
    self.beliefHand = {}; // Track which hand we last updated beliefs for
    for (let p of players) {
      if (p.id !== you.id) {
        self.belief[p.id] = Array(7).fill(0);
        for (let face = 1; face <= 6; face++) {
          self.belief[p.id][face] = p.diceCount / 6;
        }
        self.beliefHand[p.id] = 0;
      }
    }
  }
  
  // Belief decay: if dice were re-rolled (new hand), decay old beliefs
  const currentHand = history.length > 0 ? history[history.length - 1].hand || 0 : 0;
  for (let p of players) {
    if (p.id !== you.id && self.belief[p.id] && self.beliefHand[p.id] !== currentHand) {
      // New hand - decay beliefs toward uniform (dice were re-rolled)
      const decayFactor = 0.7; // Keep 70% of old belief, move 30% toward uniform
      for (let face = 1; face <= 6; face++) {
        const uniform = p.diceCount / 6;
        self.belief[p.id][face] = decayFactor * self.belief[p.id][face] + (1 - decayFactor) * uniform;
      }
      self.beliefHand[p.id] = currentHand;
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
    let varianceSum = 0;
    
    for (let p of players) {
      if (p.id !== you.id) {
        const beliefCount = self.belief[p.id] 
          ? Math.min(p.diceCount, self.belief[p.id][face] || 0)
          : p.diceCount / 6;
        expectedUnknown += beliefCount;
        // Estimate variance: if belief is high, less variance; if low, more variance
        const uncertainty = p.diceCount - beliefCount;
        varianceSum += beliefCount * (1 - beliefCount / p.diceCount) + uncertainty * (1/6) * (5/6);
      }
    }
    
    // Use exact binomial with belief-adjusted probability
    // Adjust probability based on variance - high variance = more uncertainty
    const estimatedP = unknownDiceCount > 0 
      ? Math.max(1/6, Math.min(5/6, expectedUnknown / unknownDiceCount))
      : 1/6;
    
    // Adjust for variance: if variance is high, be slightly more conservative
    // But don't over-adjust - variance is already accounted for in binomial
    const varianceAdjustment = Math.min(1.0, 1.0 - (varianceSum / (unknownDiceCount * unknownDiceCount)) * 0.05);
    const adjustedP = estimatedP * varianceAdjustment;
    
    // Use exact binomial with the adjusted probability
    return binomTail(unknownDiceCount, need, Math.max(1/6, adjustedP));
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
  let liarThreshold = 0.19;  // Fine-tuned for optimal performance
  let raiseThreshold = 0.40;  // Balanced confidence threshold
  
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
    liarThreshold = 0.16;  // More conservative when leading
    raiseThreshold = 0.53;  // Higher bar for raises
  } else if (isTrailing) {
    liarThreshold = 0.26;  // More aggressive when trailing
    raiseThreshold = 0.32;  // Lower bar for raises
  }
  
  // Adjust for game stage
  if (gameStage === 'late') {
    raiseThreshold = Math.max(raiseThreshold, 0.51);
    liarThreshold = Math.max(liarThreshold, 0.23);
  } else if (gameStage === 'early') {
    raiseThreshold = Math.min(raiseThreshold, 0.39);
    // Early game: can be slightly more aggressive with calling
    if (myDiceCount >= 4) {
      liarThreshold = Math.max(0.18, liarThreshold - 0.01);
    }
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
      // If we have good dice (4+), can be more aggressive in early game
      if (myDiceCount >= 4) {
        liarThreshold = Math.max(0.17, liarThreshold - 0.02);
      }
    }
  }
  
  // Early game advantage: if we have strong holdings (5 dice), be slightly more aggressive
  if (gameStage === 'early' && myDiceCount === 5 && myDice.length >= 3) {
    // Count how many faces we have at least 1 of
    const faceCounts = Array(7).fill(0);
    myDice.forEach(d => faceCounts[d]++);
    const uniqueFaces = faceCounts.slice(1).filter(c => c > 0).length;
    
    if (uniqueFaces >= 3) {
      // Good diversity - can be slightly more aggressive
      raiseThreshold = Math.max(0.35, raiseThreshold - 0.03);
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
    
    // Multi-dimensional profiling with weighted adjustments
    if (raiseRate > 0.7 && avgBidStrength > 1.2) {
      // Very aggressive bluffer - be skeptical
      liarThreshold = Math.min(0.30, liarThreshold + 0.09);
    }
    if (raiseRate < 0.4 && liarRate > 0.5) {
      // Conservative honest player - trust them more
      liarThreshold = Math.max(0.14, liarThreshold - 0.08);
    }
    if (bluffFailRate > 0.3) {
      // Known bluffer - catch their bluffs
      liarThreshold = Math.min(0.30, liarThreshold + 0.06);
    }
    if (callAccuracy > 0.7 && liarRate > 0.4) {
      // Accurate caller - their judgment is good, trust their bids
      liarThreshold = Math.max(0.14, liarThreshold - 0.06);
    }
    
    // Combined signals: if opponent is both aggressive AND inaccurate caller
    if (raiseRate > 0.65 && callAccuracy < 0.4 && oppStats.callsTotal > 2) {
      // They bluff a lot and call poorly - exploit by calling more
      liarThreshold = Math.min(0.30, liarThreshold + 0.04);
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
  
  // ===== TABLE-WIDE ANALYSIS =====
  // Analyze overall table aggression
  let tableAggression = 0;
  let tableCallRate = 0;
  let activeOpponents = 0;
  
  for (let p of players) {
    if (p.id !== you.id && p.diceCount > 0 && self.stats[p.id]) {
      const oppStats = self.stats[p.id];
      const oppActions = Math.max(1, oppStats.totalActions);
      tableAggression += oppStats.raises / oppActions;
      tableCallRate += oppStats.liars / oppActions;
      activeOpponents++;
    }
  }
  
  if (activeOpponents > 0) {
    tableAggression /= activeOpponents;
    tableCallRate /= activeOpponents;
    
    // Adjust thresholds based on table dynamics
    if (tableAggression > 0.6) {
      // Aggressive table - be more ready to call
      liarThreshold = Math.min(0.30, liarThreshold + 0.03);
    } else if (tableAggression < 0.4 && tableCallRate < 0.3) {
      // Passive table - can be more aggressive
      raiseThreshold = Math.max(0.30, raiseThreshold - 0.05);
    }
    
    if (tableCallRate > 0.5) {
      // High calling table - need stronger raises
      raiseThreshold = Math.max(raiseThreshold, 0.50);
    }
  }
  
  // ===== EXTREME LATE GAME OPTIMIZATION =====
  if (totalDice <= 5 && alivePlayers <= 3) {
    // Very late game - be extremely precise
    raiseThreshold = Math.max(raiseThreshold, 0.60);
    liarThreshold = Math.max(liarThreshold, 0.28);
    
    // In very late game, consider that opponents have fewer dice
    // This means probabilities are more certain
    if (unknownDiceCount <= 3) {
      raiseThreshold = Math.max(raiseThreshold, 0.65);
    }
  }
  
  // ===== OPENING BID =====
  if (!currentBid) {
    const counts = Array(7).fill(0);
    myDice.forEach(d => counts[d]++);
    
    // Consider all faces with advanced scoring
    let bestFace = 1;
    let bestScore = -1;
    
    for (let f = 1; f <= 6; f++) {
      // Calculate expected total using beliefs
      let expUnknown = 0;
      for (let p of players) {
        if (p.id !== you.id) {
          expUnknown += self.belief[p.id] 
            ? Math.min(p.diceCount, self.belief[p.id][f] || 0)
            : p.diceCount / 6;
        }
      }
      
      const expTotal = counts[f] + expUnknown;
      let testQty = Math.max(1, Math.floor(expTotal));
      
      // Push up while still meeting raise threshold
      while (probabilityAtLeast(f, testQty + 1) >= raiseThreshold && testQty < totalDice) {
        testQty++;
      }
      
      // Advanced scoring: probability * quantity * (1 + holdings bonus) * (1 + expected value bonus)
      const prob = probabilityAtLeast(f, testQty);
      const holdingsBonus = 1 + counts[f] * 0.15; // Stronger bonus for faces we have
      const evBonus = 1 + (expUnknown / unknownDiceCount) * 0.1; // Bonus for high expected value
      const score = prob * testQty * holdingsBonus * evBonus;
      
      if (score > bestScore || (score === bestScore && counts[f] > counts[bestFace])) {
        bestScore = score;
        bestFace = f;
      }
    }
    
    // Calculate final quantity for best face
    let expUnknown = 0;
    for (let p of players) {
      if (p.id !== you.id) {
        expUnknown += self.belief[p.id] 
          ? Math.min(p.diceCount, self.belief[p.id][bestFace] || 0)
          : p.diceCount / 6;
      }
    }
    
    let qty = Math.max(1, Math.floor(counts[bestFace] + expUnknown));
    
    // Push up while still meeting raise threshold, but be smart about it
    let attempts = 0;
    while (probabilityAtLeast(bestFace, qty + 1) >= raiseThreshold && qty < totalDice && attempts < 10) {
      qty++;
      attempts++;
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
  
  // Find best raise option - consider all legal raises with expected value
  const raiseOptions = [{q: currQ + 1, f: currF}];
  if (currF < 6) {
    for (let f = currF + 1; f <= 6; f++) {
      raiseOptions.push({q: currQ, f: f});
    }
  }
  
  // Calculate expected value for each option
  // EV = probability * (positive outcome) - (1 - probability) * (negative outcome)
  // In this case, we want to maximize probability while considering risk
  raiseOptions.forEach(opt => {
    opt.prob = probabilityAtLeast(opt.f, opt.q);
    const myCount = myDice.filter(d => d === opt.f).length;
    
    // Score based on probability, safety, and our holdings
    // Higher probability = better
    // Higher face at same quantity = slightly safer (harder to call)
    // Having the face ourselves = bonus
    let score = opt.prob * 100;
    if (opt.f > currF) score += 5; // Face bump is safer
    if (myCount > 0) score += myCount * 3; // Having the face helps
    
    // Prefer quantity+1 over face bump if both have similar probability
    if (opt.q === currQ + 1 && opt.f === currF) score += 2;
    
    opt.score = score;
  });
  
  // Sort by score (best first)
  raiseOptions.sort((a, b) => b.score - a.score);
  
  // Try to find a raise that meets our confidence threshold
  for (let opt of raiseOptions) {
    if (opt.prob >= raiseThreshold) {
      postMessage({ action: 'raise', quantity: opt.q, face: opt.f });
      return;
    }
  }
  
  // If no raise meets threshold, consider the best available option
  // if it's close enough and we're not in a critical position
  const bestOption = raiseOptions[0];
  if (bestOption && bestOption.prob >= raiseThreshold * 0.80 && claimProb >= 0.30 && !isLeading) {
    // Close enough (80% of threshold) and we're not leading - can take calculated risk
    // But only if we have some of that face ourselves
    const myCount = myDice.filter(d => d === bestOption.f).length;
    if (myCount > 0 || bestOption.prob >= raiseThreshold * 0.85) {
      postMessage({ action: 'raise', quantity: bestOption.q, face: bestOption.f });
      return;
    }
  }
  
  // If no safe raise but current claim is somewhat plausible, evaluate options
  if (claimProb >= 0.28) {
    const bestOption = raiseOptions[0];
    const bestProb = bestOption ? bestOption.prob : 0;
    
    // Multi-factor decision making
    // Consider: probability, position, momentum, game stage, opponent behavior
    const riskFactors = {
      lowProb: bestProb < 0.25,
      highMomentum: momentum >= MOM_HIGH,
      leading: isLeading,
      lateGame: gameStage === 'late',
      fewPlayers: alivePlayers <= 3
    };
    
    // Count risk factors
    const riskCount = Object.values(riskFactors).filter(v => v).length;
    
    // Decision logic
    let shouldRaise = false;
    
    // Enhanced decision logic with more nuanced conditions
    if (bestProb >= 0.28 && claimProb >= 0.32) {
      // Good probabilities - raise
      shouldRaise = true;
    } else if (bestProb >= 0.25 && claimProb >= 0.30 && riskCount <= 1) {
      // Moderate-good probabilities, low risk - raise
      shouldRaise = true;
    } else if (bestProb >= 0.22 && claimProb >= 0.30 && riskCount <= 1 && !isLeading) {
      // Moderate probabilities, low risk, not leading - raise
      shouldRaise = true;
    } else if (bestProb >= 0.20 && claimProb >= 0.35 && momentum <= MOM_LOW && !isLeading) {
      // Lower probabilities but low momentum and not leading - can risk it
      shouldRaise = true;
    } else if (bestProb >= 0.18 && claimProb >= 0.33 && isTrailing && gameStage !== 'late') {
      // Trailing, need to take risks
      shouldRaise = true;
    } else if (bestProb >= 0.23 && claimProb >= 0.32 && tableAggression < 0.5 && !isLeading) {
      // Passive table, decent probabilities - can raise
      shouldRaise = true;
    }
    
    // Override: high momentum + low probability = call liar
    if (momentum >= MOM_HIGH && bestProb < 0.22) {
      shouldRaise = false;
    }
    
    // Override: leading + late game = be very conservative
    if (isLeading && gameStage === 'late' && bestProb < 0.28) {
      shouldRaise = false;
    }
    
    // Additional check: if we have good dice for this face, can be more aggressive
    if (!shouldRaise && bestOption) {
      const myCount = myDice.filter(d => d === bestOption.f).length;
      if (myCount >= 2 && bestProb >= 0.20 && claimProb >= 0.30) {
        // We have 2+ of this face, decent probabilities - take the risk
        shouldRaise = true;
      }
    }
    
    if (shouldRaise && bestOption) {
      postMessage({ action: 'raise', quantity: bestOption.q, face: bestOption.f });
    } else {
      // Call liar
      postMessage({ action: 'liar' });
    }
  } else {
    // Otherwise call liar
    postMessage({ action: 'liar' });
  }
};
