// Eilandrijk — statische bordtopologie (hexagons, hoeken, randen, havens).
// Puntige hexagons met axiale coördinaten (q, r); eenheidsgrootte 1, de renderer schaalt.
(function (G) {
  'use strict';
  const EK = (G.EK = G.EK || {});

  EK.RES = ['hout', 'klei', 'wol', 'graan', 'erts'];
  EK.RES_NL = { hout: 'Hout', klei: 'Klei', wol: 'Wol', graan: 'Graan', erts: 'Erts' };
  EK.COST = {
    road: { hout: 1, klei: 1 },
    settlement: { hout: 1, klei: 1, wol: 1, graan: 1 },
    city: { graan: 2, erts: 3 },
    dev: { wol: 1, graan: 1, erts: 1 },
  };
  EK.DEV_NL = {
    knight: 'Ridder',
    roadbuilding: 'Wegenbouw',
    invention: 'Uitvinding',
    monopoly: 'Monopolie',
    vp: 'Overwinningspunt',
  };
  // Kans-punten (stippen) van een dobbelsteengetal: 6 en 8 = 5, 2 en 12 = 1.
  EK.PIPS = (n) => (n ? 6 - Math.abs(7 - n) : 0);

  function build() {
    const S3 = Math.sqrt(3);
    const tiles = [];
    for (let r = -2; r <= 2; r++) {
      for (let q = -2; q <= 2; q++) {
        if (Math.abs(q + r) <= 2) tiles.push({ q, r });
      }
    }
    const verts = [];
    const vmap = new Map();
    const edges = [];
    const emap = new Map();

    function vid(x, y) {
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
      let i = vmap.get(k);
      if (i === undefined) {
        i = verts.length;
        vmap.set(k, i);
        verts.push({ x, y, tiles: [], adj: [], edges: [] });
      }
      return i;
    }

    tiles.forEach((t, ti) => {
      t.x = S3 * (t.q + t.r / 2);
      t.y = 1.5 * t.r;
      t.verts = [];
      t.edges = [];
      for (let i = 0; i < 6; i++) {
        const a = ((60 * i - 30) * Math.PI) / 180;
        const v = vid(t.x + Math.cos(a), t.y + Math.sin(a));
        t.verts.push(v);
        verts[v].tiles.push(ti);
      }
      for (let i = 0; i < 6; i++) {
        const a = t.verts[i];
        const b = t.verts[(i + 1) % 6];
        const k = a < b ? a + '_' + b : b + '_' + a;
        let e = emap.get(k);
        if (e === undefined) {
          e = edges.length;
          emap.set(k, e);
          edges.push({ a: Math.min(a, b), b: Math.max(a, b), tiles: [] });
          verts[a].adj.push(b);
          verts[b].adj.push(a);
          verts[a].edges.push(e);
          verts[b].edges.push(e);
        }
        edges[e].tiles.push(ti);
        t.edges.push(e);
      }
    });

    // Buurtegels (delen een rand)
    const tileNbr = tiles.map(() => []);
    edges.forEach((e) => {
      if (e.tiles.length === 2) {
        tileNbr[e.tiles[0]].push(e.tiles[1]);
        tileNbr[e.tiles[1]].push(e.tiles[0]);
      }
    });

    // Havens: 9 gelijk verdeelde kustranden, gesorteerd op hoek rond het midden.
    const coast = [];
    edges.forEach((e, i) => {
      if (e.tiles.length === 1) {
        const mx = (verts[e.a].x + verts[e.b].x) / 2;
        const my = (verts[e.a].y + verts[e.b].y) / 2;
        coast.push({ edge: i, mx, my, ang: Math.atan2(my, mx) });
      }
    });
    coast.sort((p, q) => p.ang - q.ang);
    const portSlots = [];
    for (let k = 0; k < 9; k++) {
      const c = coast[Math.floor((k * coast.length) / 9)];
      const e = edges[c.edge];
      const len = Math.hypot(c.mx, c.my);
      portSlots.push({ edge: c.edge, a: e.a, b: e.b, mx: c.mx, my: c.my, nx: c.mx / len, ny: c.my / len });
    }

    return { tiles, verts, edges, tileNbr, portSlots, edgeBetween: (a, b) => emap.get(a < b ? a + '_' + b : b + '_' + a) };
  }

  EK.topo = build();
})(typeof globalThis !== 'undefined' ? globalThis : window);
