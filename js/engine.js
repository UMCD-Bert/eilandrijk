// Eilandrijk — spelregels. Alle toestand zit in één (JSON-serialiseerbaar) object;
// EK.act(state, actie) valideert en voert een actie uit voor de speler die aan de beurt is.
(function (G) {
  'use strict';
  const EK = G.EK;
  const T = EK.topo;
  const RES = EK.RES;

  EK.rand = Math.random;
  const rnd = (n) => Math.floor(EK.rand() * n);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  EK.shuffle = shuffle;
  EK.rnd = rnd;

  const zeroRes = () => ({ hout: 0, klei: 0, wol: 0, graan: 0, erts: 0 });
  const zeroDev = () => ({ knight: 0, roadbuilding: 0, invention: 0, monopoly: 0, vp: 0 });
  const sum = (o) => {
    let n = 0;
    for (const r of RES) n += o[r] || 0;
    return n;
  };
  EK.zeroRes = zeroRes;
  EK.sumRes = sum;

  // ---------- nieuw spel ----------
  function layoutTiles() {
    const list = shuffle([
      ...Array(4).fill('hout'),
      ...Array(3).fill('klei'),
      ...Array(4).fill('wol'),
      ...Array(4).fill('graan'),
      ...Array(3).fill('erts'),
      'woestijn',
    ]);
    let tiles = null;
    for (let attempt = 0; attempt < 500; attempt++) {
      const nums = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      let k = 0;
      tiles = list.map((r) => (r === 'woestijn' ? { res: r, num: null } : { res: r, num: nums[k++] }));
      // 6 en 8 mogen niet naast elkaar liggen
      let ok = true;
      for (let i = 0; i < tiles.length && ok; i++) {
        if (tiles[i].num !== 6 && tiles[i].num !== 8) continue;
        for (const j of T.tileNbr[i]) {
          if (tiles[j].num === 6 || tiles[j].num === 8) {
            ok = false;
            break;
          }
        }
      }
      if (ok) break;
    }
    return tiles;
  }

  function snake(n, first) {
    const seq = [];
    for (let i = 0; i < n; i++) seq.push((first + i) % n);
    return seq.concat(seq.slice().reverse());
  }

  EK.newGame = function (opts) {
    opts = opts || {};
    const n = Math.max(3, Math.min(4, opts.numPlayers || 4));
    const first = opts.first >= 0 && opts.first < n ? opts.first : rnd(n);
    const tiles = layoutTiles();
    const portTypes = shuffle(['any', 'any', 'any', 'any', 'hout', 'klei', 'wol', 'graan', 'erts']);
    const vPort = Array(T.verts.length).fill(null);
    T.portSlots.forEach((s, i) => {
      vPort[s.a] = portTypes[i];
      vPort[s.b] = portTypes[i];
    });
    const deck = shuffle([
      ...Array(14).fill('knight'),
      ...Array(5).fill('vp'),
      ...Array(2).fill('roadbuilding'),
      ...Array(2).fill('invention'),
      ...Array(2).fill('monopoly'),
    ]);
    const mk = () => ({
      res: zeroRes(),
      dev: zeroDev(),
      devNew: zeroDev(),
      knights: 0,
      roadsLeft: 15,
      settlementsLeft: 5,
      citiesLeft: 4,
      roadLen: 0,
    });
    return {
      tiles,
      portTypes,
      vPort,
      robber: tiles.findIndex((t) => t.res === 'woestijn'),
      vOwner: Array(T.verts.length).fill(-1),
      vType: Array(T.verts.length).fill(0),
      eOwner: Array(T.edges.length).fill(-1),
      players: Array.from({ length: n }, mk),
      bank: { hout: 19, klei: 19, wol: 19, graan: 19, erts: 19 },
      deck,
      cur: first,
      phase: 'setup',
      setup: { order: snake(n, first), step: 0, sub: 'settlement', last: -1 },
      dice: null,
      devPlayed: false,
      pending: {},
      freeRoads: 0,
      afterRobber: 'main',
      longest: { holder: -1, len: 0 },
      army: { holder: -1, count: 0 },
      winner: -1,
      target: opts.target || 10,
      names: (opts.names || ['Jij', 'Bram', 'Sanne', 'Joost']).slice(0, n),
      turnNo: 0,
      events: [],
      aiMem: null,
    };
  };

  EK.clone = function (s) {
    return {
      tiles: s.tiles,
      portTypes: s.portTypes,
      vPort: s.vPort,
      robber: s.robber,
      vOwner: s.vOwner.slice(),
      vType: s.vType.slice(),
      eOwner: s.eOwner.slice(),
      players: s.players.map((p) => ({
        res: { ...p.res },
        dev: { ...p.dev },
        devNew: { ...p.devNew },
        knights: p.knights,
        roadsLeft: p.roadsLeft,
        settlementsLeft: p.settlementsLeft,
        citiesLeft: p.citiesLeft,
        roadLen: p.roadLen,
      })),
      bank: { ...s.bank },
      deck: s.deck.slice(),
      cur: s.cur,
      phase: s.phase,
      setup: { order: s.setup.order, step: s.setup.step, sub: s.setup.sub, last: s.setup.last },
      dice: s.dice,
      devPlayed: s.devPlayed,
      pending: { ...s.pending },
      freeRoads: s.freeRoads,
      afterRobber: s.afterRobber,
      longest: { ...s.longest },
      army: { ...s.army },
      winner: s.winner,
      target: s.target,
      names: s.names,
      turnNo: s.turnNo,
      events: [],
      quiet: true,
      aiMem: null,
    };
  };

  // ---------- hulpfuncties ----------
  EK.vp = function (s, p, hidden) {
    const P = s.players[p];
    let n = 0;
    for (let v = 0; v < s.vOwner.length; v++) if (s.vOwner[v] === p) n += s.vType[v];
    if (s.longest.holder === p) n += 2;
    if (s.army.holder === p) n += 2;
    if (hidden) n += P.dev.vp + P.devNew.vp;
    return n;
  };
  EK.total = (s, p) => sum(s.players[p].res);
  EK.canAfford = (P, cost) => {
    for (const r in cost) if (P.res[r] < cost[r]) return false;
    return true;
  };
  EK.ratio = function (s, p, res) {
    let best = 4;
    for (let v = 0; v < s.vOwner.length; v++) {
      if (s.vOwner[v] !== p) continue;
      const pt = s.vPort[v];
      if (!pt) continue;
      if (pt === res) return 2;
      if (pt === 'any') best = Math.min(best, 3);
    }
    return best;
  };

  function ev(s, p, msg) {
    if (!s.quiet) s.events.push({ p, msg });
  }
  function pay(s, P, cost) {
    for (const r in cost) {
      P.res[r] -= cost[r];
      s.bank[r] += cost[r];
    }
  }

  // ---------- legale plekken ----------
  const L = (EK.legal = {});
  L.settlementSpots = function (s, p, setup) {
    const out = [];
    for (let v = 0; v < T.verts.length; v++) {
      if (s.vOwner[v] !== -1) continue;
      let ok = true;
      for (const w of T.verts[v].adj) {
        if (s.vOwner[w] !== -1) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (!setup) {
        let conn = false;
        for (const e of T.verts[v].edges) {
          if (s.eOwner[e] === p) {
            conn = true;
            break;
          }
        }
        if (!conn) continue;
      }
      out.push(v);
    }
    return out;
  };
  L.citySpots = function (s, p) {
    const out = [];
    for (let v = 0; v < T.verts.length; v++) if (s.vOwner[v] === p && s.vType[v] === 1) out.push(v);
    return out;
  };
  L.roadOk = function (s, e, p) {
    if (s.eOwner[e] !== -1) return false;
    const ed = T.edges[e];
    for (const x of [ed.a, ed.b]) {
      const o = s.vOwner[x];
      if (o === p) return true;
      if (o !== -1) continue; // vijandelijk gebouw blokkeert doorverbinden
      for (const e2 of T.verts[x].edges) if (e2 !== e && s.eOwner[e2] === p) return true;
    }
    return false;
  };
  L.roadSpots = function (s, p) {
    const out = [];
    for (let e = 0; e < T.edges.length; e++) if (L.roadOk(s, e, p)) out.push(e);
    return out;
  };
  L.setupRoadSpots = function (s) {
    const out = [];
    for (const e of T.verts[s.setup.last].edges) if (s.eOwner[e] === -1) out.push(e);
    return out;
  };
  L.robberSpots = (s) => T.tiles.map((_, i) => i).filter((i) => i !== s.robber);
  L.victims = function (s, tile, p) {
    const out = [];
    for (const v of T.tiles[tile].verts) {
      const o = s.vOwner[v];
      if (o !== -1 && o !== p && !out.includes(o) && EK.total(s, o) > 0) out.push(o);
    }
    return out;
  };

  // ---------- langste weg / grootste leger ----------
  EK.longestRoad = function (s, p) {
    const used = new Uint8Array(T.edges.length);
    let best = 0;
    function dfs(v, len) {
      if (len > best) best = len;
      for (const e of T.verts[v].edges) {
        if (s.eOwner[e] !== p || used[e]) continue;
        const ed = T.edges[e];
        const w = ed.a === v ? ed.b : ed.a;
        used[e] = 1;
        if (s.vOwner[w] !== -1 && s.vOwner[w] !== p) {
          if (len + 1 > best) best = len + 1;
        } else dfs(w, len + 1);
        used[e] = 0;
      }
    }
    const starts = new Set();
    for (let e = 0; e < T.edges.length; e++) {
      if (s.eOwner[e] === p) {
        starts.add(T.edges[e].a);
        starts.add(T.edges[e].b);
      }
    }
    for (const v of starts) dfs(v, 0);
    return best;
  };

  function recalcLongest(s) {
    const np = s.players.length;
    const len = [];
    for (let p = 0; p < np; p++) {
      len.push(EK.longestRoad(s, p));
      s.players[p].roadLen = len[p];
    }
    const m = Math.max(...len);
    const old = s.longest.holder;
    let h = -1;
    if (m >= 5) {
      const top = [];
      for (let p = 0; p < np; p++) if (len[p] === m) top.push(p);
      h = top.length === 1 ? top[0] : top.includes(old) ? old : -1;
    }
    if (h !== old) {
      if (h >= 0) ev(s, h, `${s.names[h]} krijgt de langste weg (${len[h]}).`);
      else ev(s, -1, 'Niemand heeft nu de langste weg.');
    }
    s.longest.holder = h;
    s.longest.len = h >= 0 ? len[h] : 0;
  }

  function checkWin(s) {
    if (s.phase === 'over') return;
    if (EK.vp(s, s.cur, true) >= s.target) {
      s.phase = 'over';
      s.winner = s.cur;
      ev(s, s.cur, `${s.names[s.cur]} wint met ${EK.vp(s, s.cur, true)} punten!`);
    }
  }

  // ---------- opbrengst ----------
  function produce(s, n) {
    const np = s.players.length;
    const demand = {};
    for (const r of RES) demand[r] = Array(np).fill(0);
    T.tiles.forEach((t, ti) => {
      const tl = s.tiles[ti];
      if (tl.num !== n || ti === s.robber) return;
      for (const v of t.verts) if (s.vOwner[v] !== -1) demand[tl.res][s.vOwner[v]] += s.vType[v];
    });
    for (const r of RES) {
      const d = demand[r];
      const tot = d.reduce((a, b) => a + b, 0);
      if (!tot) continue;
      const takers = d.filter((x) => x > 0).length;
      if (tot <= s.bank[r]) {
        for (let p = 0; p < np; p++) {
          if (d[p]) {
            s.players[p].res[r] += d[p];
            s.bank[r] -= d[p];
            ev(s, p, `${s.names[p]} krijgt ${d[p]}× ${EK.RES_NL[r]}.`);
          }
        }
      } else if (takers > 1) {
        ev(s, -1, `De bank heeft te weinig ${EK.RES_NL[r]}: niemand krijgt er iets van.`);
      } else {
        const p = d.findIndex((x) => x > 0);
        const g = s.bank[r];
        if (g) {
          s.players[p].res[r] += g;
          s.bank[r] = 0;
          ev(s, p, `${s.names[p]} krijgt ${g}× ${EK.RES_NL[r]} (de bank is bijna leeg).`);
        }
      }
    }
  }

  function stealCard(s, from, to) {
    const h = s.players[from].res;
    let k = rnd(sum(h));
    for (const r of RES) {
      if (k < h[r]) {
        h[r]--;
        s.players[to].res[r]++;
        return r;
      }
      k -= h[r];
    }
    return null;
  }

  function updateArmy(s, p) {
    const P = s.players[p];
    if (P.knights >= 3 && P.knights > s.army.count) {
      if (s.army.holder !== p) ev(s, p, `${s.names[p]} krijgt het grootste leger.`);
      s.army.holder = p;
      s.army.count = P.knights;
    }
  }

  function startRobber(s, after) {
    s.afterRobber = after;
    s.phase = 'robber';
  }

  function freeRoadStep(s) {
    const p = s.cur;
    if (s.freeRoads <= 0 || s.players[p].roadsLeft <= 0 || L.roadSpots(s, p).length === 0) {
      s.freeRoads = 0;
      s.phase = 'main';
    }
  }

  // ---------- acties ----------
  EK.act = function (s, a) {
    const fail = (m) => ({ ok: false, err: m });
    if (s.phase === 'over') return fail('Het spel is afgelopen.');
    const np = s.players.length;
    const p = s.cur;
    const P = s.players[p];
    const nm = s.names;
    const t = a.type;

    if (t === 'discard') {
      if (s.phase !== 'discard') return fail('Er hoeft nu niet afgegooid te worden.');
      const q = a.player;
      const need = s.pending[q];
      if (!need) return fail('Die speler hoeft niet af te gooien.');
      let n = 0;
      for (const r of RES) {
        const c = a.cards[r] || 0;
        if (c < 0 || c > s.players[q].res[r]) return fail('Je hebt die kaarten niet.');
        n += c;
      }
      if (n !== need) return fail(`Gooi precies ${need} kaarten af.`);
      for (const r of RES) {
        const c = a.cards[r] || 0;
        s.players[q].res[r] -= c;
        s.bank[r] += c;
      }
      delete s.pending[q];
      ev(s, q, `${nm[q]} gooit ${need} kaarten af.`);
      if (Object.keys(s.pending).length === 0) startRobber(s, 'main');
      return { ok: true };
    }

    switch (t) {
      case 'buildSettlement': {
        if (s.phase === 'setup') {
          if (s.setup.sub !== 'settlement') return fail('Plaats eerst een weg.');
          if (!L.settlementSpots(s, p, true).includes(a.vertex)) return fail('Daar mag geen nederzetting komen (afstandsregel).');
          s.vOwner[a.vertex] = p;
          s.vType[a.vertex] = 1;
          P.settlementsLeft--;
          s.setup.last = a.vertex;
          s.setup.sub = 'road';
          ev(s, p, `${nm[p]} plaatst een nederzetting.`);
          if (s.setup.step >= np) {
            for (const ti of T.verts[a.vertex].tiles) {
              const r = s.tiles[ti].res;
              if (r !== 'woestijn' && s.bank[r] > 0) {
                P.res[r]++;
                s.bank[r]--;
              }
            }
          }
          return { ok: true };
        }
        if (s.phase !== 'main') return fail('Bouwen kan alleen in de bouwfase van je beurt.');
        if (P.settlementsLeft <= 0) return fail('Je hebt geen nederzettingen meer over.');
        if (!EK.canAfford(P, EK.COST.settlement)) return fail('Je kunt je die nederzetting niet veroorloven.');
        if (!L.settlementSpots(s, p, false).includes(a.vertex)) return fail('Daar mag geen nederzetting komen.');
        pay(s, P, EK.COST.settlement);
        s.vOwner[a.vertex] = p;
        s.vType[a.vertex] = 1;
        P.settlementsLeft--;
        ev(s, p, `${nm[p]} bouwt een nederzetting.`);
        recalcLongest(s);
        checkWin(s);
        return { ok: true };
      }
      case 'buildCity': {
        if (s.phase !== 'main') return fail('Bouwen kan alleen in de bouwfase van je beurt.');
        if (P.citiesLeft <= 0) return fail('Je hebt geen steden meer over.');
        if (!EK.canAfford(P, EK.COST.city)) return fail('Je kunt je die stad niet veroorloven.');
        if (!L.citySpots(s, p).includes(a.vertex)) return fail('Kies een van je nederzettingen.');
        pay(s, P, EK.COST.city);
        s.vType[a.vertex] = 2;
        P.citiesLeft--;
        P.settlementsLeft++;
        ev(s, p, `${nm[p]} bouwt een stad.`);
        checkWin(s);
        return { ok: true };
      }
      case 'buildRoad': {
        if (s.phase === 'setup') {
          if (s.setup.sub !== 'road') return fail('Plaats eerst een nederzetting.');
          if (!L.setupRoadSpots(s).includes(a.edge)) return fail('De weg moet aan je nieuwe nederzetting grenzen.');
          s.eOwner[a.edge] = p;
          P.roadsLeft--;
          ev(s, p, `${nm[p]} legt een weg aan.`);
          s.setup.step++;
          if (s.setup.step >= 2 * np) {
            s.phase = 'roll';
            s.cur = s.setup.order[0];
            s.turnNo = 1;
            ev(s, s.cur, `${nm[s.cur]} begint.`);
          } else {
            s.cur = s.setup.order[s.setup.step];
            s.setup.sub = 'settlement';
          }
          recalcLongest(s);
          return { ok: true };
        }
        if (s.phase === 'roadbuilding') {
          if (!L.roadOk(s, a.edge, p)) return fail('Daar kan geen weg komen.');
          s.eOwner[a.edge] = p;
          P.roadsLeft--;
          s.freeRoads--;
          ev(s, p, `${nm[p]} legt een weg aan.`);
          recalcLongest(s);
          freeRoadStep(s);
          checkWin(s);
          return { ok: true };
        }
        if (s.phase !== 'main') return fail('Bouwen kan alleen in de bouwfase van je beurt.');
        if (P.roadsLeft <= 0) return fail('Je hebt geen wegen meer over.');
        if (!EK.canAfford(P, EK.COST.road)) return fail('Een weg kost 1 hout en 1 klei.');
        if (!L.roadOk(s, a.edge, p)) return fail('Daar kan geen weg komen.');
        pay(s, P, EK.COST.road);
        s.eOwner[a.edge] = p;
        P.roadsLeft--;
        ev(s, p, `${nm[p]} bouwt een weg.`);
        recalcLongest(s);
        checkWin(s);
        return { ok: true };
      }
      case 'roll': {
        if (s.phase !== 'roll') return fail('Je hebt al gegooid.');
        const d = a.dice || [1 + rnd(6), 1 + rnd(6)];
        s.dice = d;
        const n = d[0] + d[1];
        ev(s, p, `${nm[p]} gooit ${n}.`);
        if (n === 7) {
          s.pending = {};
          for (let q = 0; q < np; q++) {
            const tot = EK.total(s, q);
            if (tot > 7) s.pending[q] = Math.floor(tot / 2);
          }
          if (Object.keys(s.pending).length) s.phase = 'discard';
          else startRobber(s, 'main');
          s.afterRobber = 'main';
        } else {
          produce(s, n);
          s.phase = 'main';
        }
        return { ok: true, total: n };
      }
      case 'moveRobber': {
        if (s.phase !== 'robber') return fail('De rover kan nu niet verplaatst worden.');
        if (a.tile === s.robber || !(a.tile >= 0 && a.tile < T.tiles.length)) return fail('Kies een andere tegel.');
        const vic = L.victims(s, a.tile, p);
        if (vic.length > 1 && !vic.includes(a.victim)) return fail('Kies van welke speler je steelt.');
        s.robber = a.tile;
        ev(s, p, `${nm[p]} verplaatst de rover.`);
        let stolen = null;
        if (vic.length) {
          const v = vic.includes(a.victim) ? a.victim : vic[0];
          stolen = stealCard(s, v, p);
          ev(s, p, `${nm[p]} steelt ${EK.RES_NL[stolen]} van ${nm[v]}.`);
        }
        s.phase = s.afterRobber;
        return { ok: true, stolen };
      }
      case 'buyDev': {
        if (s.phase !== 'main') return fail('Kopen kan alleen in de bouwfase van je beurt.');
        if (!s.deck.length) return fail('De stapel ontwikkelingskaarten is op.');
        if (!EK.canAfford(P, EK.COST.dev)) return fail('Een ontwikkelingskaart kost wol, graan en erts.');
        pay(s, P, EK.COST.dev);
        const c = s.deck.pop();
        P.devNew[c]++;
        ev(s, p, `${nm[p]} koopt een ontwikkelingskaart.`);
        checkWin(s);
        return { ok: true, card: c };
      }
      case 'playKnight': {
        if (s.phase !== 'roll' && s.phase !== 'main') return fail('Je kunt nu geen kaart spelen.');
        if (s.devPlayed) return fail('Je speelt maximaal één ontwikkelingskaart per beurt.');
        if (P.dev.knight <= 0) return fail('Je hebt geen speelbare ridder.');
        P.dev.knight--;
        P.knights++;
        s.devPlayed = true;
        ev(s, p, `${nm[p]} speelt een ridder.`);
        updateArmy(s, p);
        startRobber(s, s.phase);
        checkWin(s);
        return { ok: true };
      }
      case 'playRoadBuilding': {
        if (s.phase !== 'main') return fail('Je kunt nu geen kaart spelen.');
        if (s.devPlayed) return fail('Je speelt maximaal één ontwikkelingskaart per beurt.');
        if (P.dev.roadbuilding <= 0) return fail('Je hebt geen speelbare wegenbouwkaart.');
        if (P.roadsLeft <= 0 || L.roadSpots(s, p).length === 0) return fail('Je kunt nergens een weg leggen.');
        P.dev.roadbuilding--;
        s.devPlayed = true;
        s.freeRoads = Math.min(2, P.roadsLeft);
        s.phase = 'roadbuilding';
        ev(s, p, `${nm[p]} speelt wegenbouw.`);
        return { ok: true };
      }
      case 'playInvention': {
        if (s.phase !== 'main') return fail('Je kunt nu geen kaart spelen.');
        if (s.devPlayed) return fail('Je speelt maximaal één ontwikkelingskaart per beurt.');
        if (P.dev.invention <= 0) return fail('Je hebt geen speelbare uitvindingskaart.');
        const want = [a.a, a.b];
        const need = zeroRes();
        for (const r of want) {
          if (!RES.includes(r)) return fail('Kies twee grondstoffen.');
          need[r]++;
        }
        for (const r of RES) if (need[r] > s.bank[r]) return fail('De bank heeft die grondstof niet meer.');
        P.dev.invention--;
        s.devPlayed = true;
        for (const r of want) {
          P.res[r]++;
          s.bank[r]--;
        }
        ev(s, p, `${nm[p]} speelt uitvinding en pakt ${EK.RES_NL[want[0]]} en ${EK.RES_NL[want[1]]}.`);
        return { ok: true };
      }
      case 'playMonopoly': {
        if (s.phase !== 'main') return fail('Je kunt nu geen kaart spelen.');
        if (s.devPlayed) return fail('Je speelt maximaal één ontwikkelingskaart per beurt.');
        if (P.dev.monopoly <= 0) return fail('Je hebt geen speelbare monopoliekaart.');
        if (!RES.includes(a.res)) return fail('Kies een grondstof.');
        P.dev.monopoly--;
        s.devPlayed = true;
        let n = 0;
        for (let q = 0; q < np; q++) {
          if (q === p) continue;
          n += s.players[q].res[a.res];
          s.players[q].res[a.res] = 0;
        }
        P.res[a.res] += n;
        ev(s, p, `${nm[p]} speelt monopolie op ${EK.RES_NL[a.res]} en pakt er ${n}.`);
        return { ok: true, taken: n };
      }
      case 'bankTrade': {
        if (s.phase !== 'main') return fail('Ruilen kan alleen in de bouwfase van je beurt.');
        if (!RES.includes(a.give) || !RES.includes(a.get) || a.give === a.get) return fail('Kies twee verschillende grondstoffen.');
        const r = EK.ratio(s, p, a.give);
        if (P.res[a.give] < r) return fail(`Je hebt ${r} ${EK.RES_NL[a.give]} nodig voor deze ruil.`);
        if (s.bank[a.get] < 1) return fail('De bank heeft die grondstof niet meer.');
        P.res[a.give] -= r;
        s.bank[a.give] += r;
        P.res[a.get]++;
        s.bank[a.get]--;
        ev(s, p, `${nm[p]} ruilt ${r}× ${EK.RES_NL[a.give]} met de bank voor 1× ${EK.RES_NL[a.get]}.`);
        return { ok: true };
      }
      case 'trade': {
        if (s.phase !== 'main') return fail('Ruilen kan alleen in de bouwfase van je beurt.');
        const o = a.with;
        if (!(o >= 0 && o < np) || o === p) return fail('Kies met wie je ruilt.');
        const O = s.players[o];
        let ng = 0;
        let nw = 0;
        for (const r of RES) {
          const g = a.give[r] || 0;
          const w = a.get[r] || 0;
          if (g < 0 || w < 0) return fail('Ongeldige ruil.');
          if (g && w) return fail('Je kunt niet dezelfde grondstof geven en vragen.');
          if (g > P.res[r]) return fail('Je hebt niet genoeg kaarten voor dit bod.');
          if (w > O.res[r]) return fail(`${nm[o]} heeft niet genoeg kaarten voor deze ruil.`);
          ng += g;
          nw += w;
        }
        if (!ng || !nw) return fail('Een ruil moet aan beide kanten kaarten bevatten.');
        for (const r of RES) {
          const g = a.give[r] || 0;
          const w = a.get[r] || 0;
          P.res[r] += w - g;
          O.res[r] += g - w;
        }
        ev(s, p, `${nm[p]} ruilt met ${nm[o]}: ${fmt(a.give)} voor ${fmt(a.get)}.`);
        return { ok: true };
      }
      case 'endTurn': {
        if (s.phase !== 'main') return fail('Je kunt je beurt nu niet beëindigen.');
        for (const k in P.devNew) {
          P.dev[k] += P.devNew[k];
          P.devNew[k] = 0;
        }
        s.devPlayed = false;
        s.cur = (p + 1) % np;
        s.phase = 'roll';
        s.dice = null;
        s.turnNo++;
        return { ok: true };
      }
    }
    return fail('Onbekende actie.');
  };

  function fmt(c) {
    return RES.filter((r) => c[r]).map((r) => `${c[r]}× ${EK.RES_NL[r]}`).join(', ');
  }
  EK.fmtCards = fmt;
})(typeof globalThis !== 'undefined' ? globalThis : window);
