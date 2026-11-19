// Gerald's body and the bed, as one big height map that the physics and the renderer share.
//
// Gerald lies face up with his head toward -Z (the headboard) and his feet toward +Z. X runs across the bed.
// Everything the goblins can stand on is a height y = H(x, z): the mattress, the pillow, Gerald himself and the
// blanket over his legs. A few things are not part of the height map and are "solids" instead (nightstands, lamp,
// alarm clock, the headboard, hair strands for bumping into).
//
// Gerald has several sleeping poses (arms and legs in different places; his head and body never move). A roll-over
// morphs the height map from one pose to another. Breathing lifts his chest, his lips part when he snores, his
// hands can lift off the bed to swat, and twitches are temporary bumps. heightAt() includes all of that, exactly the
// same way the renderer's shader does, so goblins stand where they appear to stand.
import { REGION } from './data.js';

export const BED = { x0: -50, x1: 50, z0: -80, z1: 76 };
const CELL = 0.5;
const X0 = BED.x0, Z0 = BED.z0;
export const GRID = {
  cell: CELL, x0: X0, z0: Z0,
  nx: Math.round((BED.x1 - BED.x0) / CELL) + 1,
  nz: Math.round((BED.z1 - BED.z0) / CELL) + 1,
};
const NX = GRID.nx, NZ = GRID.nz, N = NX * NZ;
export const FLOOR_Y = -55;
export const NIGHTSTAND_TOP = 1.2;

// what a vertex is made of (for the renderer's colours and for footstep sounds)
export const MAT = { sheet: 0, pillow: 1, skin: 2, shirt: 3, blanket: 4, hair: 5, beard: 6, lips: 7, lid: 8, sock: 9, brow: 10, pocket: 11, button: 12, nose: 13, navel: 14, mouth: 15, toe: 16, ear: 17 };

// ---------------------------------------------------------------- shapes
const NEG = -1e4;
// A height map can't hold the under-side of a round shape, so instead of a sheer wall at the edge, every shape
// curves into a "skirt" that slopes down to the bed (like a body sinking into a soft mattress). q is the distance
// from the centre in radii; past q = 0.9 the dome hands over smoothly (matching slope) to a skirt that reaches
// y = 0 at q = 1 + SKIRT.
const SKIRT = 0.5, Q0 = 0.9, S0 = Math.sqrt(1 - Q0 * Q0), DS0 = -Q0 / S0;
function profile(q, cy, ry, sk = SKIRT) {
  if (q < Q0) return cy + ry * Math.sqrt(1 - q * q);
  const span = 1 - Q0 + sk;
  const u = (q - Q0) / span;
  if (u >= 1) return NEG;
  const H0 = cy + ry * S0, m0 = DS0 * ry * span;
  const u2 = u * u, u3 = u2 * u;
  return H0 * (2 * u3 - 3 * u2 + 1) + m0 * (u3 - 2 * u2 + u);
}
function ellTop(x, z, s) {
  const dx = (x - s.x) / s.rx, dz = (z - s.z) / s.rz;
  return profile(Math.sqrt(dx * dx + dz * dz), s.y, s.ry, s.sk);
}
function capTop(x, z, s) {
  const abx = s.bx - s.ax, abz = s.bz - s.az;
  const L = abx * abx + abz * abz;
  let t = L > 1e-6 ? ((x - s.ax) * abx + (z - s.az) * abz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.ax + abx * t, cz = s.az + abz * t, cy = s.ay + (s.by - s.ay) * t;
  const r = s.r0 + (s.r1 - s.r0) * t;
  const h = Math.hypot(x - cx, z - cz);
  return profile(h / r, cy, r, s.sk);
}
function smax(a, b, k) {
  if (a <= NEG) return b;
  if (b <= NEG) return a;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}
const ell = (x, y, z, rx, ry, rz, mat, region, extra = {}) => ({ kind: 'e', x, y, z, rx, ry, rz, mat, region, ...extra });
const cap = (a, b, r0, r1, mat, region, extra = {}) => ({ kind: 'c', ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], r0, r1: r1 ?? r0, mat, region, ...extra });
const top = (x, z, s) => (s.kind === 'e' ? ellTop(x, z, s) : capTop(x, z, s));
const K = 1 + SKIRT;
const bbox = s => (s.kind === 'e'
  ? [s.x - s.rx * K, s.x + s.rx * K, s.z - s.rz * K, s.z + s.rz * K]
  : [Math.min(s.ax, s.bx) - Math.max(s.r0, s.r1) * K, Math.max(s.ax, s.bx) + Math.max(s.r0, s.r1) * K, Math.min(s.az, s.bz) - Math.max(s.r0, s.r1) * K, Math.max(s.az, s.bz) + Math.max(s.r0, s.r1) * K]);

