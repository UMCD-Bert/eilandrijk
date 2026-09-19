// Eilandrijk — SVG-rendering in een eigen, vlakke geometrische stijl.
(function (G) {
  'use strict';
  const EK = G.EK;
  const T = EK.topo;
  const S = 60; // tegelgrootte in pixels

  const PAL = {
    hout: { bg: '#3f7d4b', dark: '#245534', mid: '#2f6a3e' },
    klei: { bg: '#c8623f', dark: '#9c452a', mid: '#b4553a' },
    wol: { bg: '#a9d36a', dark: '#7fb04a', mid: '#ffffff' },
    graan: { bg: '#efc94c', dark: '#c99a1f', mid: '#f7dc7a' },
    erts: { bg: '#8b939c', dark: '#5d656e', mid: '#c4cad0' },
    woestijn: { bg: '#e4d3a2', dark: '#c9b57c', mid: '#efe3bd' },
  };
  EK.PAL = PAL;
  EK.PLAYER_COLORS = ['#f4f1e8', '#8a3fbd', '#3b82e8', '#f0559b'];
  EK.PLAYER_STROKE = ['#2b2b33', '#26093d', '#0c2a5c', '#5a0d2f'];

  // Kleine symbolen (viewBox 0 0 40 40), gebruikt op tegels én op kaarten.
  const EMBLEM = {
    hout: () =>
      `<path d="M20 3 L29 17 H24 L32 28 H8 L16 17 H11 Z" fill="#1c4a2b"/><path d="M20 3 L29 17 H24 L20 12 Z" fill="#2f6a3e"/><rect x="18" y="28" width="4" height="8" fill="#6b4423"/>`,
    klei: () =>
      `<g fill="#f0b092" stroke="#7d3520" stroke-width="1.4"><rect x="3" y="8" width="16" height="9"/><rect x="21" y="8" width="16" height="9"/><rect x="12" y="19" width="16" height="9"/><rect x="-4" y="19" width="12" height="9"/><rect x="32" y="19" width="12" height="9"/></g>`,
    wol: () =>
      `<g><circle cx="14" cy="21" r="6.5" fill="#fff"/><circle cx="21" cy="17" r="7.5" fill="#fff"/><circle cx="27" cy="21" r="6.5" fill="#fff"/><circle cx="20" cy="25" r="7" fill="#fff"/><circle cx="31" cy="15" r="4.2" fill="#2f3a2a"/><rect x="14" y="30" width="2.6" height="6" fill="#2f3a2a"/><rect x="24" y="30" width="2.6" height="6" fill="#2f3a2a"/></g>`,
    graan: () =>
      `<g stroke="#8a6410" stroke-width="2" fill="#8a6410"><path d="M20 36 V10" fill="none"/><ellipse cx="15.5" cy="14" rx="3" ry="5.4" transform="rotate(-25 15.5 14)"/><ellipse cx="24.5" cy="14" rx="3" ry="5.4" transform="rotate(25 24.5 14)"/><ellipse cx="15.5" cy="23" rx="3" ry="5.4" transform="rotate(-25 15.5 23)"/><ellipse cx="24.5" cy="23" rx="3" ry="5.4" transform="rotate(25 24.5 23)"/><ellipse cx="20" cy="8" rx="2.6" ry="5"/></g>`,
    erts: () =>
      `<path d="M2 34 L15 10 L22 22 L28 14 L38 34 Z" fill="#454c55"/><path d="M15 10 L19.5 18.5 L15 16.5 L10.5 18.5 Z" fill="#f2f4f6"/><path d="M28 14 L31.5 20 L28 18.6 L24.7 20 Z" fill="#f2f4f6"/>`,
    woestijn: () =>
      `<path d="M2 30 Q10 18 18 30 T34 30 T40 26" fill="none" stroke="#a48f55" stroke-width="3" stroke-linecap="round"/><path d="M4 20 Q12 10 20 20 T36 20" fill="none" stroke="#a48f55" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`,
  };
  EK.emblem = (res, size, extra) =>
    `<svg viewBox="0 0 40 40" width="${size || 28}" height="${size || 28}" ${extra || ''} aria-hidden="true">${EMBLEM[res]()}</svg>`;

  const hexPts = (r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i - 30) * Math.PI) / 180;
      pts.push((Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1));
    }
    return pts.join(' ');
  };

  function tileArt(res) {
    const c = PAL[res];
    let bg = `<polygon points="${hexPts(S)}" fill="${c.bg}"/>`;
    // subtiele textuur per type
    if (res === 'graan') {
      for (let i = -5; i <= 5; i++) bg += `<line x1="${i * 14 - 40}" y1="70" x2="${i * 14 + 40}" y2="-70" stroke="${c.mid}" stroke-width="5" opacity=".55"/>`;
    } else if (res === 'klei') {
      for (let i = -4; i <= 4; i++) bg += `<line x1="-70" y1="${i * 15}" x2="70" y2="${i * 15}" stroke="${c.dark}" stroke-width="2" opacity=".5"/>`;
    } else if (res === 'wol') {
      bg += `<circle cx="-40" cy="30" r="26" fill="${c.dark}" opacity=".35"/><circle cx="42" cy="-34" r="22" fill="${c.dark}" opacity=".3"/>`;
    } else if (res === 'hout') {
      bg += `<circle cx="42" cy="34" r="26" fill="${c.dark}" opacity=".35"/><circle cx="-44" cy="-30" r="22" fill="${c.dark}" opacity=".3"/>`;
    } else if (res === 'erts') {
      bg += `<polygon points="-70,50 -20,-10 20,50" fill="${c.dark}" opacity=".35"/><polygon points="10,60 50,-14 90,60" fill="${c.dark}" opacity=".3"/>`;
    } else {
      bg += `<circle cx="-30" cy="38" r="34" fill="${c.dark}" opacity=".3"/>`;
    }
    const sp = [
      [-31, -27, 0.72],
      [31, -27, 0.72],
      [-31, 27, 0.72],
      [31, 27, 0.72],
    ];
    const marks =
      res === 'woestijn'
        ? `<g transform="translate(-20,-20) scale(1)" opacity=".9">${EMBLEM.woestijn()}</g>`
        : sp.map(([x, y, k]) => `<g transform="translate(${x - 20 * k},${y - 20 * k}) scale(${k})">${EMBLEM[res]()}</g>`).join('');
    return `<g clip-path="url(#hexclip)">${bg}${marks}</g>`;
  }

  const ART = {};
  for (const r in PAL) ART[r] = tileArt(r);

  function tokenSvg(num, x, y) {
    const hot = num === 6 || num === 8;
    const pips = EK.PIPS(num);
    let dots = '';
    for (let i = 0; i < pips; i++) dots += `<circle cx="${((i - (pips - 1) / 2) * 5).toFixed(1)}" cy="10" r="1.7" fill="${hot ? '#c0392b' : '#4a4030'}"/>`;
    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="19" fill="#f5ecd2" stroke="#3b3324" stroke-width="1.6"/><text y="4" text-anchor="middle" font-size="${num >= 10 ? 17 : 19}" font-weight="700" fill="${hot ? '#c0392b' : '#2d2618'}" font-family="ui-rounded,system-ui,sans-serif">${num}</text>${dots}</g>`;
  }

  function houseSvg(p) {
    return `<path d="M-9 8 V-2 L0 -11 L9 -2 V8 Z" fill="${EK.PLAYER_COLORS[p]}" stroke="${EK.PLAYER_STROKE[p]}" stroke-width="2.2" stroke-linejoin="round"/>`;
  }
  function citySvg(p) {
    return `<path d="M-14 9 V-2 H-4 V-10 L2 -16 L8 -10 V-2 H14 V9 Z" fill="${EK.PLAYER_COLORS[p]}" stroke="${EK.PLAYER_STROKE[p]}" stroke-width="2.2" stroke-linejoin="round"/><rect x="-1" y="0" width="5" height="9" fill="${EK.PLAYER_STROKE[p]}" opacity=".35"/>`;
  }
  EK.pieceIcon = (kind, p, size) => {
    const inner = kind === 'city' ? citySvg(p) : kind === 'settlement' ? houseSvg(p) : `<line x1="-12" y1="6" x2="12" y2="-6" stroke="${EK.PLAYER_STROKE[p]}" stroke-width="9" stroke-linecap="round"/><line x1="-12" y1="6" x2="12" y2="-6" stroke="${EK.PLAYER_COLORS[p]}" stroke-width="5" stroke-linecap="round"/>`;
    return `<svg viewBox="-18 -18 36 36" width="${size || 20}" height="${size || 20}" aria-hidden="true">${inner}</svg>`;
  };

  const vx = (v) => T.verts[v].x * S;
  const vy = (v) => T.verts[v].y * S;

  // Tekent het hele bord. `hl` = { vertices:[], edges:[], tiles:[], flashNum }.
  EK.renderBoard = function (s, hl) {
    hl = hl || {};
    let h = `<svg viewBox="-330 -305 660 610" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Speelbord">`;
    h += `<defs><clipPath id="hexclip"><polygon points="${hexPts(S)}"/></clipPath></defs>`;
    h += `<rect x="-330" y="-305" width="660" height="610" rx="28" fill="#1d4f6e"/>`;
    h += `<polygon points="${hexPts(S * 3.55)}" fill="#25698f" transform="rotate(0)"/>`;
    h += `<polygon points="${hexPts(S * 3.05)}" fill="#2f7ba5"/>`;

    // tegels
    T.tiles.forEach((t, i) => {
      const tl = s.tiles[i];
      const x = t.x * S;
      const y = t.y * S;
      const flash = hl.flashNum && tl.num === hl.flashNum && i !== s.robber;
      h += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">${ART[tl.res]}<polygon points="${hexPts(S)}" fill="none" stroke="#173f58" stroke-width="2.5"/>${
        flash ? `<polygon class="flash" points="${hexPts(S - 3)}" fill="#fff" stroke="#fff" stroke-width="3"/>` : ''
      }</g>`;
    });

    // havens
    T.portSlots.forEach((p, i) => {
      const type = s.portTypes[i];
      const ax = vx(p.a);
      const ay = vy(p.a);
      const bx = vx(p.b);
      const by = vy(p.b);
      const mx = p.mx * S + p.nx * 40;
      const my = p.my * S + p.ny * 40;
      h += `<g class="port"><line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#e9dcb4" stroke-width="3" stroke-linecap="round"/><line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#e9dcb4" stroke-width="3" stroke-linecap="round"/>`;
      if (type === 'any') {
        h += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="16" fill="#f5ecd2" stroke="#3b3324" stroke-width="2"/><text x="${mx.toFixed(1)}" y="${(my + 4.5).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#2d2618" font-family="ui-rounded,system-ui,sans-serif">3:1</text>`;
      } else {
        h += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="17" fill="${PAL[type].bg}" stroke="#3b3324" stroke-width="2"/><g transform="translate(${(mx - 8.5).toFixed(1)},${(my - 15).toFixed(1)}) scale(.42)">${EMBLEM[type]()}</g><text x="${mx.toFixed(1)}" y="${(my + 12).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff" stroke="#2d2618" stroke-width=".6" paint-order="stroke" font-family="ui-rounded,system-ui,sans-serif">2:1</text>`;
      }
      h += `</g>`;
    });

    // getalfiches
    T.tiles.forEach((t, i) => {
      const tl = s.tiles[i];
      if (tl.num) h += tokenSvg(tl.num, t.x * S, t.y * S);
    });

    // rover
    {
      const t = T.tiles[s.robber];
      const x = t.x * S;
      const y = t.y * S;
      const blocked = s.tiles[s.robber].num ? `<polygon points="${hexPts(S - 1.5)}" fill="#000" opacity=".28" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"/>` : '';
      h += blocked;
      h += `<g class="robber" transform="translate(${(x + 21).toFixed(1)},${(y + 14).toFixed(1)})"><ellipse cx="0" cy="17" rx="12" ry="4" fill="#000" opacity=".3"/><path d="M-9 16 Q-9 3 -4 -1 A6.5 6.5 0 1 1 4 -1 Q9 3 9 16 Z" fill="#23262b" stroke="#0d0e10" stroke-width="1.6"/><circle cx="0" cy="-8" r="0" fill="#fff"/></g>`;
    }

    // wegen
    for (let e = 0; e < T.edges.length; e++) {
      const o = s.eOwner[e];
      if (o === -1) continue;
      const ed = T.edges[e];
      const x1 = vx(ed.a);
      const y1 = vy(ed.a);
      const x2 = vx(ed.b);
      const y2 = vy(ed.b);
      // iets inkorten zodat de weg niet over de hoeken schiet
      const dx = x2 - x1;
      const dy = y2 - y1;
      const k = 0.16;
      const ax = x1 + dx * k;
      const ay = y1 + dy * k;
      const bx = x2 - dx * k;
      const by = y2 - dy * k;
      h += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${EK.PLAYER_STROKE[o]}" stroke-width="10.5" stroke-linecap="round"/><line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${EK.PLAYER_COLORS[o]}" stroke-width="6" stroke-linecap="round"/>`;
    }
    // gebouwen
    for (let v = 0; v < T.verts.length; v++) {
      const o = s.vOwner[v];
      if (o === -1) continue;
      h += `<g transform="translate(${vx(v).toFixed(1)},${vy(v).toFixed(1)})" class="bld">${s.vType[v] === 2 ? citySvg(o) : houseSvg(o)}</g>`;
    }

    // markeringen (klikbaar)
    for (const e of hl.edges || []) {
      const ed = T.edges[e];
      const x1 = vx(ed.a);
      const y1 = vy(ed.a);
      const x2 = vx(ed.b);
      const y2 = vy(ed.b);
      h += `<g class="spot" data-e="${e}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="spot-line" stroke-width="9" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="26" stroke-linecap="round"/></g>`;
    }
    for (const v of hl.vertices || []) {
      h += `<g class="spot" data-v="${v}"><circle cx="${vx(v).toFixed(1)}" cy="${vy(v).toFixed(1)}" r="11" class="spot-dot"/><circle cx="${vx(v).toFixed(1)}" cy="${vy(v).toFixed(1)}" r="20" fill="transparent"/></g>`;
    }
    for (const ti of hl.tiles || []) {
      const t = T.tiles[ti];
      h += `<g class="spot tilespot" data-t="${ti}" transform="translate(${(t.x * S).toFixed(1)},${(t.y * S).toFixed(1)})"><polygon points="${hexPts(S - 4)}" class="spot-tile"/></g>`;
    }
    h += `</svg>`;
    return h;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
