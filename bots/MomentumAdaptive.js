// BOT_NAME: Momentum Adaptive
// Version 202535-001
// Summary: Tracks the recent pace of bidding. If opponents are pushing fast,
//          it becomes more skeptical (LIAR sooner). If the pace stalls,
//          it offers small, steady raises.
//
// Idea in plain words:
// - "Momentum" ≈ how much quantity has jumped recently.
// - High momentum → bids are likely stretched → be cautious → LIAR earlier.
// - Low momentum → bids are tame → keep the hand alive with small raises.

const BASE_CALL_THRESHOLD = 0.20; // default skepticism: call LIAR if <20% likely
const HIGH_MOMENTUM_SKEPTIC = 0.28; // be harsher when momentum is hot
const LOW_MOMENTUM_FRIENDLY = 0.15; // be friendlier when momentum is low

const MOM_WINDOW = 3;       // look at last 3 raises
const MOM_HIGH   = 4;       // total qty jump ≥ 4 → "high momentum"
const MOM_LOW    = 1;       // total qty jump ≤ 1 → "low momentum"

const FACE_PROB = 1/6;

onmessage = (e) => {
  const { state } = e.data;
  const myDice = state.you.dice || [];
  const players = state.players || [];
  const currentBid = state.currentBid || null;

  const totalDiceOnTable = players.reduce((s,p)=>s+p.diceCount,0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  // Count my faces
  const myFaceCounts = Array(7).fill(0);
  for (const d of myDice) if (d>=1 && d<=6) myFaceCounts[d]++;

  // Simple momentum from (synthetic) short history:
  function recentMomentum() {
    // If you collect actual history, replace this with real deltas.
    // For now we infer momentum only from the last bid vs expectation.
    if (!currentBid) return 0;
    const expected = unknownDiceCount * FACE_PROB + (myFaceCounts[currentBid.face]||0);
    // bigger "overshoot" means higher momentum
    return Math.max(0, currentBid.quantity - expected);
  }

  // Probability helpers
  function binomPMF(n,k,p){ if(k<0||k>n) return 0; let c=1; for(let i=1;i<=k;i++) c=c*(n-(k-i))/i; return c*Math.pow(p,k)*Math.pow(1-p,n-k); }
  function binomTail(n,k,p){ if(k<=0) return 1; if(k>n) return 0; let t=binomPMF(n,k,p), s=t; for(let x=k+1;x<=n;x++){ t = t*((n-(x-1))/x)*(p/(1-p)); s+=t; if(t<1e-12) break; } return Math.max(0,Math.min(1,s)); }
  function probabilityAtLeast(face, qty) {
    const need = Math.max(0, qty - (myFaceCounts[face]||0));
    return binomTail(unknownDiceCount, need, FACE_PROB);
  }

  // Opening: calm, pick strongest face near expectation
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f=1; f<=6; f++) if (myFaceCounts[f] > bestCount) { bestFace = f; bestCount = myFaceCounts[f]; }
    const expected = unknownDiceCount * FACE_PROB + bestCount;
    const qty = Math.max(1, Math.floor(expected));
    postMessage({ action: 'raise', quantity: qty, face: bestFace });
    return;
  }

  const { quantity: prevQty, face: prevFace } = currentBid;
  // Adjust call threshold by momentum
  const mom = recentMomentum();
  let liarThreshold = BASE_CALL_THRESHOLD;
  if (mom >= MOM_HIGH) liarThreshold = HIGH_MOMENTUM_SKEPTIC;
  else if (mom <= MOM_LOW) liarThreshold = LOW_MOMENTUM_FRIENDLY;

  const claimLikely = probabilityAtLeast(prevFace, prevQty);
  if (claimLikely < liarThreshold) { postMessage({ action:'liar' }); return; }

  // Otherwise issue minimal legal raise (quantity +1), unless that’s ridiculous
  const raiseQ = prevQty + 1;
  const ok = probabilityAtLeast(prevFace, raiseQ) >= liarThreshold;
  if (ok) {
    postMessage({ action:'raise', quantity: raiseQ, face: prevFace });
  } else {
    // Try a face bump at same qty (slightly safer)
    for (let f = prevFace + 1; f <= 6; f++) {
      if (probabilityAtLeast(f, prevQty) >= liarThreshold) {
        postMessage({ action:'raise', quantity: prevQty, face: f });
        return;
      }
    }
    // Nothing credible → LIAR
    postMessage({ action:'liar' });
  }
};