// ---------------------------------------------------------------- Gerald's fixed parts: head, face, torso
const HEAD = { x: 0, y: 14.5, z: -56 };
function fixedParts() {
  const p = [];
  // torso: chest + big round belly + shoulders + neck
  p.push(cap([0, 9, -35], [0, 9, -13], 15, 15, MAT.shirt, 'chest'));
  p.push(ell(0, 10, -6, 16, 17, 13, MAT.shirt, 'belly'));
  p.push(ell(-14, 8, -33, 7.5, 8.5, 7.5, MAT.shirt, 'chest'));
  p.push(ell(14, 8, -33, 7.5, 8.5, 7.5, MAT.shirt, 'chest'));
  p.push(cap([0, 12, -45], [0, 10, -37], 6.8, 7, MAT.skin, 'neck'));
  // head + face (face points up)
  p.push(ell(HEAD.x, HEAD.y, HEAD.z, 11.5, 11, 13, MAT.skin, 'cheek', { sk: 0.26 }));
  p.push(ell(0, 22.3, -61.5, 9, 3, 3.2, MAT.skin, 'brow'));                 // brow ridge
  p.push(ell(-4.7, 24.6, -60.6, 3.4, 1.2, 1.3, MAT.brow, 'brow'));          // eyebrows
  p.push(ell(4.7, 24.6, -60.6, 3.4, 1.2, 1.3, MAT.brow, 'brow'));
  p.push(ell(-4.8, 23.4, -57.8, 2.9, 1.7, 2.1, MAT.lid, 'eyes'));           // closed eyelids
  p.push(ell(4.8, 23.4, -57.8, 2.9, 1.7, 2.1, MAT.lid, 'eyes'));
  p.push(ell(0, 23.5, -54.2, 2.5, 5.2, 4.0, MAT.nose, 'nose'));             // nose bridge
  p.push(ell(0, 26.6, -52.6, 3.2, 3.6, 3.0, MAT.nose, 'nose'));             // round button nose
  p.push(ell(-7.2, 21.6, -51, 4.6, 3.0, 4.6, MAT.skin, 'cheek'));
  p.push(ell(7.2, 21.6, -51, 4.6, 3.0, 4.6, MAT.skin, 'cheek'));
  p.push(ell(-2.7, 23.6, -49.6, 3.1, 1.2, 1.4, MAT.beard, 'beard'));        // moustache
  p.push(ell(2.7, 23.6, -49.6, 3.1, 1.2, 1.4, MAT.beard, 'beard'));
  p.push(ell(0, 22.7, -47.7, 4.6, 1.4, 1.4, MAT.lips, 'mouth'));            // lips
  p.push(ell(0, 22.3, -45.4, 4.2, 1.4, 1.5, MAT.lips, 'mouth'));
  p.push(ell(0, 18.5, -42.5, 9.5, 5.5, 6.2, MAT.beard, 'beard'));           // beard
  p.push(ell(-6.5, 17.5, -45.5, 4.5, 4, 5, MAT.beard, 'beard'));
  p.push(ell(6.5, 17.5, -45.5, 4.5, 4, 5, MAT.beard, 'beard'));
  p.push(ell(-11.9, 13.5, -56, 2.5, 6.2, 4.3, MAT.ear, 'ear', { sk: 0.3 }));             // ears
  p.push(ell(11.9, 13.5, -56, 2.5, 6.2, 4.3, MAT.ear, 'ear', { sk: 0.3 }));
  p.push(ell(0, 15.2, -60.5, 12.0, 11.0, 12.6, MAT.hair, 'hair', { zMax: -63, sk: 0.26 }));  // hair, only toward the headboard
  // pajama pocket (a flap with a little pit for the pocket watch) and shirt buttons
  p.push(ell(8.5, 23.0, -27, 3.6, 1.6, 3.0, MAT.pocket, 'pocket'));
  for (const z of [-36, -30, -24, -18, -11]) p.push(ell(0, z < -14 ? 23.6 : 26.4, z, 0.9, 0.7, 0.9, MAT.button, 'chest'));
  return p;
}
// pits are carved out of the surface after the shapes are joined: [x, z, rx, rz, depth, mat, region]
const PITS = [
  [0, -3.5, 1.7, 1.7, 3.2, MAT.navel, 'navel'],          // belly button
  [8.5, -27.6, 2.2, 1.2, 2.3, MAT.pocket, 'pocket'],      // pajama pocket
  [-12.3, -56, 1.3, 1.6, 1.2, MAT.ear, 'ear'],            // ear coves (earbuds sit here)
  [12.3, -56, 1.3, 1.6, 1.2, MAT.ear, 'ear'],
];

