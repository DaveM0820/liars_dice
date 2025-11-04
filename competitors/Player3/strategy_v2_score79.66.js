// BOT_NAME: Enhanced Opponent Modeling & Exploitation
// Strategy: Advanced opponent profiling with exact probability + multi-dimensional behavior tracking
// Version: 2.0.0
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
  
  function probabilityAtLeast(face, qty) {
    const myCount = myDice.filter(d => d === face).length;
    const need = Math.max(0, qty - myCount);
    if (need <= 0) return 1;
    if (need > unknownDiceCount) return 0;
    return binomTail(unknownDiceCount, need, 1/6);
  }
  
  // ===== ENHANCED OPPONENT MODELING =====
  if (!self.stats) self.stats = {};
  
  // Enhanced stats per opponent: behavior patterns + bid analysis
  // { raises, liars, totalActions, bluffFails, avgBidStrength, recentBids, callAccuracy }
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
        // Keep only last 10 bids
        if (self.stats[last.actor].recentBids.length > 10) {
          self.stats[last.actor].recentBids.shift();
          self.stats[last.actor].bidStrengths.shift();
        }
      }
    } else if (last.action === 'liar') {
      self.stats[last.actor].liars += 1;
      self.stats[last.actor].totalActions += 1;
      self.stats[last.actor].callsTotal += 1;
    }
    
    // Track bluff failures and call accuracy
    if (last.action === 'resolution' || last.action === 'resolution-illegal') {
      // Track if the caller was correct
      if (last.action === 'resolution') {
        const caller = history.slice().reverse().find(h => h.action === 'liar' && h.on && 
          h.on.quantity === last.on.quantity && h.on.face === last.on.face);
        if (caller && self.stats[caller.actor]) {
          if (last.claimTrue) {
            // Caller was wrong (lost)
          } else {
            // Caller was correct
            self.stats[caller.actor].callsCorrect += 1;
          }
        }
      }
      
      // Track if a raise resulted in a loss (bluff caught)
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
  
  // ===== ADAPTIVE THRESHOLDS =====
  // Determine our position in the game
  const sortedCounts = players.map(p => p.diceCount).sort((a, b) => b - a);
  const myRank = sortedCounts.indexOf(myDiceCount) + 1;
  const maxDice = sortedCounts[0];
  const minDice = sortedCounts[sortedCounts.length - 1];
  const isLeading = myDiceCount === maxDice;
  const isTrailing = myDiceCount === minDice;
  const gameStage = totalDice < 10 ? 'late' : totalDice < 15 ? 'mid' : 'early';
  
  // Base thresholds
  let liarThreshold = 0.22;
  let raiseThreshold = 0.40;
  
  // Adjust based on dice position
  if (isLeading) {
    // Leading: be more cautious, preserve advantage
    liarThreshold = 0.18;
    raiseThreshold = 0.50;
  } else if (isTrailing) {
    // Trailing: be more aggressive, need to take risks
    liarThreshold = 0.28;
    raiseThreshold = 0.35;
  }
  
  // Adjust for game stage
  if (gameStage === 'late') {
    // Late game: be more careful, fewer mistakes allowed
    raiseThreshold = Math.max(raiseThreshold, 0.50);
    liarThreshold = Math.max(liarThreshold, 0.25);
  } else if (gameStage === 'early') {
    // Early game: can be slightly more aggressive
    raiseThreshold = Math.min(raiseThreshold, 0.38);
  }
  
  // ===== OPPONENT-SPECIFIC ADJUSTMENTS =====
  let prevBidderId = null;
  if (currentBid && history.length) {
    const lastRaise = history.slice().reverse().find(h => h.action === 'raise');
    prevBidderId = lastRaise ? lastRaise.actor : null;
  }
  
  // Find next player in turn order
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
    // Aggressive bluffer: high raise rate, high bid strength, frequent bluff fails
    if (raiseRate > 0.7 && avgBidStrength > 1.2) {
      liarThreshold = Math.min(0.30, liarThreshold + 0.08);
    }
    // Conservative player: low raise rate, high liar rate
    if (raiseRate < 0.4 && liarRate > 0.5) {
      liarThreshold = Math.max(0.15, liarThreshold - 0.07);
    }
    // Known bluffer: high bluff fail rate
    if (bluffFailRate > 0.3) {
      liarThreshold = Math.min(0.30, liarThreshold + 0.05);
    }
    // Accurate caller: high call accuracy, trust their judgment
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
    
    // If next player calls frequently and accurately, be very careful
    if (nextCallRate > 0.5 && nextCallAccuracy > 0.6) {
      raiseThreshold = 0.65;
    }
    // If next player calls frequently but inaccurately, can be more aggressive
    else if (nextCallRate > 0.5 && nextCallAccuracy < 0.4) {
      raiseThreshold = 0.45;
    }
    // If next player is timid (low call rate, low raise rate), can bluff more
    else if (nextCallRate < 0.2 && nextRaiseRate < 0.5) {
      raiseThreshold = 0.25;
    }
    // If next player is aggressive caller but inaccurate, moderate threshold
    else if (nextCallRate > 0.5) {
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
    
    // Calculate expected total
    const expectedUnknown = unknownDiceCount / 6;
    let qty = Math.max(1, Math.floor(counts[bestFace] + expectedUnknown));
    
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
  
  // Find best raise option
  const raiseOptions = [{q: currQ + 1, f: currF}];
  if (currF < 6) raiseOptions.push({q: currQ, f: currF + 1});
  
  // Try to find a raise that meets our confidence threshold
  for (let opt of raiseOptions) {
    if (probabilityAtLeast(opt.f, opt.q) >= raiseThreshold) {
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
