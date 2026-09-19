// AI-tegen-AI simulaties om de regels en de AI te testen.
//   node test/sim.js [aantalSpellen] [level0] [level1]
require('../js/topology.js');
require('../js/engine.js');
require('../js/ai.js');
const EK = globalThis.EK;
const T = EK.topo;

function invariants(s) {
  for (const r of EK.RES) {
    const tot = s.bank[r] + s.players.reduce((n, P) => n + P.res[r], 0);
    if (tot !== 19) throw new Error(`Grondstof ${r} niet in balans: ${tot}`);
  }
  for (const p of s.players.keys()) {
    let st = 0;
    let ci = 0;
    for (let v = 0; v < T.verts.length; v++) if (s.vOwner[v] === p) (s.vType[v] === 1 ? st++ : ci++);
    const P = s.players[p];
    if (st + P.settlementsLeft !== 5) throw new Error('Nederzettingen kloppen niet');
    if (ci + P.citiesLeft !== 4) throw new Error('Steden kloppen niet');
    let ro = 0;
    for (let e = 0; e < T.edges.length; e++) if (s.eOwner[e] === p) ro++;
    if (ro + P.roadsLeft !== 15) throw new Error('Wegen kloppen niet');
    for (const r of EK.RES) if (P.res[r] < 0) throw new Error('Negatieve hand');
  }
  // afstandsregel
  for (let v = 0; v < T.verts.length; v++) {
    if (s.vOwner[v] === -1) continue;
    for (const w of T.verts[v].adj) if (s.vOwner[w] !== -1) throw new Error('Afstandsregel geschonden');
  }
}

function playGame(levels, verbose) {
  const s = EK.newGame({ target: 10, numPlayers: levels.length });
  let steps = 0;
  let fails = 0;
  const stats = { trades: 0, proposed: 0, bankTrades: 0, knights: 0, robber: 0 };
  while (s.phase !== 'over' && steps < 20000) {
    steps++;
    let who = s.cur;
    if (s.phase === 'discard') who = Number(Object.keys(s.pending)[0]);
    let a = EK.AI.step(s, who, levels[who]);
    if (!a) throw new Error('AI gaf geen actie in fase ' + s.phase);
    if (a.type === 'proposeTrade') {
      stats.proposed++;
      const resp = EK.AI.respond(s, a.to, { give: a.give, get: a.get }, levels[a.to], who);
      if (resp.accept) {
        const r = EK.act(s, { type: 'trade', with: a.to, give: a.give, get: a.get });
        if (!r.ok) fails++;
        else stats.trades++;
      }
      continue;
    }
    if (a.type === 'bankTrade') stats.bankTrades++;
    if (a.type === 'playKnight') stats.knights++;
    const r = EK.act(s, a);
    if (!r.ok) {
      fails++;
      if (verbose) console.log('FAIL', a, r.err, 'fase', s.phase);
      if (fails > 50) throw new Error('Te veel mislukte acties: ' + JSON.stringify(a) + ' ' + r.err);
      if (s.phase === 'main') EK.act(s, { type: 'endTurn' });
    }
    invariants(s);
  }
  return { s, steps, fails, stats };
}

const n = Number(process.argv[2] || 20);
const levels = (process.argv[3] || '2,2,2,2').split(',').map(Number);
const wins = levels.map(() => 0);
let turns = 0;
let fails = 0;
const agg = { trades: 0, proposed: 0, bankTrades: 0, knights: 0 };
const t0 = Date.now();
let unfinished = 0;
for (let i = 0; i < n; i++) {
  const g = playGame(levels, false);
  if (g.s.phase !== 'over') {
    unfinished++;
    continue;
  }
  wins[g.s.winner]++;
  turns += g.s.turnNo;
  fails += g.fails;
  for (const k in agg) agg[k] += g.stats[k];
}
console.log(`levels ${levels.join(',')}: wins ${wins.join('-')}, onafgemaakt ${unfinished}, gem. beurten ${(turns / n).toFixed(1)}, mislukte acties ${fails}, ${((Date.now() - t0) / n).toFixed(0)}ms/spel`);
console.log('stats/spel', Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, (v / n).toFixed(1)])));