// ---------------------------------------------------------------- poses: arms and legs
// each pose: arms (with hand parts and a hand rest spot), legs (under the blanket), feet (socks)
function arm(side, sh, el, wr, hand, yaw) {
  const parts = [cap(sh, el, 4.7, 4.3, MAT.shirt, 'arm'), cap(el, wr, 4.3, 3.6, MAT.shirt, 'arm')];
  const hp = [];
  hp.push(ell(hand[0], hand[1], hand[2], 3.6, 2.2, 3.6, MAT.skin, 'hand', { side }));
  // fingers fan out along `yaw` (the direction the fingers point)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), px = Math.cos(yaw), pz = -Math.sin(yaw);
  [-2.3, -0.8, 0.8, 2.3].forEach((o, k) => {
    const len = [3.6, 4.6, 4.4, 3.4][k];
    const bx = hand[0] + px * o + fx * 2.4, bz = hand[2] + pz * o + fz * 2.4;
    hp.push(cap([bx, hand[1], bz], [bx + fx * len, hand[1] - 0.4, bz + fz * len], 0.95, 0.85, MAT.skin, 'hand', { side }));
  });
  const th = side === 1 ? -1 : 1;   // thumb on the inside
  hp.push(cap([hand[0] + px * 3.2 * th, hand[1], hand[2]], [hand[0] + px * 5.2 * th + fx * 2, hand[1] - 0.2, hand[2] + pz * 5.2 * th + fz * 2], 1.0, 0.9, MAT.skin, 'hand', { side }));
  return { parts, hand: hp, rest: { x: hand[0], y: hand[1], z: hand[2], yaw } };
}
function leg(hip, knee, ankle, foot) {
  return {
    legs: [cap(hip, knee, 8, 7, MAT.blanket, 'blanket'), cap(knee, ankle, 7, 5, MAT.blanket, 'blanket')],
    feet: [cap(ankle, foot, 4.3, 4.0, MAT.sock, 'sock'), ell(foot[0], foot[1] + 1.2, foot[2], 3.4, 2.8, 3.0, MAT.toe, 'sock')],
  };
}
export const POSES = {
  back: () => ({
    arms: [arm(1, [-16, 8, -33], [-21, 5, -15], [-22, 4, 1], [-22.5, 3.2, 6.5], 0.05), arm(2, [16, 8, -33], [21, 5, -15], [22, 4, 1], [22.5, 3.2, 6.5], -0.05)],
    legs: [leg([-8, 8, 4], [-9, 7, 33], [-9, 5, 57], [-9.4, 15.5, 61]), leg([8, 8, 4], [9, 7, 33], [9, 5, 57], [9.4, 15.5, 61])],
  }),
  starfish: () => ({
    arms: [arm(1, [-16, 8, -33], [-29, 4.5, -45], [-37, 3.5, -55], [-40, 3.2, -60], -2.55), arm(2, [16, 8, -33], [29, 4.5, -45], [37, 3.5, -55], [40, 3.2, -60], 2.55)],
    legs: [leg([-8, 8, 4], [-16, 7, 32], [-23, 5, 55], [-24, 15, 59]), leg([8, 8, 4], [16, 7, 32], [23, 5, 55], [24, 15, 59])],
  }),
  hug: () => ({
    arms: [arm(1, [-16, 8, -33], [-20, 12, -17], [-5, 24, -13], [2, 25.5, -11], 1.45), arm(2, [16, 8, -33], [20, 12, -17], [5, 25, -9], [-2, 26.2, -6.5], -1.45)],
    legs: [leg([-8, 8, 4], [-9, 7, 33], [-9, 5, 57], [-9.4, 15.5, 61]), leg([8, 8, 4], [10, 21, 25], [9, 5, 44], [9.4, 14, 48])],
  }),
  reach: () => ({
    arms: [arm(1, [-16, 8, -33], [-25, 11, -50], [-15, 9.5, -63], [-9, 9.3, -66], 1.3), arm(2, [16, 8, -33], [30, 4.5, -24], [39, 3.5, -14], [42, 3.2, -9.5], 0.35)],
    legs: [leg([-8, 8, 4], [-5, 7, 32], [3, 6, 55], [3.5, 16, 59]), leg([8, 8, 4], [5, 9, 32], [-3, 9.5, 54], [-3.5, 19, 57])],
  }),
};
export const POSE_IDS = Object.keys(POSES);

