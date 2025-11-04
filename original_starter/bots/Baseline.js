// BOT_NAME: Probabilistic Baseline
// Version 202535-001
// Summary: Simple, readable probability-driven bot (no wilds). Opens on its best face,
//          raises only when Pr[claim true] is high enough; otherwise calls LIAR.
// Assumptions: Legal raise = (quantity increases) OR (same quantity & face increases)
// Time budget: Respond within ~200ms.

// ---- Tunables (gentle defaults; easy to explain in class) ----
const FACE_PROB = 1/6;        // Pr[d == specific face]
const RAISE_TARGET = 0.40;    // Need at least 40% chance for our raise
const LIAR_THRESHOLD = 0.22;  // Call LIAR if current claim < 22% likely
const OPENING_CAP_FRAC = 0.70;// Don't open above 70% of total dice

onmessage = (e) => {
  const { state } = e.data;

  // ---- 1) Unpack the round state ----
  const myDice = state.you.dice || [];                 // e.g., [2,5,1,6,3]
  const players = state.players || [];                 // [{id, diceCount}, ...]
  const currentBid = state.currentBid || null;         // null or {quantity, face}
  const totalDiceOnTable = players.reduce((sum,p)=>sum + p.diceCount, 0);
  const unknownDiceCount = totalDiceOnTable - myDice.length;

  // ---- 2) Hand facts: how many of each face do I hold? ----
  const myFaceCounts = Array(7).fill(0); // 1..6
  for (const d of myDice) if (d>=1 && d<=6) myFaceCounts[d]++;

  // ---- 3) Probability helpers (Binomial tail) ----
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function binomPMF(n, k, p) {
    if (k < 0 || k > n) return 0;
    // multiplicative nCk to avoid factorials
    let coeff = 1;
    for (let i=1; i<=k; i++) coeff = coeff * (n - (k - i)) / i;
    return coeff * Math.pow(p, k) * Math.pow(1-p, n-k);
  }

  // Pr[X >= k] for X ~ Bin(n, p). Uses recursion for successive terms.
  function binomTail(n, k, p) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    let term = binomPMF(n, k, p), sum = term;
    for (let x=k+1; x<=n; x++) {
      term = term * ((n - (x - 1)) / x) * (p / (1 - p));
      sum += term;
      if (term < 1e-12) break; // numeric early exit
    }
    return clamp01(sum);
  }

  // Pr[ there are at least Q of face F on the table ]
  function probabilityAtLeast(face, qty) {
    const mySupport = myFaceCounts[face] || 0;
    const needFromUnknown = Math.max(0, qty - mySupport);
    return binomTail(unknownDiceCount, needFromUnknown, FACE_PROB);
  }

  // ---- 4) Decide opening vs reacting ----

  // 4A) Opening: bid on the face I hold most of, near expectation but not absurd.
  if (!currentBid) {
    let bestFace = 1, bestCount = -1;
    for (let f=1; f<=6; f++) if (myFaceCounts[f] > bestCount) { bestFace = f; bestCount = myFaceCounts[f]; }

    // Start near E[total of bestFace] = myCount + unknown * p, then expand until target holds
    const expectedUnknown = unknownDiceCount * FACE_PROB;
    let q = Math.max(1, Math.floor(bestCount + expectedUnknown));

    const openingCap = Math.min(totalDiceOnTable, Math.ceil(totalDiceOnTable * OPENING_CAP_FRAC));
    q = Math.min(q, openingCap);

    // Walk upward while still meeting our target probability
    while (q + 1 <= openingCap && probabilityAtLeast(bestFace, q + 1) >= RAISE_TARGET) q++;

    postMessage({ action: 'raise', quantity: q, face: bestFace });
    return;
  }

  // 4B) Reacting: try a minimal legal raise if it meets target, else LIAR if claim is weak.
  const { quantity: prevQty, face: prevFace } = currentBid;
  const probPrevTrue = probabilityAtLeast(prevFace, prevQty);

  // Construct the minimal legal raise options:
  // (1) increase quantity by 1 (same face) OR (2) same quantity with higher face(s)
  const raiseCandidates = [{ quantity: prevQty + 1, face: prevFace }];
  for (let f = prevFace + 1; f <= 6; f++) raiseCandidates.push({ quantity: prevQty, face: f });

  // Pick the *cheapest* raise that clears the target probability
  let chosenRaise = null;
  for (const r of raiseCandidates) {
    const p = probabilityAtLeast(r.face, r.quantity);
    if (p >= RAISE_TARGET) { chosenRaise = r; break; }
  }

  if (chosenRaise) {
    postMessage({ action: 'raise', quantity: chosenRaise.quantity, face: chosenRaise.face });
    return;
  }

  // No credible raise: call LIAR if the current bid is sufficiently unlikely.
  if (probPrevTrue < LIAR_THRESHOLD) {
    postMessage({ action: 'liar' });
    return;
  }

  // Otherwise, make the absolute minimal nudge (keeps the hand moving without big risk)
  const nudge = { quantity: prevQty + 1, face: prevFace };
  postMessage({ action: 'raise', quantity: nudge.quantity, face: nudge.face });
};
