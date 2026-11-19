// cosmetics.js - Don't Wake Gerald
// Purely cosmetic goblin dress-up: hats made of scavenged household junk,
// body colours/patterns, eyes and emotes. No gameplay effect.
//
// Conventions (match the game's goblin body):
//   body origin at feet, Y up, facing +Z, bean radius ~0.45, height 1.3.
//   buildHat(id)  -> Group whose origin is the top-centre of the head (attached at 0,1.25,0).
//   buildEyes(id) -> Group placed at the eye anchor (0,0.92,0.38), facing +Z.

import * as THREE from '../vendor/three.min.js';

const TAU = Math.PI * 2;
const PI = Math.PI;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const HATS = [
  { id: 'none',              name: 'No Hat',               price: 0,    level: 1,  desc: 'Bold. Aerodynamic. A little chilly.' },
  { id: 'thimble',           name: 'Thimble Helm',         price: 0,    level: 1,  desc: 'Stops needles. Does not stop Gerald.' },
  { id: 'bottle_cap',        name: 'Bottle Cap',           price: 0,    level: 1,  desc: 'Crimped for freshness. Still a little fizzy.' },
  { id: 'acorn_cup',         name: 'Acorn Cup',            price: 0,    level: 1,  desc: 'A squirrel wants this back. Do not make eye contact.' },
  { id: 'coat_button',       name: 'Coat Button Beret',    price: 0,    level: 1,  desc: 'Four holes for ventilation. Very French.' },
  { id: 'teabag',            name: 'Teabag',               price: 0,    level: 1,  desc: 'Earl Grey, with a tag for dramatic flicking.' },
  { id: 'jellybean',         name: 'Jellybean',            price: 100,  level: 1,  desc: 'Cherry flavour. Do not lick your own hat.' },
  { id: 'popcorn',           name: 'Popcorn Kernel',       price: 120,  level: 2,  desc: 'Fluffy, buttery, fresh from the sofa cushions.' },
  { id: 'pencil_eraser',     name: 'Pencil Stub',          price: 150,  level: 2,  desc: 'Sharpened down to a nub by a very busy doodler.' },
  { id: 'qtip_mohawk',       name: 'Cotton Swab Mohawk',   price: 200,  level: 3,  desc: 'Brand new, straight from the box. Fluffy and punk.' },
  { id: 'paperclip_antenna', name: 'Paperclip Antenna',    price: 250,  level: 3,  desc: 'Picks up Gerald\'s dreams on AM radio.' },
  { id: 'floss_bandana',     name: 'Mint Floss Bandana',   price: 300,  level: 4,  desc: 'Unused, minty fresh, wrapped exactly eleven times.' },
  { id: 'sock_hood',         name: 'Lost Sock Hood',       price: 350,  level: 4,  desc: 'Where the dryer sends them. A very cosy nightcap.' },
  { id: 'pom_pom',           name: 'Pom-Pom',              price: 400,  level: 5,  desc: 'Fell off a winter hat. Now it is the whole hat.' },
  { id: 'pill_cap',          name: 'Childproof Cap',       price: 450,  level: 5,  desc: 'Push down and turn. Goblins have not figured it out.' },
  { id: 'bread_tag',         name: 'Bread Tag Tiara',      price: 500,  level: 6,  desc: 'Best before: forever. Royalty of the bread bin.' },
  { id: 'lint_beanie',       name: 'Lint Beanie',          price: 550,  level: 6,  desc: 'A thousand dryer cycles of fluff, lovingly felted.' },
  { id: 'eggshell',          name: 'Hatchling Helmet',     price: 600,  level: 7,  desc: 'Somebody already hatched. You are next.' },
  { id: 'thread_spool',      name: 'Cotton Reel Top Hat',  price: 650,  level: 7,  desc: 'Comes with a needle for that dashing feather look.' },
  { id: 'match_quiff',       name: 'Matchstick Quiff',     price: 700,  level: 8,  desc: 'A hairdo with a lot of spark.' },
  { id: 'birthday_candle',   name: 'Birthday Candle',      price: 750,  level: 8,  desc: 'Make a wish. The wish is that Gerald stays asleep.' },
  { id: 'lucky_die',         name: 'Lucky Die',            price: 800,  level: 9,  desc: 'Always rolls a 1. That is lucky for goblins.' },
  { id: 'earbud',            name: 'Lost Earbud',          price: 850,  level: 9,  desc: 'Still playing a tiny song only you can hear.' },
  { id: 'teacup',            name: 'Doll\'s Teacup',        price: 900,  level: 10, desc: 'Pinky out. Saucer brim for extra posh.' },
  { id: 'sponge_cap',        name: 'Sponge Mortarboard',   price: 1000, level: 11, desc: 'Graduated from the School of Hard Scrubs.' },
  { id: 'toy_brick',         name: 'Foot Destroyer',       price: 1100, level: 12, desc: 'The little plastic brick. Gerald stepped on it once. Once.' },
  { id: 'fairy_bulb',        name: 'Fairy-Light Bulb',     price: 1250, level: 13, desc: 'Glows. It is not plugged in. Nobody asks.' },
  { id: 'rubber_duck',       name: 'Bath Duck',            price: 1400, level: 14, desc: 'Squeak once for yes, twice for "run".' },
  { id: 'toothbrush_plume',  name: 'Toothbrush Plume',     price: 1500, level: 15, desc: 'A noble centurion crest, topped with a minty swirl.' },
  { id: 'lampshade',         name: 'Party Lampshade',      price: 1650, level: 16, desc: 'You have been at this party since 2009.' },
  { id: 'sprinkle_donut',    name: 'Sprinkle Donut Crown', price: 1800, level: 17, desc: 'A crown for the ruler of the snack drawer.' },
  { id: 'pocket_watch',      name: 'Pocket Watch',         price: 2000, level: 18, desc: 'Always ten past nap time. Tick, tock, shhh.' },
  { id: 'rubber_glove',      name: 'Rubber Glove Crest',   price: 2200, level: 19, desc: 'Inflated by hand. Waves hello to everyone behind you.' },
  { id: 'twist_propeller',   name: 'Spoon Propeller',      price: 2400, level: 20, desc: 'Two spoons and a twist-tie. Achieves zero lift.' },
  { id: 'banana_peel',       name: 'Banana Peel',          price: 2600, level: 21, desc: 'A classic slapstick hazard, worn with dignity.' },
  { id: 'snail_shell',       name: 'Snail\'s Spare Shell',  price: 2800, level: 22, desc: 'Borrowed from a snail who moved somewhere roomier.' },
  { id: 'crazy_straw',       name: 'Crazy Straw',          price: 3200, level: 24, desc: 'Loop-de-loop-de-loop. Lemonade not included.' },
  { id: 'snow_globe',        name: 'Snow Globe',           price: 3800, level: 26, desc: 'A tiny winter. Shake your head for weather.' },
  { id: 'golden_thimble',    name: 'Golden Thimble',       price: 4500, level: 28, desc: 'Same as the thimble, but you paid 4,500 coins.' },
  { id: 'gerald_head',       name: 'Tiny Gerald',          price: 5000, level: 30, desc: 'A little sleeping Gerald. Shhh. He is so peaceful.' },
];

export const COLORS = [
  // 8 free, vivid, easy to tell apart
  { id: 'ketchup',       name: 'Ketchup',        hex: 0xff3b30, pattern: 'solid',    hex2: 0xff3b30, price: 0,    level: 1 },
  { id: 'cheese_puff',   name: 'Cheese Puff',    hex: 0xff8c00, pattern: 'solid',    hex2: 0xff8c00, price: 0,    level: 1 },
  { id: 'mustard',       name: 'Mustard',        hex: 0xffd60a, pattern: 'solid',    hex2: 0xffd60a, price: 0,    level: 1 },
  { id: 'goblin_green',  name: 'Goblin Green',   hex: 0x2ecc40, pattern: 'solid',    hex2: 0x2ecc40, price: 0,    level: 1 },
  { id: 'mouthwash',     name: 'Mouthwash',      hex: 0x00d1e8, pattern: 'solid',    hex2: 0x00d1e8, price: 0,    level: 1 },
  { id: 'blue_raspberry',name: 'Blue Raspberry', hex: 0x2f6bff, pattern: 'solid',    hex2: 0x2f6bff, price: 0,    level: 1 },
  { id: 'grape_soda',    name: 'Grape Soda',     hex: 0x9b4dff, pattern: 'solid',    hex2: 0x9b4dff, price: 0,    level: 1 },
  { id: 'bubblegum',     name: 'Bubblegum',      hex: 0xff4fb3, pattern: 'solid',    hex2: 0xff4fb3, price: 0,    level: 1 },
  // paid solids
  { id: 'lime_fizz',     name: 'Lime Fizz',      hex: 0xb4f000, pattern: 'solid',    hex2: 0xb4f000, price: 150,  level: 2 },
  { id: 'teal_kettle',   name: 'Teal Kettle',      hex: 0x0f9d8a, pattern: 'solid',    hex2: 0x0f9d8a, price: 200,  level: 3 },
  { id: 'toasty',        name: 'Toasty',    hex: 0x9a5b2e, pattern: 'solid',    hex2: 0x9a5b2e, price: 250,  level: 4 },
  { id: 'fridge_white',  name: 'Fridge White',   hex: 0xf4f1e8, pattern: 'solid',    hex2: 0xf4f1e8, price: 300,  level: 5 },
  { id: 'dust_bunny',    name: 'Dust Bunny',     hex: 0x9aa1ad, pattern: 'solid',    hex2: 0x9aa1ad, price: 300,  level: 5 },
  { id: 'under_the_bed', name: 'Under-the-Bed',  hex: 0x2a2a33, pattern: 'solid',    hex2: 0x2a2a33, price: 400,  level: 6 },
  { id: 'lavender_soap', name: 'Lavender Soap',  hex: 0xc7a4ff, pattern: 'solid',    hex2: 0xc7a4ff, price: 450,  level: 7 },
  { id: 'gold_foil',     name: 'Gold Foil',      hex: 0xe8b923, pattern: 'solid',    hex2: 0xe8b923, price: 1200, level: 14 },
  // patterns
  { id: 'toothpaste',    name: 'Toothpaste',     hex: 0xe63946, pattern: 'stripes',  hex2: 0xffffff, price: 600,  level: 8 },
  { id: 'odd_sock',      name: 'Odd Sock',       hex: 0x22b14c, pattern: 'stripes',  hex2: 0xff7a1a, price: 650,  level: 9 },
  { id: 'bumblebee',     name: 'Bumblebee',      hex: 0xffc61a, pattern: 'stripes',  hex2: 0x1d1d1d, price: 700,  level: 9 },
  { id: 'strawberry_milk', name: 'Strawberry Milk',     hex: 0xffb3c7, pattern: 'spots',    hex2: 0xe0304e, price: 750,  level: 10 },
  { id: 'ladybug',       name: 'Ladybug',        hex: 0xe8202a, pattern: 'spots',    hex2: 0x161616, price: 800,  level: 10 },
  { id: 'lemon_lime',    name: 'Lemon Lime',  hex: 0xffd34d, pattern: 'spots',    hex2: 0x5fae3b, price: 900,  level: 11 },
  { id: 'sunset_soda',   name: 'Sunset Soda',    hex: 0xff6a00, pattern: 'gradient', hex2: 0xff2fa0, price: 1000, level: 12 },
  { id: 'slushie',       name: 'Slushie',   hex: 0x39ff14, pattern: 'gradient', hex2: 0x00b3ff, price: 1100, level: 13 },
  { id: 'picnic_blanket',name: 'Picnic Blanket', hex: 0xe63946, pattern: 'checker',  hex2: 0xffffff, price: 1300, level: 16 },
  { id: 'bathroom_tile', name: 'Bathroom Tile',  hex: 0x1e88e5, pattern: 'checker',  hex2: 0xffffff, price: 1400, level: 18 },
  { id: 'geralds_pjs',   name: 'Gerald\'s PJs',   hex: 0x7fa8ff, pattern: 'pajama',   hex2: 0xffffff, price: 2000, level: 20 },
  { id: 'bedtime',       name: 'Bedtime',        hex: 0x23306b, pattern: 'pajama',   hex2: 0xffd84d, price: 2500, level: 25 },
];