// ---------------------------------------------------------------- the bed: sheets, pillow, blanket
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function sheetH(x, z) { return 0.25 * vnoise(x * 0.12, z * 0.12) + 0.12 * vnoise(x * 0.4 + 9, z * 0.4); }
function pillowH(x, z) {
  const dx = Math.abs(x) / 29, dz = Math.abs(z + 63) / 16;
  const d = Math.pow(dx ** 4 + dz ** 4, 0.25);
  if (d >= 1) return NEG;
  return 7.2 * Math.sqrt(1 - d ** 8) + 0.3 * vnoise(x * 0.3, z * 0.3);
}
const BLANKET_Z0 = 1.5, BLANKET_Z1 = 66;
function blanketFold(x, z) { return 0.9 * vnoise(x * 0.08 + 3, z * 0.1) + 0.5 * Math.sin(x * 0.35 + z * 0.05) * vnoise(x * 0.05, z * 0.2); }

// ---------------------------------------------------------------- building a pose's height map
const cellX = i => X0 + (i % NX) * CELL;
const cellZ = i => Z0 + Math.floor(i / NX) * CELL;

function buildPose(name) {
  const pose = POSES[name]();
  const fixed = fixedParts();
  const body = [...fixed, ...pose.arms.flatMap(a => a.parts)];
  const hands = pose.arms.flatMap(a => a.hand);
  const legs = pose.legs.flatMap(l => l.legs);
  const feet = pose.legs.flatMap(l => l.feet);
  const full = new Float32Array(N), base = new Float32Array(N);
  const side = new Uint8Array(N), region = new Uint8Array(N), mat = new Uint8Array(N);
  // shapes only touch their bounding boxes: bucket them by row for speed
  const rows = new Array(NZ).fill(0).map(() => []);
  const addTo = (list, s) => { const [, , za, zb] = bbox(s); for (let r = Math.max(0, Math.floor((za - Z0) / CELL)); r <= Math.min(NZ - 1, Math.ceil((zb - Z0) / CELL)); r++) rows[r].push([list, s]); };
  for (const s of body) addTo('body', s);
  for (const s of hands) addTo('hand', s);
  for (const s of legs) addTo('leg', s);
  for (const s of feet) addTo('foot', s);
  for (let r = 0; r < NZ; r++) {
    const z = Z0 + r * CELL, list = rows[r];
    for (let c = 0; c < NX; c++) {
      const i = r * NX + c, x = X0 + c * CELL;
      let h = sheetH(x, z), m = MAT.sheet, reg = REGION.bed;
      const pil = pillowH(x, z);
      if (pil > h) { h = pil; m = MAT.pillow; reg = REGION.pillow; }
      // blanket over the legs, from the waist to the ankles
      let bl = NEG;
      if (z > BLANKET_Z0 - 2 && z < BLANKET_Z1 + 2) {
        let lg = NEG;
        for (const [k, s] of list) if (k === 'leg') lg = smax(lg, top(x, z, { ...s, r0: s.r0 + 2.5, r1: s.r1 + 2.5 }), 6);
        const edge = Math.min(1, Math.max(0, (z - BLANKET_Z0 + 2) / 2.5)) * Math.min(1, Math.max(0, (BLANKET_Z1 + 2 - z) / 2.5));
        bl = Math.max(0.9 + blanketFold(x, z), lg + 0.6) * edge + (1 - edge) * (h - 0.01);
        // the folded hem at the waist is a thick ridge
        const hz = z - BLANKET_Z0 - 1.2; const hem = Math.exp(-(hz * hz) / 1.6) * 1.4;
        bl += hem * edge;
        if (bl > h) { h = bl; m = MAT.blanket; reg = REGION.blanket; }
      }
      // Gerald's body (smoothly joined), sinking softly into the pillow
      let bh = NEG, bm = 0, breg = 0, best = NEG;
      for (const [k, s] of list) {
        if (k !== 'body') continue;
        if (s.zMax !== undefined && z > s.zMax) continue;
        const t = top(x, z, s);
        if (t <= NEG) continue;
        if (t > best) { best = t; bm = s.mat; breg = REGION[s.region]; }
        bh = smax(bh, t, 2.2);
      }
      if (bh > NEG) {
        // the shirt rides up over the belly: bare skin between the shirt hem and the blanket
        if (bm === MAT.shirt && z > -3 && z < BLANKET_Z0 + 1 && Math.abs(x) < 14) { bm = MAT.skin; breg = REGION.belly; }
        const joined = m === MAT.pillow ? smax(h, bh, 3) : Math.max(h, bh);
        if (bh >= h - 0.3) { m = bm; reg = breg; }
        h = joined;
      }
      // socks poke up out of the blanket
      for (const [k, s] of list) {
        if (k !== 'foot') continue;
        const t = top(x, z, s);
        if (t > h) { h = t; m = s.mat; reg = REGION.sock; }
      }
      // pits
      for (const [px, pz, rx, rz, depth, pm, preg] of PITS) {
        const dx = (x - px) / rx, dz = (z - pz) / rz, d2 = dx * dx + dz * dz;
        if (d2 < 2.2 && (reg !== REGION.blanket)) {
          const f = d2 < 1 ? Math.cos(Math.sqrt(d2) * Math.PI / 2) ** 0.7 : 0;
          if (f > 0) { h -= depth * f; m = pm; reg = REGION[preg]; }
          else if (d2 < 2.2 && preg === 'navel') reg = REGION.navel;
        }
      }
      base[i] = h;
      // hands on top
      let hh = NEG, hs = 0;
      for (const [k, s] of list) {
        if (k !== 'hand') continue;
        const t = top(x, z, s);
        if (t > NEG) { hh = smax(hh, t, 1.2); hs = s.side; }
      }
      if (hh > h) { full[i] = smax(h, hh, 1.0); side[i] = hs; mat[i] = MAT.skin; region[i] = REGION.hand; }
      else { full[i] = h; mat[i] = m; region[i] = reg; }
    }
  }
  // mattress edge rounds off at the sides and the foot
  for (let i = 0; i < N; i++) {
    const x = cellX(i), z = cellZ(i);
    const ex = Math.min(x - BED.x0, BED.x1 - x), ez = BED.z1 - z;
    const e = Math.min(ex, ez);
    if (e < 0.8) { const drop = (0.8 - e) * 1.2; full[i] -= drop; base[i] -= drop; }
  }
  const rest = { L: pose.arms[0].rest, R: pose.arms[1].rest };
  return { name, full, base, side, region, mat, rest };
}

