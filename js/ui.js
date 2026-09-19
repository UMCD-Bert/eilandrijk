// Eilandrijk — interface en spelbesturing (mens = speler 0, AI = speler 1).
(function () {
  'use strict';
  const EK = window.EK;
  const T = EK.topo;
  const RES = EK.RES;
  const L = EK.legal;
  const HUMAN = 0;
  const SAVE_KEY = 'eilandrijk.save.v2';
  const SET_KEY = 'eilandrijk.settings.v2';

  const $ = (s) => document.querySelector(s);
  const App = { s: null, level: 2, numAI: 3, target: 10, first: 'random', mode: null, busy: false, gen: 0, flashNum: null, rolling: false, log: [], stats: null };
  let modal = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = {
    get(k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* opslag niet beschikbaar */ }
    },
    del(k) {
      try { localStorage.removeItem(k); } catch (e) { /* idem */ }
    },
  };

  // ---------- kleine HTML-hulpjes ----------
  const resChip = (r, n) => `<span class="tag" style="background:${EK.PAL[r].bg};color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.4)">${EK.emblem(r, 18)}${n === undefined ? '' : n}</span>`;
  const cardsHtml = (c) => RES.filter((r) => c[r]).map((r) => resChip(r, c[r])).join('') || '<span class="muted">—</span>';
  const costHtml = (cost) => RES.filter((r) => cost[r]).map((r) => `<span>${cost[r]}</span>${EK.emblem(r, 17)}`).join('');

  function dieSvg(n) {
    const pos = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };
    return `<svg class="die" viewBox="0 0 100 100">${(pos[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${n === 1 ? '#c0392b' : '#2b2b33'}"/>`).join('')}</svg>`;
  }

  function toast(msg, good) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('good', !!good);
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- modals ----------
  function showModal(m) {
    modal = m;
    refreshModal();
  }
  function refreshModal() {
    if (!modal) return;
    $('#modal-root').innerHTML = `<div class="overlay"><div class="modal ${modal.cls || ''}" role="dialog" aria-modal="true"><h2>${modal.title}</h2><div class="modal-body">${modal.render()}</div></div></div>`;
  }
  function closeModal() {
    modal = null;
    $('#modal-root').innerHTML = '';
  }
  $('#modal-root').addEventListener('click', (e) => {
    const el = e.target.closest('[data-m]');
    if (!el || !modal || el.disabled) return;
    modal.onAction(el.dataset.m, el.dataset);
  });

  // ---------- opslaan ----------
  function save() {
    if (!App.s) return;
    if (App.s.phase === 'over') {
      safe.del(SAVE_KEY);
      return;
    }
    safe.set(SAVE_KEY, JSON.stringify({ s: App.s, level: App.level, log: App.log.slice(-60) }));
  }
  function loadSave() {
    const raw = safe.get(SAVE_KEY);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (d && d.s && d.s.tiles && d.s.tiles.length === T.tiles.length) return d;
    } catch (e) { /* kapotte save */ }
    return null;
  }

  // ---------- spel starten ----------
  function newGame() {
    App.gen++;
    App.busy = false;
    App.mode = null;
    App.log = [];
    App.flashNum = null;
    const first = App.first === 'you' ? HUMAN : undefined;
    App.s = EK.newGame({ target: App.target, first, numPlayers: App.numAI + 1 });
    logSys(`Nieuw spel met ${App.numAI} tegenstanders (${EK.AI.LEVELS[App.level].name}). Wie als eerste ${App.target} punten haalt, wint.`);
    closeModal();
    tick();
  }

  function showNewGameDialog(canCancel) {
    const st = { level: App.level, numAI: App.numAI, target: App.target, first: App.first };
    const saved = loadSave();
    showModal({
      title: 'Eilandrijk',
      render() {
        const opt = (key, val, label) => `<button data-m="set" data-k="${key}" data-v="${val}" class="${String(st[key]) === String(val) ? 'sel' : ''}">${label}</button>`;
        return `<p class="muted">Speel met 2 of 3 AI-tegenstanders op een eiland van hexagons. Verzamel grondstoffen, bouw wegen, nederzettingen en steden, en haal als eerste de benodigde punten.</p>
        <div class="field-l">Aantal tegenstanders (AI)</div>
        <div class="seg">${[2, 3].map((n) => opt('numAI', n, n + ' tegenstanders')).join('')}</div>
        <div class="field-l">Sterkte van de tegenstanders</div>
        <div class="seg">${[1, 2, 3].map((l) => opt('level', l, EK.AI.LEVELS[l].name)).join('')}</div>
        <div class="field-l">Winnen bij</div>
        <div class="seg">${[8, 10, 12].map((n) => opt('target', n, n + ' punten')).join('')}</div>
        <div class="field-l">Wie begint</div>
        <div class="seg">${opt('first', 'random', 'Willekeurig')}${opt('first', 'you', 'Jij')}</div>
        <div class="foot">
          ${canCancel ? '<button class="secondary" data-m="cancel">Annuleren</button>' : ''}
          ${saved ? '<button class="secondary" data-m="continue">Verder met vorig spel</button>' : ''}
          <button class="primary" data-m="start">Start spel</button>
        </div>`;
      },
      onAction(a, d) {
        if (a === 'set') {
          st[d.k] = d.k === 'level' || d.k === 'target' || d.k === 'numAI' ? Number(d.v) : d.v;
          refreshModal();
        } else if (a === 'cancel') closeModal();
        else if (a === 'start') {
          App.level = st.level;
          App.numAI = st.numAI;
          App.target = st.target;
          App.first = st.first;
          safe.set(SET_KEY, JSON.stringify({ level: App.level, numAI: App.numAI, target: App.target, first: App.first }));
          newGame();
        } else if (a === 'continue') {
          App.level = saved.level || 2;
          App.s = saved.s;
          App.log = saved.log || [];
          App.gen++;
          App.busy = false;
          closeModal();
          tick();
        }
      },
    });
  }

  function showRules() {
    showModal({
      title: 'Spelregels',
      cls: 'wide rules',
      render() {
        return `<h4>Doel</h4><ul><li>Wie als eerste ${App.s ? App.s.target : 10} punten heeft, wint. Nederzetting = 1 punt, stad = 2, langste weg = 2, grootste leger = 2, elke overwinningspuntkaart = 1 (die blijft verborgen tot je wint).</li></ul>
        <h4>Beurt</h4><ul><li><b>Gooi</b> twee dobbelstenen. Elke tegel met dat getal levert 1 kaart per nederzetting en 2 per stad die eraan grenst.</li>
        <li>Daarna mag je <b>bouwen</b>, <b>ruilen</b> en een ontwikkelingskaart <b>spelen</b> (max. één per beurt), in elke volgorde. Sluit af met "Beurt beëindigen".</li></ul>
        <h4>Bouwen</h4><ul>
        <li>Weg: 1 hout + 1 klei. Moet aansluiten op je eigen weg of gebouw.</li>
        <li>Nederzetting: 1 hout + 1 klei + 1 wol + 1 graan. Moet aan je eigen weg liggen en minstens twee wegen (hoekpunten) van elk ander gebouw af (afstandsregel).</li>
        <li>Stad: 2 graan + 3 erts, vervangt een eigen nederzetting.</li>
        <li>Ontwikkelingskaart: 1 wol + 1 graan + 1 erts. Een net gekochte kaart speel je pas de volgende beurt.</li></ul>
        <h4>De 7 en de rover</h4><ul><li>Bij een 7 levert niets op. Wie meer dan 7 kaarten heeft, gooit de helft (naar beneden afgerond) af. De speler die gooide zet de rover op een andere tegel: die tegel levert niets meer op, en je steelt een willekeurige kaart van een speler die eraan bouwt (bij meerdere spelers kies je wie).</li></ul>
        <h4>Ruilen</h4><ul><li>Met de bank: 4 gelijke kaarten voor 1 naar keuze. Een nederzetting of stad aan een haven verlaagt dat: 3:1 (algemeen) of 2:1 voor de grondstof van de haven.</li>
        <li>Met de tegenstanders: bied kaarten aan; elke AI reageert met ja, nee of een tegenbod. Alleen tijdens je eigen beurt. De AI\'s ruilen onderling niet.</li></ul>
        <h4>Ontwikkelingskaarten</h4><ul><li><b>Ridder</b>: verplaats de rover (ook vóór het gooien). 3 gespeelde ridders = grootste leger.</li>
        <li><b>Wegenbouw</b>: leg 2 wegen gratis. <b>Uitvinding</b>: pak 2 grondstoffen van de bank. <b>Monopolie</b>: kies een grondstof en pak alle kaarten daarvan van alle andere spelers. <b>Overwinningspunt</b>: 1 punt.</li></ul>
        <h4>Langste weg</h4><ul><li>Een aaneengesloten weg van minstens 5 stukken. Een gebouw van een andere speler onderbreekt je weg.</li></ul>
        <h4>Begin</h4><ul><li>Iedereen plaatst twee nederzettingen met elk een weg: eerst met de klok mee, dan terug in omgekeerde volgorde. De tweede nederzetting levert direct kaarten van de omliggende tegels.</li></ul>
        <div class="foot"><button class="primary" data-m="close">Sluiten</button></div>`;
      },
      onAction() { closeModal(); },
    });
  }

  // ---------- log ----------
  function logMsg(msg, p) {
    App.log.push({ msg, p });
    if (App.log.length > 200) App.log.shift();
  }
  const logSys = (m) => logMsg(m, -1);
  function flush() {
    const s = App.s;
    for (const e of s.events) logMsg(e.msg, e.p);
    s.events = [];
  }

  // ---------- markeringen op het bord ----------
  const humanTurn = () => App.s.cur === HUMAN && App.s.phase !== 'over';
  function computeHl() {
    const s = App.s;
    const hl = { flashNum: App.flashNum };
    if (!humanTurn()) return hl;
    if (s.phase === 'setup') {
      if (s.setup.sub === 'settlement') hl.vertices = L.settlementSpots(s, HUMAN, true);
      else hl.edges = L.setupRoadSpots(s);
    } else if (s.phase === 'robber') hl.tiles = L.robberSpots(s);
    else if (s.phase === 'roadbuilding') hl.edges = L.roadSpots(s, HUMAN);
    else if (s.phase === 'main') {
      if (App.mode === 'road') hl.edges = L.roadSpots(s, HUMAN);
      else if (App.mode === 'settlement') hl.vertices = L.settlementSpots(s, HUMAN, false);
      else if (App.mode === 'city') hl.vertices = L.citySpots(s, HUMAN);
    }
    return hl;
  }

  // ---------- status ----------
  const firstPendingAI = (s) => Object.keys(s.pending).map(Number).find((q) => q !== HUMAN && s.pending[q] > 0) ?? -1;
  function statusHtml() {
    const s = App.s;
    const nm = s.names;
    if (s.phase === 'over') return { html: `<span class="msg"><b>${nm[s.winner]}</b> wint het spel!</span>`, ai: false };
    if (s.phase === 'discard') {
      if (s.pending[HUMAN]) return { html: `<span class="msg">Een <b>7</b>! Gooi <b>${s.pending[HUMAN]}</b> kaarten af.</span>` };
      const who = firstPendingAI(s);
      return { html: `<span class="msg thinking">${who >= 0 ? nm[who] : 'De tegenstanders'} gooi${who >= 0 ? 't' : 'en'} kaarten af</span>`, ai: true };
    }
    if (s.cur !== HUMAN) {
      const t = { setup: 'plaatst beginstukken', roll: 'gooit de dobbelstenen', robber: 'verplaatst de rover', roadbuilding: 'legt wegen aan', main: 'is aan de beurt' }[s.phase];
      return { html: `<span class="msg thinking"><b>${nm[s.cur]}</b> ${t}</span>`, ai: true };
    }
    switch (s.phase) {
      case 'setup':
        return { html: `<span class="msg">Startopstelling: ${s.setup.sub === 'settlement' ? 'kies een <b>hoekpunt</b> voor je nederzetting.' : 'leg een <b>weg</b> vanaf je nieuwe nederzetting.'}${s.setup.step >= 2 && s.setup.sub === 'settlement' ? ' Deze levert direct grondstoffen op.' : ''}</span>` };
      case 'roll':
        return { html: `<span class="msg">Jouw beurt. Gooi de dobbelstenen${s.players[HUMAN].dev.knight > 0 && !s.devPlayed ? ' — of speel eerst een ridder.' : '.'}</span>`, roll: true };
      case 'robber':
        return { html: `<span class="msg">Zet de <b>rover</b> op een andere tegel. Die levert niets meer op.</span>` };
      case 'roadbuilding':
        return { html: `<span class="msg">Wegenbouw: leg nog <b>${s.freeRoads}</b> gratis ${s.freeRoads === 1 ? 'weg' : 'wegen'}.</span>` };
      case 'main': {
        if (App.mode) return { html: `<span class="msg">Kies een gemarkeerde plek op het bord om te bouwen.</span>`, cancel: true };
        return { html: `<span class="msg">Jouw beurt: bouw, ruil of beëindig je beurt.</span>` };
      }
    }
    return { html: '' };
  }

  // ---------- paneel ----------
  function scoreRow(p) {
    const s = App.s;
    const P = s.players[p];
    const vp = EK.vp(s, p, p === HUMAN);
    const cards = EK.total(s, p);
    const devN = Object.values(P.dev).reduce((a, b) => a + b, 0) + Object.values(P.devNew).reduce((a, b) => a + b, 0);
    const badges = `${s.longest.holder === p ? '<span class="badge">Langste weg</span>' : ''}${s.army.holder === p ? '<span class="badge">Groot leger</span>' : ''}`;
    return `<div class="pl ${s.cur === p && s.phase !== 'over' ? 'active' : ''}">
      <div class="ico">${EK.pieceIcon('settlement', p, 24)}</div>
      <div><div class="nm">${s.names[p]} ${badges}</div>
      <div class="sub"><span title="Grondstofkaarten">▣ ${cards}</span><span title="Ontwikkelingskaarten">✦ ${devN}</span><span title="Gespeelde ridders">⚔ ${P.knights}</span><span title="Langste weg">⟿ ${P.roadLen}</span></div></div>
      <div class="vp">${vp}<small>PUNTEN</small></div></div>`;
  }

  function actBtn(id, title, cost, enabled, why, on) {
    return `<button class="act ${on ? 'on' : ''}" data-do="${id}" ${enabled ? '' : 'disabled'} title="${enabled ? '' : why}"><span class="t">${title}</span><span class="c">${costHtml(cost)}</span></button>`;
  }

  function panelHtml() {
    const s = App.s;
    const P = s.players[HUMAN];
    const turn = humanTurn();
    const main = turn && s.phase === 'main';
    const spots = { road: main && P.roadsLeft > 0 && L.roadSpots(s, HUMAN).length > 0, settlement: main && P.settlementsLeft > 0 && L.settlementSpots(s, HUMAN, false).length > 0, city: main && P.citiesLeft > 0 && L.citySpots(s, HUMAN).length > 0 };
    const afford = (k) => EK.canAfford(P, EK.COST[k]);
    const why = (k, sp) => (!afford(k) ? 'Te weinig grondstoffen' : sp === false ? 'Geen geschikte plek' : '');

    const dice = s.dice
      ? `${dieSvg(s.dice[0])}${dieSvg(s.dice[1])}<span class="total">${s.dice[0] + s.dice[1]}</span>`
      : '<span class="none">Nog niet gegooid</span>';

    // ontwikkelingskaarten
    const devKinds = ['knight', 'roadbuilding', 'invention', 'monopoly'];
    let devs = '';
    for (const k of devKinds) {
      const ready = P.dev[k];
      const fresh = P.devNew[k];
      if (!ready && !fresh) continue;
      const okPhase = turn && !s.devPlayed && (k === 'knight' ? s.phase === 'roll' || s.phase === 'main' : s.phase === 'main');
      devs += `<div class="dev"><span><b>${ready + fresh}×</b> ${EK.DEV_NL[k]}${fresh ? ` <span class="new">(${fresh} nieuw)</span>` : ''}</span>${ready ? `<button data-do="play-${k}" ${okPhase ? '' : 'disabled'}>Speel</button>` : ''}</div>`;
    }
    const vpc = P.dev.vp + P.devNew.vp;
    if (vpc) devs += `<div class="dev"><span><b>${vpc}×</b> Overwinningspunt <span class="new">(telt mee)</span></span></div>`;
    if (!devs) devs = '<span class="muted small">Geen ontwikkelingskaarten</span>';

    const hand = RES.map((r) => `<div class="rc ${P.res[r] ? '' : 'zero'}" style="background:${EK.PAL[r].bg}">${EK.emblem(r, 30)}<div class="n">${P.res[r]}</div><div class="l">${EK.RES_NL[r]}</div></div>`).join('');

    const log = App.log.slice(-40).map((e) => `<div class="${e.p < 0 ? 'sys' : ''}"><i style="${e.p >= 0 ? `background:${EK.PLAYER_COLORS[e.p]};box-shadow:0 0 0 1px ${EK.PLAYER_STROKE[e.p]}` : ''}"></i><span>${e.msg}</span></div>`).join('');

    return `
    <div class="card c-score"><h3>Stand · winnen bij ${s.target}</h3><div class="players">${s.players.map((_, i) => scoreRow(i)).join('')}</div></div>
    <div class="card c-dice"><h3>Dobbelstenen</h3><div class="dice ${App.rolling ? 'rolling' : ''}" id="dice">${dice}</div></div>
    <div class="card c-hand"><h3>Jouw grondstoffen</h3><div class="hand">${hand}</div><div class="devs">${devs}</div></div>
    <div class="card c-act"><h3>Acties</h3><div class="actions">
      ${actBtn('build-road', 'Weg', EK.COST.road, main && afford('road') && spots.road, why('road', spots.road), App.mode === 'road')}
      ${actBtn('build-settlement', 'Nederzetting', EK.COST.settlement, main && afford('settlement') && spots.settlement, why('settlement', spots.settlement), App.mode === 'settlement')}
      ${actBtn('build-city', 'Stad', EK.COST.city, main && afford('city') && spots.city, why('city', spots.city), App.mode === 'city')}
      ${actBtn('buy-dev', 'Ontwikkelingskaart', EK.COST.dev, main && afford('dev') && s.deck.length > 0, s.deck.length ? why('dev') : 'De stapel is op', false)}
      <button class="act" data-do="trade" ${main ? '' : 'disabled'}><span class="t">⇄ Ruilen</span><span class="c"><span>bank of tegenstanders</span></span></button>
      <button class="act end" data-do="end" ${main ? '' : 'disabled'}><span class="t">Beurt beëindigen</span></button>
    </div></div>
    <div class="card c-log"><h3>Verloop</h3><div id="log">${log}</div></div>
    <details class="card"><summary>Bouwkosten</summary><div class="costs">
      <div><b>Weg</b>${costHtml(EK.COST.road)}</div><div><b>Nederzetting</b>${costHtml(EK.COST.settlement)}</div><div><b>Stad</b>${costHtml(EK.COST.city)}</div><div><b>Ontw.kaart</b>${costHtml(EK.COST.dev)}</div>
      <div class="muted small">Ruilkoers met de bank: 4:1, met haven 3:1 of 2:1.</div></div></details>`;
  }

  function renderAll() {
    const s = App.s;
    if (!s) return;
    const st = statusHtml();
    const el = $('#status');
    el.className = st.ai ? 'ai' : '';
    el.innerHTML = st.html + (st.roll ? `<button class="primary" data-do="roll" ${App.rolling ? 'disabled' : ''}>🎲 Gooi dobbelstenen</button>` : '') + (st.cancel ? '<button class="secondary" data-do="cancel-mode">Annuleren</button>' : '');
    $('#board').innerHTML = EK.renderBoard(s, computeHl());
    $('#panel').innerHTML = panelHtml();
    const lg = $('#log');
    if (lg) lg.scrollTop = lg.scrollHeight;
  }

  // ---------- spelverloop ----------
  function tick() {
    flush();
    renderAll();
    save();
    const s = App.s;
    if (s.phase === 'over') {
      setTimeout(showEnd, 700);
      return;
    }
    if (App.busy) return;
    const who = s.phase === 'discard' ? firstPendingAI(s) : s.cur !== HUMAN ? s.cur : -1;
    if (who >= 0) {
      App.busy = true;
      const gen = App.gen;
      const delay = s.phase === 'setup' ? 380 : s.phase === 'main' ? 620 : 480;
      setTimeout(() => runAI(gen, who), delay);
      return;
    }
    if (s.phase === 'discard' && s.pending[HUMAN] && !modal) openDiscard();
  }

  async function animateDice() {
    App.rolling = true;
    for (let i = 0; i < 7; i++) {
      const d = $('#dice');
      if (d) {
        d.classList.add('rolling');
        d.innerHTML = dieSvg(1 + EK.rnd(6)) + dieSvg(1 + EK.rnd(6));
      }
      await sleep(80);
    }
    App.rolling = false;
  }

  function afterRoll(r) {
    if (r.total && r.total !== 7) {
      App.flashNum = r.total;
      const gen = App.gen;
      setTimeout(() => {
        if (gen === App.gen) {
          App.flashNum = null;
          renderAll();
        }
      }, 1700);
    }
  }

  async function runAI(gen, who) {
    if (gen !== App.gen) return;
    const s = App.s;
    try {
      const a = EK.AI.step(s, who, App.level, { tradeTargets: [HUMAN] });
      if (!a) {
        App.busy = false;
        tick();
        return;
      }
      if (a.type === 'proposeTrade') {
        const accepted = await askTradeOffer(a, who);
        if (gen !== App.gen) return;
        if (accepted) {
          const r = EK.act(s, { type: 'trade', with: HUMAN, give: a.give, get: a.get });
          if (!r.ok) logSys(r.err);
        } else logMsg(`${s.names[HUMAN]} wijst het ruilvoorstel af.`, HUMAN);
        App.busy = false;
        tick();
        return;
      }
      if (a.type === 'roll') {
        await animateDice();
        if (gen !== App.gen) return;
      }
      const r = EK.act(s, a);
      if (!r.ok) {
        console.warn('AI-actie mislukt', a, r.err);
        if (s.phase === 'main') EK.act(s, { type: 'endTurn' });
      } else if (a.type === 'roll') afterRoll(r);
    } catch (err) {
      console.error(err);
      if (s.phase === 'main') EK.act(s, { type: 'endTurn' });
    }
    App.busy = false;
    tick();
  }

  function doAct(a) {
    if (App.busy) return { ok: false };
    const r = EK.act(App.s, a);
    if (!r.ok) {
      toast(r.err);
      return r;
    }
    App.mode = null;
    if (a.type === 'roll') afterRoll(r);
    tick();
    return r;
  }

  // ---------- klikken ----------
  $('#board').addEventListener('click', (e) => {
    if (!humanTurn() || App.busy) return;
    const s = App.s;
    const sp = e.target.closest('.spot');
    if (!sp) return;
    if (sp.dataset.v !== undefined) {
      const v = Number(sp.dataset.v);
      if (s.phase === 'main' && App.mode === 'city') doAct({ type: 'buildCity', vertex: v });
      else doAct({ type: 'buildSettlement', vertex: v });
    } else if (sp.dataset.e !== undefined) doAct({ type: 'buildRoad', edge: Number(sp.dataset.e) });
    else if (sp.dataset.t !== undefined) {
      const tile = Number(sp.dataset.t);
      const vic = L.victims(s, tile, HUMAN);
      if (vic.length > 1) askVictim(tile, vic);
      else doAct({ type: 'moveRobber', tile });
    }
  });

  function askVictim(tile, vic) {
    const s = App.s;
    showModal({
      title: 'Van wie steel je?',
      render() {
        return `<p class="muted">Meerdere spelers bouwen aan deze tegel. Kies van wie je een willekeurige kaart steelt.</p><div class="chips">${vic
          .map((q) => `<button class="chip" data-m="v" data-q="${q}">${EK.pieceIcon('settlement', q, 26)}<span>${s.names[q]}</span><small>${EK.total(s, q)} kaarten · ${EK.vp(s, q, false)} p</small></button>`)
          .join('')}</div><div class="foot"><button class="secondary" data-m="cancel">Annuleren</button></div>`;
      },
      onAction(a, d) {
        if (a === 'cancel') return closeModal();
        closeModal();
        doAct({ type: 'moveRobber', tile, victim: Number(d.q) });
      },
    });
  }

  async function humanRoll() {
    if (App.busy || App.rolling) return;
    App.busy = true;
    renderAll();
    await animateDice();
    App.busy = false;
    doAct({ type: 'roll' });
  }

  $('#status').addEventListener('click', (e) => onDo(e));
  $('#panel').addEventListener('click', (e) => onDo(e));
  function onDo(e) {
    const b = e.target.closest('[data-do]');
    if (!b || b.disabled) return;
    const s = App.s;
    const d = b.dataset.do;
    if (d === 'roll') return humanRoll();
    if (App.busy) return;
    if (d === 'cancel-mode') {
      App.mode = null;
      return renderAll();
    }
    if (d.startsWith('build-')) {
      const k = d.slice(6);
      App.mode = App.mode === k ? null : k;
      return renderAll();
    }
    if (d === 'buy-dev') {
      const r = doAct({ type: 'buyDev' });
      if (r.ok) toast(`Je kaart: ${EK.DEV_NL[r.card]}${r.card === 'vp' ? ' (+1 punt, blijft verborgen)' : ''}`, true);
      return;
    }
    if (d === 'end') return doAct({ type: 'endTurn' });
    if (d === 'trade') return openTrade();
    if (d === 'play-knight') return doAct({ type: 'playKnight' });
    if (d === 'play-roadbuilding') return doAct({ type: 'playRoadBuilding' });
    if (d === 'play-invention') return openInvention();
    if (d === 'play-monopoly') return openMonopoly();
  }

  // ---------- dialogen: ontwikkelingskaarten ----------
  function pickChips(sel, max, disabledFn) {
    return `<div class="chips">${RES.map((r) => `<button class="chip ${sel.includes(r) ? 'sel' : ''}" data-m="pick" data-r="${r}" ${disabledFn && disabledFn(r) ? 'disabled' : ''}>${EK.emblem(r, 24)}<span>${EK.RES_NL[r]}</span></button>`).join('')}</div>`;
  }
  function openInvention() {
    const pick = [];
    showModal({
      title: 'Uitvinding',
      render() {
        return `<p>Kies twee grondstoffen van de bank (dezelfde twee keer mag). Gekozen: ${pick.length ? pick.map((r) => resChip(r)).join(' ') : '—'}</p>${pickChips(pick, 2)}
        <div class="foot"><button class="secondary" data-m="cancel">Annuleren</button><button class="primary" data-m="ok" ${pick.length === 2 ? '' : 'disabled'}>Pak kaarten</button></div>`;
      },
      onAction(a, d) {
        if (a === 'cancel') return closeModal();
        if (a === 'pick') {
          if (pick.length < 2) pick.push(d.r);
          else {
            pick.shift();
            pick.push(d.r);
          }
          return refreshModal();
        }
        if (a === 'ok') {
          const r = EK.act(App.s, { type: 'playInvention', a: pick[0], b: pick[1] });
          if (!r.ok) return toast(r.err);
          closeModal();
          tick();
        }
      },
    });
  }
  function openMonopoly() {
    showModal({
      title: 'Monopolie',
      render() {
        return `<p>Kies een grondstof: alle andere spelers geven je hun kaarten van dit soort.</p>${pickChips([], 1)}<div class="foot"><button class="secondary" data-m="cancel">Annuleren</button></div>`;
      },
      onAction(a, d) {
        if (a === 'cancel') return closeModal();
        if (a === 'pick') {
          const r = EK.act(App.s, { type: 'playMonopoly', res: d.r });
          if (!r.ok) return toast(r.err);
          closeModal();
          toast(`Je pakt ${r.taken}× ${EK.RES_NL[d.r]}`, true);
          tick();
        }
      },
    });
  }

  // ---------- dialoog: afgooien ----------
  function openDiscard() {
    const s = App.s;
    const need = s.pending[HUMAN];
    const c = EK.zeroRes();
    const count = () => RES.reduce((n, r) => n + c[r], 0);
    showModal({
      title: `Een 7! Gooi ${need} kaarten af`,
      render() {
        const P = s.players[HUMAN];
        return `<p class="muted">Je hebt meer dan 7 kaarten. Kies welke ${need} je afgooit (${count()}/${need}).</p><div class="stepgrid">${RES.map((r) => `<div class="step"><span class="rn">${EK.emblem(r, 26)}${EK.RES_NL[r]}</span><button data-m="dec" data-r="${r}" ${c[r] ? '' : 'disabled'}>−</button><span class="v">${c[r]}</span><button data-m="inc" data-r="${r}" ${c[r] < P.res[r] && count() < need ? '' : 'disabled'}>+</button></div>`).join('')}</div>
        <div class="foot"><button class="primary" data-m="ok" ${count() === need ? '' : 'disabled'}>Afgooien</button></div>`;
      },
      onAction(a, d) {
        if (a === 'inc') c[d.r]++;
        else if (a === 'dec') c[d.r]--;
        else if (a === 'ok') {
          const r = EK.act(s, { type: 'discard', player: HUMAN, cards: { ...c } });
          if (!r.ok) return toast(r.err);
          closeModal();
          return tick();
        }
        refreshModal();
      },
    });
  }

  // ---------- dialoog: ruilen ----------
  function openTrade() {
    const s = App.s;
    const foes = s.players.map((_, i) => i).filter((i) => i !== HUMAN);
    const st = { tab: 'bank', give: null, get: null, offer: { give: EK.zeroRes(), get: EK.zeroRes() }, resps: null };
    showModal({
      title: 'Ruilen',
      cls: 'wide',
      render() {
        const P = s.players[HUMAN];
        let body = `<div class="tabs"><button data-m="tab" data-t="bank" class="${st.tab === 'bank' ? 'sel' : ''}">Met de bank</button><button data-m="tab" data-t="player" class="${st.tab === 'player' ? 'sel' : ''}">Met tegenstanders</button></div>`;
        if (st.tab === 'bank') {
          body += `<div class="field-l">Jij geeft</div><div class="chips">${RES.map((r) => {
            const ratio = EK.ratio(s, HUMAN, r);
            return `<button class="chip ${st.give === r ? 'sel' : ''}" data-m="give" data-r="${r}" ${P.res[r] >= ratio ? '' : 'disabled'}>${EK.emblem(r, 24)}<span>${ratio}× ${EK.RES_NL[r]}</span><small>(${P.res[r]})</small></button>`;
          }).join('')}</div>
          <div class="field-l">Jij krijgt 1×</div><div class="chips">${RES.map((r) => `<button class="chip ${st.get === r ? 'sel' : ''}" data-m="get" data-r="${r}" ${r !== st.give && s.bank[r] > 0 ? '' : 'disabled'}>${EK.emblem(r, 24)}<span>${EK.RES_NL[r]}</span></button>`).join('')}</div>
          <div class="foot"><button class="secondary" data-m="close">Sluiten</button><button class="primary" data-m="bank" ${st.give && st.get ? '' : 'disabled'}>Wissel met de bank</button></div>`;
        } else {
          const o = st.offer;
          const step = (kind, r) => {
            const max = kind === 'give' ? P.res[r] : 9;
            return `<div class="step"><span class="rn">${EK.emblem(r, 24)}${EK.RES_NL[r]}</span><button data-m="dec" data-k="${kind}" data-r="${r}" ${o[kind][r] ? '' : 'disabled'}>−</button><span class="v">${o[kind][r]}</span><button data-m="inc" data-k="${kind}" data-r="${r}" ${o[kind][r] < max ? '' : 'disabled'}>+</button></div>`;
          };
          const ng = RES.reduce((n, r) => n + o.give[r], 0);
          const nw = RES.reduce((n, r) => n + o.get[r], 0);
          body += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" class="tradegrid"><div><div class="field-l">Jij geeft</div><div class="stepgrid">${RES.map((r) => step('give', r)).join('')}</div></div>
          <div><div class="field-l">Jij wilt</div><div class="stepgrid">${RES.map((r) => step('get', r)).join('')}</div></div></div>`;
          if (st.resps) {
            body += `<div class="field-l">Reacties</div>` + st.resps
              .map(({ q, resp }) => {
                const cls = resp.accept ? 'ok' : resp.counter ? '' : 'no';
                let btn = '';
                if (resp.accept) btn = `<button class="primary" data-m="deal" data-q="${q}">Ruil met ${s.names[q]}</button>`;
                else if (resp.counter) btn = `<div class="offer" style="margin:8px 0 4px"><span>Jij geeft</span>${cardsHtml(resp.counter.give)}<span>voor</span>${cardsHtml(resp.counter.get)}</div><button class="primary" data-m="counter" data-q="${q}">Accepteer tegenbod</button>`;
                return `<div class="resp ${cls}" style="margin-top:8px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${EK.pieceIcon('settlement', q, 22)}<b>${s.names[q]}:</b> <span style="flex:1">${resp.msg}</span>${resp.accept ? btn : ''}</div>${resp.counter ? btn : ''}</div>`;
              })
              .join('');
          }
          body += `<div class="foot"><button class="secondary" data-m="close">Sluiten</button><button class="primary" data-m="offer" ${ng && nw ? '' : 'disabled'}>Bied aan iedereen</button></div>`;
        }
        return body;
      },
      onAction(a, d) {
        const P = s.players[HUMAN];
        if (a === 'close') return closeModal();
        if (a === 'tab') {
          st.tab = d.t;
          st.resps = null;
        } else if (a === 'give') {
          st.give = d.r;
          if (st.get === d.r) st.get = null;
        } else if (a === 'get') st.get = d.r;
        else if (a === 'bank') {
          const r = EK.act(s, { type: 'bankTrade', give: st.give, get: st.get });
          if (!r.ok) return toast(r.err);
          flush();
          renderAll();
          save();
          if (P.res[st.give] < EK.ratio(s, HUMAN, st.give)) st.give = null;
          st.get = null;
        } else if (a === 'inc' || a === 'dec') {
          const k = d.k;
          const o = st.offer;
          if (a === 'inc') {
            o[k][d.r]++;
            o[k === 'give' ? 'get' : 'give'][d.r] = 0;
          } else o[k][d.r]--;
          st.resps = null;
        } else if (a === 'offer') {
          st.resps = foes.map((q) => ({ q, resp: EK.AI.respond(s, q, { give: st.offer.give, get: st.offer.get }, App.level, HUMAN) }));
        } else if (a === 'deal' || a === 'counter') {
          const q = Number(d.q);
          const c = a === 'deal' ? st.offer : st.resps.find((x) => x.q === q).resp.counter;
          const r = EK.act(s, { type: 'trade', with: q, give: c.give, get: c.get });
          if (!r.ok) return toast(r.err);
          closeModal();
          toast('Ruil gedaan!', true);
          return tick();
        }
        refreshModal();
      },
    });
  }

  // Een AI doet de speler een voorstel; geeft een Promise<boolean>.
  function askTradeOffer(a, who) {
    return new Promise((resolve) => {
      const s = App.s;
      const P = s.players[HUMAN];
      // kan de speler dit uberhaupt betalen?
      if (!RES.every((r) => (a.get[r] || 0) <= P.res[r])) {
        resolve(false);
        return;
      }
      showModal({
        title: `Ruilvoorstel van ${s.names[who]}`,
        render() {
          return `<p>${s.names[who]} stelt een ruil voor:</p><div class="offer"><span>Jij krijgt</span>${cardsHtml(a.give)}<span>en geeft</span>${cardsHtml(a.get)}</div>
          <div class="foot"><button class="secondary" data-m="no">Weiger</button><button class="primary" data-m="yes">Accepteer</button></div>`;
        },
        onAction(act) {
          closeModal();
          resolve(act === 'yes');
        },
      });
    });
  }

  // ---------- einde ----------
  function showEnd() {
    const s = App.s;
    if (!s || s.phase !== 'over' || modal) return;
    const won = s.winner === HUMAN;
    const order = s.players.map((_, i) => i).sort((a, b) => EK.vp(s, b, true) - EK.vp(s, a, true));
    const row = (p) => {
      const P = s.players[p];
      let st = 0;
      let ci = 0;
      for (let v = 0; v < s.vOwner.length; v++) if (s.vOwner[v] === p) s.vType[v] === 1 ? st++ : ci++;
      return `<tr><td>${EK.pieceIcon('settlement', p, 18)} ${s.names[p]}${p === s.winner ? ' 🏆' : ''}</td><td>${st}</td><td>${ci}</td><td>${s.longest.holder === p ? 2 : 0}</td><td>${s.army.holder === p ? 2 : 0}</td><td>${P.dev.vp + P.devNew.vp}</td><td><b>${EK.vp(s, p, true)}</b></td></tr>`;
    };
    showModal({
      title: won ? 'Gewonnen!' : `${s.names[s.winner]} wint`,
      render() {
        return `<div class="end-hero">${won ? '🏆' : '🌊'}</div><p style="text-align:center">${won ? 'Jij hebt het eiland veroverd.' : `${s.names[s.winner]} was je te snel af.`} Beurten: ${s.turnNo}.</p>
        <table class="sc"><tr><th></th><th>Neders.</th><th>Steden</th><th>Weg</th><th>Leger</th><th>Kaarten</th><th>Totaal</th></tr>${order.map(row).join('')}</table>
        <div class="foot"><button class="secondary" data-m="close">Bord bekijken</button><button class="primary" data-m="new">Nieuw spel</button></div>`;
      },
      onAction(a) {
        if (a === 'close') closeModal();
        else showNewGameDialog(true);
      },
    });
  }

  // ---------- start ----------
  $('#btn-new').addEventListener('click', () => showNewGameDialog(true));
  $('#btn-rules').addEventListener('click', showRules);

  try {
    const cfg = JSON.parse(safe.get(SET_KEY) || '{}');
    if (cfg.level) App.level = cfg.level;
    if (cfg.numAI) App.numAI = cfg.numAI;
    if (cfg.target) App.target = cfg.target;
    if (cfg.first) App.first = cfg.first === 'ai' ? 'random' : cfg.first;
  } catch (e) { /* standaardinstellingen */ }

  App.s = EK.newGame({ target: App.target, numPlayers: App.numAI + 1 });
  renderAll();
  showNewGameDialog(false);

  window.Eilandrijk = App; // handig bij het debuggen
})();