export const EYES = [
  { id: 'normal',  name: 'Normal',        price: 0,    level: 1 },
  { id: 'sleepy',  name: 'Sleepy',        price: 150,  level: 2 },
  { id: 'tiny',    name: 'Beady',         price: 200,  level: 3 },
  { id: 'angry',   name: 'Grumpy',        price: 300,  level: 4 },
  { id: 'googly',  name: 'Googly',        price: 450,  level: 6 },
  { id: 'x_x',     name: 'x_x',           price: 600,  level: 8 },
  { id: 'hearts',  name: 'Smitten',       price: 800,  level: 10 },
  { id: 'cyclops', name: 'Cyclops',       price: 1000, level: 12 },
  { id: 'spiral',  name: 'Hypnotised',    price: 1300, level: 15 },
  { id: 'shades',  name: 'Cool Shades',   price: 1800, level: 18 },
  { id: 'monocle', name: 'Monocle',       price: 2500, level: 22 },
];

export const EMOTES = [
  { id: 'wave',  name: 'Wave',          emoji: '\u{1F44B}', anim: 'wave',  price: 0,    level: 1 },
  { id: 'dance', name: 'Wiggle',        emoji: '\u{1F483}', anim: 'dance', price: 0,    level: 1 },
  { id: 'laugh', name: 'Giggle',        emoji: '\u{1F602}', anim: 'laugh', price: 0,    level: 1 },
  { id: 'point', name: 'J\'accuse!',     emoji: '\u{1F449}', anim: 'point', price: 0,    level: 1 },
  { id: 'flex',  name: 'Bean Flex',     emoji: '\u{1F4AA}', anim: 'flex',  price: 200,  level: 3 },
  { id: 'spin',  name: 'Spin Cycle',    emoji: '\u{1F300}', anim: 'spin',  price: 300,  level: 5 },
  { id: 'shrug', name: 'Dunno',         emoji: '\u{1F937}', anim: 'shrug', price: 400,  level: 6 },
  { id: 'jump',  name: 'Boing',         emoji: '\u{1F938}', anim: 'jump',  price: 500,  level: 8 },
  { id: 'cry',   name: 'Big Sob',      emoji: '\u{1F62D}', anim: 'cry',   price: 600,  level: 10 },
  { id: 'sleep', name: 'Fake Nap',      emoji: '\u{1F634}', anim: 'sleep', price: 800,  level: 12 },
  { id: 'bow',   name: 'Fancy Bow',        emoji: '\u{1F647}', anim: 'bow',   price: 1000, level: 14 },
  { id: 'taunt', name: 'Nyah Nyah',     emoji: '\u{1F61C}', anim: 'taunt', price: 1500, level: 18 },
];

// ---------------------------------------------------------------------------
// Caches & helpers (module level, shared by every goblin)
// ---------------------------------------------------------------------------

const _mats = new Map();
const _geos = new Map();
const _tex = new Map();

// Cached MeshStandardMaterial. o: r=roughness m=metalness e=emissive ei=emissiveIntensity
// op=opacity flat=flatShading ds=double-sided tex=texture name (see TEX)
function M(color, o = {}) {
  const key = color + '|' + (o.r ?? '') + '|' + (o.m ?? '') + '|' + (o.e ?? '') + '|' + (o.ei ?? '') + '|' +
    (o.op ?? '') + '|' + (o.flat ? 1 : 0) + '|' + (o.ds ? 1 : 0) + '|' + (o.tex ?? '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.r ?? 0.6,
      metalness: o.m ?? 0,
      emissive: o.e ?? 0x000000,
      emissiveIntensity: o.ei ?? 1,
      flatShading: !!o.flat,
      side: o.ds ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (o.op !== undefined) { m.transparent = true; m.opacity = o.op; m.depthWrite = o.op > 0.8; }
    if (o.tex) m.map = TEX(o.tex);
    _mats.set(key, m);
  }
  return m;
}

function G(key, make) {
  let g = _geos.get(key);
  if (!g) { g = make(); _geos.set(key, g); }
  return g;
}