// breathing (the chest and belly rise) and the mouth (the lips part when he snores) are masks shared by every pose
function buildMasks() {
  const breath = new Float32Array(N), mouth = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = cellX(i), z = cellZ(i);
    const q = (x / 17) ** 2 + ((z + 17) / 21) ** 2; const b = Math.exp(-(q * q));
    breath[i] = b < 0.01 ? 0 : b;
    const mdx = x / 3.9, mdz = (z + 46.55) / 0.85, md = mdx * mdx + mdz * mdz;
    mouth[i] = md < 1 ? Math.cos(Math.sqrt(md) * Math.PI / 2) : 0;
  }
  return { breath, mouth };
}

// ---------------------------------------------------------------- solids (not part of the height map)
// box: {kind:'box', x, z, hx, hz, y0, y1}, cyl: {kind:'cyl', x, z, r, y0, y1}. tag names what it is.
function buildSolids() {
  const s = [];
  const T = NIGHTSTAND_TOP;
  s.push({ kind: 'box', tag: 'headboard', x: 0, z: -84, hx: 56, hz: 4, y0: FLOOR_Y, y1: 40 });
  s.push({ kind: 'box', tag: 'footboard', x: 0, z: 78, hx: 53, hz: 1.6, y0: FLOOR_Y, y1: 4.5 });
  for (const sx of [-1, 1]) {
    s.push({ kind: 'box', tag: 'nightstand', x: sx * 62.5, z: -68, hx: 11, hz: 12, y0: FLOOR_Y, y1: T });
  }
  // right nightstand: lamp, alarm clock, glass of water
  s.push({ kind: 'cyl', tag: 'lampbase', x: 68, z: -74, r: 3.2, y0: T, y1: T + 1.2 });
  s.push({ kind: 'cyl', tag: 'lamppole', x: 68, z: -74, r: 0.6, y0: T, y1: T + 22 });
  s.push({ kind: 'box', tag: 'clock', x: 59.5, z: -66, hx: 2, hz: 4.2, y0: T, y1: T + 6.2 });
  s.push({ kind: 'cyl', tag: 'glass', x: 69, z: -60.5, r: 2.2, y0: T, y1: T + 7 });
  // left nightstand: a stack of books (steps!) and a framed photo of Mr. Biscuits
  s.push({ kind: 'box', tag: 'book', x: -64, z: -72, hx: 7, hz: 5, y0: T, y1: T + 1.6 });
  s.push({ kind: 'box', tag: 'book', x: -65, z: -73, hx: 5.5, hz: 4, y0: T + 1.6, y1: T + 3.0 });
  s.push({ kind: 'box', tag: 'book', x: -64.5, z: -72.5, hx: 4.5, hz: 3.4, y0: T + 3.0, y1: T + 4.6 });
  s.push({ kind: 'box', tag: 'frame', x: -59, z: -62, hx: 0.7, hz: 4.5, y0: T, y1: T + 8 });
  return s;
}

