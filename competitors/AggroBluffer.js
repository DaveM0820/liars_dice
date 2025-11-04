// BOT_NAME: Aggro Bluffer
// Version 202535-001

// Summary: Pushes bids aggressively to force mistakes. Will bluff into higher
//          faces and larger quantities if the table looks timid; calls LIAR
//          only when claims are hilariously unlikely.
//
// Teaching angle: shows why “asymmetric penalty” matters — sometimes bold play
//                punishes the whole table if a LIAR call is wrong.

const FACE_PROB = 1/6;
const VERY_LOW_CHANCE = 0.12;   // call LIAR if claim < 12% likely
const PUSH_UNTIL_ABOVE = 0.30;  // raise until chance drops below ~30%, then stop

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((s,p)=>s+p.diceCount,0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d>=1 && d<=6) myFaceCounts[d]++;

  function binomPMF(n,k,p){ if(k<0||k>n) return 0; let c=1; for(let i=1;i<=k;i++) c=c*(n-(k-i))/i; return c*Math.pow(p,k)*Math.pow(1-p,n-k); }
  function binomTail(n,k,p){ if(k<=0) return 1; if(k>n) return 0; let t=binomPMF(n,k,p), s=t; for(let x=k+1;x<=n;x++){ t=t*((n-(x-1))/x)*(p/(1-p)); s+=t; if(t<1e-12) break; } return Math.max(0,Math.min(1,s)); }
  function probabilityAtLeast(face, qty) {
    const have = myFaceCounts[face] || 0;
    const need = Math.max(0, qty - have);
    return binomTail(unknownDiceCount, need, FACE_PROB);
  }

  // Opening: pick our best face, then "pump" until we hit the push limit
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f=1; f<=6; f++) if (myFaceCounts[f] > bestCount) { bestFace = f; bestCount = myFaceCounts[f]; }
    let qty = Math.max(1, bestCount); // start at what we actually hold
    while (probabilityAtLeast(bestFace, qty + 1) >= PUSH_UNTIL_ABOVE) qty++;
    postMessage({ action:'raise', quantity: qty, face: bestFace });
    return;
  }

  const { quantity: prevQty, face: prevFace } = currentBid;
  const claimLikely = probabilityAtLeast(prevFace, prevQty);

  // Call LIAR only on very unlikely claims
  if (claimLikely < VERY_LOW_CHANCE) { postMessage({ action:'liar' }); return; }

  // Otherwise, keep pushing: try quantity +1, else bump face at same qty
  if (probabilityAtLeast(prevFace, prevQty + 1) >= VERY_LOW_CHANCE) {
    postMessage({ action:'raise', quantity: prevQty + 1, face: prevFace });
    return;
  }
  for (let f = prevFace + 1; f <= 6; f++) {
    if (probabilityAtLeast(f, prevQty) >= VERY_LOW_CHANCE) {
      postMessage({ action:'raise', quantity: prevQty, face: f });
      return;
    }
  }
  // Nowhere to push credibly → take the coin-flip and call LIAR
  postMessage({ action:'liar' });
};
