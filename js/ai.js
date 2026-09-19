// Eilandrijk — AI-tegenstander.
//  1. Heuristische scoring van plaatsing, bouwen en kaarten
//  2. Monte Carlo-simulatie (gedeterminiseerd) voor de roverplaatsing
//  3. Eenvoudige ruillogica op basis van behoefte
//  4. Moeilijkheid = hoeveel simulatie/vooruitkijken de AI doet
(function (G) {
  'use strict';
  const EK = G.EK;
  const T = EK.topo;
  const RES = EK.RES;
  const L = EK.legal;
  const AI = (EK.AI = {});

  AI.LEVELS = {
    1: { name: 'Makkelijk', noise: 0.7, sims: 0, horizon: 0, tradeMin: -0.6, lookahead: false },
    2: { name: 'Gemiddeld', noise: 0.15, sims: 40, horizon: 8, tradeMin: 0.2, lookahead: false },
    3: { name: 'Moeilijk', noise: 0, sims: 200, horizon: 12, tradeMin: 0.6, lookahead: true },
  };

  const W = { hout: 1.0, klei: 0.95, wol: 0.7, graan: 1.1, erts: 1.1 };
  const rnd = (n) => EK.rnd(n);
  const rand = () => EK.rand();
  const others = (s, me) => s.players.map((_, i) => i).filter((i) => i !== me);
  const noisy = (x, lv) => x + (lv.noise ? (rand() - 0.5) * 2 * lv.noise * 3 : 0);

  function production(s, p, withRobber) {
    const out = EK.zeroRes();
    for (let v = 0; v < T.verts.length; v++) {
      if (s.vOwner[v] !== p) continue;
      for (const ti of T.verts[v].tiles) {
        const t = s.tiles[ti];
        if (t.res === 'woestijn') continue;
        if (withRobber && ti === s.robber) continue;
        out[t.res] += EK.PIPS(t.num) * s.vType[v];
      }
    }
    return out;
  }
  AI.production = production;

  // Waarde van een hoekpunt als nederzettingsplek.
  function siteValue(s, v, prod) {
    let val = 0;
    const seen = {};
    for (const ti of T.verts[v].tiles) {
      const t = s.tiles[ti];
      if (t.res === 'woestijn') continue;
      let w = W[t.res];
      if (!prod[t.res]) w *= 1.25;
      let pip = EK.PIPS(t.num);
      if (ti === s.robber) pip *= 0.4;
      val += pip * w;
      seen[t.res] = (seen[t.res] || 0) + pip;
    }
    for (const r in seen) if (!prod[r]) val += 1.6;
    const pt = s.vPort[v];
    if (pt === 'any') val += 1.2;
    else if (pt) val += 0.5 + ((seen[pt] || 0) + prod[pt]) * 0.35;
    return val;
  }

  // Hoeveel ruimte is er rond een hoekpunt om verder uit te breiden?
  function openness(s, v) {
    let n = 0;
    const seen = new Set([v]);
    for (const a of T.verts[v].adj) {
      for (const b of T.verts[a].adj) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (s.vOwner[b] !== -1) continue;
        let ok = true;
        for (const c of T.verts[b].adj) if (s.vOwner[c] !== -1) ok = false;
        if (ok) n++;
      }
    }
    return n;
  }

  function bestSetupSpot(s, me, lv) {
    const prod = production(s, me, false);
    const spots = L.settlementSpots(s, me, true);
    const scored = spots.map((v) => {
      let val = siteValue(s, v, prod) + openness(s, v) * 0.35;
      if (lv.lookahead && s.players[me].settlementsLeft === 5) {
        // kijk vooruit: wat is de beste tweede plek als ik hier begin?
        s.vOwner[v] = me;
        s.vType[v] = 1;
        const prod2 = production(s, me, false);
        let best2 = 0;
        for (const w of L.settlementSpots(s, me, true)) best2 = Math.max(best2, siteValue(s, w, prod2));
        s.vOwner[v] = -1;
        s.vType[v] = 0;
        val += best2 * 0.45;
      }
      return { v, val: noisy(val, lv) };
    });
    scored.sort((a, b) => b.val - a.val);
    return scored[0].v;
  }

  function bestSetupRoad(s, me, lv) {
    const from = s.setup.last;
    const prod = production(s, me, false);
    let best = null;
    for (const e of L.setupRoadSpots(s)) {
      const ed = T.edges[e];
      const w = ed.a === from ? ed.b : ed.a;
      let val = 0;
      for (const x of T.verts[w].adj) {
        if (x === from || s.vOwner[x] !== -1) continue;
        let ok = true;
        for (const y of T.verts[x].adj) if (s.vOwner[y] !== -1) ok = false;
        if (ok) val = Math.max(val, siteValue(s, x, prod));
      }
      val = noisy(val, lv);
      if (!best || val > best.val) best = { e, val };
    }
    return best.e;
  }

  // Beste weg in de bouwfase; geeft {e, val} terug.
  function bestRoad(s, me, lv) {
    const prod = production(s, me, false);
    const spots = L.roadSpots(s, me);
    let best = null;
    const curLen = s.players[me].roadLen;
    for (const e of spots) {
      const ed = T.edges[e];
      let val = 0;
      for (const x of [ed.a, ed.b]) {
        if (s.vOwner[x] === me) continue;
        if (s.vOwner[x] === -1) {
          let ok = true;
          for (const y of T.verts[x].adj) if (s.vOwner[y] !== -1) ok = false;
          if (ok) val = Math.max(val, siteValue(s, x, prod) + 3);
          // een stap verder
          for (const y of T.verts[x].adj) {
            if (s.vOwner[y] !== -1) continue;
            let ok2 = true;
            for (const z of T.verts[y].adj) if (s.vOwner[z] !== -1) ok2 = false;
            if (ok2) val = Math.max(val, siteValue(s, y, prod) * 0.55);
          }
        }
      }
      // langste-weg-bonus
      s.eOwner[e] = me;
      const nl = EK.longestRoad(s, me);
      s.eOwner[e] = -1;
      if (nl > curLen && nl >= 4) val += 1.2 * (nl - 3);
      val = noisy(val, lv);
      if (!best || val > best.val) best = { e, val };
    }
    return best;
  }

  function bestCity(s, me) {
    let best = null;
    for (const v of L.citySpots(s, me)) {
      let val = 0;
      for (const ti of T.verts[v].tiles) {
        const t = s.tiles[ti];
        if (t.res === 'woestijn') continue;
        val += EK.PIPS(t.num) * W[t.res] * (ti === s.robber ? 0.4 : 1);
      }
      if (!best || val > best.val) best = { v, val };
    }
    return best;
  }

  // ---------- kaarten & bouwplan ----------
  const missing = (P, cost) => {
    let n = 0;
    for (const r in cost) n += Math.max(0, cost[r] - P.res[r]);
    return n;
  };

  function buildOptions(s, me, lv) {
    const P = s.players[me];
    const opts = [];
    const prod = production(s, me, false);
    if (P.settlementsLeft > 0) {
      const spots = L.settlementSpots(s, me, false);
      if (spots.length) {
        let best = null;
        for (const v of spots) {
          const val = siteValue(s, v, prod);
          if (!best || val > best.val) best = { v, val };
        }
        opts.push({ kind: 'settlement', cost: EK.COST.settlement, score: noisy(12 + best.val * 0.3, lv), v: best.v });
      }
    }
    if (P.citiesLeft > 0) {
      const c = bestCity(s, me);
      if (c) opts.push({ kind: 'city', cost: EK.COST.city, score: noisy(10.5 + c.val * 0.25, lv), v: c.v });
    }
    if (s.deck.length) {
      let sc = 6;
      if (prod.erts && prod.graan) sc += 1.5;
      opts.push({ kind: 'dev', cost: EK.COST.dev, score: noisy(sc, lv) });
    }
    if (P.roadsLeft > 0) {
      const r = bestRoad(s, me, lv);
      if (r) {
        const noSettleSpot = !opts.some((o) => o.kind === 'settlement');
        opts.push({ kind: 'road', cost: EK.COST.road, score: noisy(2.5 + Math.min(r.val, 12) * (noSettleSpot ? 0.6 : 0.25), lv), e: r.e });
      }
    }
    opts.sort((a, b) => b.score - a.score);
    return opts;
  }

  function deficit(P, cost) {
    const d = {};
    for (const r in cost) {
      const m = cost[r] - P.res[r];
      if (m > 0) d[r] = m;
    }
    return d;
  }

  // Kaarten die ik "vrij" heb (niet nodig voor het doel)
  function surplus(P, cost) {
    const sp = {};
    for (const r of RES) sp[r] = Math.max(0, P.res[r] - (cost ? cost[r] || 0 : 0));
    return sp;
  }

  function bankTradeFor(s, me, target) {
    const P = s.players[me];
    const d = deficit(P, target.cost);
    const need = Object.keys(d);
    if (!need.length) return null;
    const sp = surplus(P, target.cost);
    let best = null;
    for (const g of RES) {
      if (need.includes(g)) continue;
      const ratio = EK.ratio(s, me, g);
      if (sp[g] >= ratio && (!best || ratio < best.ratio || (ratio === best.ratio && sp[g] > sp[best.g]))) best = { g, ratio };
    }
    if (!best) return null;
    const want = need.find((r) => s.bank[r] > 0);
    if (!want) return null;
    return { type: 'bankTrade', give: best.g, get: want };
  }

  function mem(s) {
    if (!s.aiMem || s.aiMem.turn !== s.turnNo) s.aiMem = { turn: s.turnNo, proposals: [], trades: 0, sim: null };
    return s.aiMem;
  }

  // ---------- ruilen ----------
  function targetForTrade(s, me, lv) {
    const opts = buildOptions(s, me, lv);
    return opts[0] || null;
  }

  // Hoe waardevol is een grondstof voor mij nu?
  function resValues(s, me, lv) {
    const P = s.players[me];
    const target = targetForTrade(s, me, lv);
    const val = {};
    for (const r of RES) val[r] = 1;
    if (target) {
      for (const r in target.cost) {
        const have = P.res[r];
        if (have < target.cost[r]) val[r] += 1.6 + (target.cost[r] - have) * 0.3;
      }
    }
    for (const r of RES) {
      if (P.res[r] >= 4) val[r] -= 0.35 * (P.res[r] - 3);
      if (P.res[r] === 0) val[r] += 0.2;
      val[r] = Math.max(0.2, val[r]);
    }
    return val;
  }

  // offer: { give: wat de voorsteller geeft, get: wat de voorsteller wil }. `me` is de ontvanger.
  AI.respond = function (s, me, offer, lvl, from) {
    const lv = AI.LEVELS[lvl] || AI.LEVELS[2];
    const P = s.players[me];
    const prop = from === undefined ? (me + 1) % s.players.length : from;
    let inN = 0;
    let outN = 0;
    for (const r of RES) {
      inN += offer.give[r] || 0;
      outN += offer.get[r] || 0;
      if ((offer.get[r] || 0) > P.res[r]) return { accept: false, msg: 'Zoveel heb ik niet.' };
    }
    if (!inN || !outN) return { accept: false, msg: 'Dat is geen ruil.' };
    if (EK.vp(s, prop, false) >= s.target - 2 && lvl >= 2) return { accept: false, msg: 'Jij staat te dicht bij de winst. Geen ruil.' };
    const val = resValues(s, me, lv);
    let gain = 0;
    let loss = 0;
    for (const r of RES) {
      gain += (offer.give[r] || 0) * val[r];
      loss += (offer.get[r] || 0) * val[r];
    }
    // een beetje "tempo": ruilen is pas leuk als ik er echt op vooruitga
    const delta = gain - loss - (inN < outN ? 0.4 : 0);
    if (delta >= lv.tradeMin) return { accept: true, msg: 'Deal!' };
    if (delta > lv.tradeMin - 1.6 && lvl >= 2) {
      // tegenbod: vraag één extra kaart van de grondstof die ik het hardst nodig heb
      let bestR = null;
      for (const r of RES) if (!(offer.get[r] || 0) && (bestR === null || val[r] > val[bestR])) bestR = r;
      if (bestR) {
        const counter = { give: { ...offer.give }, get: { ...offer.get } };
        counter.give[bestR] = (counter.give[bestR] || 0) + 1;
        return { accept: false, msg: 'Nog een extra kaart erbij en ik doe het:', counter };
      }
    }
    return { accept: false, msg: 'Nee, dat is me te weinig.' };
  };

  // Mogelijk ruilvoorstel van de AI aan de speler. Geeft {give, get} (vanuit AI gezien) of null.
  function proposeTrade(s, me, lv, target, targets) {
    const m = mem(s);
    if (!target || m.proposals.length >= 2) return null;
    const P = s.players[me];
    // kies de ruilpartner: geen speler die bijna wint, en wel iemand met kaarten
    let to = null;
    for (const q of targets) {
      if (EK.vp(s, q, false) >= s.target - 2 || EK.total(s, q) === 0) continue;
      if (to === null || EK.total(s, q) > EK.total(s, to)) to = q;
    }
    if (to === null) return null;
    const d = deficit(P, target.cost);
    const need = Object.keys(d);
    if (!need.length) return null;
    const missingN = need.reduce((n, r) => n + d[r], 0);
    if (missingN > 2) return null;
    const sp = surplus(P, target.cost);
    let g = null;
    for (const r of RES) if (!need.includes(r) && sp[r] >= 1 && (!g || sp[r] > sp[g])) g = r;
    if (!g) return null;
    const want = need[0];
    const key = to + ':' + g + '>' + want;
    if (m.proposals.includes(key)) return null;
    const give = {};
    const get = {};
    give[g] = 1;
    get[want] = 1;
    // bij een 2e voorstel een royaler bod als ik veel overheb
    if (m.proposals.length && sp[g] >= 2) give[g] = 2;
    return { give, get, key, to };
  }

  // ---------- afgooien ----------
  AI.discard = function (s, me, lvl) {
    const lv = AI.LEVELS[lvl] || AI.LEVELS[2];
    const P = s.players[me];
    const need = s.pending[me];
    const have = { ...P.res };
    const out = EK.zeroRes();
    const val = resValues(s, me, lv);
    for (let i = 0; i < need; i++) {
      let worst = null;
      for (const r of RES) {
        if (have[r] <= 0) continue;
        const v = val[r] - have[r] * 0.05 + (lv.noise ? rand() * lv.noise : 0);
        if (worst === null || v < worst.v) worst = { r, v };
      }
      have[worst.r]--;
      out[worst.r]++;
    }
    return out;
  };

  // ---------- rover ----------
  function robberScore(s, ti, me) {
    const pip = EK.PIPS(s.tiles[ti].num);
    let gain = 0;
    let loss = 0;
    let victim = false;
    for (const v of T.tiles[ti].verts) {
      const o = s.vOwner[v];
      if (o === -1) continue;
      if (o === me) loss += pip * s.vType[v];
      else {
        // de leider extra pijn doen
        const vp = EK.vp(s, o, false);
        gain += pip * s.vType[v] * (1 + 0.1 * vp + (vp >= s.target - 3 ? 0.5 : 0));
        if (EK.total(s, o) > 0) victim = true;
      }
    }
    return gain - loss * 1.3 + (victim ? 1.2 : 0) + (s.tiles[ti].res === 'erts' || s.tiles[ti].res === 'graan' ? 0.3 : 0);
  }

  // Beste slachtoffer voor een diefstal op tegel `ti`.
  function pickVictim(s, ti, me) {
    const vic = L.victims(s, ti, me);
    let best = null;
    for (const q of vic) {
      const sc = EK.vp(s, q, false) * 3 + EK.total(s, q);
      if (best === null || sc > best.sc) best = { q, sc };
    }
    return best ? best.q : undefined;
  }

  function determinize(s, me) {
    const c = EK.clone(s);
    // De handen van de anderen zijn voor mij onbekend: herverdeel ze willekeurig
    // (met dezelfde aantallen), gewogen naar hun productie.
    const pool = c.deck.slice();
    const counts = {};
    for (const q of others(c, me)) {
      const op = c.players[q];
      const total = EK.sumRes(op.res);
      const prodO = production(c, q, false);
      const weights = RES.map((r) => 1 + prodO[r]);
      const wsum = weights.reduce((a, b) => a + b, 0);
      op.res = EK.zeroRes();
      for (let i = 0; i < total; i++) {
        let k = rand() * wsum;
        let idx = 0;
        while (idx < 4 && k >= weights[idx]) {
          k -= weights[idx];
          idx++;
        }
        op.res[RES[idx]]++;
      }
      // onbekende ontwikkelingskaarten opnieuw trekken
      counts[q] = Object.values(op.dev).reduce((a, b) => a + b, 0) + Object.values(op.devNew).reduce((a, b) => a + b, 0);
      for (const k in op.dev) {
        for (let i = 0; i < op.dev[k] + op.devNew[k]; i++) pool.push(k);
        op.dev[k] = 0;
        op.devNew[k] = 0;
      }
    }
    EK.shuffle(pool);
    for (const q of others(c, me)) for (let i = 0; i < counts[q]; i++) c.players[q].dev[pool.pop()]++;
    c.deck = pool;
    return c;
  }

  // Snelle, simpele bot voor de simulaties.
  function simTurn(c) {
    const me = c.cur;
    const P = c.players[me];
    if (c.phase === 'roll') EK.act(c, { type: 'roll' });
    if (c.phase === 'discard') {
      for (const q of Object.keys(c.pending).map(Number)) {
        const cards = EK.zeroRes();
        const have = { ...c.players[q].res };
        for (let i = 0; i < c.pending[q]; i++) {
          let r;
          do r = RES[rnd(5)];
          while (have[r] <= 0);
          have[r]--;
          cards[r]++;
        }
        EK.act(c, { type: 'discard', player: q, cards });
      }
    }
    if (c.phase === 'robber') {
      let best = -1;
      let bs = -1e9;
      for (let ti = 0; ti < T.tiles.length; ti++) {
        if (ti === c.robber) continue;
        const sc = robberScore(c, ti, me) + rand() * 0.5;
        if (sc > bs) {
          bs = sc;
          best = ti;
        }
      }
      EK.act(c, { type: 'moveRobber', tile: best, victim: pickVictim(c, best, me) });
    }
    if (c.phase !== 'main' || c.phase === 'over') return;
    // ridders spelen
    if (P.dev.knight > 0 && !c.devPlayed && rand() < 0.6) {
      EK.act(c, { type: 'playKnight' });
      if (c.phase === 'robber') {
        let best = -1;
        let bs = -1e9;
        for (let ti = 0; ti < T.tiles.length; ti++) {
          if (ti === c.robber) continue;
          const sc = robberScore(c, ti, me) + rand() * 0.5;
          if (sc > bs) {
            bs = sc;
            best = ti;
          }
        }
        EK.act(c, { type: 'moveRobber', tile: best, victim: pickVictim(c, best, me) });
      }
    }
    for (let guard = 0; guard < 8 && c.phase === 'main'; guard++) {
      let did = false;
      if (EK.canAfford(P, EK.COST.city) && P.citiesLeft > 0) {
        const cs = bestCity(c, me);
        if (cs) did = EK.act(c, { type: 'buildCity', vertex: cs.v }).ok;
      }
      if (!did && EK.canAfford(P, EK.COST.settlement) && P.settlementsLeft > 0) {
        const prod = production(c, me, false);
        let bv = -1;
        let bs = -1;
        for (const v of L.settlementSpots(c, me, false)) {
          const sc = siteValue(c, v, prod);
          if (sc > bs) {
            bs = sc;
            bv = v;
          }
        }
        if (bv >= 0) did = EK.act(c, { type: 'buildSettlement', vertex: bv }).ok;
      }
      if (!did && EK.canAfford(P, EK.COST.dev) && c.deck.length) did = EK.act(c, { type: 'buyDev' }).ok;
      if (!did && EK.canAfford(P, EK.COST.road) && P.roadsLeft > 0 && P.settlementsLeft > 0 && rand() < 0.5) {
        const spots = L.roadSpots(c, me);
        if (spots.length) did = EK.act(c, { type: 'buildRoad', edge: spots[rnd(spots.length)] }).ok;
      }
      if (!did) {
        // bankruil: veel van één soort → wat ik voor stad/nederzetting mis
        let g = null;
        for (const r of RES) if (P.res[r] >= EK.ratio(c, me, r) + 1 && (!g || P.res[r] > P.res[g])) g = r;
        if (g) {
          const want = P.citiesLeft > 0 && c.vType.some((t, v) => t === 1 && c.vOwner[v] === me) ? ['erts', 'graan'] : ['hout', 'klei', 'wol', 'graan'];
          const w = want.find((r) => P.res[r] < 2 && r !== g);
          if (w) did = EK.act(c, { type: 'bankTrade', give: g, get: w }).ok;
        }
      }
      if (!did) break;
    }
    if (c.phase === 'main') EK.act(c, { type: 'endTurn' });
  }

  function evaluate(c, me) {
    const f = (p) => {
      const pr = production(c, p, true);
      let pips = 0;
      for (const r of RES) pips += pr[r];
      return EK.vp(c, p, true) * 10 + pips * 0.8 + EK.total(c, p) * 0.15 + c.players[p].knights * 0.5;
    };
    const rest = others(c, me).map(f);
    const avg = rest.reduce((a, b) => a + b, 0) / rest.length;
    return f(me) - 0.5 * avg - 0.5 * Math.max(...rest);
  }

  // Monte Carlo: hoe goed is het om de rover op tegel `ti` te zetten?
  function simulateRobber(s, me, ti, lv) {
    let total = 0;
    for (let i = 0; i < lv.sims; i++) {
      const c = determinize(s, me);
      c.cur = me;
      c.phase = 'robber';
      c.afterRobber = 'main';
      EK.act(c, { type: 'moveRobber', tile: ti, victim: pickVictim(c, ti, me) });
      c.phase = 'main';
      EK.act(c, { type: 'endTurn' });
      let turns = 0;
      const maxTurns = lv.horizon * c.players.length / 2;
      while (c.phase !== 'over' && turns < maxTurns) {
        simTurn(c);
        turns++;
      }
      total += evaluate(c, me) + (c.winner === me ? 100 : c.winner >= 0 ? -60 : 0);
    }
    return total / lv.sims;
  }

  function chooseRobber(s, me, lv) {
    const cands = [];
    for (let ti = 0; ti < T.tiles.length; ti++) {
      if (ti === s.robber) continue;
      cands.push({ ti, h: noisy(robberScore(s, ti, me), lv) });
    }
    cands.sort((a, b) => b.h - a.h);
    if (lv.sims > 0) {
      const top = cands.slice(0, 5);
      for (const c of top) c.mc = simulateRobber(s, me, c.ti, lv) + c.h * 0.6;
      top.sort((a, b) => b.mc - a.mc);
      return top[0].ti;
    }
    return cands[0].ti;
  }

  // ---------- dev-kaarten spelen ----------
  function blockedPips(s, me) {
    let n = 0;
    for (const v of T.tiles[s.robber].verts) {
      if (s.vOwner[v] === me) n += EK.PIPS(s.tiles[s.robber].num) * s.vType[v];
    }
    return n;
  }

  function chooseDevPlay(s, me, lv, top) {
    const P = s.players[me];
    if (s.devPlayed) return null;
    const foes = others(s, me);
    if (P.dev.knight > 0) {
      const armyChance = P.knights + 1 >= 3 && (s.army.holder !== me) && P.knights + 1 > s.army.count;
      if (blockedPips(s, me) >= 3 || armyChance || P.dev.knight >= 2 || (Math.max(...foes.map((q) => EK.total(s, q))) >= 5 && lv.sims > 0)) return { type: 'playKnight' };
      if (lv.noise > 0.5 && rand() < 0.4) return { type: 'playKnight' };
    }
    if (s.phase !== 'main') return null;
    if (P.dev.roadbuilding > 0 && P.roadsLeft >= 2) {
      const r = bestRoad(s, me, lv);
      if (r && (r.val >= 5 || !EK.canAfford(P, EK.COST.road))) return { type: 'playRoadBuilding' };
    }
    if (P.dev.invention > 0 && top) {
      const d = deficit(P, top.cost);
      const list = [];
      for (const r in d) for (let i = 0; i < d[r]; i++) list.push(r);
      let pick = null;
      if (list.length >= 2) pick = [list[0], list[1]];
      else if (list.length === 1) pick = [list[0], P.res.erts < 3 ? 'erts' : 'graan']; // tweede kaart: iets nuttigs
      else if (EK.total(s, me) <= 1) pick = ['graan', 'erts'];
      if (pick && s.bank[pick[0]] >= (pick[0] === pick[1] ? 2 : 1) && s.bank[pick[1]] >= 1) return { type: 'playInvention', a: pick[0], b: pick[1] };
    }
    if (P.dev.monopoly > 0) {
      const po = EK.zeroRes();
      for (const q of foes) {
        const pq = production(s, q, false);
        for (const r of RES) po[r] += pq[r];
      }
      let best = null;
      for (const r of RES) if (!best || po[r] > po[best]) best = r;
      if (po[best] >= 6 * foes.length / 2 || s.turnNo > 40 * foes.length / 2) return { type: 'playMonopoly', res: best };
    }
    return null;
  }

  // ---------- hoofdbeslissing: één actie per aanroep ----------
  AI.step = function (s, me, lvl, opts) {
    const lv = AI.LEVELS[lvl] || AI.LEVELS[2];
    const P = s.players[me];
    if (s.phase === 'discard') {
      if (s.pending[me]) return { type: 'discard', player: me, cards: AI.discard(s, me, lvl) };
      return null;
    }
    if (s.cur !== me || s.phase === 'over') return null;

    switch (s.phase) {
      case 'setup':
        if (s.setup.sub === 'settlement') return { type: 'buildSettlement', vertex: bestSetupSpot(s, me, lv) };
        return { type: 'buildRoad', edge: bestSetupRoad(s, me, lv) };
      case 'roll': {
        if (P.dev.knight > 0 && !s.devPlayed && blockedPips(s, me) >= 4) return { type: 'playKnight' };
        return { type: 'roll' };
      }
      case 'robber': {
        const tile = chooseRobber(s, me, lv);
        return { type: 'moveRobber', tile, victim: pickVictim(s, tile, me) };
      }
      case 'roadbuilding': {
        const r = bestRoad(s, me, lv);
        return { type: 'buildRoad', edge: r.e };
      }
      case 'main':
        return mainStep(s, me, lv, lvl, (opts && opts.tradeTargets) || others(s, me));
    }
    return null;
  };

  function mainStep(s, me, lv, lvl, targets) {
    const P = s.players[me];
    const m = mem(s);
    const opts = buildOptions(s, me, lv);
    const top = opts[0] || null;

    // 1. kaarten spelen
    const play = chooseDevPlay(s, me, lv, top);
    if (play) return play;

    // 2. bouwen: hoogste doel dat betaalbaar is (zonder een veel beter doel in de weg te zitten)
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (!EK.canAfford(P, o.cost)) continue;
      if (i > 0) {
        // niet de spullen opmaken die het hoofddoel nodig heeft, tenzij dat doel ver weg is
        const t0 = opts[0];
        const before = missing(P, t0.cost);
        const after = { res: { ...P.res } };
        for (const r in o.cost) after.res[r] -= o.cost[r];
        if (missing(after, t0.cost) > before && before <= 2 && t0.kind !== 'road') continue;
      }
      if (o.kind === 'settlement') return { type: 'buildSettlement', vertex: o.v };
      if (o.kind === 'city') return { type: 'buildCity', vertex: o.v };
      if (o.kind === 'dev') return { type: 'buyDev' };
      if (o.kind === 'road') return { type: 'buildRoad', edge: o.e };
    }

    // 3. ruilen richting het hoofddoel (of een tweede doel)
    if (top && m.trades < 6) {
      for (let i = 0; i < Math.min(2, opts.length); i++) {
        const target = opts[i];
        if (EK.canAfford(P, target.cost)) continue;
        // eerst een voorstel aan de speler (goedkoper dan de bank)
        if (lvl >= 2 || rand() < 0.3) {
          const prop = proposeTrade(s, me, lv, target, targets);
          if (prop) {
            m.proposals.push(prop.key);
            return { type: 'proposeTrade', to: prop.to, give: prop.give, get: prop.get };
          }
        }
        const bt = bankTradeFor(s, me, target);
        if (bt) {
          m.trades++;
          return bt;
        }
      }
    }
    // 4. te veel kaarten in de hand? Wissel vooraf zodat een 7 minder pijn doet.
    if (EK.total(s, me) > 7 && m.trades < 6) {
      let g = null;
      for (const r of RES) if (P.res[r] >= EK.ratio(s, me, r) && (!g || P.res[r] > P.res[g])) g = r;
      if (g) {
        const want = RES.filter((r) => r !== g && s.bank[r] > 0).sort((a, b) => P.res[a] - P.res[b])[0];
        if (want) {
          m.trades++;
          return { type: 'bankTrade', give: g, get: want };
        }
      }
    }
    return { type: 'endTurn' };
  }

  AI.bestRoad = bestRoad;
})(typeof globalThis !== 'undefined' ? globalThis : window);