// ---------------------------------------------------------------- hair strands (bumpable, and drawn)
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function buildStrands(pose) {
  const rnd = mulberry(424242);
  const out = [];   // [x, y, z, height, leanX, leanZ, kind (0 hair, 1 beard, 2 brow), solid]
  // kind, strands per cell, height, chance a strand is thick enough to bump into
  const tries = { [REGION.hair]: [0, 2.2, 4.2, 0.04], [REGION.beard]: [1, 2.6, 3.2, 0.08], [REGION.brow]: [2, 2.4, 1.5, 0] };
  for (let i = 0; i < N; i += 1) {
    const reg = pose.region[i], t = tries[reg];
    if (!t) continue;
    const n = Math.floor(t[1] + rnd());
    for (let k = 0; k < n; k++) {
      const x = cellX(i) + (rnd() - 0.5) * CELL, z = cellZ(i) + (rnd() - 0.5) * CELL;
      // comb-over: a bald patch on top of the head
      if (reg === REGION.hair && Math.hypot(x, (z + 66) * 0.9) < 4.5 && rnd() < 0.85) continue;
      // the moustache is part of the beard but must not cover the lips
      if (reg === REGION.beard && z < -47.5 && z > -48.6) continue;
      const y = pose.full[i];
      const hgt = t[2] * (0.7 + rnd() * 0.6);
      const ang = rnd() * Math.PI * 2, lean = (t[0] === 1 ? 0.35 : 0.5) * rnd();
      // hair combs toward the headboard, beard droops toward the chest
      const lx = Math.cos(ang) * lean, lz = Math.sin(ang) * lean + (t[0] === 0 ? -0.35 : t[0] === 1 ? 0.25 : 0);
      out.push([x, y - 0.2, z, hgt, lx, lz, t[0], rnd() < t[3]]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the world
export class World {
  constructor(poseName = 'back') {
    this.poses = {};
    const m = buildMasks();
    this.breathM = m.breath; this.mouthM = m.mouth;
    this.solids = buildSolids();
    this.extraSolids = [];   // moving ones (a swatting hand resting on the bed), set by the sim each step
    this.A = this.pose(poseName);
    this.B = this.A;
    this.morph = 0;
    this.breath = 0; this.mouth = 0; this.liftL = 0; this.liftR = 0;
    this.bumps = [];   // [{x, z, r, a}] a = current amplitude
    this.jelly = 0;
    this.strands = buildStrands(this.A);
    this._strandGrid = new Map();
    this.strands.forEach((s, k) => { if (!s[7]) return; const key = (Math.floor(s[0] / 2) * 1000) + Math.floor(s[2] / 2); if (!this._strandGrid.has(key)) this._strandGrid.set(key, []); this._strandGrid.get(key).push(k); });
  }
  pose(name) { return this.poses[name] || (this.poses[name] = buildPose(name)); }
  setPose(name) { this.A = this.B = this.pose(name); this.morph = 0; }
  startMorph(name) { this.B = this.pose(name); this.morph = 0; }
  endMorph() { this.A = this.B; this.morph = 0; }
  get poseName() { return (this.morph > 0.5 ? this.B : this.A).name; }

  /** the height of grid vertex i right now (same maths as the shader) */
  vh(i) {
    const A = this.A;
    let ha = A.full[i];
    const s = A.side[i];
    if (s) { const lift = s === 1 ? this.liftL : this.liftR; if (lift > 0) ha += (A.base[i] - ha) * lift; }
    let h = this.morph > 0 ? ha + (this.B.full[i] - ha) * this.morph : ha;
    h += this.breathM[i] * this.breath - this.mouthM[i] * this.mouth * 2.2;
    return h;
  }
  /** height of the mattress / Gerald / blanket at (x, z); -1e4 off the bed */
  heightAt(x, z) {
    const fx = (x - X0) / CELL, fz = (z - Z0) / CELL;
    if (fx < 0 || fz < 0 || fx > NX - 1 || fz > NZ - 1) return NEG;
    let c = Math.floor(fx), r = Math.floor(fz);
    if (c >= NX - 1) c = NX - 2;
    if (r >= NZ - 1) r = NZ - 2;
    const u = fx - c, v = fz - r, i = r * NX + c;
    const h00 = this.vh(i), h10 = this.vh(i + 1), h01 = this.vh(i + NX), h11 = this.vh(i + NX + 1);
    let h = (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
    for (const b of this.bumps) {
      const d2 = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
      if (d2 < 4) h += b.a * Math.exp(-d2 * 2);
    }
    return h;
  }
  /** surface normal at (x, z) */
  normalAt(x, z, out = [0, 1, 0]) {
    const e = 0.35;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    let nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
    return out;
  }
  _idx(x, z) {
    const c = Math.round((x - X0) / CELL), r = Math.round((z - Z0) / CELL);
    if (c < 0 || r < 0 || c >= NX || r >= NZ) return -1;
    return r * NX + c;
  }
  /** region index at (x, z) (REGIONS in data.js) or -1 off the bed */
  regionAt(x, z) { const i = this._idx(x, z); return i < 0 ? -1 : (this.morph > 0.5 ? this.B : this.A).region[i]; }
  matAt(x, z) { const i = this._idx(x, z); return i < 0 ? -1 : (this.morph > 0.5 ? this.B : this.A).mat[i]; }
  onBed(x, z) { return x >= BED.x0 && x <= BED.x1 && z >= BED.z0 && z <= BED.z1; }

  /** highest solid top under (x, z) that is at or below y + step (for standing on things); NEG if none */
  solidFloor(x, z, y, step) {
    let best = NEG;
    const test = s => {
      if (s.y1 > y + step || s.y1 < best) return;
      if (s.kind === 'box' ? (Math.abs(x - s.x) <= s.hx && Math.abs(z - s.z) <= s.hz) : ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r)) best = s.y1;
    };
    for (const s of this.solids) test(s);
    for (const s of this.extraSolids) test(s);
    return best;
  }
  /** ground under a body at (x, y, z): the height map or a solid it's standing on */
  groundAt(x, z, y, step = 0.5) {
    return Math.max(this.heightAt(x, z), this.solidFloor(x, z, y, step), FLOOR_Y);
  }
  /** push a round body (radius r, feet at y, height hgt) out of solids it's walking into; mutates pos [x, y, z], returns true if pushed */
  pushOut(pos, r, hgt, step = 0.5) {
    let hit = false;
    const doOne = s => {
      if (pos[1] + hgt < s.y0 || pos[1] >= s.y1 - step) return;
      if (s.kind === 'box') {
        const dx = pos[0] - s.x, dz = pos[2] - s.z;
        const ox = s.hx + r - Math.abs(dx), oz = s.hz + r - Math.abs(dz);
        if (ox <= 0 || oz <= 0) return;
        if (ox < oz) pos[0] += Math.sign(dx || 1) * ox; else pos[2] += Math.sign(dz || 1) * oz;
        hit = true;
      } else {
        const dx = pos[0] - s.x, dz = pos[2] - s.z, d = Math.hypot(dx, dz), m = s.r + r;
        if (d >= m) return;
        const k = d > 1e-4 ? (m - d) / d : 1;
        pos[0] += (d > 1e-4 ? dx : 1) * k; pos[2] += dz * k;
        hit = true;
      }
    };
    for (const s of this.solids) doOne(s);
    for (const s of this.extraSolids) doOne(s);
    // the thicker hair and beard strands
    const gx = Math.floor(pos[0] / 2), gz = Math.floor(pos[2] / 2);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this._strandGrid.get((gx + a) * 1000 + gz + b);
      if (!list) continue;
      for (const k of list) {
        const st = this.strands[k];
        if (pos[1] > st[1] + st[3] * 0.8) continue;
        const dx = pos[0] - st[0], dz = pos[2] - st[2], d = Math.hypot(dx, dz), m = 0.16 + r;
        if (d >= m || d < 1e-4) continue;
        pos[0] += dx / d * (m - d); pos[2] += dz / d * (m - d);
        hit = true;
      }
    }
    return hit;
  }
  /** a random spot in a region (current pose), or null. rnd: () => 0..1 */
  randomIn(regionIdx, rnd, tries = 400) {
    const P = this.A;
    for (let k = 0; k < tries; k++) {
      const i = Math.floor(rnd() * N);
      if (P.region[i] !== regionIdx) continue;
      const x = cellX(i), z = cellZ(i);
      if (P.side[i]) continue;   // not on a hand (it may lift)
      return [x, z];
    }
    return null;
  }
  /** spots the loot table likes: count of cells per region in the current pose */
  regionCounts() {
    const counts = new Map();
    for (let i = 0; i < N; i++) counts.set(this.A.region[i], (counts.get(this.A.region[i]) || 0) + 1);
    return counts;
  }
}

// important places
export const SPOTS = {
  head: HEAD,
  noseTip: { x: 0, y: 30.5, z: -52.6 },
  mouth: { x: 0, y: 22.5, z: -46.6 },
  navel: { x: 0, z: -3.5 },
  pocket: { x: 8.5, z: -27.6 },
  earL: { x: -12.3, z: -56 }, earR: { x: 12.3, z: -56 },
  nightstandL: { x: -62.5, z: -68 }, nightstandR: { x: 62.5, z: -68 },
  eyes: [{ x: -4.8, y: 25.1, z: -57.8 }, { x: 4.8, y: 25.1, z: -57.8 }],
  clockFace: { x: 57.4, y: NIGHTSTAND_TOP + 3.1, z: -66 },
};
// stash seats around the bed, in the order players get them (mirrored pairs so 2-player games are fair)
export const SEATS = [
  [-42, -22], [42, -22], [-42, 24], [42, 24], [-39, -72], [39, -72], [-36, 68], [36, 68],
];
export const STASH_R = 2.6;
