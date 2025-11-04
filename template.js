// BOT_NAME: MyStudentBot
// Authorship: Your Name (Student #)

self.onmessage = (e) => {
  const { state } = e.data;
  const { you, players, currentBid, history, rules } = state;

  // Example: simple LIAR threshold on expected count of current face
  // Estimate total dice on table:
  const totalDice = players.reduce((s,p)=>s + p.diceCount, 0);

  // If no bid yet, open conservatively on your best face:
  if (!currentBid) {
    const counts = [0,0,0,0,0,0];
    for (const d of you.dice) counts[d-1]++;
    // pick the most frequent face you have; quantity=that count or 1 if none
    let bestFace = 6, bestCount = -1;
    for (let f=1; f<=6; f++) if (counts[f-1] >= bestCount) { bestCount = counts[f-1]; bestFace = f; }
    const q = Math.max(1, bestCount);
    postMessage({ action:"raise", quantity:q, face:bestFace });
    return;
  }

  // Decide whether to call LIAR on the current bid
  const { quantity:Q, face:F } = currentBid;
  const expected = totalDice / 6; // naive expectation for a given face

  // Add a tiny aggression-based nudge from history (last ~30 actions)
  const recent = history.slice(-30);
  const raisesBySeat = {};
  for (const h of recent) if (h.action === 'raise') raisesBySeat[h.actor] = (raisesBySeat[h.actor]||0)+1;
  const tableAggression = Object.values(raisesBySeat).reduce((a,b)=>a+b,0) / Math.max(1, Object.keys(raisesBySeat).length);

  // Simple call rule: if claim exceeds expected by a margin, call LIAR
  const margin = 0.9 + 0.05 * tableAggression; // slightly stricter if table is hot
  if (Q > expected * margin) {
    postMessage({ action:"liar" });
    return;
  }

  // Otherwise, raise legally: bump face if possible, else increase quantity
  if (F < 6) postMessage({ action:"raise", quantity:Q, face:F+1 });
  else       postMessage({ action:"raise", quantity:Q+1, face:F });
};