const cyl = (rt, rb, h, s = 16, open = false, ts = 0, tl = TAU) =>
  G(`cyl${rt},${rb},${h},${s},${open},${ts},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl));
const sph = (r, ws = 16, hs = 12, ps = 0, pl = TAU, ts = 0, tl = PI) =>
  G(`sph${r},${ws},${hs},${ps},${pl},${ts},${tl}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
const tor = (R, t, rs = 8, ts = 24, arc = TAU) =>
  G(`tor${R},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, t, rs, ts, arc));
const box = (w, h, d) => G(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cone = (r, h, s = 12) => G(`cone${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const capsule = (r, len, cs = 4, rs = 10) => G(`cap${r},${len},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs));
const ico = (r, d = 1) => G(`ico${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const lathe = (key, pts, segs = 24) =>
  G('lathe' + key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), segs));

// Add a mesh: P(parent, geo, mat, [x,y,z], [rx,ry,rz], scale|[sx,sy,sz])
function P(parent, geo, mat, p, r, s) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s !== undefined && s !== null) {
    if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  }
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Add an empty transform group
function S(parent, p, r, s) {
  const g = new THREE.Group();
  if (p) g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  if (s !== undefined && s !== null) {
    if (typeof s === 'number') g.scale.setScalar(s); else g.scale.set(s[0], s[1], s[2]);
  }
  parent.add(g);
  return g;
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// deterministic little pseudo-random generator
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Lumpy displacement along the direction from the geometry origin.
function lumpy(geo, amt, seed = 1, freq = 9) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.31 + seed * 2.1) * Math.sin(v.z * freq * 0.87 + seed * 0.7) +
      0.5 * Math.sin(v.x * freq * 2.3 - seed) * Math.sin(v.z * freq * 2.1 + seed * 1.7);
    const len = v.length() || 1;
    v.multiplyScalar(1 + (n * amt) / len);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Box with rounded edges & smooth normals
function roundedBox(w, h, d, r, s = 3) {
  return G(`rbox${w},${h},${d},${r},${s}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, s * 2, s * 2, s * 2);
    const p = g.attributes.position, n = g.attributes.normal;
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
      v.sub(c);
      if (v.lengthSq() > 1e-10) {
        v.normalize();
        n.setXYZ(i, v.x, v.y, v.z);
        v.multiplyScalar(r);
      }
      v.add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  });
}

// Tube with a radius that varies along its length: rFn(t) -> radius, t in 0..1
function taperTube(key, curve, segs, radial, rFn) {
  return G('ttube' + key, () => {
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const p = g.attributes.position, n = g.attributes.normal;
    const pt = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      curve.getPointAt(i / segs, pt);
      const r = rFn(i / segs);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        p.setXYZ(k, pt.x + n.getX(k) * r, pt.y + n.getY(k) * r, pt.z + n.getZ(k) * r);
      }
    }
    return g;
  });
}

const tube = (key, curve, segs, r, radial = 6) =>
  G('tube' + key, () => new THREE.TubeGeometry(curve, segs, r, radial, false));

const curveOf = (pts) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));

// Parametric sheet: fn(u, v, target:Vector3) sets the point. Use with a double-sided material.
function sheet(key, us, vs, fn) {
  return G('sheet' + key, () => {
    const pos = [], uv = [], idx = [];
    const v = new THREE.Vector3();
    for (let j = 0; j <= vs; j++) {
      for (let i = 0; i <= us; i++) {
        fn(i / us, j / vs, v);
        pos.push(v.x, v.y, v.z);
        uv.push(i / us, j / vs);
      }
    }
    for (let j = 0; j < vs; j++) {
      for (let i = 0; i < us; i++) {
        const a = j * (us + 1) + i, b = a + 1, c = a + us + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

// Arc points (2D) helper: returns [[x,y],...] from angle a0 to a1
function arcPts(cx, cy, r, a0, a1, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

const hexStr = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function canvasTex(key, w, h, draw) {
  let t = _tex.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    _tex.set(key, t);
  }
  return t;
}

// draw a dot that wraps around the horizontal seam
function wrapDot(ctx, W, x, y, rx, ry) {
  for (const dx of [-W, 0, W]) {
    if (x + dx + rx < 0 || x + dx - rx > W) continue;
    ctx.beginPath();
    ctx.ellipse(x + dx, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }
}

// Named hat/eye textures (white-ish so the material colour can tint them)
const TEX_DRAW = {
  dimples(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const cols = 16, rows = 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + (r % 2) * 0.5) * (W / cols);
        const y = H * 0.18 + r * (H * 0.62 / rows);
        const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 9);
        g.addColorStop(0, '#6d6d6d'); g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        wrapDot(ctx, W, x, y, 8, 7);
      }
    }
  },
  pillTop(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.42, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#d23b3b';
    ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PUSH DOWN', W / 2, H / 2 - 26);
    ctx.fillText('& TURN', W / 2, H / 2 + 14);
    ctx.strokeStyle = '#d23b3b'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W * 0.33, PI * 0.15, PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.2, H * 0.72); ctx.lineTo(W * 0.2, H * 0.6); ctx.lineTo(W * 0.31, H * 0.67); ctx.fill();
  },
  sockStripes(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8343c';
    const n = 7;
    for (let i = 0; i < n; i++) ctx.fillRect(i * W / n, 0, W / n / 2, H);
  },
  sockRows(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8343c';
    const n = 5;
    for (let i = 0; i < n; i++) ctx.fillRect(0, i * H / n, W, H / n / 2);
  },
  candle(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff5fa2';
    const n = 4, sw = W / n;
    for (let i = -n; i < n * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * sw, H); ctx.lineTo(i * sw + sw / 2, H); ctx.lineTo(i * sw + sw / 2 + W, 0); ctx.lineTo(i * sw + W, 0);
      ctx.closePath(); ctx.fill();
    }
  },
  sponge(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const rnd = rng(7);
    ctx.fillStyle = '#c9b25a';
    for (let i = 0; i < 160; i++) wrapDot(ctx, W, rnd() * W, rnd() * H, 2 + rnd() * 4, 2 + rnd() * 3);
  },
  banana(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const rnd = rng(3);
    ctx.fillStyle = '#6b4a1d';
    for (let i = 0; i < 70; i++) wrapDot(ctx, W, rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(80,60,20,0.9)'); g.addColorStop(0.12, 'rgba(120,160,40,0.0)');
    g.addColorStop(0.9, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,10,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
  shell(ctx, W, H) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const n = 18;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#8a5a35' : '#c79a6b';
      ctx.fillRect(i * W / n, 0, W / n * (0.4 + (i % 3) * 0.2), H);
    }
  },
};

function TEX(name) {
  return canvasTex('hat_' + name, 256, 256, TEX_DRAW[name]);
}

// ---------------------------------------------------------------------------
// Body colours
// ---------------------------------------------------------------------------

const _colorById = new Map(COLORS.map(c => [c.id, c]));
const _bodyMats = new Map();

function colorDef(id) { return _colorById.get(id) || COLORS[0]; }

export function colorHex(colorId) {
  return colorDef(colorId).hex;
}

function bodyPatternTexture(c) {
  // 512x256: the bean's circumference is ~1.75x its profile length, so pixels stay roughly square.
  // canvas top = top of the head (v=1), x=0 / x=W = front seam (+Z, under the face).
  return canvasTex('body_' + c.id, 512, 256, (ctx, W, H) => {
    const a = hexStr(c.hex), b = hexStr(c.hex2);
    ctx.fillStyle = a; ctx.fillRect(0, 0, W, H);
    if (c.pattern === 'stripes') {
      const n = 9;
      ctx.fillStyle = b;
      for (let i = 0; i < n; i++) ctx.fillRect(0, (i + 0.25) * H / n, W, H / n / 2);
    } else if (c.pattern === 'spots') {
      const rnd = rng(c.id.length * 131 + c.hex);
      ctx.fillStyle = b;
      for (let i = 0; i < 26; i++) {
        const r = 10 + rnd() * 14;
        wrapDot(ctx, W, rnd() * W, H * 0.12 + rnd() * H * 0.76, r, r * 0.9);
      }
    } else if (c.pattern === 'gradient') {
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (c.pattern === 'checker') {
      const cols = 16, rows = 8;
      ctx.fillStyle = b;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if ((x + y) % 2) ctx.fillRect(x * W / cols, y * H / rows, W / cols, H / rows);
      }
    } else if (c.pattern === 'pajama') {
      // pinstripes
      ctx.globalAlpha = 0.55; ctx.fillStyle = b;
      for (let x = 16; x < W; x += 32) ctx.fillRect(x, 0, 5, H);
      ctx.globalAlpha = 1;
      // little moons & stars
      const rnd = rng(42);
      for (let i = 0; i < 14; i++) {
        const x = 40 + rnd() * (W - 80), y = H * 0.15 + rnd() * H * 0.7;
        ctx.fillStyle = b;
        if (i % 2) {
          ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
          ctx.fillStyle = a; ctx.beginPath(); ctx.arc(x + 4, y - 3, 8, 0, TAU); ctx.fill();
        } else {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const ang = -PI / 2 + k * PI / 5, rr = k % 2 ? 3.5 : 8;
            ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      // button placket down the front (front seam is at x=0 and x=W)
      ctx.fillStyle = b; ctx.globalAlpha = 0.85;
      ctx.fillRect(0, H * 0.35, 7, H * 0.4); ctx.fillRect(W - 7, H * 0.35, 7, H * 0.4);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) wrapDot(ctx, W, 0, H * 0.42 + i * H * 0.12, 7, 7);
    }
  });
}

export function bodyMaterial(colorId) {
  const c = colorDef(colorId);
  let m = _bodyMats.get(c.id);
  if (!m) {
    const opts = { color: c.hex, roughness: 0.6, metalness: 0 };
    if (c.pattern !== 'solid') { opts.color = 0xffffff; opts.map = bodyPatternTexture(c); }
    if (c.id === 'gold_foil') { opts.roughness = 0.35; opts.metalness = 0.35; opts.emissive = 0x3a2800; }
    m = new THREE.MeshStandardMaterial(opts);
    m.name = 'body_' + c.id;
    _bodyMats.set(c.id, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Hats
// ---------------------------------------------------------------------------

const HB = {}; // id -> (group) => void   (filled in below)

export function buildHat(id) {
  const g = new THREE.Group();
  g.name = 'hat:' + id;
  const fn = HB[id];
  if (fn) {
    fn(g);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  return g;
}

// --- extra hat textures -----------------------------------------------------
TEX_DRAW.acorn = (ctx, W, H) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#6b4320'; ctx.lineWidth = 3;
  const rows = 8, cols = 14;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = (c + (r % 2) * 0.5) * W / cols, y = (r + 0.5) * H / rows;
    ctx.beginPath(); ctx.arc(x, y, W / cols * 0.55, 0.12 * PI, 0.88 * PI); ctx.stroke();
  }
};
TEX_DRAW.yarn = (ctx, W, H) => {
  ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, W, H);
  const rnd = rng(17);
  ctx.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, l = 4 + rnd() * 10;
    ctx.strokeStyle = rnd() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(150,150,150,0.6)';
    ctx.lineWidth = 1 + rnd() * 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
};
TEX_DRAW.floss = (ctx, W, H) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  for (let y = 2; y < H; y += 9) {
    ctx.strokeStyle = (y / 9) % 3 < 1 ? 'rgba(0,90,70,0.28)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 1.5);
    ctx.stroke();
  }
};

function starShape(R, r, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = PI / 2 + i * PI / n, rr = i % 2 ? r : R;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}
const extrude = (key, shape, depth, bevel = 0) => G('ext' + key, () => {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
  g.center();
  return g;
});

const SILVER = () => M(0xd3d8e0, { r: 0.3, m: 0.45 });
const WHITE = () => M(0xffffff, { r: 0.5 });

// --- thimble / golden thimble ------------------------------------------------
const THIMBLE_PTS = [[0.27, -0.14], [0.305, -0.13], [0.305, -0.09], [0.29, -0.07], [0.288, 0.02], [0.287, 0.1],
  [0.286, 0.18], [0.284, 0.25], [0.27, 0.33], [0.235, 0.39], [0.16, 0.425], [0.08, 0.437], [0.0, 0.44]];
function thimbleBody(g, mat, rimMat) {
  P(g, lathe('thimble', THIMBLE_PTS, 28), mat);
  P(g, tor(0.3, 0.028, 6, 28), rimMat, [0, -0.11, 0], [PI / 2, 0, 0]);
}
HB.thimble = (g) => {
  const s = S(g, null, [0.05, 0, -0.12]);
  thimbleBody(s, M(0xd3d8e0, { r: 0.32, m: 0.4, tex: 'dimples', ds: true }), SILVER());
};
HB.golden_thimble = (g) => {
  const s = S(g, null, [0.05, 0, -0.12]);
  const gold = M(0xffc53d, { r: 0.28, m: 0.45, e: 0x4a3000 });
  thimbleBody(s, M(0xffc53d, { r: 0.28, m: 0.45, e: 0x4a3000, tex: 'dimples', ds: true }), gold);
  const octa = G('octa', () => new THREE.OctahedronGeometry(1, 0));
  P(s, cyl(0.07, 0.09, 0.05, 14), gold, [0, 0.455, 0]);
  P(s, octa, M(0xff2a5a, { r: 0.12, e: 0x7a0020 }), [0, 0.55, 0], [0, PI / 4, 0], [0.075, 0.1, 0.075]);
  const sparkle = M(0xffffff, { e: 0xfff2b0, ei: 1.2 });
  P(s, octa, sparkle, [0.25, 0.42, 0.12], null, [0.02, 0.05, 0.02]);
  P(s, octa, sparkle, [-0.22, 0.2, 0.2], null, [0.016, 0.04, 0.016]);
  P(s, octa, sparkle, [0.12, 0.62, -0.1], null, [0.014, 0.035, 0.014]);
  // little pearl band
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    P(s, sph(0.026, 8, 6), M(0xfff6e8, { r: 0.25 }), [Math.sin(a) * 0.29, 0.2, Math.cos(a) * 0.29]);
  }
};

// --- bottle cap --------------------------------------------------------------
HB.bottle_cap = (g) => {
  const s = S(g, [0, 0.0, 0], [0.08, 0, 0.18]);
  const red = M(0xd62828, { r: 0.35, m: 0.3, ds: true });
  const skirt = G('capSkirt', () => {
    const geo = new THREE.CylinderGeometry(0.3, 0.32, 0.12, 96, 2, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      const k = 1 + (0.045 + (y < 0 ? 0.03 : 0)) * Math.cos(a * 24);
      p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  });
  P(s, skirt, red, [0, 0, 0]);
  P(s, cyl(0.3, 0.3, 0.03, 48), red, [0, 0.07, 0]);
  const white = M(0xffffff, { r: 0.4 });
  P(s, tor(0.22, 0.013, 4, 40), white, [0, 0.086, 0], [PI / 2, 0, 0]);
  P(s, extrude('star', starShape(0.13, 0.055), 0.012), white, [0, 0.09, 0], [-PI / 2, 0, 0]);
};

// --- acorn cup ---------------------------------------------------------------
HB.acorn_cup = (g) => {
  const cup = G('acornCup', () => lumpy(new THREE.SphereGeometry(0.37, 22, 8, 0, TAU, 0, PI / 2), 0.012, 3, 22));
  P(g, cup, M(0xa0703f, { r: 0.85, tex: 'acorn', ds: true }), [0, -0.2, 0], null, [1, 0.74, 1]);
  P(g, tor(0.365, 0.032, 6, 32), M(0x7a4f27, { r: 0.9 }), [0, -0.2, 0], [PI / 2, 0, 0]);
  const stemMat = M(0x6b4423, { r: 0.9 });
  P(g, tube('acornStem', curveOf([[0, 0.04, 0], [0.01, 0.12, 0], [0.05, 0.18, 0], [0.11, 0.2, 0]]), 10, 0.028, 6), stemMat);
  P(g, sph(0.028, 6, 4), stemMat, [0.11, 0.2, 0]);
};

// --- coat button beret ---------------------------------------------------------
HB.coat_button = (g) => {
  const s = S(g, [0, 0.03, 0], [-0.15, 0, 0.3]);
  const teal = M(0x2a9d8f, { r: 0.35 });
  P(s, cyl(0.32, 0.32, 0.07, 32), teal);
  P(s, tor(0.3, 0.035, 8, 32), teal, [0, 0.035, 0], [PI / 2, 0, 0]);
  P(s, cyl(0.24, 0.24, 0.02, 32), M(0x23877b, { r: 0.4 }), [0, 0.03, 0]);
  const hole = M(0x0d2d29, { r: 0.9 });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P(s, cyl(0.04, 0.04, 0.075, 10), hole, [x * 0.08, 0.006, z * 0.08]);
  const thread = M(0xfff1c9, { r: 0.9 });
  P(s, box(0.27, 0.025, 0.035), thread, [0, 0.05, 0], [0, PI / 4, 0]);
  P(s, box(0.27, 0.025, 0.035), thread, [0, 0.055, 0], [0, -PI / 4, 0]);
};

// --- teabag --------------------------------------------------------------------
HB.teabag = (g) => {
  const s = S(g, [0, 0.03, 0], [0.12, 0.35, -0.08]);
  const bag = G('teabag', () => {
    const geo = new THREE.BoxGeometry(0.46, 0.14, 0.56, 10, 2, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = Math.sqrt(Math.max(0, 1 - (x / 0.23) ** 2)) * Math.sqrt(Math.max(0, 1 - (z / 0.28) ** 2));
      p.setY(i, y * (0.12 + 0.88 * f) - 0.9 * (x * x + z * z));
    }
    geo.computeVertexNormals();
    return geo;
  });
  P(s, bag, M(0xf2e6c9, { r: 0.95 }));
  P(s, sph(0.15, 14, 6, 0, TAU, 0, PI / 2), M(0xb08a5a, { r: 1, op: 0.35 }), [0, 0.0, 0], null, [1, 0.35, 1.1]);
  P(s, box(0.05, 0.012, 0.014), M(0xb0b6bf, { r: 0.3, m: 0.6 }), [0, 0.072, 0]);
  const str = tube('teaString', curveOf([[0, 0.072, 0], [0.04, 0.2, 0.02], [0.18, 0.25, 0.04], [0.33, 0.14, 0.06],
    [0.4, -0.08, 0.08], [0.47, -0.22, 0.1]]), 24, 0.008, 4);
  P(s, str, M(0xffffff, { r: 0.9 }));
  const tag = S(s, [0.48, -0.3, 0.1], [0, 0.6, 0.15]);
  P(tag, box(0.13, 0.16, 0.014), M(0xe76f51, { r: 0.7 }));
  P(tag, box(0.09, 0.06, 0.016), M(0xfff3e0, { r: 0.8 }), [0, 0.02, 0]);
  P(tag, box(0.05, 0.012, 0.018), M(0x6a994e, { r: 0.8 }), [0, -0.04, 0]);
};

// --- jellybean pile ------------------------------------------------------------
const jellyGeo = () => G('jelly', () => {
  const geo = new THREE.CapsuleGeometry(0.15, 0.24, 6, 14);
  geo.rotateZ(PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const dent = y > 0 ? 0.035 * Math.max(0, 1 - (x / 0.2) ** 2) * (y / 0.15) : 0;
    p.setXYZ(i, x, y + 1.1 * x * x - dent, z * 0.82);
  }
  geo.computeVertexNormals();
  return geo;
});
HB.jellybean = (g) => {
  const j = jellyGeo();
  P(g, j, M(0xff2d55, { r: 0.18, e: 0x3a0010 }), [0, 0.12, 0], [0, 0.3, 0.12]);
  P(g, j, M(0x7ed957, { r: 0.18, e: 0x103a00 }), [0.15, 0.03, -0.13], [0.3, 1.2, -0.4], 0.7);
  P(g, j, M(0xffc93c, { r: 0.18, e: 0x3a2800 }), [-0.17, 0.02, 0.09], [-0.2, -0.6, 0.5], 0.65);
  // a few sugar sparkles
  const sugar = M(0xffffff, { r: 0.2, e: 0x666666 });
  for (const p of [[0.05, 0.27, 0.06], [-0.1, 0.25, -0.02], [0.14, 0.22, 0.04]]) P(g, box(0.018, 0.018, 0.018), sugar, p, [0.5, 0.5, 0]);
};

// --- popcorn -------------------------------------------------------------------
HB.popcorn = (g) => {
  const lump = G('popLump', () => lumpy(new THREE.IcosahedronGeometry(0.15, 2), 0.025, 2, 18));
  const cream = M(0xfff2cc, { r: 0.85 });
  const butter = M(0xffe08a, { r: 0.7 });
  const L = [[0, 0.14, 0, 1.25, cream], [0.15, 0.11, 0.05, 0.95, cream], [-0.14, 0.12, 0.04, 1.0, butter],
    [0.02, 0.27, -0.06, 0.9, cream], [0.0, 0.09, 0.15, 0.85, cream], [-0.05, 0.1, -0.15, 0.9, butter]];
  L.forEach(([x, y, z, s, m], i) => P(g, lump, m, [x, y, z], [i, i * 1.7, i * 0.6], s));
  P(g, sph(0.08, 10, 5, 0, TAU, 0, PI / 2), M(0xc8902e, { r: 0.5, ds: true }), [0.02, 0.02, -0.02], [PI, 0, 0.3], [1, 0.6, 1]);
};

// --- pencil stub ---------------------------------------------------------------
HB.pencil_eraser = (g) => {
  const s = S(g, [0, 0.1, 0], [0, 0.6, 1.35]);
  P(s, cyl(0.1, 0.1, 0.4, 6), M(0xffc21a, { r: 0.45, flat: true }));
  P(s, cyl(0.104, 0.104, 0.08, 16), SILVER(), [0, 0.24, 0]);
  P(s, tor(0.104, 0.012, 4, 16), SILVER(), [0, 0.215, 0], [PI / 2, 0, 0]);
  P(s, tor(0.104, 0.012, 4, 16), SILVER(), [0, 0.265, 0], [PI / 2, 0, 0]);
  const pink = M(0xff8fab, { r: 0.8 });
  P(s, cyl(0.096, 0.096, 0.07, 16), pink, [0, 0.315, 0]);
  P(s, sph(0.096, 16, 6, 0, TAU, 0, PI / 2), pink, [0, 0.35, 0], null, [1, 0.5, 1]);
  P(s, cyl(0.1, 0.035, 0.12, 6), M(0xf0c896, { r: 0.8, flat: true }), [0, -0.26, 0]);
  P(s, G('graphite', () => new THREE.ConeGeometry(0.035, 0.05, 8).rotateX(PI)), M(0x3a3a40, { r: 0.4, m: 0.3 }), [0, -0.345, 0]);
};

// --- cotton swab mohawk -------------------------------------------------------
HB.qtip_mohawk = (g) => {
  const L = [0.3, 0.4, 0.46, 0.4, 0.3];
  const sticks = [M(0x9ad7ff, { r: 0.4 }), M(0xffb3d1, { r: 0.4 })];
  const cotton = M(0xffffff, { r: 1 });
  const fluff = G('cottonTip', () => lumpy(new THREE.SphereGeometry(0.055, 10, 8), 0.008, 5, 60));
  L.forEach((len, i) => {
    const z = -0.24 + i * 0.12;
    const s = S(g, [0, -0.06 - 1.1 * z * z, z], [z * 1.6, 0, 0]);
    P(s, cyl(0.016, 0.016, len, 6), sticks[i % 2], [0, len / 2, 0]);
    P(s, fluff, cotton, [0, len + 0.03, 0], null, [1, 1.5, 1]);
  });
};

// --- paperclip antenna --------------------------------------------------------
HB.paperclip_antenna = (g) => {
  const pts2 = [];
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.04));
    for (let i = 1; i <= n; i++) pts2.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  };
  pts2.push([0.06, 0.85]);
  line(0.06, 0.85, 0.06, 0.72);
  pts2.push([0.1, 0.66], [0.02, 0.6], [0.06, 0.54]);
  line(0.06, 0.54, 0.06, 0.08);
  pts2.push(...arcPts(0, 0.08, 0.06, 0, -PI, 8).slice(1));
  line(-0.06, 0.08, -0.06, 0.4);
  pts2.push(...arcPts(-0.015, 0.4, 0.045, PI, 0, 8).slice(1));
  line(0.03, 0.4, 0.03, 0.12);
  pts2.push(...arcPts(0, 0.12, 0.03, 0, -PI, 6).slice(1));
  line(-0.03, 0.12, -0.03, 0.3);
  const curve = new THREE.CatmullRomCurve3(pts2.map(p => new THREE.Vector3(p[0], p[1], 0)));
  const s = S(g, [0, 0.03, 0], [0, 0.4, -0.08], 1.25);
  P(s, tube('paperclip', curve, 150, 0.012, 5), M(0xc9d1db, { r: 0.25, m: 0.6 }));
  P(s, sph(0.05, 12, 10), M(0xff3b30, { r: 0.2, e: 0x551010 }), [0.06, 0.87, 0]);
  P(s, sph(0.08, 12, 8), M(0x58a6ff, { r: 0.9 }), [0.0, 0.0, 0], null, [1.3, 0.6, 1]);
};

// --- mint floss bandana -------------------------------------------------------
HB.floss_bandana = (g) => {
  const mint = M(0x7fe8c4, { r: 0.5, e: 0x0b3328, tex: 'floss', ds: true });
  const s = S(g, [0, -0.17, 0], [-0.12, 0, 0]);
  P(s, cyl(0.355, 0.37, 0.1, 32, true), mint);
  const knotMat = M(0x7fe8c4, { r: 0.5, e: 0x0b3328 });
  P(s, G('flossKnot', () => lumpy(new THREE.SphereGeometry(0.05, 8, 6), 0.008, 4, 40)), knotMat, [0, 0, -0.38]);
  P(s, tube('flossTail1', curveOf([[0, 0, -0.38], [0.07, -0.05, -0.47], [0.04, -0.14, -0.55], [0.1, -0.24, -0.58]]), 16, 0.018, 5), knotMat);
  P(s, tube('flossTail2', curveOf([[0, 0, -0.38], [-0.06, -0.03, -0.48], [-0.1, -0.12, -0.52], [-0.07, -0.2, -0.6]]), 16, 0.018, 5), knotMat);
};

// --- lost sock hood -------------------------------------------------------------
HB.sock_hood = (g) => {
  const stripeRows = M(0xffffff, { r: 0.95, tex: 'sockRows', ds: true });
  P(g, sph(0.44, 24, 8, 0, TAU, 0, 0.38 * PI), stripeRows, [0, -0.38, 0]);
  P(g, sph(0.44, 20, 5, 0.9 * PI, 1.2 * PI, 0.38 * PI, 0.24 * PI), M(0xe8343c, { r: 0.95, ds: true }), [0, -0.38, 0]);
  const curve = curveOf([[0, -0.02, -0.02], [0, 0.18, -0.06], [0.02, 0.33, -0.16], [0.04, 0.36, -0.32], [0.06, 0.26, -0.45], [0.07, 0.12, -0.5]]);
  P(g, taperTube('sock', curve, 24, 14, t => 0.2 - 0.09 * t), M(0xffffff, { r: 0.95, tex: 'sockStripes', ds: true }));
  const end = curve.getPointAt(1);
  P(g, sph(0.112, 14, 10), M(0x9aa1ad, { r: 1 }), [end.x, end.y, end.z], null, [1, 1, 1]);
  // little heel patch on the bend
  P(g, sph(0.1, 12, 8), M(0x9aa1ad, { r: 1 }), [0.035, 0.42, -0.3], null, [1.15, 0.6, 0.9]);
};

// --- pom-pom ---------------------------------------------------------------------
HB.pom_pom = (g) => {
  const ball = G('pomBall', () => lumpy(new THREE.SphereGeometry(0.28, 28, 20), 0.016, 1, 34));
  P(g, ball, M(0xff6f91, { r: 1, tex: 'yarn' }), [0, 0.24, 0]);
  // a few stray yarn tufts poking out
  const tuft = M(0xff6f91, { r: 1 });
  const rnd = rng(11);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, b = 0.2 + rnd() * 1.4;
    const dir = V3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
    const m = P(g, cone(0.03, 0.09, 5), tuft, [dir.x * 0.29, 0.24 + dir.y * 0.29, dir.z * 0.29]);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
  }
  P(g, tor(0.1, 0.035, 6, 16), M(0xff6f91, { r: 1, tex: 'yarn' }), [0, -0.01, 0], [PI / 2, 0, 0]);
};

// --- childproof pill-bottle cap -----------------------------------------------
HB.pill_cap = (g) => {
  const s = S(g, [0, 0.0, 0], [0.1, 0, -0.14]);
  const white = M(0xf7f7f2, { r: 0.4, ds: true });
  const ridged = G('pillRidges', () => {
    const geo = new THREE.CylinderGeometry(0.27, 0.28, 0.16, 120, 1, true);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const k = 1 + 0.022 * Math.sign(Math.cos(Math.atan2(x, z) * 40));
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  });
  P(s, ridged, white);
  const top = new THREE.Mesh(cyl(0.285, 0.285, 0.025, 48), [white, M(0xffffff, { r: 0.45, tex: 'pillTop' }), white]);
  top.position.y = 0.09; top.castShadow = true; s.add(top);
  P(s, tor(0.265, 0.022, 6, 40), M(0xff9a3c, { r: 0.25, op: 0.75 }), [0, -0.085, 0], [PI / 2, 0, 0]);
};

// --- bread tag tiara -----------------------------------------------------------
function breadTagShape() {
  const pts = [[-0.11, -0.08], [-0.09, -0.1], [-0.02, -0.1], [-0.007, -0.014]];
  pts.push(...arcPts(0, 0.02, 0.035, -PI / 2 - 0.2, -PI / 2 + 0.2 - TAU, 16).slice(1, -1));
  pts.push([0.007, -0.014], [0.02, -0.1], [0.09, -0.1], [0.11, -0.08], [0.11, 0.08], [0.09, 0.1], [-0.09, 0.1], [-0.11, 0.08]);
  return new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
}
HB.bread_tag = (g) => {
  const geo = extrude('breadTag', breadTagShape(), 0.02, 0.004);
  P(g, tor(0.3, 0.014, 5, 40), M(0xf2c94c, { r: 0.35, m: 0.4 }), [0, -0.1, 0], [PI / 2, 0, 0]);
  const tags = [[0, 1.35, 0x3d8bff], [0.8, 1.0, 0xff5a5f], [-0.8, 1.0, 0x2ecc71], [1.6, 0.85, 0xffd23f], [-1.6, 0.85, 0xb57bff]];
  for (const [a, sc, col] of tags) {
    const t = S(g, [Math.sin(a) * 0.29, -0.1 + 0.1 * sc, Math.cos(a) * 0.29], [-0.18, a, 0], sc);
    P(t, geo, M(col, { r: 0.3 }));
  }
};

// --- lint beanie ------------------------------------------------------------------
HB.lint_beanie = (g) => {
  const lint = M(0xa7b4cc, { r: 1, tex: 'yarn' });
  const dome = G('lintDome', () => lumpy(new THREE.SphereGeometry(0.41, 26, 10, 0, TAU, 0, PI * 0.45), 0.012, 4, 30));
  P(g, dome, M(0xa7b4cc, { r: 1, ds: true, tex: 'yarn' }), [0, -0.25, 0]);
  const brim = G('lintBrim', () => lumpy(new THREE.TorusGeometry(0.4, 0.055, 8, 36), 0.01, 2, 40));
  P(g, brim, M(0x95a3bd, { r: 1, tex: 'yarn' }), [0, -0.19, 0], [PI / 2, 0, 0]);
  P(g, G('lintPom', () => lumpy(new THREE.SphereGeometry(0.11, 14, 10), 0.016, 6, 35)), lint, [0, 0.18, 0]);
  const fibres = [[0xff6b6b, [[0.15, 0.08, 0.2], [0.2, 0.05, 0.2], [0.22, 0.0, 0.25], [0.28, -0.02, 0.22]]],
    [0x4dabf7, [[-0.2, 0.06, 0.12], [-0.24, 0.02, 0.18], [-0.3, -0.02, 0.14], [-0.33, -0.08, 0.17]]],
    [0xffd43b, [[0.05, 0.14, -0.18], [0.0, 0.11, -0.24], [0.06, 0.07, -0.29], [0.02, 0.02, -0.33]]]];
  fibres.forEach(([col, pts], i) => P(g, tube('lintFibre' + i, curveOf(pts), 12, 0.009, 4), M(col, { r: 0.9 })));
  const tuft = G('lintTuft', () => lumpy(new THREE.SphereGeometry(0.05, 8, 6), 0.01, 9, 60));
  for (const p of [[0.25, -0.02, -0.15], [-0.12, 0.1, 0.22], [-0.27, -0.03, -0.12]]) P(g, tuft, M(0xd8deea, { r: 1 }), p);
};

// --- hatchling helmet (eggshell) ------------------------------------------------
HB.eggshell = (g) => {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const th = (i / 10) * PI / 2;
    pts.push([Math.max(0.0001, 0.36 * Math.cos(th) * (1 - 0.12 * Math.sin(th))), -0.2 + 0.52 * Math.sin(th)]);
  }
  pts[pts.length - 1][0] = 0;
  const shell = G('eggshell', () => {
    const geo = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 24);
    const p = geo.attributes.position, n = pts.length;
    for (let i = 0; i <= 24; i++) {
      const k = i * n;
      p.setY(k, p.getY(k) + (i % 2 ? 0.06 : -0.015));
      p.setY(k + 1, p.getY(k + 1) + (i % 2 ? 0.02 : 0));
    }
    geo.computeVertexNormals();
    return geo;
  });
  const s = S(g, null, [0.1, 0, 0.12]);
  P(s, shell, M(0xfff4e2, { r: 0.55, ds: true }));
  const speck = M(0xd9b48a, { r: 0.8 });
  for (const [x, y, z, sc] of [[0.2, 0.15, 0.17, 1], [-0.24, 0.05, 0.2, 0.8], [0.05, 0.29, -0.12, 0.9], [-0.15, 0.2, -0.2, 0.7], [0.29, -0.02, -0.12, 0.8]]) {
    const m = P(s, sph(0.02, 6, 4), speck, [x, y, z], null, [sc, sc, sc * 0.4]);
    m.lookAt(x * 3, y * 3 + 0.4, z * 3);
  }
  // a single fluffy chick feather stuck to the top
  P(s, G('chickFluff', () => lumpy(new THREE.SphereGeometry(0.06, 10, 8), 0.012, 3, 50)), M(0xffe066, { r: 1 }), [0.04, 0.33, 0.02]);
  P(s, G('chickFluff2', () => new THREE.ConeGeometry(0.025, 0.12, 6)), M(0xffe066, { r: 1 }), [0.07, 0.4, 0.02], [0, 0, -0.5]);
};

// --- cotton reel top hat --------------------------------------------------------
HB.thread_spool = (g) => {
  const s = S(g, [0, -0.04, 0], [-0.05, 0, 0.1]);
  const wood = M(0xd9a066, { r: 0.7 });
  P(s, cyl(0.34, 0.34, 0.05, 32), wood, [0, 0.025, 0]);
  P(s, cyl(0.3, 0.3, 0.05, 32), wood, [0, 0.5, 0]);
  P(s, cyl(0.06, 0.06, 0.052, 14), M(0x5a3a1a, { r: 0.9 }), [0, 0.503, 0]);
  P(s, cyl(0.24, 0.24, 0.42, 32, true), M(0xe63946, { r: 0.85, tex: 'floss' }), [0, 0.26, 0]);
  const red = M(0xe63946, { r: 0.85 });
  P(s, tube('spoolThread', curveOf([[0.24, 0.32, 0.02], [0.3, 0.24, 0.08], [0.33, 0.08, 0.1], [0.36, -0.06, 0.14], [0.3, -0.16, 0.2]]), 20, 0.012, 4), red);
  // needle stuck through like a feather
  const n = S(s, [-0.14, 0.42, 0.12], [0.35, 0, 0.55]);
  P(n, cyl(0.01, 0.01, 0.48, 6), SILVER(), [0, 0.12, 0]);
  P(n, cone(0.01, 0.06, 6), SILVER(), [0, 0.39, 0]);
  P(n, tor(0.018, 0.006, 4, 10), SILVER(), [0, -0.14, 0], [0, PI / 2, 0], [1, 1.8, 1]);
};

// --- matchstick quiff -------------------------------------------------------------
HB.match_quiff = (g) => {
  const wood = M(0xf0d9a8, { r: 0.8 });
  const head = M(0xd62828, { r: 0.6 });
  const tip = G('matchHead', () => lumpy(new THREE.SphereGeometry(0.042, 10, 8), 0.006, 3, 60));
  for (let i = 0; i < 5; i++) {
    const d = i - 2;
    const len = 0.42 - Math.abs(d) * 0.05;
    const s = S(g, [d * 0.065, -0.06, 0.06 - Math.abs(d) * 0.04], [0.75 - Math.abs(d) * 0.12, 0, -d * 0.28]);
    P(s, box(0.034, len, 0.034), wood, [0, len / 2, 0]);
    P(s, tip, head, [0, len + 0.02, 0], null, [1, 1.4, 1]);
    if (i === 2) {
      P(s, sph(0.035, 10, 8), M(0xffa31a, { e: 0xff7a00, ei: 1.6, op: 0.85 }), [0, len + 0.1, 0], null, [1, 1.9, 1]);
      P(s, sph(0.02, 8, 6), M(0xfff3a0, { e: 0xfff3a0, ei: 1.6 }), [0, len + 0.09, 0], null, [1, 1.6, 1]);
    }
  }
};

// --- birthday candle -----------------------------------------------------------
HB.birthday_candle = (g) => {
  const frost = M(0xffb3d9, { r: 0.5 });
  P(g, tor(0.19, 0.075, 8, 24), frost, [0, 0.02, 0], [PI / 2, 0, 0]);
  P(g, tor(0.13, 0.065, 8, 20), frost, [0, 0.1, 0], [PI / 2, 0, 0.6]);
  P(g, tor(0.07, 0.055, 8, 16), frost, [0, 0.16, 0], [PI / 2, 0, 1.2]);
  P(g, sph(0.08, 12, 8), frost, [0, 0.17, 0]);
  const cols = [0xff3b30, 0x2f6bff, 0xffd60a, 0x2ecc40, 0xffffff, 0x9b4dff];
  const rnd = rng(5);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, ring = rnd() < 0.5 ? 0 : 1;
    const R = ring ? 0.15 : 0.24, y = ring ? 0.135 : 0.065;
    P(g, box(0.016, 0.016, 0.05), M(cols[i % cols.length], { r: 0.4 }), [Math.sin(a) * R, y + 0.02, Math.cos(a) * R], [rnd() * 3, rnd() * 3, rnd() * 3]);
  }
  const c = S(g, [0, 0.2, 0], [0.05, 0, -0.12]);
  P(c, cyl(0.055, 0.055, 0.42, 16), M(0xffffff, { r: 0.5, tex: 'candle' }), [0, 0.21, 0]);
  P(c, capsule(0.018, 0.05, 3, 6), M(0xffe0ef, { r: 0.4 }), [0.05, 0.36, 0.02]);
  P(c, capsule(0.016, 0.08, 3, 6), M(0xffe0ef, { r: 0.4 }), [-0.04, 0.34, 0.035]);
  P(c, cyl(0.006, 0.006, 0.05, 5), M(0x222222, { r: 0.9 }), [0, 0.445, 0]);
  P(c, sph(0.045, 12, 10), M(0xff9a1a, { e: 0xff7a00, ei: 1.5, op: 0.9 }), [0, 0.53, 0], null, [1, 1.9, 1]);
  P(c, sph(0.024, 10, 8), M(0xfff3a0, { e: 0xfff3a0, ei: 1.8 }), [0, 0.51, 0], null, [1, 1.6, 1]);
};

// --- lucky die --------------------------------------------------------------------
HB.lucky_die = (g) => {
  const s = S(g, [0, 0.19, 0], [0.22, 0.6, 0.12]);
  P(s, roundedBox(0.36, 0.36, 0.36, 0.06, 3), M(0xfafafa, { r: 0.25 }));
  const black = M(0x1b1b1f, { r: 0.4 });
  const d = 0.09, h = 0.181;
  const L = {
    2: [[-d, -d], [d, d]], 3: [[-d, -d], [0, 0], [d, d]], 4: [[-d, -d], [-d, d], [d, -d], [d, d]],
    5: [[-d, -d], [-d, d], [d, -d], [d, d], [0, 0]],
  };
  const pip = cyl(0.034, 0.034, 0.012, 12);
  const face = (n, normal) => {
    for (const [u, v] of L[n]) {
      if (normal === 'z') P(s, pip, black, [u, v, h], [PI / 2, 0, 0]);
      if (normal === '-z') P(s, pip, black, [u, v, -h], [PI / 2, 0, 0]);
      if (normal === 'x') P(s, pip, black, [h, u, v], [0, 0, PI / 2]);
      if (normal === '-x') P(s, pip, black, [-h, u, v], [0, 0, PI / 2]);
    }
  };
  face(2, 'z'); face(5, '-z'); face(3, 'x'); face(4, '-x');
  P(s, cyl(0.065, 0.065, 0.012, 20), M(0xe0182d, { r: 0.3 }), [0, h, 0]);
};

// --- lost earbud ----------------------------------------------------------------
HB.earbud = (g) => {
  const white = M(0xfbfbfd, { r: 0.18 });
  const s = S(g, [0, 0.12, 0], [0, 0.5, 0.25]);
  P(s, sph(0.13, 18, 14), white, [0, 0, 0], null, [1, 0.9, 0.95]);
  P(s, sph(0.075, 14, 10), M(0xd5dde8, { r: 0.7 }), [-0.12, 0.0, 0.02], null, [0.8, 1, 1]);
  P(s, capsule(0.042, 0.34, 4, 12), white, [0.06, 0.24, -0.01], [0, 0, -0.25]);
  P(s, cyl(0.043, 0.043, 0.025, 12), SILVER(), [0.106, 0.43, -0.01], [0, 0, -0.25]);
  P(s, cyl(0.02, 0.02, 0.006, 10), M(0x222222, { r: 0.5 }), [0.0, 0.03, 0.123], [PI / 2, 0, 0]);
  // tiny music notes drifting out
  const noteMats = [M(0x2fd3ff, { e: 0x0a6a80, r: 0.3 }), M(0xff5fb8, { e: 0x80104a, r: 0.3 })];
  const notes = [[-0.22, 0.32, 0.05, 0.25], [-0.3, 0.52, -0.02, -0.15]];
  notes.forEach(([x, y, z, rz], i) => {
    const n = S(g, [x, y, z], [0, 0, rz]);
    P(n, sph(0.035, 10, 8), noteMats[i], [0, 0, 0], [0, 0, 0.5], [1.25, 0.9, 0.7]);
    P(n, cyl(0.008, 0.008, 0.14, 5), noteMats[i], [0.035, 0.07, 0]);
    P(n, box(0.06, 0.018, 0.012), noteMats[i], [0.06, 0.13, 0], [0, 0, -0.5]);
  });
};

// --- doll's teacup ----------------------------------------------------------------
HB.teacup = (g) => {
  const china = M(0xfdfbf7, { r: 0.25, ds: true });
  const gold = M(0xf2c94c, { r: 0.3, m: 0.5 });
  P(g, lathe('saucer', [[0.0, -0.03], [0.3, -0.03], [0.4, -0.01], [0.44, 0.02], [0.445, 0.032]], 32), china);
  P(g, tor(0.445, 0.01, 4, 40), gold, [0, 0.032, 0], [PI / 2, 0, 0]);
  const s = S(g, [0, -0.01, 0], [0.06, 0, -0.08]);
  P(s, lathe('cup', [[0.27, 0.0], [0.262, 0.04], [0.24, 0.14], [0.2, 0.22], [0.13, 0.27], [0.11, 0.28], [0.1, 0.3], [0.0, 0.3]], 28), china);
  P(s, tor(0.268, 0.012, 4, 36), gold, [0, 0.006, 0], [PI / 2, 0, 0]);
  P(s, tor(0.1, 0.01, 4, 24), gold, [0, 0.3, 0], [PI / 2, 0, 0]);
  P(s, tor(0.243, 0.008, 4, 36), M(0x4a7bd0, { r: 0.4 }), [0, 0.13, 0], [PI / 2, 0, 0]);
  P(s, tor(0.08, 0.022, 8, 16, PI * 1.25), china, [0.255, 0.15, 0], [0, 0, -PI * 0.62]);
  // little painted rose
  const petal = M(0xff7aa8, { r: 0.5 });
  const f = S(s, [0, 0.07, 0.258], [0.2, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    P(f, sph(0.022, 8, 6), petal, [Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0], null, [1, 1, 0.4]);
  }
  P(f, sph(0.016, 8, 6), M(0xffd23f, { r: 0.5 }), [0, 0, 0.006], null, [1, 1, 0.5]);
};

// --- sponge mortarboard ---------------------------------------------------------
HB.sponge_cap = (g) => {
  const sponge = M(0xffd84a, { r: 1, tex: 'sponge' });
  P(g, cyl(0.29, 0.33, 0.16, 24), sponge, [0, -0.02, 0]);
  const b = S(g, [0, 0.0, 0], [0, PI / 4, 0]);
  P(b, box(0.66, 0.07, 0.66), sponge, [0, 0.095, 0]);
  P(b, box(0.66, 0.04, 0.66), M(0x2e8b57, { r: 1, flat: true }), [0, 0.15, 0]);
  P(g, cyl(0.04, 0.04, 0.03, 12), M(0xff9f1c, { r: 0.7 }), [0, 0.185, 0]);
  const orange = M(0xff9f1c, { r: 0.8 });
  P(g, tube('tassel', curveOf([[0, 0.19, 0], [0.25, 0.19, 0.02], [0.45, 0.18, 0.04], [0.5, 0.1, 0.05], [0.5, -0.05, 0.05]]), 20, 0.012, 4), orange);
  P(g, sph(0.025, 8, 6), orange, [0.5, -0.06, 0.05]);
  P(g, cyl(0.016, 0.05, 0.14, 8), orange, [0.5, -0.14, 0.05]);
  const bubble = M(0xdff6ff, { r: 0.05, m: 0.2, op: 0.35, e: 0x1a3550 });
  P(g, sph(0.06, 12, 10), bubble, [-0.28, 0.3, 0.1]);
  P(g, sph(0.04, 12, 10), bubble, [-0.2, 0.42, -0.05]);
  P(g, sph(0.028, 10, 8), bubble, [-0.34, 0.45, 0.02]);
};

// --- foot destroyer (toy brick) ------------------------------------------------
HB.toy_brick = (g) => {
  const red = M(0xe3242b, { r: 0.22 });
  const s = S(g, [0, 0.06, 0], [0.06, 0.45, -0.05]);
  P(s, roundedBox(0.64, 0.24, 0.32, 0.02, 1), red, [0, 0.12, 0]);
  const stud = cyl(0.055, 0.055, 0.06, 16);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) for (const z of [-0.08, 0.08]) P(s, stud, red, [x, 0.27, z]);
};

// --- fairy-light bulb -----------------------------------------------------------
HB.fairy_bulb = (g) => {
  const s = S(g, [0, 0.0, 0], [0.12, 0, 0.3]);
  const green = M(0x2e7d32, { r: 0.5 });
  P(s, cyl(0.08, 0.09, 0.12, 12), green, [0, 0.06, 0]);
  P(s, tor(0.085, 0.012, 4, 14), green, [0, 0.03, 0], [PI / 2, 0, 0]);
  P(s, tor(0.082, 0.012, 4, 14), green, [0, 0.08, 0], [PI / 2, 0, 0]);
  const pts = [[0.06, 0.12], [0.09, 0.17], [0.12, 0.24], [0.13, 0.3], [0.12, 0.37], [0.09, 0.44], [0.05, 0.5], [0.0, 0.53]];
  P(s, lathe('bulb', pts, 18), M(0xff6680, { e: 0xff1a4a, ei: 0.9, r: 0.2 }));
  P(s, lathe('bulbGlow', pts.map(([r, y]) => [r * 1.35 + 0.02, (y - 0.3) * 1.25 + 0.3]), 14), M(0xff3355, { e: 0xff3355, ei: 1, op: 0.18 }));
  const wire = M(0x1f5f22, { r: 0.6 });
  P(g, tube('fairyWire1', curveOf([[0, 0.02, -0.03], [0.02, -0.05, -0.22], [0.12, -0.12, -0.34], [-0.04, -0.2, -0.42], [0.02, -0.32, -0.46]]), 30, 0.013, 5), wire);
  P(g, tube('fairyWire2', curveOf([[0.02, 0.02, -0.03], [0.04, -0.04, -0.23], [0.15, -0.12, -0.33], [-0.02, -0.21, -0.43], [0.05, -0.32, -0.47]]), 30, 0.013, 5), wire);
};

// --- bath duck ------------------------------------------------------------------
HB.rubber_duck = (g) => {
  const yellow = M(0xffd43b, { r: 0.3 });
  const s = S(g, [0, 0.0, 0], [0, 0.35, 0]);
  P(s, sph(0.2, 20, 14), yellow, [0, 0.13, 0], null, [1, 0.75, 1.3]);
  P(s, cone(0.07, 0.14, 10), yellow, [0, 0.2, -0.25], [-0.9, 0, 0]);
  P(s, sph(0.13, 18, 14), yellow, [0, 0.33, 0.12]);
  P(s, sph(0.07, 12, 8), M(0xff8c1a, { r: 0.35 }), [0, 0.31, 0.245], null, [1.1, 0.42, 1.25]);
  const black = M(0x111111, { r: 0.2 });
  const shine = M(0xffffff, { e: 0x888888 });
  for (const x of [-1, 1]) {
    P(s, sph(0.024, 10, 8), black, [x * 0.062, 0.37, 0.215]);
    P(s, sph(0.008, 6, 4), shine, [x * 0.062 + 0.008, 0.378, 0.236]);
    P(s, sph(0.1, 12, 8), M(0xf5c518, { r: 0.35 }), [x * 0.175, 0.15, -0.03], [0, 0, x * 0.3], [0.35, 0.6, 1]);
    P(s, sph(0.025, 8, 6), M(0xff8fab, { r: 0.6 }), [x * 0.095, 0.315, 0.19], null, [1, 0.6, 0.4]);
  }
};

// --- toothbrush plume -------------------------------------------------------------
HB.toothbrush_plume = (g) => {
  const handle = M(0x4dabf7, { r: 0.2, op: 0.9 });
  P(g, tube('tbHandle', curveOf([[0, -0.17, -0.38], [0, -0.04, -0.3], [0, 0.04, -0.15], [0, 0.065, 0.0]]), 16, 0.03, 8), handle);
  P(g, sph(0.03, 8, 6), handle, [0, -0.17, -0.38]);
  const h = S(g, [0, 0.07, 0.1], [0.15, 0, 0], 1.35);
  P(h, roundedBox(0.1, 0.035, 0.28, 0.014, 1), handle);
  const tuftW = M(0xffffff, { r: 0.8 }), tuftC = M(0x7fe0ff, { r: 0.8 });
  for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) {
    P(h, cyl(0.015, 0.015, 0.12, 6), (i + k) % 2 ? tuftC : tuftW, [(k - 1) * 0.028, 0.075, -0.11 + i * 0.044]);
  }
  const pastePts = [];
  for (let i = 0; i <= 8; i++) pastePts.push([Math.sin(i * 1.4) * 0.022, 0.16 + Math.abs(Math.sin(i * 0.9)) * 0.02, -0.11 + i * 0.028]);
  P(h, tube('paste', curveOf(pastePts), 30, 0.03, 8), M(0xffffff, { r: 0.35 }));
  P(h, tube('pasteStripe', curveOf(pastePts.map(([x, y, z]) => [x, y + 0.024, z])), 30, 0.012, 5), M(0x38d9a9, { r: 0.35 }));
  P(h, sph(0.03, 8, 6), M(0xffffff, { r: 0.35 }), [pastePts[8][0], pastePts[8][1], pastePts[8][2]]);
};

// --- party lampshade --------------------------------------------------------------
HB.lampshade = (g) => {
  const s = S(g, [0.04, -0.02, 0], [0.12, 0, 0.26]);
  P(s, cyl(0.2, 0.38, 0.38, 24, true), M(0xf7e3b5, { r: 0.85, ds: true }), [0, 0.12, 0]);
  const trim = M(0xc0392b, { r: 0.6 });
  P(s, tor(0.2, 0.016, 5, 28), trim, [0, 0.31, 0], [PI / 2, 0, 0]);
  P(s, tor(0.38, 0.018, 5, 36), trim, [0, -0.07, 0], [PI / 2, 0, 0]);
  const tassel = G('lampTassel', () => new THREE.ConeGeometry(0.02, 0.07, 5).rotateX(PI));
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU;
    P(s, tassel, trim, [Math.sin(a) * 0.38, -0.115, Math.cos(a) * 0.38]);
  }
  const brass = M(0xd4a017, { r: 0.3, m: 0.5 });
  P(s, box(0.4, 0.012, 0.012), brass, [0, 0.3, 0]);
  P(s, sph(0.035, 10, 8), brass, [0, 0.34, 0]);
  P(s, tube('lampChain', curveOf([[0.12, 0.3, 0.05], [0.14, 0.12, 0.08], [0.15, -0.1, 0.1], [0.17, -0.26, 0.1]]), 14, 0.007, 4), brass);
  P(s, sph(0.025, 8, 6), brass, [0.17, -0.27, 0.1]);
};

// --- sprinkle donut crown -------------------------------------------------------
HB.sprinkle_donut = (g) => {
  const s = S(g, [0, 0.04, 0], [0.12, 0, -0.08]);
  P(s, tor(0.24, 0.11, 14, 32), M(0xe0a96d, { r: 0.75 }), [0, 0, 0], [PI / 2, 0, 0]);
  const icing = G('icing', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * PI;
      pts.push(new THREE.Vector2(0.24 - 0.118 * Math.cos(a), 0.118 * Math.sin(a)));
    }
    const geo = new THREE.LatheGeometry(pts, 36);
    const p = geo.attributes.position, n = pts.length;
    for (let i = 0; i <= 36; i++) {
      const phi = i / 36 * TAU;
      const drip = 0.012 + 0.035 * Math.max(0, Math.sin(phi * 5)) ** 2;
      const k0 = i * n, k1 = i * n + n - 1;
      p.setY(k1, p.getY(k1) - drip); p.setY(k0, p.getY(k0) - 0.012);
    }
    geo.computeVertexNormals();
    return geo;
  });
  P(s, icing, M(0xff7eb9, { r: 0.35, ds: true }), [0, 0.004, 0]);
  const cols = [0xff3b30, 0x2f6bff, 0xffd60a, 0x2ecc40, 0xffffff, 0x9b4dff, 0x00d1e8];
  const rnd = rng(9);
  const spr = box(0.016, 0.016, 0.05);
  for (let i = 0; i < 26; i++) {
    const phi = rnd() * TAU, a = 0.2 * PI + rnd() * 0.6 * PI;
    const R = 0.24 - 0.12 * Math.cos(a), y = 0.12 * Math.sin(a) + 0.006;
    P(s, spr, M(cols[i % cols.length], { r: 0.4 }), [Math.sin(phi) * R, y, Math.cos(phi) * R], [rnd() * 0.6, rnd() * TAU, 0]);
  }
};

// --- pocket watch -------------------------------------------------------------------
HB.pocket_watch = (g) => {
  const gold = M(0xf2c14e, { r: 0.28, m: 0.5, e: 0x2a1c00 });
  const w = S(g, [0, 0.23, 0], [-0.32, 0.25, 0]);
  P(w, cyl(0.22, 0.22, 0.08, 32), gold, [0, 0, 0], [PI / 2, 0, 0]);
  P(w, tor(0.205, 0.025, 6, 32), gold, [0, 0, 0.04]);
  P(w, cyl(0.185, 0.185, 0.01, 32), M(0xfff8e7, { r: 0.4 }), [0, 0, 0.042], [PI / 2, 0, 0]);
  const ink = M(0x2b2b33, { r: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, big = i % 3 === 0;
    P(w, box(0.012, big ? 0.04 : 0.022, 0.006), ink, [Math.sin(a) * 0.155, Math.cos(a) * 0.155, 0.049], [0, 0, -a]);
  }
  P(w, box(0.016, 0.09, 0.006), ink, [-0.035, 0.022, 0.054], [0, 0, 1.0]);
  P(w, box(0.012, 0.13, 0.006), ink, [0.056, 0.032, 0.058], [0, 0, -1.05]);
  P(w, cyl(0.016, 0.016, 0.014, 10), gold, [0, 0, 0.058], [PI / 2, 0, 0]);
  P(w, cyl(0.035, 0.035, 0.05, 10), gold, [0, 0.245, 0]);
  P(w, tor(0.05, 0.013, 6, 16), gold, [0, 0.31, 0], [0, PI / 2, 0]);
  // chain of little links draping down the back
  const chain = curveOf([[0, 0.55, -0.12], [-0.12, 0.42, -0.25], [-0.25, 0.18, -0.3], [-0.3, -0.05, -0.25], [-0.26, -0.2, -0.15]]);
  const link = tor(0.022, 0.007, 4, 8);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, p = chain.getPointAt(t), tg = chain.getTangentAt(t);
    const m = P(g, link, gold, [p.x, p.y, p.z]);
    m.quaternion.setFromUnitVectors(V3(1, 0, 0), tg);
    if (i % 2) m.rotateX(PI / 2);
  }
};

// --- rubber glove crest ---------------------------------------------------------
HB.rubber_glove = (g) => {
  const blue = M(0x4fb3ff, { r: 0.35 });
  P(g, cyl(0.1, 0.13, 0.14, 16), blue, [0, 0.08, 0]);
  P(g, tor(0.13, 0.025, 6, 20), M(0x3d9ae6, { r: 0.35 }), [0, 0.02, 0], [PI / 2, 0, 0]);
  P(g, sph(0.2, 18, 14), blue, [0, 0.32, 0], null, [0.55, 1, 1.15]);
  const fingers = [[-0.75, 0.16], [-0.26, 0.2], [0.24, 0.19], [0.7, 0.15]];
  for (const [a, len] of fingers) {
    const d = 0.2 + len / 2 + 0.02;
    P(g, capsule(0.066, len, 4, 10), blue, [0, 0.32 + Math.cos(a) * d, Math.sin(a) * d * 1.1], [a, 0, 0]);
  }
  P(g, capsule(0.066, 0.12, 4, 10), blue, [0, 0.2, 0.3], [1.5, 0, 0]);
};

// --- spoon propeller beanie -----------------------------------------------------
HB.twist_propeller = (g) => {
  const cols = [0xff3b30, 0xffd60a, 0x2f6bff, 0x2ecc40];
  for (let i = 0; i < 4; i++) P(g, sph(0.38, 8, 8, i * PI / 2, PI / 2, 0, PI / 2), M(cols[i], { r: 0.7, ds: true }), [0, -0.22, 0]);
  P(g, tor(0.375, 0.02, 5, 32), M(0xffffff, { r: 0.7 }), [0, -0.22, 0], [PI / 2, 0, 0]);
  P(g, cyl(0.045, 0.05, 0.03, 12), M(0xffffff, { r: 0.5 }), [0, 0.165, 0]);
  P(g, cyl(0.012, 0.012, 0.2, 6), SILVER(), [0, 0.27, 0]);
  const helix = [];
  for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU * 3; helix.push([Math.cos(a) * 0.022, 0.3 + i / 24 * 0.06, Math.sin(a) * 0.022]); }
  P(g, tube('twistTie', curveOf(helix), 40, 0.007, 4), M(0x2ecc40, { r: 0.6 }));
  P(g, tube('twistTieEnd', curveOf([[0.02, 0.36, 0], [0.05, 0.39, 0.02], [0.06, 0.43, 0.0]]), 6, 0.007, 4), M(0x2ecc40, { r: 0.6 }));
  const spoonCols = [0xff8c42, 0x2ec4b6];
  for (let k = 0; k < 2; k++) {
    const sp = S(g, [0, 0.36, 0], [0, k * PI + 0.3, 0]);
    const blade = S(sp, null, [0.35, 0, 0]);
    const m = M(spoonCols[k], { r: 0.3, ds: true });
    P(blade, box(0.26, 0.012, 0.04), m, [0.15, 0, 0]);
    P(blade, sph(0.075, 12, 8, 0, TAU, PI / 2, PI / 2), m, [0.34, 0.012, 0], null, [1.3, 0.35, 0.85]);
  }
};

// --- banana peel ------------------------------------------------------------------
const peelFn = (inner) => (u, v, out) => {
  const uu = inner ? u : 1 - u;
  const w = 1.05 * Math.pow(Math.sin(PI * (0.1 + 0.9 * v)), 0.8) + 0.02;
  const phi = (uu - 0.5) * w;
  const th = 0.12 + v * 1.75;
  const R = (inner ? 0.374 : 0.38) + Math.max(0, v - 0.55) * 0.35;
  out.set(R * Math.sin(th) * Math.sin(phi), -0.33 + R * Math.cos(th), R * Math.sin(th) * Math.cos(phi));
};
HB.banana_peel = (g) => {
  const outer = sheet('peelOut', 6, 14, peelFn(false));
  const inner = sheet('peelIn', 6, 14, peelFn(true));
  const yellow = M(0xffe135, { r: 0.6, tex: 'banana' });
  const cream = M(0xfff3c4, { r: 0.8 });
  for (let k = 0; k < 4; k++) {
    const p = S(g, null, [0, PI / 4 + k * PI / 2 + (k % 2) * 0.15, 0]);
    P(p, outer, yellow);
    P(p, inner, cream);
  }
  P(g, cyl(0.035, 0.05, 0.1, 8), M(0x8a6a2a, { r: 0.8 }), [0, 0.08, 0]);
  P(g, cyl(0.036, 0.036, 0.02, 8), M(0x3d2a12, { r: 0.9 }), [0, 0.14, 0]);
};

// --- snail's spare shell --------------------------------------------------------
HB.snail_shell = (g) => {
  const turns = 2.5, k = Math.log(0.23 / 0.012);
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, th = -(1 - t) * turns * TAU;
    const rho = 0.23 * Math.exp(k * (t - 1));
    pts.push(new THREE.Vector3(0.2 * Math.pow(1 - t, 1.3), -rho * Math.cos(th), rho * Math.sin(th)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = taperTube('snail', curve, 90, 12, t => { const q = curve.getPointAt(t); return 0.006 + 0.5 * Math.hypot(q.y, q.z); });
  const s = S(g, [0, 0.35, 0], [0, 0.7, 0]);
  P(s, geo, M(0xffffff, { r: 0.45, tex: 'shell', ds: true }));
  P(s, sph(0.008, 6, 4), M(0x8a5a35, { r: 0.5 }), [pts[0].x, pts[0].y, pts[0].z]);
};

// --- crazy straw ----------------------------------------------------------------------
HB.crazy_straw = (g) => {
  canvasTex('hat_straw', 2048, 16, (ctx, W, H) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff4fa3';
    for (let i = 0; i < 64; i++) ctx.fillRect(i * W / 64, 0, W / 128, H);
  });
  const pts = [[0, -0.05, 0], [0, 0.1, 0], [0, 0.25, 0]];
  for (let i = 1; i <= 16; i++) { const a = PI - i / 16 * TAU; pts.push([0.15 + Math.cos(a) * 0.15, 0.25 + Math.sin(a) * 0.15, 0.08 * i / 16]); }
  pts.push([0, 0.4, 0.08], [0, 0.55, 0.08], [0.12, 0.65, 0.08], [-0.12, 0.78, 0.08], [0.12, 0.9, 0.08], [0, 1.0, 0.08]);
  for (let i = 1; i <= 16; i++) { const a = i / 16 * TAU; pts.push([-0.08 * i / 16, 1.0 + Math.sin(a) * 0.15, -0.07 + Math.cos(a) * 0.15]); }
  pts.push([-0.08, 1.15, 0.08], [-0.08, 1.3, 0.08], [-0.06, 1.42, 0.08], [0.02, 1.5, 0.08], [0.12, 1.53, 0.08]);
  const curve = curveOf(pts);
  P(g, tube('crazyStraw', curve, 150, 0.035, 7), M(0xffffff, { r: 0.25, tex: 'straw' }));
  const end = curve.getPointAt(1);
  P(g, tor(0.035, 0.006, 4, 12), M(0xff4fa3, { r: 0.25 }), [end.x, end.y, end.z], [0, PI / 2, 0]);
  P(g, sph(0.07, 12, 8), M(0xff4fa3, { r: 0.4 }), [0, -0.02, 0], null, [1, 0.45, 1]);
};

// --- snow globe ---------------------------------------------------------------------
HB.snow_globe = (g) => {
  P(g, cyl(0.26, 0.3, 0.12, 24), M(0x8b4a2b, { r: 0.6 }), [0, 0.04, 0]);
  P(g, tor(0.26, 0.014, 5, 30), M(0xf2c94c, { r: 0.3, m: 0.5 }), [0, 0.1, 0], [PI / 2, 0, 0]);
  P(g, box(0.12, 0.05, 0.01), M(0xf2c94c, { r: 0.3, m: 0.5 }), [0, 0.04, 0.29], [-0.3, 0, 0]);
  const snow = M(0xffffff, { r: 0.9 });
  P(g, sph(0.22, 16, 8, 0, TAU, 0, PI / 2), snow, [0, 0.12, 0], null, [1, 0.35, 1]);
  const pine = M(0x2e8b57, { r: 0.8, flat: true });
  P(g, cyl(0.015, 0.015, 0.05, 5), M(0x6b4423, { r: 0.9 }), [0.08, 0.215, -0.04]);
  P(g, cone(0.075, 0.14, 7), pine, [0.08, 0.29, -0.04]);
  P(g, cone(0.055, 0.11, 7), pine, [0.08, 0.36, -0.04]);
  P(g, sph(0.05, 12, 10), snow, [-0.08, 0.235, 0.05]);
  P(g, sph(0.035, 12, 10), snow, [-0.08, 0.305, 0.05]);
  P(g, G('carrot', () => new THREE.ConeGeometry(0.01, 0.04, 6).rotateX(PI / 2)), M(0xff8c1a, { r: 0.6 }), [-0.08, 0.305, 0.095]);
  const flake = ico(0.012, 0);
  const rnd = rng(21);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, r = rnd() * 0.2;
    P(g, flake, snow, [Math.cos(a) * r, 0.28 + rnd() * 0.25, Math.sin(a) * r]);
  }
  P(g, sph(0.27, 24, 16), M(0xe6f6ff, { r: 0.05, m: 0.1, op: 0.22, e: 0x0a1a2a }), [0, 0.36, 0]);
};

// --- tiny Gerald (sleeping, bald, bearded) ------------------------------------------
function zShape() {
  const p = [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.3], [-0.15, -0.3], [0.5, -0.3], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.3], [0.15, 0.3], [-0.5, 0.3]];
  return new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x, y)));
}
HB.gerald_head = (g) => {
  const skin = M(0xf2c09a, { r: 0.45 });
  const ginger = M(0xc0622f, { r: 0.95 });
  P(g, cyl(0.08, 0.11, 0.14, 12), skin, [0, 0.05, 0]);
  P(g, sph(0.2, 20, 14), skin, [0, 0.33, 0], null, [1, 1.05, 0.95]);
  for (const x of [-1, 1]) {
    P(g, sph(0.06, 10, 8), skin, [x * 0.2, 0.33, -0.01], null, [0.5, 1, 0.8]);
    const eye = P(g, tor(0.035, 0.009, 4, 10, PI), M(0x3a2418, { r: 0.6 }), [x * 0.075, 0.375, 0.178], [-0.25, 0, PI]);
    eye.scale.set(1, 0.8, 1);
    P(g, capsule(0.016, 0.06, 3, 6), ginger, [x * 0.078, 0.425, 0.17], [0, 0, PI / 2 + x * 0.18]);
    P(g, sph(0.03, 8, 6), M(0xff9e9e, { r: 0.7 }), [x * 0.12, 0.31, 0.15], null, [1, 0.7, 0.4]);
    P(g, capsule(0.03, 0.09, 3, 8), ginger, [x * 0.058, 0.262, 0.185], [0, 0, x * 1.15]);
  }
  P(g, sph(0.052, 12, 10), M(0xe8a183, { r: 0.5 }), [0, 0.315, 0.2], null, [1, 0.9, 1]);
  const beard = G('geraldBeard', () => lumpy(new THREE.SphereGeometry(0.2, 16, 10), 0.018, 5, 22));
  P(g, beard, ginger, [0, 0.18, 0.07], null, [1.0, 0.85, 0.72]);
  P(g, sph(0.022, 8, 6), M(0x5a2a20, { r: 0.8 }), [0, 0.232, 0.205], null, [1, 0.7, 0.4]);
  P(g, tube('combover', curveOf([[-0.05, 0.53, 0.0], [0.0, 0.565, 0.03], [0.05, 0.55, 0.06], [0.04, 0.52, 0.09], [0.0, 0.53, 0.08]]), 12, 0.008, 4), ginger);
  const zMat = M(0x9fd3ff, { r: 0.4, e: 0x224466 });
  const zGeo = extrude('zzz', zShape(), 0.2);
  P(g, zGeo, zMat, [0.22, 0.6, 0.05], [0, -0.3, 0.15], [0.08, 0.08, 0.08]);
  P(g, zGeo, zMat, [0.32, 0.75, 0.02], [0, -0.3, 0.25], [0.11, 0.11, 0.11]);
};

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------
// buildEyes(id, colorId?) -> Group at the eye anchor (0,0.92,0.38), facing +Z.
//   userData.pupils : Object3Ds resting at position (0,0,0); nudge .position.x/.y by up to +-0.05.
//   userData.lids   : Object3Ds; scale.y 0 = open, 1 = closed.
//   userData.setSkin(colorIdOrHex) : recolour the lids to match the body (optional colorId arg does this too).
//   userData.spin   : (spiral eyes only) Object3Ds the game may rotate about z for a hypnotic swirl.

const DEFAULT_SKIN = 0x2ecc40;
const _lidMats = new Map();

// colour of the body around the eyes (gradients blend toward hex2 near the top)
function mixHex(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
function skinHexOf(v) {
  if (typeof v === "number") return v;
  const c = colorDef(v);
  return c.pattern === "gradient" ? mixHex(c.hex, c.hex2, 0.7) : c.hex;
}
function lidMat(hex) {
  let m = _lidMats.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 });
    m.name = 'lid';
    _lidMats.set(hex, m);
  }
  return m;
}

const EYE_WHITE = () => M(0xffffff, { r: 0.3 });
const PUPIL = () => M(0x111118, { r: 0.2 });
const GLINT = () => M(0xffffff, { e: 0xffffff, ei: 0.6, r: 0.2 });

// A fully-open lid has scale.y = 0, which gives degenerate normals (renders as a black sliver).
// Make the pivot hide itself whenever its scale.y is ~0, transparently to the game.
function autoHide(obj) {
  const sc = obj.scale;
  let y = sc.y;
  Object.defineProperty(sc, "y", {
    get() { return y; },
    set(v) { y = v; obj.visible = v > 0.002; },
    enumerable: true, configurable: true,
  });
}

// Lid = front half-dome hanging from a pivot at the top of the eye.
function addLid(parent, rx, ry, rz, ctx, fixed) {
  const pivot = new THREE.Group();
  pivot.position.set(0, ry * 1.05, 0);
  parent.add(pivot);
  const m = new THREE.Mesh(sph(1, 16, 8, 0, PI, 0, PI), ctx.lid);
  m.position.set(0, -ry * 1.05, 0);
  m.scale.set(rx * 1.1, ry * 1.08, rz);
  m.userData.isLid = true;
  pivot.add(m);
  if (fixed !== undefined) pivot.scale.y = fixed; // static droopy lid, not blinkable
  else { autoHide(pivot); pivot.scale.y = 0; ctx.lids.push(pivot); }
  return pivot;
}

function pupilGroup(parent, ctx) {
  const p = new THREE.Group();
  parent.add(p);
  ctx.pupils.push(p);
  return p;
}

// standard eyeball. o: pr (pupil radius ratio), pOff [x,y], iris colour, pupil:false
function eyeBall(g, x, y, r, ctx, o = {}) {
  const e = S(g, [x, y, 0]);
  P(e, sph(1, 18, 14), EYE_WHITE(), null, null, [r, r, r * 0.6]);
  const pupil = pupilGroup(e, ctx);
  if (o.pupil !== false) {
    const pr = r * (o.pr ?? 0.48);
    const [ox, oy] = o.pOff ?? [0, 0];
    if (o.iris) P(pupil, sph(1, 14, 10), M(o.iris, { r: 0.3 }), [ox, oy, r * 0.44], null, [pr * 1.45, pr * 1.45, pr * 0.4]);
    P(pupil, sph(1, 14, 10), PUPIL(), [ox, oy, r * 0.5], null, [pr, pr, pr * 0.45]);
    P(pupil, sph(1, 8, 6), GLINT(), [ox + pr * 0.35, oy + pr * 0.4, r * 0.5 + pr * 0.4], null, pr * 0.3);
  }
  addLid(e, r, r, r * 0.95, ctx);
  return { e, pupil };
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.32, -0.55, -0.1, -0.5, 0.2);
  s.bezierCurveTo(-0.45, 0.48, -0.12, 0.55, 0, 0.3);
  s.bezierCurveTo(0.12, 0.55, 0.45, 0.48, 0.5, 0.2);
  s.bezierCurveTo(0.55, -0.1, 0.15, -0.32, 0, -0.5);
  return s;
}

const EB = {
  normal(g, ctx) {
    for (const s of [-1, 1]) eyeBall(g, s * 0.13, 0, 0.105, ctx);
  },
  sleepy(g, ctx) {
    for (const s of [-1, 1]) {
      const { e } = eyeBall(g, s * 0.13, -0.01, 0.1, ctx, { pOff: [0, -0.03], pr: 0.45 });
      addLid(e, 0.1, 0.1, 0.1, ctx, 0.5);
    }
  },
  angry(g, ctx) {
    const brow = M(0x1b1b1f, { r: 0.6 });
    for (const s of [-1, 1]) {
      eyeBall(g, s * 0.13, 0, 0.1, ctx, { iris: 0xff3b30, pr: 0.4 });
      P(g, roundedBox(0.17, 0.04, 0.05, 0.015, 1), brow, [s * 0.125, 0.115, 0.06], [0, 0, s * 0.42]);
    }
  },
  googly(g, ctx) {
    const clear = M(0xf4fbff, { r: 0.05, op: 0.3 });
    for (const [x, y, r] of [[-0.14, 0.015, 0.13], [0.15, -0.01, 0.105]]) {
      const e = S(g, [x, y, 0]);
      P(e, cyl(r, r, 0.03, 24), M(0xffffff, { r: 0.4 }), [0, 0, 0.02], [PI / 2, 0, 0]);
      P(e, tor(r, 0.008, 4, 24), M(0xdddddd, { r: 0.4 }), [0, 0, 0.035]);
      P(e, sph(r * 0.97, 16, 8, 0, TAU, 0, PI / 2), clear, [0, 0, 0.035], [PI / 2, 0, 0], [1, 0.45, 1]);
      const p = pupilGroup(e, ctx);
      P(p, cyl(r * 0.55, r * 0.55, 0.012, 18), PUPIL(), [0, -r * 0.38, 0.042], [PI / 2, 0, 0]);
      addLid(e, r, r, 0.09, ctx);
    }
  },
  cyclops(g, ctx) {
    eyeBall(g, 0, 0.02, 0.17, ctx, { pr: 0.42, iris: 0x2ecc71 });
  },
  hearts(g, ctx) {
    const red = M(0xff2d55, { r: 0.3, e: 0x7a0022 });
    const geo = extrude('heart', heartShape(), 0.25, 0.05);
    for (const s of [-1, 1]) {
      const { pupil } = eyeBall(g, s * 0.13, 0, 0.105, ctx, { pupil: false });
      P(pupil, geo, red, [0, 0, 0.066], null, [0.13, 0.13, 0.12]);
      P(pupil, sph(1, 8, 6), GLINT(), [0.03, 0.025, 0.09], null, 0.012);
    }
  },
  x_x(g, ctx) {
    const ink = M(0x1b1b1f, { r: 0.5 });
    const bar = roundedBox(0.13, 0.032, 0.03, 0.012, 1);
    for (const s of [-1, 1]) {
      const e = S(g, [s * 0.13, 0, 0]);
      const p = pupilGroup(e, ctx);
      P(p, bar, ink, [0, 0, 0.025], [0, 0, PI / 4]);
      P(p, bar, ink, [0, 0, 0.025], [0, 0, -PI / 4]);
      addLid(e, 0.075, 0.075, 0.07, ctx);
    }
  },
  shades(g, ctx) {
    const black = M(0x111114, { r: 0.08, m: 0.4 });
    const frame = M(0x222228, { r: 0.4 });
    const glint = M(0xffffff, { e: 0xffffff, ei: 0.5, r: 0.2 });
    for (const s of [-1, 1]) {
      const lens = S(g, [s * 0.135, 0.01, 0]);
      P(lens, cyl(0.105, 0.105, 0.03, 24), black, [0, 0, 0.075], [PI / 2, 0, 0], [1.15, 1, 0.85]);
      const p = pupilGroup(lens, ctx);
      P(p, box(0.06, 0.013, 0.004), glint, [0.035, 0.035, 0.092], [0, 0, 0.6]);
      P(p, box(0.025, 0.01, 0.004), glint, [0.065, 0.005, 0.092], [0, 0, 0.6]);
      const lid = new THREE.Group(); lid.scale.y = 0; lens.add(lid); ctx.lids.push(lid);
      P(g, box(0.02, 0.022, 0.3), frame, [s * 0.255, 0.05, -0.08], [0, s * 0.3, 0]);
    }
    P(g, box(0.52, 0.03, 0.025), frame, [0, 0.085, 0.072]);
    P(g, box(0.07, 0.02, 0.02), frame, [0, 0.04, 0.085]);
  },
  tiny(g, ctx) {
    for (const s of [-1, 1]) {
      const e = S(g, [s * 0.1, 0, 0]);
      const p = pupilGroup(e, ctx);
      P(p, sph(0.04, 12, 10), PUPIL(), [0, 0, 0.02]);
      P(p, sph(0.012, 6, 4), GLINT(), [0.014, 0.016, 0.055]);
      addLid(e, 0.045, 0.045, 0.075, ctx);
    }
  },
  spiral(g, ctx) {
    const r = 0.11;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * 2.5 * TAU, rr = 0.078 * t;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.6 * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) + 0.004));
    }
    const geo = tube('eyeSpiral', new THREE.CatmullRomCurve3(pts), 60, 0.008, 4);
    g.userData.spin = [];
    for (const s of [-1, 1]) {
      const { pupil } = eyeBall(g, s * 0.13, 0, r, ctx, { pupil: false });
      const sp = S(pupil, null, [0, 0, s > 0 ? 0 : PI]);
      P(sp, geo, M(0x6a1b9a, { r: 0.4 }));
      g.userData.spin.push(sp);
    }
  },
  monocle(g, ctx) {
    eyeBall(g, -0.13, -0.005, 0.095, ctx);
    eyeBall(g, 0.14, 0.01, 0.115, ctx, { pr: 0.5 });
    const gold = M(0xf2c14e, { r: 0.3, m: 0.5, e: 0x2a1c00 });
    P(g, tor(0.13, 0.013, 6, 28), gold, [0.14, 0.01, 0.078]);
    P(g, cyl(0.125, 0.125, 0.006, 24), M(0xe6f6ff, { r: 0.05, op: 0.25 }), [0.14, 0.01, 0.076], [PI / 2, 0, 0]);
    P(g, tube('monocleChain', curveOf([[0.25, -0.06, 0.07], [0.3, -0.2, 0.08], [0.26, -0.35, 0.12], [0.18, -0.42, 0.15]]), 16, 0.006, 4), gold);
    P(g, capsule(0.016, 0.1, 3, 6), M(0x1b1b1f, { r: 0.6 }), [-0.13, 0.13, 0.05], [0, 0, PI / 2 - 0.25]);
  },
};

export function buildEyes(id, colorId) {
  const g = new THREE.Group();
  g.name = 'eyes:' + id;
  const skinHex = colorId === undefined || colorId === null ? DEFAULT_SKIN : skinHexOf(colorId);
  const ctx = { pupils: [], lids: [], lid: lidMat(skinHex) };
  (EB[id] || EB.normal)(g, ctx);
  g.userData.pupils = ctx.pupils;
  g.userData.lids = ctx.lids;
  g.userData.setSkin = (v) => {
    const mat = lidMat(skinHexOf(v));
    g.traverse(o => { if (o.isMesh && o.userData.isLid) o.material = mat; });
  };
  return g;
}
