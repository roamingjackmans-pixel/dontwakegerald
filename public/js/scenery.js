// The scenery for the away maps: a moonlit beach, a campout in the woods and a garden hammock, plus the animals
// that visit them. Gerald and the surface he lies on are drawn by render.js; this file draws everything around it.
//
//   buildSet(id, env)  ->  { group, swing, glows, light, extraLight, sky, update(dt, time), lightFlicker, setDim(k), dispose() }
//   buildCritter(kind) ->  THREE.Group whose userData.sync(c, dt, time) poses it ('gull' | 'raccoon')
//
// Coordinates are the bedroom's: Y up, Gerald's head toward -Z, his surface covers x -50..50, z -80..76 at about y 0.
// The side tables and their props are fixed collision solids (world.js buildSolids); every mesh here that stands in for
// one of them fills exactly that box or cylinder, with its top at the solid's y1.
//
// Glows: every material in `glows` has an emissiveIntensity (sprites and point clouds get one too, mapped onto their
// brightness) whose normal value is in userData.base. Dim one by lowering emissiveIntensity; update() never writes it,
// it animates flames and twinkles through scale and emissive colour instead.
import * as THREE_NS from '../vendor/three.min.js';

let THREE = THREE_NS;

// ---------------------------------------------------------------- small helpers
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rnd = mulberry(1);
const rr = (a, b) => a + (b - a) * rnd();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash2(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const _c1 = new THREE_NS.Color(), _c2 = new THREE_NS.Color();
const shade = (hex, k) => _c1.setHex(hex).multiplyScalar(k).getHex();
const mixHex = (a, b, t) => _c1.setHex(a).lerp(_c2.setHex(b), clamp01(t)).getHex();
const vary = (hex, amt = 0.08) => shade(hex, 1 + (rnd() * 2 - 1) * amt);
const rawRGB = hex => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

const _p = new THREE_NS.Vector3(), _s = new THREE_NS.Vector3(), _q = new THREE_NS.Quaternion(), _e = new THREE_NS.Euler();
function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
/** a matrix that stretches a unit-tall, Y-up, centred geometry from a to b (r scales its width) */
function between(a, b, r = 1) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
}
const unitCyl = (seg = 8, open = false) => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open);

/**
 * Batch: many little static pieces merged into one mesh with vertex colours (one draw call).
 * color: a hex, an array of hexes by geometry group (cylinder side/top/bottom), a function (worldPos, i) => hex,
 * or null to keep the geometry's own colour attribute.
 */
class Batch {
  constructor() { this.parts = []; this.stack = [new THREE.Matrix4()]; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { this.stack.push(this.top.clone().multiply(M4(x, y, z, rx, ry, rz, s, s, s))); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return this.addM(geo, color, M4(x, y, z, rx, ry, rz, sx, sy, sz)); }
  addM(geo, color, m) { this.parts.push({ geo, color, m: this.top.clone().multiply(m) }); return this; }
  build() {
    if (!this.parts.length) return null;
    let nv = 0, ni = 0;
    for (const p of this.parts) { const P = p.geo.attributes.position; nv += P.count; ni += p.geo.index ? p.geo.index.count : P.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    const v = new THREE.Vector3(), nn = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
    let vo = 0, io = 0;
    for (const p of this.parts) {
      const g = p.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
      nm.getNormalMatrix(p.m);
      let per = null;
      if (Array.isArray(p.color)) {
        per = new Array(P.count).fill(p.color[0]);
        for (const gr of g.groups) { const cc = p.color[gr.materialIndex] ?? p.color[0]; for (let k = gr.start; k < gr.start + gr.count; k++) per[I ? I.getX(k) : k] = cc; }
      }
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.m);
        nn.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        const o = (vo + i) * 3;
        pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        nor[o] = nn.x; nor[o + 1] = nn.y; nor[o + 2] = nn.z;
        if (typeof p.color === 'function') c.setHex(p.color(v, i));
        else if (per) c.setHex(per[i]);
        else if (p.color == null && C) c.fromBufferAttribute(C, i);
        else c.setHex(p.color ?? 0xffffff);
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
      const flip = p.m.determinant() < 0;
      if (I) for (let k = 0; k < I.count; k += 3) { const a = I.getX(k), b = I.getX(k + 1), d = I.getX(k + 2); idx[io++] = vo + a; idx[io++] = vo + (flip ? d : b); idx[io++] = vo + (flip ? b : d); }
      else for (let k = 0; k < P.count; k += 3) { idx[io++] = vo + k; idx[io++] = vo + k + (flip ? 2 : 1); idx[io++] = vo + k + (flip ? 1 : 2); }
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

/** points around a rounded rectangle (centred, half sizes hx/hz, corner radius r): [x, z, nx, nz]; ns per edge, na per corner */
function rrRing(hx, hz, r, ns, na) {
  r = clamp(r, 0.01, Math.min(hx, hz) - 0.01);
  const sx = hx - r, sz = hz - r, pts = [];
  const edge = (x0, z0, x1, z1, nx, nz) => { for (let i = 0; i < ns; i++) { const f = i / ns; pts.push([x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, nx, nz]); } };
  const corner = (cx, cz, a0) => { for (let i = 0; i < na; i++) { const a = a0 + (i / na) * PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
  edge(hx, -sz, hx, sz, 1, 0); corner(sx, sz, 0);
  edge(sx, hz, -sx, hz, 0, 1); corner(-sx, sz, PI / 2);
  edge(-hx, sz, -hx, -sz, -1, 0); corner(-sx, -sz, PI);
  edge(-sx, -hz, sx, -hz, 0, -1); corner(sx, -sz, PI * 1.5);
  return pts;
}
/** quads between consecutive closed rows of [x, y, z] (each row one step further down / out) */
function rowsGeo(rows, capTop = false, capBottom = false) {
  const pos = [], idx = [], M = rows[0].length;
  for (const row of rows) for (const p of row) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
    idx.push(a, b, c, b, d, c);
  }
  if (capTop) {
    // its own vertices, so a flat top stays crisp
    const t0 = pos.length / 3, y = rows[0][0][1];
    for (const p of rows[0]) pos.push(p[0], y, p[2]);
    let cx = 0, cz = 0; for (const p of rows[0]) { cx += p[0] / M; cz += p[2] / M; }
    const ct = pos.length / 3; pos.push(cx, y, cz);
    for (let j = 0; j < M; j++) idx.push(ct, t0 + (j + 1) % M, t0 + j);
  }
  if (capBottom) {
    const L = rows.length - 1, last = rows[L];
    let cx = 0, cy = 0, cz = 0; for (const p of last) { cx += p[0] / M; cy += p[1] / M; cz += p[2] / M; }
    const cb = pos.length / 3; pos.push(cx, cy, cz);
    for (let j = 0; j < M; j++) idx.push(cb, L * M + j, L * M + (j + 1) % M);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/**
 * A rounded-rectangle loft: rings top first, {y, hx, hz, r, n (noise), out (noise only pushes outward), ny (y jitter)}.
 * The top ring is flat at its y with a cap, so a solid's top can sit exactly on it.
 */
function loftGeo(rings, ns = 3, na = 3, seed = 0, capBottom = true) {
  const rows = rings.map((rg, i) => rrRing(rg.hx, rg.hz, rg.r, ns, na).map(([x, z, nx, nz], j) => {
    let o = 0;
    if (rg.n) { const h = hash2(j * 1.7 + seed * 5.3, i * 3.1 + seed); o = rg.out ? h * rg.n : (h * 2 - 1) * rg.n; }
    const y = rg.y + (rg.ny ? (hash2(j + seed * 2.3, i * 7.7) * 2 - 1) * rg.ny : 0);
    return [x + nx * o, y, z + nz * o];
  }));
  return rowsGeo(rows, true, capBottom);
}
/** a flat round-ish ground made of rings (dense in the middle); fy(x, z) gives the height, fc(x, y, z) the colour */
function radialGrid(rMax, rings, segs, fy, fc) {
  const pos = [], col = [], idx = [], c = new THREE.Color();
  const put = (x, z) => { const y = fy(x, z); pos.push(x, y, z); c.setHex(fc(x, y, z)); col.push(c.r, c.g, c.b); };
  put(0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = rMax * Math.pow(i / rings, 1.7);
    for (let j = 0; j < segs; j++) { const a = j / segs * PI * 2; put(Math.cos(a) * r, Math.sin(a) * r); }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + i * segs + j, b = 1 + i * segs + (j + 1) % segs, cc = a + segs, d = b + segs;
    idx.push(a, b, cc, b, d, cc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** a regular grid over [x0,x1]x[z0,z1] with y = fy(x, z); faces up (or down) */
function gridGeo(x0, x1, z0, z1, nx, nz, fy, down = false) {
  const pos = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz); pos.push(x, fy(x, z), z); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (down) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** a palm or fern frond along +x: a folded strip that rises then droops, with notched edges; carries its own colours */
function frondGeo(len, w, droop, mid = 0x4d9b52, edge = 0x2f6f3a, N = 9) {
  const pos = [], col = [], idx = [], cm = new THREE.Color(mid), ce = new THREE.Color(edge);
  for (let i = 0; i <= N; i++) {
    const s = i / N, x = s * len;
    const y = (Math.sin(s * PI * 0.7) * 0.22 - s * s * droop) * len;
    const ww = w * Math.pow(Math.sin(PI * Math.min(1, s * 1.08 + 0.04)), 0.6) * (i % 2 ? 1 : 0.72);
    pos.push(x, y - ww * 0.3, -ww, x, y, 0, x, y - ww * 0.3, ww);
    col.push(ce.r, ce.g, ce.b, cm.r, cm.g, cm.b, ce.r, ce.g, ce.b);
  }
  for (let i = 0; i < N; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** a teardrop flame, base at y 0, tip at y h */
function flameGeo(h, r, seg = 9) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.max(0.001, r * Math.sin(PI * Math.pow(t, 0.62)) * (1 - t * 0.2)), t * h)); }
  return new THREE.LatheGeometry(pts, seg);
}
function starShape(ro, ri, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * PI * 2 + PI / 2, r = i % 2 ? ri : ro; if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  return s;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  glowTex.colorSpace = THREE.NoColorSpace;
  return glowTex;
}

// ---------------------------------------------------------------- glowing things
function glowMat(color, emissive, intensity, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.6, ...o });
  m.userData.base = intensity; m.userData.emissive0 = new THREE.Color(emissive);
  return m;
}
/** give a sprite / points material an emissiveIntensity the game can dim like the others */
function dimmable(mat, base = 1) {
  mat.userData.base = base;
  let v = base;
  Object.defineProperty(mat, 'emissiveIntensity', { get: () => v, set: x => { v = x; }, configurable: true, enumerable: true });
  return mat;
}
const dimK = m => (m.userData.base ? clamp(m.emissiveIntensity / m.userData.base, 0, 4) : 1);
function makeHalo(color, size, opacity) {
  const m = dimmable(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.userData.op = opacity;
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.renderOrder = 5;
  return s;
}
/** additive glowing points. kind 0: twinkle in place, 1: fireflies (drift + blink), 2: sparks rising from a fire */
function pointsMat(kind, color, scale, atten = true) {
  return dimmable(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, uColor: { value: rawRGB(color) }, uScale: { value: scale } },
    defines: { KIND: kind, ATTEN: atten ? 1 : 0 },
    vertexShader: `uniform float uTime, uDim, uScale; attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      varying float vA; varying vec3 vC;
      void main(){
        vec3 p = position; float a = 1.0; float sz = aSize;
        #if KIND == 1
          float t = uTime * 0.3 + aPhase * 6.2831;
          p += vec3(sin(t * 1.3 + aPhase * 17.0) * 7.0 + sin(t * 0.53) * 4.0, sin(t * 0.9 + aPhase * 9.0) * 3.5, cos(t * 1.1 + aPhase * 13.0) * 7.0);
          a = 0.08 + 0.92 * pow(0.5 + 0.5 * sin(uTime * (0.9 + aPhase * 0.8) + aPhase * 40.0), 4.0);
        #elif KIND == 2
          float k = fract(uTime * (0.4 + aPhase * 0.35) + aPhase * 7.0);
          p += vec3(sin(aPhase * 50.0 + k * 5.0) * 4.0 * k, k * 34.0, cos(aPhase * 31.0 + k * 4.0) * 4.0 * k);
          a = (1.0 - k) * smoothstep(0.0, 0.06, k); sz *= 1.0 - 0.5 * k;
        #else
          a = 0.7 + 0.3 * sin(uTime * (0.7 + aPhase * 2.3) + aPhase * 60.0);
        #endif
        vA = a * uDim; vC = aColor;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        #if ATTEN == 1
          gl_PointSize = sz * uScale / max(1.0, -mv.z);
        #else
          gl_PointSize = sz * uScale;
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a + smoothstep(0.3, 0.0, d) * 0.7;
        gl_FragColor = vec4(uColor * vC * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}
/** pts: [{x, y, z, size, phase, color (hex, defaults white)}] */
function makePoints(pts, mat) {
  const n = pts.length, P = new Float32Array(n * 3), S = new Float32Array(n), F = new Float32Array(n), C = new Float32Array(n * 3);
  pts.forEach((p, i) => {
    P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; S[i] = p.size; F[i] = p.phase ?? rnd();
    const c = rawRGB(p.color ?? 0xffffff); C[i * 3] = c.x; C[i * 3 + 1] = c.y; C[i * 3 + 2] = c.z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(S, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(F, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(C, 3));
  const o = new THREE.Points(geo, mat); o.frustumCulled = false; o.renderOrder = 4;
  return o;
}

// ---------------------------------------------------------------- the set builder
const KINDS = {
  solid: o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, ...o }),
  shiny: o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, ...o }),
  metal: o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.65, ...o }),
  flat: o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true, ...o }),
  cloth: o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, ...o }),
};
function makeCtx(id, env) {
  const quality = env.quality || 'high';
  rnd = mulberry({ beach: 1101, camp: 2202, hammock: 3303 }[id] || 7);
  const group = new THREE.Group(); group.name = 'set:' + id;
  const ctx = {
    id, env, quality, T: env.T ?? 1.2, FY: env.FLOOR_Y ?? -55,
    n: quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1,   // how many of the little repeated things
    shadows: quality !== 'low',
    group, bg: group, swing: null,
    glows: [], updaters: [], light: null, extraLight: null, sky: null, lightFlicker: 1,
    batches: new Map(), disposables: [],
    count: k => Math.max(1, Math.round(k * ctx.n)),
    /** a batch: where 'near' casts shadows and stays put; 'far' is background (no shadows; inside the swing on the hammock) */
    b(kind = 'solid', where = 'near') {
      const key = kind + ':' + where;
      if (!ctx.batches.has(key)) ctx.batches.set(key, { kind, where, batch: new Batch() });
      return ctx.batches.get(key).batch;
    },
    add(obj, where = 'near') { (where === 'far' ? ctx.bg : ctx.group).add(obj); return obj; },
    glow(mat) { ctx.glows.push(mat); return mat; },
    tick(fn) { ctx.updaters.push(fn); },
    glowPoints(mat, pts, where = 'far') {
      const o = makePoints(pts, mat);
      ctx.add(o, where); ctx.glow(mat);
      ctx.tick((dt, t) => { mat.uniforms.uTime.value = t; mat.uniforms.uDim.value = dimK(mat); });
      return o;
    },
    halo(color, size, opacity, x, y, z, where = 'near', follow = null) {
      const h = makeHalo(color, size, opacity); h.position.set(x, y, z); ctx.add(h, where); ctx.glow(h.material);
      // a halo that belongs to an emissive material follows that material's dimming too
      ctx.tick(() => { const k = Math.min(dimK(h.material), follow ? dimK(follow) : 1); h.material.opacity = h.material.userData.op * k * (h.userData.flicker ?? 1); h.visible = h.material.opacity > 0.003; });
      return h;
    },
    mesh(geo, mat, x = 0, y = 0, z = 0, where = 'near', cast = false) {
      const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = cast && ctx.shadows; o.receiveShadow = true;
      return ctx.add(o, where);
    },
    texPlane(tex, w, h, x, y, z, ry, o = {}) {
      const m = ctx.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, ...o }), x, y, z, o.where || 'near');
      m.rotation.y = ry;
      return m;
    },
  };
  return ctx;
}
function finishCtx(ctx) {
  for (const [key, b] of ctx.batches) {
    const geo = b.batch.build();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, KINDS[b.kind]());
    mesh.name = key;
    mesh.castShadow = b.where === 'near' && ctx.shadows;
    mesh.receiveShadow = true;
    (b.where === 'far' ? ctx.bg : ctx.group).add(mesh);
  }
  ctx.batches.clear();
  const set = {
    id: ctx.id, group: ctx.group, swing: ctx.swing, glows: ctx.glows,
    light: ctx.light, extraLight: ctx.extraLight, sky: ctx.sky,
    lightFlicker: 1,
    update(dt, time) {
      let r;
      for (const u of ctx.updaters) { const v = u(dt, time); if (v !== undefined) r = v; }
      set.lightFlicker = ctx.lightFlicker;
      return r;
    },
    /** convenience: every glow at k times its normal brightness (0 = lights out) */
    setDim(k) { for (const m of ctx.glows) m.emissiveIntensity = (m.userData.base ?? 1) * k; },
    dispose() {
      ctx.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { if (m.map && m.map !== glowTex && m.map !== ctx.env.clockTex) m.map.dispose(); m.dispose(); }
      });
    },
  };
  return set;
}

export function buildSet(id, env = {}) {
  if (env.THREE) THREE = env.THREE;
  const ctx = makeCtx(id, env);
  if (id === 'beach') buildBeach(ctx);
  else if (id === 'camp') buildCamp(ctx);
  else if (id === 'hammock') buildHammock(ctx);
  else throw new Error('scenery: unknown set ' + id);
  return finishCtx(ctx);
}

// ---------------------------------------------------------------- shared pieces
/** the night sky: a gradient dome, stars and the moon (all unfogged) */
function addSky(ctx, o) {
  const g = new THREE.Group(); g.name = 'sky';
  const md = new THREE.Vector3(...o.moonDir).normalize();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: rawRGB(o.zenith) }, uHor: { value: rawRGB(o.horizon) }, uLow: { value: rawRGB(o.low ?? o.horizon) }, uGlow: { value: rawRGB(o.glow ?? 0x34467a) }, uMoon: { value: md } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uLow, uGlow, uMoon; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(uHor, uTop, pow(smoothstep(0.0, 0.8, h), 0.55)) : mix(uHor, uLow, smoothstep(0.0, -0.2, h));
        float m = max(0.0, dot(d, uMoon)); c += uGlow * (pow(m, 24.0) * 0.7 + pow(m, 5.0) * 0.16);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false;
  g.add(dome);
  // stars
  const pts = [], N = ctx.count(o.stars ?? 600);
  for (let i = 0; i < N; i++) {
    const a = rnd() * PI * 2, y = 0.04 + Math.pow(rnd(), 0.8) * 0.96, r = Math.sqrt(1 - y * y);
    const d = V3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (d.dot(md) > 0.985) continue;
    const big = rnd() < 0.07;
    pts.push({ x: d.x * 640, y: d.y * 640, z: d.z * 640, size: big ? rr(3.2, 4.4) : rr(1.4, 2.8), color: [0xffffff, 0xdfe8ff, 0xfff0d8, 0xcfe0ff][i % 4] });
  }
  const sm = pointsMat(0, 0xffffff, 1, false);
  const stars = makePoints(pts, sm); stars.renderOrder = -9;
  g.add(stars);
  ctx.tick((dt, t) => { sm.uniforms.uTime.value = t; });
  // moon with a few soft craters
  const mb = new Batch(), mp = md.clone().multiplyScalar(600);
  mb.add(new THREE.CircleGeometry(o.moonR ?? 26, 40), 0xfff4da);
  for (const [x, y, r] of [[-7, 6, 5], [8, -4, 6.5], [-3, -11, 3.5], [11, 9, 3], [-12, -3, 2.6]]) mb.add(new THREE.CircleGeometry(r, 20), 0xeadfc2, x, y, 0.3);
  const moon = new THREE.Mesh(mb.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }));
  moon.position.copy(mp); moon.lookAt(0, 0, 0); moon.renderOrder = -8;
  g.add(moon);
  ctx.bg.add(g);
  return g;
}
function placeholderClock() {
  return canvasTex(256, 160, g => {
    g.fillStyle = '#120a0a'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#ff3b3b'; g.shadowColor = '#ff2020'; g.shadowBlur = 18;
    g.font = '700 92px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('11:00', 128, 78);
    g.font = '700 26px "Courier New", monospace'; g.shadowBlur = 8; g.fillText('PM', 222, 138);
  });
}
/** the alarm clock's face: the game's own clock texture, exactly where the bedroom's is */
function clockFace(ctx) {
  const tex = ctx.env.clockTex || (ctx.env.clockTex = placeholderClock());
  const m = ctx.mesh(new THREE.PlaneGeometry(7.2, 4.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 57.45, ctx.T + 3.1, -66);
  m.rotation.y = -PI / 2; m.receiveShadow = false;
  return m;
}
/** a cluster of flame tongues; returns its update. tongues: [[dx, dz, height, radius]] */
function addFlames(ctx, x, y, z, tongues, colors = [0xff5a14, 0xff9a2a, 0xffe07a], where = 'near') {
  const mats = colors.map((c, i) => ctx.glow(glowMat(0x000000, c, [2.2, 2.4, 2.6][i], { transparent: true, opacity: [0.78, 0.86, 0.95][i], depthWrite: false, roughness: 1 })));
  const parts = [];
  const root = new THREE.Group(); root.position.set(x, y, z); ctx.add(root, where);
  tongues.forEach(([dx, dz, h, r], k) => {
    [1, 0.72, 0.42].forEach((s, layer) => {
      const m = new THREE.Mesh(flameGeo(h * (layer ? s * 1.05 : 1), r * s), mats[layer]);
      m.position.set(dx, layer * 0.05 * h, dz); m.renderOrder = 6 + layer;
      root.add(m);
      parts.push({ m, ph: k * 1.7 + layer * 0.6 + rnd() * 3, dx, dz });
    });
  });
  const op = mats.map(m => m.opacity);
  return { root, mats, update(t) {
    // dimmed flames fade away rather than turning into dark cones
    let any = 0;
    mats.forEach((m, i) => { const k = Math.min(1, dimK(m)); m.opacity = op[i] * k; any = Math.max(any, k); });
    root.visible = any > 0.02;
    for (const p of parts) {
      const f = 1 + 0.16 * Math.sin(t * 11 + p.ph) + 0.09 * Math.sin(t * 23.3 + p.ph * 2.1);
      p.m.scale.set(1 - 0.08 * Math.sin(t * 9 + p.ph), f, 1 - 0.08 * Math.cos(t * 8 + p.ph));
      p.m.rotation.y = t * 1.3 + p.ph;
      p.m.rotation.z = Math.sin(t * 5 + p.ph) * 0.06;
      p.m.position.x = p.dx + Math.sin(t * 7 + p.ph) * 0.08;
    }
    return 1 + 0.08 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23.3 + 1.3) + 0.03 * Math.sin(t * 37.1);
  } };
}
/** a rope (thin open cylinder) from a to b */
function rope(b, a, c, r, color, seg = 5) { b.addM(new THREE.CylinderGeometry(1, 1, 1, seg, 1, true), color, between(a, c, r)); }
/** a sagging wire / rope through n points between a and b */
function sagCurve(a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const s = i / 12; pts.push(new THREE.Vector3().lerpVectors(a, b, s).add(V3(0, -sag * 4 * s * (1 - s), 0))); }
  return new THREE.CatmullRomCurve3(pts);
}
/** a wooden slatted crate filling [x0,x1]x[y0,y1]x[z0,z1]; lid adds top boards flush with y1 */
function crate(b, x0, x1, y0, y1, z0, z1, wood, lid) {
  const w = x1 - x0, d = z1 - z0, h = y1 - y0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const post = 2.2, th = 0.8;
  for (const px of [x0 + post / 2, x1 - post / 2]) for (const pz of [z0 + post / 2, z1 - post / 2]) b.add(new THREE.BoxGeometry(post, h - (lid ? 0.9 : 0), post), shade(wood, 0.85), px, y0 + (h - (lid ? 0.9 : 0)) / 2, pz);
  const slat = 3.4, gap = 0.9;
  for (let y = y0 + 0.3; y + slat <= y1 - (lid ? 0.9 : 0) + 0.01; y += slat + gap) {
    const yc = y + slat / 2;
    b.add(new THREE.BoxGeometry(w - 0.1, slat, th), vary(wood, 0.07), cx, yc, z0 + th / 2);
    b.add(new THREE.BoxGeometry(w - 0.1, slat, th), vary(wood, 0.07), cx, yc, z1 - th / 2);
    b.add(new THREE.BoxGeometry(th, slat, d - 0.1), vary(wood, 0.07), x0 + th / 2, yc, cz);
    b.add(new THREE.BoxGeometry(th, slat, d - 0.1), vary(wood, 0.07), x1 - th / 2, yc, cz);
  }
  if (lid) {
    const n = 6, bw = (d - (n - 1) * 0.3) / n;
    for (let i = 0; i < n; i++) b.add(new THREE.BoxGeometry(w, 0.9, bw), vary(shade(wood, 1.08), 0.06), cx, y1 - 0.45, z0 + bw / 2 + i * (bw + 0.3));
  } else b.add(new THREE.BoxGeometry(w - 0.2, 0.6, d - 0.2), shade(wood, 0.7), cx, y1 - 0.3, cz);
}
/** a big round rock you can't stand on (background) */
function boulder(b, x, y, z, s, color, seed) {
  const geo = loftGeo([
    { y: 0.55, hx: 0.55, hz: 0.45, r: 0.4, n: 0.08 }, { y: 0.42, hx: 0.95, hz: 0.8, r: 0.6, n: 0.12, ny: 0.05 },
    { y: 0.12, hx: 1.05, hz: 0.9, r: 0.7, n: 0.12, ny: 0.05 }, { y: -0.2, hx: 0.9, hz: 0.8, r: 0.6, n: 0.1 },
  ], 2, 3, seed);
  b.add(geo, v => shade(color, 0.85 + 0.25 * hash2(v.x * 0.3, v.z * 0.3 + v.y)), x, y, z, 0, rnd() * PI * 2, 0, s, s * rr(0.7, 1.1), s);
}
/** instanced copies of a merged geometry. list: [{x, y, z, ry, s, sy, color}] */
function instanced(ctx, geo, mat, list, where = 'far') {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((o, i) => {
    im.setMatrixAt(i, M4(o.x, o.y, o.z, o.rx || 0, o.ry || 0, o.rz || 0, o.s, o.sy ?? o.s, o.sz ?? o.s));
    if (o.color != null) im.setColorAt(i, _c1.setHex(o.color));
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = false; im.receiveShadow = true;
  ctx.add(im, where);
  return im;
}

// ---------------------------------------------------------------- textures
function drawPostcard(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#ff8f6b'); sky.addColorStop(1, '#ffd98a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff3b8'; g.beginPath(); g.arc(w * 0.66, h * 0.6, 30, 0, PI * 2); g.fill();
  const sea = g.createLinearGradient(0, h * 0.6, 0, h); sea.addColorStop(0, '#39a9cc'); sea.addColorStop(1, '#1f6f99');
  g.fillStyle = sea; g.fillRect(0, h * 0.6, w, h * 0.4);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(w * 0.45 + i * 6, h * (0.66 + i * 0.05)); g.lineTo(w * 0.87 - i * 6, h * (0.66 + i * 0.05)); g.stroke(); }
  g.fillStyle = '#f5d79e'; g.beginPath(); g.ellipse(w * 0.2, h * 0.95, w * 0.32, h * 0.16, 0, 0, PI * 2); g.fill();
  g.strokeStyle = '#4a3140'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(w * 0.2, h * 0.88); g.quadraticCurveTo(w * 0.17, h * 0.6, w * 0.27, h * 0.38); g.stroke();
  g.fillStyle = '#3e6b3a';
  for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; g.beginPath(); g.ellipse(w * 0.27 + Math.cos(a) * 20, h * 0.38 + Math.sin(a) * 8 + 6, 24, 6, a, 0, PI * 2); g.fill(); }
  g.textAlign = 'center'; g.lineJoin = 'round';
  g.font = '700 20px Fredoka, "Trebuchet MS", sans-serif'; g.fillStyle = '#5a2e3a'; g.fillText('Greetings from', w * 0.56, 30);
  g.font = '900 36px Fredoka, "Trebuchet MS", sans-serif'; g.lineWidth = 6; g.strokeStyle = '#5a2e3a'; g.strokeText('SNOOZE BEACH', w / 2, 68);
  g.fillStyle = '#ffe14a'; g.fillText('SNOOZE BEACH', w / 2, 68);
  g.strokeStyle = '#fffaf0'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
}
function drawTrailMap(g, w, h) {
  g.fillStyle = '#efdfb4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(150,110,60,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  g.strokeStyle = '#6fb0d8'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, h * 0.75); g.bezierCurveTo(w * 0.3, h * 0.6, w * 0.5, h * 0.95, w, h * 0.8); g.stroke();
  for (let i = 0; i < 22; i++) {
    const x = 20 + Math.random() * (w - 40), y = 50 + Math.random() * (h - 110);
    if (Math.hypot(x - w * 0.5, y - h * 0.5) < 45) continue;
    g.fillStyle = ['#3d7a45', '#2f6a3a', '#4a8a50'][i % 3]; g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 9, y + 6); g.lineTo(x - 9, y + 6); g.fill();
  }
  g.strokeStyle = '#c0392b'; g.lineWidth = 4; g.setLineDash([8, 7]);
  g.beginPath(); g.moveTo(24, h - 24); g.bezierCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.9, w * 0.52, h * 0.5); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#e67e22'; g.beginPath(); g.moveTo(w * 0.52 - 16, h * 0.5 + 10); g.lineTo(w * 0.52, h * 0.5 - 14); g.lineTo(w * 0.52 + 16, h * 0.5 + 10); g.fill();
  g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(w * 0.66, h * 0.52, 6, 0, PI * 2); g.fill();
  g.fillStyle = '#c0392b'; g.font = '900 26px Fredoka, "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.fillText('CAMP SNOOZE', w / 2, 32);
  g.font = '700 14px Fredoka, "Trebuchet MS", sans-serif'; g.fillStyle = '#5a3a20'; g.fillText('★ you are here', w * 0.58, h * 0.5 + 34);
  g.strokeStyle = '#7a5230'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
}
function drawSeedPacket(g, w, h) {
  g.fillStyle = '#7a5230'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff7e6'; g.beginPath(); g.roundRect(18, 10, w - 36, h - 20, 10); g.fill();
  g.fillStyle = '#9ed36a'; g.fillRect(18, h - 56, w - 36, 46);
  const cx = w / 2, cy = h * 0.48;
  g.strokeStyle = '#4a8a3a'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, h - 30); g.stroke();
  g.fillStyle = '#ffcf2e';
  for (let k = 0; k < 14; k++) { const a = k / 14 * PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 20, 9, a, 0, PI * 2); g.fill(); }
  g.fillStyle = '#7a4a22'; g.beginPath(); g.arc(cx, cy, 24, 0, PI * 2); g.fill();
  g.fillStyle = '#5a3416'; for (let i = 0; i < 20; i++) { const a = Math.random() * PI * 2, r = Math.random() * 18; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3); }
  g.textAlign = 'center'; g.fillStyle = '#c0392b'; g.font = '900 28px Fredoka, "Trebuchet MS", sans-serif'; g.fillText('SUNFLOWER', cx, 42);
  g.fillStyle = '#2f5a2a'; g.font = '700 18px Fredoka, "Trebuchet MS", sans-serif'; g.fillText('giant seeds', cx, h - 26);
}
function drawCoolerLabel(g, w, h) {
  g.fillStyle = '#f4f1e8'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
  g.strokeStyle = '#2a6fb0'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#2a6fb0'; g.font = '900 54px Fredoka, "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ICE BOX', w * 0.58, h / 2 + 2);
  g.strokeStyle = '#5bc0de'; g.lineWidth = 5; g.lineCap = 'round';
  const sx = 42, sy = h / 2;
  for (let k = 0; k < 3; k++) { const a = k * PI / 3; g.beginPath(); g.moveTo(sx - Math.cos(a) * 22, sy - Math.sin(a) * 22); g.lineTo(sx + Math.cos(a) * 22, sy + Math.sin(a) * 22); g.stroke(); }
}
function drawStencil(text) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,24,12,0.85)'; g.font = '900 64px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 2); }
    g.globalCompositeOperation = 'source-over';
  };
}

// ================================================================ BEACH SNOOZE
function buildBeach(ctx) {
  const { T } = ctx;
  const near = ctx.b('solid'), shiny = ctx.b('shiny'), flat = ctx.b('flat'), cloth = ctx.b('cloth');
  const far = ctx.b('solid', 'far'), farFlat = ctx.b('flat', 'far'), farCloth = ctx.b('cloth', 'far');
  ctx.sky = { background: 0x0b1431, fog: 0x18264e, fogDensity: 0.003, hemiSky: 0x8ea4e2, hemiGround: 0x3a3244, hemiIntensity: 1.2, moonColor: 0xc4d2ff, moonIntensity: 1.85 };
  addSky(ctx, { zenith: 0x050a1e, horizon: 0x18264e, low: 0x111c3c, glow: 0x3a4c80, moonDir: [0.75, 0.4, -0.52], stars: 650 });
  ctx.light = { pos: [68, T + 22.4, -74], color: 0xffa860, intensity: 2600 };

  // ---- the sea floor: sand under the shallows, deeper further out, rising to the mainland past his feet
  const seaY = (x, z) => {
    const r = Math.hypot(x, z * 0.85);
    let y = -14.4 + 0.3 * Math.sin(x * 0.21 + Math.sin(z * 0.05) * 2) * Math.sin(z * 0.17) - Math.max(0, r - 150) * 0.045;
    const m = smooth(220, 300, z);
    return lerp(y, 5 + 7 * vnoise(x * 0.025, z * 0.03), m);
  };
  const seaCol = (x, y, z) => {
    const nz = 0.92 + 0.12 * vnoise(x * 0.08, z * 0.08);
    if (y > -1.5) return shade(0xd8c69c, nz);
    if (y > -4) return shade(0xb9a47c, nz);
    return shade(mixHex(0xcdb88e, 0x4d5e6e, smooth(14.5, 30, -y)), nz);
  };
  far.addM(radialGrid(690, Math.round(lerp(26, 44, ctx.n)), 72, seaY, seaCol), null, new THREE.Matrix4());
  // the island's sandy edges reach down to the sea floor (his surface stops at the grid; this fills the gap under it)
  const kAt = z => clamp01(1 - (Math.abs(z + 68) - 12) / 5);
  const edgeY = z => { const k = kAt(z); return 0.1 - Math.max(10 * (1 - k), 0.96 * k); };
  {
    const A = rrRing(49.7, 77.7, 2, 26, 4), Bq = rrRing(50.7, 78.7, 3, 26, 4);
    const rowA = A.map(([x, z]) => [x, edgeY(z - 2) - 0.9, z - 2]);
    const rowB = Bq.map(([x, z]) => [x, edgeY(z - 2) - 3.4, z - 2]);
    const rowC = A.map(([x, z, nx, nz]) => { const k = kAt(z - 2); const o = lerp(11, 1.6, k); return [x + nx * o, -14.7, z - 2 + nz * o]; });
    far.addM(rowsGeo([rowA, rowB, rowC]), v => shade(v.y > -4 ? 0xc9b083 : 0xbba47a, 0.95 + 0.1 * hash2(v.x, v.z)), new THREE.Matrix4());
  }
  // a few rocks resting under the water
  for (let i = 0; i < ctx.count(10); i++) {
    const a = rr(0, PI * 2), r = rr(80, 170), x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
    if (z > 180) continue;
    boulder(farFlat, x, -14.2, z, rr(3, 7), 0x5a6168, i + 3);
  }

  // ---- the side tables: two flat-topped rocks rising out of the sea
  const rockCol = v => {
    const y = v.y, n = 0.88 + 0.24 * hash2(v.x * 0.7, v.z * 0.7 + v.y);
    const c = y > 0.7 ? 0x9b9284 : y > -3.3 ? mixHex(0x56604c, 0x857e70, smooth(-3.3, 0.7, y)) : 0x4a5157;
    return shade(c, n);
  };
  for (const sx of [-1, 1]) {
    flat.addM(loftGeo([
      { y: T, hx: 11.42, hz: 12.42, r: 1.3, n: 0.22, out: true },
      { y: T - 0.55, hx: 11.72, hz: 12.72, r: 1.6, n: 0.28, out: true },
      { y: -1.3, hx: 11.85, hz: 12.85, r: 2.1, n: 0.38, out: true, ny: 0.25 },
      { y: -3.4, hx: 12.1, hz: 13.1, r: 2.6, n: 0.6, out: true, ny: 0.4 },
      { y: -7.5, hx: 13.6, hz: 14.6, r: 3.6, n: 1.3, ny: 0.8 },
      { y: -13, hx: 15.6, hz: 16.6, r: 5, n: 1.7, ny: 0.8 },
      { y: -20, hx: 17, hz: 18, r: 6, n: 1.4 },
    ], 5, 3, sx > 0 ? 3 : 8), rockCol, M4(sx * 62.5, 0, -68));
  }
  // lichen freckles on the rock tops (flat, so they don't look like anything to climb)
  for (const [x, z, r, c] of [[54, -78, 1.6, 0xc9c27a], [72, -64, 1.2, 0xd8904e], [55, -57.5, 0.9, 0xc9c27a], [-53, -78.5, 1.3, 0xd8904e], [-72.5, -58.5, 1.5, 0xc9c27a], [-53.5, -56.8, 0.8, 0xc9c27a]]) {
    near.add(new THREE.CircleGeometry(r, 9), c, x, T + 0.02, z, -PI / 2);
  }
  // a starfish sunbathing by the postcard
  near.add(new THREE.ExtrudeGeometry(starShape(2.3, 0.95), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.18, bevelSegments: 1 }), 0xf2875a, -67.5, T + 0.02, -60, -PI / 2, 0, 0.4);
  for (let k = 0; k < 5; k++) { const a = PI / 2 + 0.4 + k * PI * 2 / 5; near.add(new THREE.SphereGeometry(0.22, 6, 4), 0xffc29a, -67.5 + Math.cos(a) * 1.2, T + 0.38, -60 - Math.sin(a) * 1.2); }

  // ---- right rock: a tiki torch (the light), a portable radio alarm clock and a soda
  near.add(new THREE.CylinderGeometry(3.2, 3.35, 1.2, 12), 0x7d766c, 68, T + 0.6, -74);
  near.add(new THREE.CylinderGeometry(0.6, 0.62, 16.8, 8), 0xb58e55, 68, T + 9.6, -74);
  for (let y = 3.6; y < 17; y += 3.3) near.add(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 8), 0x8a6a3c, 68, T + y, -74);
  near.add(new THREE.CylinderGeometry(1.5, 0.72, 3.8, 10), 0xc9a35e, 68, T + 19.9, -74);
  for (const y of [18.9, 20.4]) near.add(new THREE.TorusGeometry(1.15 + (y - 18) * 0.14, 0.16, 5, 12), 0x7a5a32, 68, T + y, -74, PI / 2);
  near.add(new THREE.CylinderGeometry(1.55, 1.5, 0.4, 10), 0x3a2a1e, 68, T + 21.8, -74);
  const torch = addFlames(ctx, 68, T + 21.6, -74, [[0, 0, 4.6, 1.3], [0.55, 0.3, 2.6, 0.7], [-0.45, -0.35, 2.2, 0.6]]);
  const torchHalo = ctx.halo(0xffa050, 13, 0.55, 68, T + 23.4, -74, 'near', torch.mats[0]);
  // radio: teal body, chrome frame round the clock face, a handle and an antenna
  near.add(new THREE.BoxGeometry(4, 6.2, 8.4), 0x3fb0a8, 59.5, T + 3.1, -66);
  near.add(new THREE.BoxGeometry(3.6, 0.5, 8.0), 0xf3ead6, 59.5, T + 6.2 - 0.25, -66);
  for (let k = 0; k < 6; k++) near.add(new THREE.BoxGeometry(2.4, 0.08, 0.25), 0x4a5a5a, 59.9, T + 6.21, -68.6 + k * 1.0);
  for (const [dy, dz, w, h] of [[2.45, 0, 0.35, 7.9], [-2.45, 0, 0.35, 7.9], [0, 3.8, 5.25, 0.35], [0, -3.8, 5.25, 0.35]]) shiny.add(new THREE.BoxGeometry(0.2, w, h), 0xdde3ea, 57.45, T + 3.1 + dy, -66 + dz);
  shiny.add(new THREE.TorusGeometry(3.4, 0.32, 6, 16, PI), 0xdde3ea, 59.5, T + 6.2, -66, 0, PI / 2);
  shiny.addM(new THREE.CylinderGeometry(0.1, 0.14, 1, 6), 0xdde3ea, between(V3(60.9, T + 6.2, -69.6), V3(63.5, T + 14.5, -71.5)));
  shiny.add(new THREE.SphereGeometry(0.3, 8, 6), 0xdde3ea, 63.5, T + 14.5, -71.5);
  for (const y of [T + 1.9, T + 4.3]) shiny.add(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 12), 0xf3ead6, 59.5, y, -61.6, PI / 2);
  clockFace(ctx);
  // soda: a striped paper cup with a lid and a straw
  const cupR = y => 1.85 + 0.35 * y / 6.4;
  for (const [y0, y1, c] of [[0, 1.6, 0xf7f3ea], [1.6, 4.6, 0xe0453a], [4.6, 6.4, 0xf7f3ea]]) near.add(new THREE.CylinderGeometry(cupR(y1), cupR(y0), y1 - y0, 16), c, 69, T + (y0 + y1) / 2, -60.5);
  near.add(new THREE.CylinderGeometry(2.32, 2.28, 0.6, 16), 0xffffff, 69, T + 6.7, -60.5);
  const strawA = V3(69.4, T + 6.6, -60.2), strawB = V3(70.0, T + 9.2, -59.8), strawC = V3(70.6, T + 11.6, -59.4);
  near.addM(new THREE.CylinderGeometry(0.26, 0.26, 1, 8), 0xffffff, between(strawA, strawB));
  near.addM(new THREE.CylinderGeometry(0.26, 0.26, 1, 8), 0xff6fa8, between(strawB, strawC));

  // ---- left rock: flat pebbles stacked as steps and a postcard propped in driftwood
  const pebble = (cx, cz, y0, y1, hx, hz, color, seed) => {
    const h = y1 - y0;
    near.addM(loftGeo([
      { y: h, hx: hx + 0.36, hz: hz + 0.36, r: 1.2 },
      { y: h * 0.72, hx: hx + 0.66, hz: hz + 0.66, r: 1.5, n: 0.12 },
      { y: h * 0.3, hx: hx + 0.62, hz: hz + 0.62, r: 1.6, n: 0.12 },
      { y: 0, hx: hx + 0.15, hz: hz + 0.15, r: 1.6 },
    ], 3, 3, seed), v => shade(color, 0.93 + 0.12 * hash2(v.x * 2.1, v.z * 1.7)), M4(cx, y0, cz));
  };
  pebble(-64, -72, T, T + 1.6, 7, 5, 0x7f8a92, 1);
  pebble(-65, -73, T + 1.6, T + 3.0, 5.5, 4, 0xc8b59a, 2);
  pebble(-64.5, -72.5, T + 3.0, T + 4.6, 4.5, 3.4, 0xb4938e, 3);
  near.add(new THREE.BoxGeometry(1.4, 8, 9), v => shade(0xb3a58c, 0.9 + 0.15 * hash2(v.y * 3, v.z)), -59, T + 4, -62);
  near.add(new THREE.BoxGeometry(1.5, 0.5, 9.2), 0x8f826c, -59, T + 7.85, -62);
  ctx.texPlane(canvasTex(256, 206, drawPostcard), 8.1, 6.5, -58.27, T + 4.1, -62, PI / 2);

  // ---- the striped windbreak behind his head (fills the box x -56..56, z -88..-80 up to y 30)
  const stripes = [0xe5484d, 0xf6eedb, 0x3a7bd5, 0xf6eedb, 0xf2c14e, 0xf6eedb];
  const poleXs = []; for (let i = 0; i <= 8; i++) poleXs.push(-56 + i * 14);
  let si = 0;
  for (let p = 0; p < 8; p++) {
    for (let k = 0; k < 4; k++) {
      const x0 = poleXs[p] + k * 3.5, geo = new THREE.PlaneGeometry(3.5, 43.8, 2, 6);
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const u = (k * 3.5 + P.getX(i) + 1.75) / 14, v = (P.getY(i) + 21.9) / 43.8;
        P.setZ(i, -Math.sin(PI * u) * (1.0 + 0.3 * v));
      }
      geo.computeVertexNormals();
      cloth.add(geo, stripes[si++ % stripes.length], x0 + 1.75, -14 + 21.9, -80.9);
    }
  }
  for (const x of poleXs) {
    near.add(new THREE.CylinderGeometry(0.72, 0.8, 45.4, 8), 0x9a7148, x, -14 + 22.7, -80.75);
    near.add(new THREE.SphereGeometry(0.95, 10, 8), 0x8a6340, x, 31.6, -80.75);
    rope(far, V3(x, 30.6, -81), V3(x + 2, -13.5, -101), 0.12, 0xd8c49a, 4);
  }
  near.add(new THREE.BoxGeometry(113, 0.7, 0.55), 0x7a5a3a, 0, 29.65, -80.85);

  // ---- a big beach umbrella planted by the edge, leaning over him (canopy high up, casts no shadow)
  {
    const th = 0.2, B = V3(-46, -14, 2), L = 80, dir = V3(Math.sin(th), Math.cos(th), 0);
    const top = B.clone().addScaledVector(dir, L);
    const mid = B.clone().addScaledVector(dir, 40);
    near.addM(new THREE.CylinderGeometry(0.8, 0.85, 1, 10), 0xf4efe6, between(B, mid));
    near.addM(new THREE.CylinderGeometry(0.78, 0.8, 1, 10), 0x2ec4b6, between(mid, top));
    for (const t of [16, 24, 48, 64]) { const p = B.clone().addScaledVector(dir, t); near.add(new THREE.CylinderGeometry(0.86, 0.86, 1.2, 10), 0xe5484d, p.x, p.y, p.z, 0, 0, -th); }
    const R = 34, H = 8, P = 16, cols = [0xf25c54, 0xfff1d6, 0x2ec4b6, 0xfff1d6];
    const cp = top.clone().addScaledVector(dir, -2.5);
    farCloth.push(cp.x, cp.y, cp.z, 0, 0, -th);
    for (let k = 0; k < P; k++) {
      const pos = [], idx = [], m = 4;
      const a0 = k / P * PI * 2, a1 = (k + 1) / P * PI * 2;
      pos.push(0, H, 0);
      for (let i = 0; i <= m; i++) { const f = i / m, a = lerp(a0, a1, f); const sg = Math.sin(PI * f); pos.push(Math.cos(a) * R * 0.55, H * 0.46 - 0.4 * sg, Math.sin(a) * R * 0.55); }
      for (let i = 0; i <= m; i++) { const f = i / m, a = lerp(a0, a1, f); const sg = Math.sin(PI * f); pos.push(Math.cos(a) * R, -1.0 * sg, Math.sin(a) * R); }
      for (let i = 0; i <= m; i++) { const f = i / m, a = lerp(a0, a1, f); const sg = Math.sin(PI * f); pos.push(Math.cos(a) * R * 1.005, -2.6 - 1.4 * sg, Math.sin(a) * R * 1.005); }
      for (let i = 0; i < m; i++) idx.push(0, 2 + i, 1 + i);
      for (let r = 0; r < 2; r++) for (let i = 0; i < m; i++) { const a = 1 + r * (m + 1) + i, b = a + 1, c = a + m + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      farCloth.add(geo, cols[k % 4]);
    }
    farCloth.pop();
    far.add(new THREE.SphereGeometry(1.5, 10, 8), 0xe5484d, top.x + dir.x * 6, top.y + dir.y * 6, top.z);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * PI * 2;
      const tip = new THREE.Vector3(Math.cos(a) * R * 0.97, -0.6, Math.sin(a) * R * 0.97).applyAxisAngle(V3(0, 0, 1), -th).add(cp);
      const hub = cp.clone().addScaledVector(dir, -6);
      rope(far, hub, tip, 0.22, 0xd8d2c4, 4);
    }
  }

  // ---- a sandcastle on a sandbar out in the shallows
  far.add(new THREE.SphereGeometry(1, 22, 10), v => shade(v.y > -2.5 ? 0xd3bb88 : 0xbca578, 0.95 + 0.1 * hash2(v.x, v.z)), 108, -15, 52, 0, 0, 0, 34, 15.4, 24);
  let castleFlag;
  {
    const sand = 0xd9c08c, cx = 108, cz = 50, y0 = -0.6;
    far.push(cx, y0, cz, 0, 0.45, 0, 1.15);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      far.add(new THREE.CylinderGeometry(2.4, 3.0, 7, 10), vary(sand, 0.05), x, 3.5, z);
      for (let k = 0; k < 4; k++) far.add(new THREE.BoxGeometry(1.1, 1.2, 1.1), sand, x + Math.cos(k * PI / 2) * 1.8, 7.6, z + Math.sin(k * PI / 2) * 1.8);
    }
    for (const [x, z, ry] of [[0, -6, 0], [0, 6, 0], [-6, 0, PI / 2], [6, 0, PI / 2]]) {
      far.add(new THREE.BoxGeometry(10, 4.2, 1.6), shade(sand, 0.96), x, 2.1, z, 0, ry);
      for (let k = -1; k <= 1; k++) far.add(new THREE.BoxGeometry(1.4, 1, 1.6), sand, x + (ry ? 0 : k * 3.2), 4.7, z + (ry ? k * 3.2 : 0), 0, ry);
    }
    far.add(new THREE.CylinderGeometry(3.2, 4.2, 11, 12), sand, 0, 5.5, 0);
    far.add(new THREE.ConeGeometry(3.4, 4.2, 12), shade(sand, 1.05), 0, 13.1, 0);
    far.add(new THREE.TorusGeometry(11.5, 1.3, 4, 28), 0xb59c6e, 0, 0.1, 0, PI / 2, 0, 0, 1, 1, 0.35);
    for (let k = 0; k < 7; k++) far.add(new THREE.SphereGeometry(0.45, 6, 4), [0xffd9c7, 0xffffff, 0xf7b6a0][k % 3], -4 + k * 1.3, 2.6, -6.9);
    far.add(new THREE.CylinderGeometry(0.15, 0.15, 6, 5), 0x8a6a48, 0, 18, 0);
    far.pop();
    castleFlag = ctx.mesh(new THREE.PlaneGeometry(3.4, 2, 4, 1).translate(1.7, 0, 0), new THREE.MeshStandardMaterial({ color: 0xff5a8a, roughness: 0.8, side: THREE.DoubleSide }), cx, y0 + 20 * 1.15, cz, 'far');
  }

  // ---- palm trees on a little islet to his left
  far.add(new THREE.SphereGeometry(1, 20, 10), v => shade(v.y > -2 ? 0xdcc797 : 0xbca578, 0.95 + 0.1 * hash2(v.x, v.z)), -122, -14, -18, 0, 0, 0, 27, 16.5, 22);
  const palm = (x, y, z, h, lean, dirA, seed) => {
    const top = V3(x + Math.cos(dirA) * lean * h, y + h, z + Math.sin(dirA) * lean * h);
    const curve = new THREE.QuadraticBezierCurve3(V3(x, y - 3, z), V3(x + Math.cos(dirA) * lean * h * 0.15, y + h * 0.55, z + Math.sin(dirA) * lean * h * 0.15), top);
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = curve.getPoint(i / N), c = curve.getPoint((i + 1) / N);
      far.addM(new THREE.CylinderGeometry(lerp(2.9, 1.7, (i + 1) / N) * 1.12, lerp(2.9, 1.7, i / N) * 0.95, 1, 8), i % 2 ? 0x8a6a48 : 0x76583b, between(a, c));
    }
    for (let k = 0; k < 3; k++) far.add(new THREE.SphereGeometry(1.5, 8, 6), 0x5a3d22, top.x + Math.cos(k * 2.1) * 1.7, top.y - 1.3, top.z + Math.sin(k * 2.1) * 1.7);
    for (let k = 0; k < 9; k++) {
      const ang = k / 9 * PI * 2 + hash2(seed, k) * 0.5, len = h * (0.34 + hash2(k, seed) * 0.08);
      farCloth.addM(frondGeo(len, len * 0.13, 0.55 + hash2(seed + k, 3) * 0.3), null, M4(top.x, top.y, top.z, 0, -ang, 0.18 + hash2(k * 3, seed) * 0.2));
    }
  };
  palm(-124, 2, -22, 84, 0.22, 0.2, 1);
  palm(-114, 1.5, -8, 64, 0.3, 1.9, 2);

  // ---- far off past his feet: the mainland, a lifeguard tower and a pier with lamps
  const lgX = 135, lgZ = 300, lgY = seaY(lgX, lgZ);
  {
    far.push(lgX, lgY, lgZ, 0, PI + 0.3); farCloth.push(lgX, lgY, lgZ, 0, PI + 0.3);
    for (const [x, z] of [[-9, -8], [9, -8], [-9, 8], [9, 8]]) far.add(new THREE.BoxGeometry(2, 36, 2), 0xf0ece2, x, 16, z);
    for (const z of [-8, 8]) far.addM(new THREE.BoxGeometry(1, 1, 26), 0xf0ece2, M4(0, 14, z, 0, PI / 2, 0.85));
    far.add(new THREE.BoxGeometry(26, 1.5, 24), 0x9a7a58, 0, 34, 0);
    far.add(new THREE.BoxGeometry(20, 16, 16), 0xf2c14e, 0, 43, 0);
    far.add(new THREE.BoxGeometry(20.3, 3, 16.3), 0xe5484d, 0, 38, 0);
    far.add(new THREE.BoxGeometry(12, 6, 0.4), 0x1b2238, 0, 45, 8.05);
    far.add(new THREE.BoxGeometry(25, 1.4, 21), 0xe5484d, 0, 51.6, 0, 0.12);
    far.addM(new THREE.BoxGeometry(6, 1, 42), 0x9a7a58, M4(0, 17, 28, 0.9));
    far.add(new THREE.CylinderGeometry(0.3, 0.3, 16, 5), 0xdddddd, 9, 59, -6);
    farCloth.add(new THREE.PlaneGeometry(6, 3.6), 0xe5484d, 12, 64.6, -6);
    far.pop(); farCloth.pop();
  }
  const pierX = -150, pz0 = 300, pz1 = 150, deckY = 6;
  const lampPts = [];
  {
    const len = pz0 - pz1, mz = (pz0 + pz1) / 2;
    far.add(new THREE.BoxGeometry(16, 1.4, len), 0x8a6a4a, pierX, deckY, mz);
    for (let z = pz1 + 2; z <= pz0; z += 14) for (const dx of [-7, 7]) {
      const fy = seaY(pierX + dx, z);
      far.add(new THREE.CylinderGeometry(1.1, 1.2, deckY - fy, 6), 0x5e4632, pierX + dx, (deckY + fy) / 2, z);
      far.add(new THREE.BoxGeometry(0.6, 5, 0.6), 0x7a5a3e, pierX + dx * 1.07, deckY + 3.2, z);
    }
    for (const dx of [-7.5, 7.5]) far.add(new THREE.BoxGeometry(0.5, 0.5, len), 0x7a5a3e, pierX + dx, deckY + 5.6, mz);
    for (let z = pz1 + 8; z < pz0; z += 30) {
      far.add(new THREE.CylinderGeometry(0.4, 0.5, 14, 6), 0x2c2f38, pierX + 7.5, deckY + 7, z);
      lampPts.push([pierX + 7.5, deckY + 14.6, z]);
    }
    far.add(new THREE.BoxGeometry(12, 10, 12), 0x5bc0de, pierX, deckY + 5.7, pz1 + 8);
    far.add(new THREE.ConeGeometry(10, 6, 4), 0xf6eedb, pierX, deckY + 13.7, pz1 + 8, 0, PI / 4);
  }
  const lampMat = ctx.glow(glowMat(0xfff0c8, 0xffc070, 2.2));
  const lb = new Batch(); for (const [x, y, z] of lampPts) lb.add(new THREE.SphereGeometry(1.4, 10, 8), 0xffffff, x, y, z);
  ctx.mesh(lb.build(), lampMat, 0, 0, 0, 'far');
  ctx.glowPoints(pointsMat(0, 0xffc070, 420), lampPts.map(([x, y, z]) => ({ x, y, z, size: 9 })));
  // dune grass on the mainland
  for (let i = 0; i < ctx.count(40); i++) {
    const x = rr(-320, 320), z = rr(285, 360), y = seaY(x, z);
    for (let k = 0; k < 5; k++) far.add(new THREE.ConeGeometry(0.6, rr(6, 10), 3), vary(0x8a9a5a, 0.12), x + rr(-2, 2), y + 3, z + rr(-2, 2), rr(-0.3, 0.3), 0, rr(-0.3, 0.3));
  }
  // distant headland hills (unfogged silhouettes) with a sprinkle of town lights
  {
    const pos = [], idx = [], N = 60, R = 625;
    for (let i = 0; i <= N; i++) {
      const a = lerp(0.12, 0.88, i / N) * PI, h = 18 + 34 * vnoise(i * 0.22, 1) + 14 * vnoise(i * 0.7, 5);
      pos.push(Math.cos(a) * R, -30, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    ctx.mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0f1834, fog: false, toneMapped: false, side: THREE.DoubleSide }), 0, 0, 0, 'far');
    const tl = [];
    for (let i = 0; i < ctx.count(36); i++) { const a = lerp(0.2, 0.8, rnd()) * PI, R2 = 615; tl.push({ x: Math.cos(a) * R2, y: rr(-2, 14), z: Math.sin(a) * R2, size: rr(1.6, 2.8), color: rnd() < 0.8 ? 0xffd28a : 0xfff6e0 }); }
    ctx.glowPoints(pointsMat(0, 0xffffff, 1, false), tl);
  }

  ctx.tick((dt, t) => {
    const f = torch.update(t);
    ctx.lightFlicker = f;
    torchHalo.userData.flicker = f;
    torchHalo.scale.setScalar(13 * (0.94 + 0.06 * f));
    castleFlag.rotation.y = Math.sin(t * 1.7) * 0.35;
  });
}

// ================================================================ CAMPOUT
function buildCamp(ctx) {
  const { T, FY } = ctx;
  const near = ctx.b('solid'), shiny = ctx.b('shiny'), metal = ctx.b('metal'), flat = ctx.b('flat'), cloth = ctx.b('cloth');
  const far = ctx.b('solid', 'far'), farFlat = ctx.b('flat', 'far'), farCloth = ctx.b('cloth', 'far');
  ctx.sky = { background: 0x070a17, fog: 0x0c1328, fogDensity: 0.0042, hemiSky: 0x6e7fc2, hemiGround: 0x2b2316, hemiIntensity: 1.0, moonColor: 0xaabcf0, moonIntensity: 1.35 };
  addSky(ctx, { zenith: 0x03050e, horizon: 0x0c1328, low: 0x0a0f1e, glow: 0x2c3a68, moonDir: [-0.5, 0.62, -0.6], stars: 800 });
  const canvasC = ctx.env.colors?.cot ?? 0x5f6f45;
  const FIRE = [85, FY, 5];

  // ---- the forest floor: packed dirt in the clearing, needles and moss further out
  const floorY = (x, z) => { const r = Math.hypot(x, z); return FY + smooth(200, 420, r) * (vnoise(x * 0.015, z * 0.015) * 14 - 2); };
  const floorCol = (x, y, z) => {
    const r = Math.hypot(x, z), n = vnoise(x * 0.05, z * 0.05), n2 = vnoise(x * 0.17 + 7, z * 0.17);
    let c = mixHex(0x4a3b2c, 0x3a4a2c, smooth(60, 190, r + n * 60));
    if (n2 > 0.62) c = mixHex(c, 0x6a4a30, 0.6);            // rusty pine needles
    if (n2 < 0.25 && r > 70) c = mixHex(c, 0x44602f, 0.5);    // mossy grass
    if (Math.hypot(x - FIRE[0], z - FIRE[2]) < 22) c = mixHex(c, 0x2e2620, 0.5);
    return shade(c, 0.9 + 0.15 * n);
  };
  far.addM(radialGrid(690, Math.round(lerp(24, 40, ctx.n)), 72, floorY, floorCol), null, new THREE.Matrix4());

  // ---- the cot: side rails, end bars, X legs, and the canvas wrapped round the rails
  const alu = 0xa3acb6;
  for (const sx of [-1, 1]) metal.add(new THREE.CylinderGeometry(1.15, 1.15, 166, 10), alu, sx * 50.3, -0.9, -2, PI / 2);
  for (const z of [-84.2, 80.2]) metal.add(new THREE.CylinderGeometry(0.95, 0.95, 100.6, 10), alu, 0, -0.9, z, 0, 0, PI / 2);
  for (const sx of [-1, 1]) for (const z of [-85, 81]) near.add(new THREE.CylinderGeometry(1.25, 1.25, 1.2, 10), 0x2a2a2e, sx * 50.3, -0.9, z, PI / 2);
  for (const z0 of [-74, -26, 22, 70]) {
    for (const s of [-1, 1]) {
      const a = V3(s * 50.3, -1.4, z0 + s * 0.95), b = V3(-s * 45, FY + 1, z0 + s * 0.95);
      metal.addM(new THREE.CylinderGeometry(0.85, 0.85, 1, 8), alu, between(a, b));
      near.add(new THREE.CylinderGeometry(1.2, 1.3, 2, 8), 0x2a2a2e, -s * 45.3, FY + 1, z0 + s * 0.95);
    }
    metal.add(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 8), 0x7d858e, 0, -1.4 + (FY + 2.4) * 50.3 / 95.3, z0, PI / 2);
  }
  {
    const prof = [[49.6, 0.35], [50.6, 0.45], [51.45, -0.3], [51.5, -1.6], [51.45, -2.9]];
    for (const sx of [-1, 1]) {
      const rows = [];
      for (let i = 0; i <= 30; i++) {
        const z = lerp(-80, 76, i / 30);
        rows.push(prof.map(([x, y], j) => [sx * x, y + (j === prof.length - 1 ? Math.sin(z * 0.35) * 0.25 : 0), z]));
      }
      // rows run along z; build quads across the profile
      const pos = [], idx = [], M = prof.length;
      for (const r of rows) for (const p of r) pos.push(...p);
      for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j, b = a + 1, c = a + M, d = c + 1; idx.push(a, c, b, b, c, d); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      cloth.add(geo, shade(canvasC, 0.85));
    }
  }

  // ---- right table: a big cooler standing on a crate (fills x 51.5..73.5, z -80..-56 from the floor to T)
  const wood = 0x9a7048;
  crate(near, 51.5, 73.5, FY, -25, -80, -56, wood, false);
  near.addM(loftGeo([{ y: T - 3.2, hx: 10.95, hz: 11.95, r: 1.6 }, { y: -25, hx: 10.95, hz: 11.95, r: 1.6 }], 3, 3), 0xc8423b, M4(62.5, 0, -68));
  near.addM(loftGeo([{ y: -25 + 2.2, hx: 11.05, hz: 12.05, r: 1.65 }, { y: -25, hx: 11.05, hz: 12.05, r: 1.65 }], 3, 3), 0xf0ede4, M4(62.5, 0, -68));
  near.addM(loftGeo([
    { y: 3.2, hx: 11.4, hz: 12.4, r: 1.3 }, { y: 2.8, hx: 11.55, hz: 12.55, r: 1.45 }, { y: 0.35, hx: 11.55, hz: 12.55, r: 1.45 }, { y: 0, hx: 11.25, hz: 12.25, r: 1.4 },
  ], 3, 3), 0xd9d3c3, M4(62.5, T - 3.2, -68));
  for (const z of [-80.55, -55.45]) shiny.add(new THREE.TorusGeometry(3.2, 0.5, 6, 14, PI), 0xf0ede4, 62.5, -9.5, z, 0, 0, 0, 1, 1, 1);
  for (const z of [-75, -61]) shiny.add(new THREE.BoxGeometry(0.6, 2.6, 2.2), 0xdde3ea, 51.25, T - 3.4, z);
  ctx.texPlane(canvasTex(256, 112, drawCoolerLabel), 13, 5.7, 51.42, -12, -68, -PI / 2);
  // lantern on a shepherd's hook (the light)
  metal.add(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 16), 0x2f4a36, 68, T + 0.6, -74);
  metal.add(new THREE.CylinderGeometry(0.5, 0.55, 20.8, 8), 0x2f4a36, 68, T + 1.2 + 10.4, -74);
  metal.add(new THREE.TorusGeometry(2, 0.45, 6, 14, PI), 0x2f4a36, 66, T + 22 - 0.45, -74);
  metal.add(new THREE.SphereGeometry(0.5, 8, 6), 0x2f4a36, 64, T + 21.4, -74);
  const LX = 64, LY = T + 16.6;
  metal.add(new THREE.TorusGeometry(1.3, 0.12, 4, 12, PI), 0x8a8f98, LX, LY + 3.0, -74, 0, PI / 2);
  rope(metal, V3(LX, LY + 4.3, -74), V3(LX, T + 21.3, -74), 0.12, 0x8a8f98, 4);
  metal.add(new THREE.CylinderGeometry(0.6, 1.9, 1.3, 12), 0x2f5a3a, LX, LY + 2.65, -74);
  metal.add(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8), 0x2f5a3a, LX, LY + 3.5, -74);
  metal.add(new THREE.CylinderGeometry(1.9, 1.7, 1.3, 12), 0x2f5a3a, LX, LY - 2.55, -74);
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; metal.add(new THREE.CylinderGeometry(0.1, 0.1, 3.8, 4), 0x8a8f98, LX + Math.cos(a) * 1.6, LY, -74 + Math.sin(a) * 1.6); }
  const lanternMat = ctx.glow(glowMat(0xfff1c8, 0xffbf5e, 1.9));
  ctx.mesh(new THREE.CylinderGeometry(1.45, 1.45, 3.8, 14), lanternMat, LX, LY, -74);
  const lanternHalo = ctx.halo(0xffc070, 11, 0.5, LX, LY, -74, 'near', lanternMat);
  ctx.light = { pos: [LX, LY, -74], color: 0xffc27a, intensity: 2400 };
  // travel alarm clock with twin bells and a wind-up key
  near.add(new THREE.BoxGeometry(4, 6.2, 8.4), 0x7a3b2a, 59.5, T + 3.1, -66);
  for (const [dy, dz, w, h] of [[2.45, 0, 0.35, 7.9], [-2.45, 0, 0.35, 7.9], [0, 3.8, 5.25, 0.35], [0, -3.8, 5.25, 0.35]]) metal.add(new THREE.BoxGeometry(0.2, w, h), 0xd4af37, 57.45, T + 3.1 + dy, -66 + dz);
  for (const z of [-68.6, -63.4]) metal.add(new THREE.SphereGeometry(1.6, 14, 8, 0, PI * 2, 0, PI / 2), 0xd4af37, 59.5, T + 6.2, z);
  metal.add(new THREE.CylinderGeometry(0.25, 0.25, 4.2, 6), 0xd4af37, 59.5, T + 7.3, -66, PI / 2);
  metal.add(new THREE.TorusGeometry(1.1, 0.2, 5, 12), 0xd4af37, 59.5, T + 7.3, -66, 0, PI / 2);
  metal.add(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6), 0xd4af37, 62.0, T + 3.6, -66, 0, 0, PI / 2);
  for (const s of [-1, 1]) metal.add(new THREE.SphereGeometry(0.8, 8, 6), 0xd4af37, 62.7, T + 3.6, -66 + s * 0.8, 0, 0, 0, 0.25, 0.8, 1);
  clockFace(ctx);
  // tin camping mug (blue enamel, white speckles) of cocoa
  near.add(new THREE.CylinderGeometry(2.2, 2.1, 6.82, 18), [0x2f6fb0, 0x5a3420, 0x2f6fb0], 69, T + 3.41, -60.5);   // the top cap is the cocoa
  shiny.add(new THREE.TorusGeometry(2.1, 0.18, 6, 18), 0xdfe6ee, 69, T + 6.82, -60.5, PI / 2);
  for (let k = 0; k < 14; k++) { const a = rr(0, PI * 2), y = rr(0.8, 6); near.add(new THREE.SphereGeometry(0.2, 5, 4), 0xf4f6fa, 69 + Math.cos(a) * 2.19, T + y, -60.5 + Math.sin(a) * 2.19, 0, 0, 0, 1, 1, 0.4); }
  shiny.add(new THREE.TorusGeometry(1.6, 0.35, 6, 12, PI), 0x2f6fb0, 71.2, T + 3.6, -60.5, 0, 0, -PI / 2);
  const steam = [0, 1, 2].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe8eef8, transparent: true, opacity: 0, depthWrite: false })); s.userData.ph = i / 3; ctx.add(s); return s; });

  // ---- left table: two stacked wooden crates; firewood steps; a trail map board
  crate(near, -73.5, -51.5, FY, -27, -80, -56, shade(wood, 0.92), false);
  crate(near, -73.5, -51.5, -27, T, -80, -56, wood, true);
  const sten = canvasTex(256, 96, drawStencil('CAMP GEAR'));
  ctx.texPlane(sten, 14, 5.2, -51.48, -10, -68, PI / 2, { transparent: true, alphaTest: 0.05 });
  const bark = 0x6b4a2e, cut = 0xd9b98a, ring = 0xb08a5c;
  const logs = (cx, cz, y0, hx, hz, h, alongX) => {
    const r = h / 2, across = alongX ? hz * 2 : hx * 2, n = Math.max(1, Math.round(across / h)), sp = across / n;
    for (let i = 0; i < n; i++) {
      const o = -across / 2 + sp * (i + 0.5), len = (alongX ? hx : hz) * 2 + rr(0, 0.5), rad = r * rr(0.96, 1.0);
      const geo = new THREE.CylinderGeometry(rad, rad, len, 9);
      if (alongX) near.add(geo, [vary(bark, 0.1), i % 2 ? cut : ring, cut], cx + rr(-0.15, 0.15), y0 + r, cz + o, 0, 0, PI / 2);
      else near.add(geo, [vary(bark, 0.1), i % 2 ? cut : ring, cut], cx + o, y0 + r, cz + rr(-0.15, 0.15), PI / 2);
    }
  };
  logs(-64, -72, T, 7, 5, 1.6, true);
  logs(-65, -73, T + 1.6, 5.5, 4, 1.4, false);
  logs(-64.5, -72.5, T + 3.0, 4.5, 3.4, 1.6, true);
  near.add(new THREE.BoxGeometry(1.4, 8, 9), 0x8a6038, -59, T + 4, -62);
  for (const [dy, dz, h, w] of [[3.8, 0, 0.4, 9], [-3.8, 0, 0.4, 9], [0, 4.3, 8, 0.4], [0, -4.3, 8, 0.4]]) near.add(new THREE.BoxGeometry(1.5, h, w), 0x6a4426, -59, T + 4 + dy, -62 + dz);
  ctx.texPlane(canvasTex(256, 220, drawTrailMap), 8.1, 7.0, -58.27, T + 4, -62, PI / 2);

  // ---- the campfire: a ring of stones, a teepee of logs, flames, embers and sparks
  const [fx, , fz] = FIRE;
  for (let k = 0; k < 11; k++) { const a = k / 11 * PI * 2; boulder(flat, fx + Math.cos(a) * 12.5, FY + 0.6, fz + Math.sin(a) * 12.5, rr(3, 3.8), 0x6e6a66, k + 20); }
  far.add(new THREE.CircleGeometry(11, 20), 0x2a2522, fx, FY + 0.12, fz, -PI / 2);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * PI * 2 + 0.3, b0 = V3(fx + Math.cos(a) * 8.5, FY + 0.6, fz + Math.sin(a) * 8.5), b1 = V3(fx + Math.cos(a) * 1.2, FY + 13, fz + Math.sin(a) * 1.2);
    far.addM(new THREE.CylinderGeometry(1.05, 1.2, 1, 8), [0x3a2a1e, 0x8a6a48, 0x2a1e16], between(b0, b1));
  }
  for (const [a, l] of [[0.7, 17], [2.4, 15]]) far.add(new THREE.CylinderGeometry(1.3, 1.3, l, 8), [0x33261b, 0x6a4a30, 0x6a4a30], fx, FY + 1.3, fz, 0, a, PI / 2);
  const emberMat = ctx.glow(glowMat(0x1a0d08, 0xff5a1a, 1.6, { roughness: 0.9 }));
  const eb = new Batch();
  for (let i = 0; i < 18; i++) { const a = rr(0, PI * 2), r = rr(0, 8); eb.add(new THREE.IcosahedronGeometry(rr(0.6, 1.3), 0), 0xffffff, fx + Math.cos(a) * r, FY + 0.5, fz + Math.sin(a) * r, rr(0, 3), rr(0, 3)); }
  ctx.mesh(eb.build(), emberMat, 0, 0, 0, 'far');
  const fire = addFlames(ctx, fx, FY + 0.6, fz, [[0, 0, 22, 5.2], [3.2, 1.6, 13, 3], [-2.8, 2.4, 11, 2.6], [-1.5, -3.2, 14, 3.2], [2.2, -2.8, 9, 2.2]], undefined, 'far');
  const fireHalo = ctx.halo(0xff8a3a, 60, 0.42, fx, FY + 12, fz, 'far', fire.mats[0]);
  const sparks = []; for (let i = 0; i < ctx.count(40); i++) sparks.push({ x: fx + rr(-4, 4), y: FY + 6, z: fz + rr(-4, 4), size: rr(0.5, 1.0), color: rnd() < 0.5 ? 0xffb050 : 0xffe08a });
  ctx.glowPoints(pointsMat(2, 0xffffff, 420), sparks);
  ctx.extraLight = { pos: [fx, FY + 14, fz], color: 0xff8a3a, intensity: 3400 };
  // a blue enamel kettle warming on a flat stone
  boulder(flat, fx + 17, FY + 0.3, fz - 9, 3.2, 0x7a7570, 40);
  far.push(fx + 17, FY + 2.6, fz - 9, 0, 0.8);
  far.add(new THREE.SphereGeometry(3, 16, 10), 0x3a7fc0, 0, 2.2, 0, 0, 0, 0, 1, 0.8, 1);
  far.add(new THREE.CylinderGeometry(1.2, 1.4, 0.8, 12), 0x3a7fc0, 0, 4.7, 0);
  far.add(new THREE.SphereGeometry(0.6, 8, 6), 0x222428, 0, 5.3, 0);
  far.addM(new THREE.CylinderGeometry(0.35, 0.7, 1, 8), 0x3a7fc0, between(V3(2.2, 2.2, 0), V3(4.6, 4.2, 0)));
  far.add(new THREE.TorusGeometry(2.4, 0.2, 5, 14, PI), 0x2a2c30, 0, 4.6, 0, 0, PI / 2);
  far.pop();

  // ---- around the clearing: a log bench, a stump, the tent with Gerald's boots by the door
  far.add(new THREE.CylinderGeometry(5.5, 5.8, 46, 12), [0x5e4330, 0xcfa878, 0xcfa878], 124, FY + 5.5, 8, PI / 2, 0.15);
  far.add(new THREE.CylinderGeometry(6.5, 7.5, 11, 12), [0x5e4330, 0xcfa878, 0x5e4330], 64, FY + 5.5, 44);
  {
    const tz = -165, W = 54, H = 74, L = 84, y0 = FY, tent = 0xe0782e, trim = 0x7a4a2a;
    const z0 = tz - L / 2, z1 = tz + L / 2;
    const roof = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([s * W, y0, z0, s * W, y0, z1, 0, y0 + H, z1, 0, y0 + H, z0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g; };
    farCloth.add(roof(-1), tent); farCloth.add(roof(1), shade(tent, 0.92));
    const tri = (z, c, w = W, h = H, dz = 0) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-w, y0 + 0.05, z + dz, w, y0 + 0.05, z + dz, 0, y0 + h, z + dz], 3)); g.setIndex([0, 1, 2]); g.computeVertexNormals(); farCloth.add(g, c); };
    tri(z0, shade(tent, 0.8)); tri(z1, tent); tri(z1, 0x1a130e, 24, 58, 0.25);
    for (const s of [-1, 1]) {
      rope(far, V3(s * 24, y0 + 1, z1 + 0.5), V3(s * 1.5, y0 + 57, z1 + 0.5), 1.4, shade(tent, 0.75), 8);
      far.add(new THREE.BoxGeometry(W * 2 + 1, 4, 0.3), trim, 0, y0 + 2, s > 0 ? z1 + 0.15 : z0 - 0.15);
    }
    for (const z of [z0 - 1.5, z1 + 1.5]) far.add(new THREE.CylinderGeometry(0.6, 0.6, H + 8, 6), 0x8a8f98, 0, y0 + (H + 8) / 2, z);
    farCloth.add(new THREE.BufferGeometry().setFromPoints([V3(0, y0 + H + 8, z1 + 1.5), V3(0, y0 + H + 3, z1 + 1.5), V3(0, y0 + H + 5.5, z1 + 9)]), 0xe5484d);
    for (const s of [-1, 1]) for (const z of [z0 - 1.5, z1 + 1.5]) rope(far, V3(0, y0 + H + 4, z), V3(s * 30, y0, z + (z > tz ? 28 : -28)), 0.15, 0xd8c49a, 4);
    // Gerald's big boots, left by the tent door
    for (const [bx, ry] of [[30, 0.25], [44, -0.15]]) {
      far.push(bx, y0, z1 + 22, 0, ry);
      far.add(new THREE.CylinderGeometry(5.2, 5.6, 16, 14), 0x6b4528, 0, 11, -3);
      far.add(new THREE.SphereGeometry(1, 16, 10), 0x6b4528, 0, 3.4, 3, 0, 0, 0, 5.8, 4, 9);
      far.add(new THREE.BoxGeometry(11.6, 1.6, 19), 0x2e2420, 0, 0.8, 2);
      far.add(new THREE.TorusGeometry(5.3, 0.6, 5, 16), 0x4e331e, 0, 18.6, -3, PI / 2);
      for (let k = 0; k < 4; k++) far.add(new THREE.BoxGeometry(6, 0.35, 0.5), 0xe8d8b0, 0, 6 + k * 2.5, 2.4 - k * 1.3, -0.7);
      far.pop();
    }
  }

  // ---- tall pines ringing the clearing (instanced), ferns, grass, mushrooms, pinecones and rocks
  const pineB = new Batch();
  pineB.add(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 6), 0x4a3426, 0, 0.15, 0);
  [[0.21, 0.36, 0.15], [0.17, 0.32, 0.37], [0.13, 0.28, 0.57], [0.085, 0.22, 0.76], [0.045, 0.14, 0.9]].forEach(([r, h, y], i) => pineB.add(new THREE.ConeGeometry(r, h, 7), [0x284430, 0x2f4d34, 0x355638, 0x3a5e3c, 0x3f643f][i], 0, y + h / 2, 0, 0, i * 0.6));
  const pines = [];
  const tries = ctx.count(150);
  for (let i = 0; i < tries * 3 && pines.length < tries; i++) {
    const a = rr(0, PI * 2), r = pines.length < tries * 0.6 ? rr(150, 330) : rr(330, 560), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z + 165) < 80 || Math.hypot(x - fx, z - fz) < 50) continue;
    const s = rr(120, 210) * (r > 330 ? 1.25 : 1);
    pines.push({ x, y: floorY(x, z) - 2, z, ry: rr(0, PI * 2), s, sy: s * rr(0.9, 1.15), color: shade(0xffffff, rr(0.75, 1.05)) });
  }
  instanced(ctx, pineB.build(), KINDS.flat(), pines);
  const fernB = new Batch();
  for (let k = 0; k < 6; k++) fernB.addM(frondGeo(1, 0.16, 0.7, 0x4a8a46, 0x2f6034, 7), null, M4(0, 0.05, 0, 0, k / 6 * PI * 2 + 0.3, 0.55));
  const ferns = [];
  for (let i = 0; i < ctx.count(50); i++) { const a = rr(0, PI * 2), r = rr(90, 260), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x, z + 165) < 70) continue; ferns.push({ x, y: floorY(x, z), z, ry: rr(0, 6), s: rr(9, 16), color: shade(0xffffff, rr(0.8, 1.1)) }); }
  instanced(ctx, fernB.build(), KINDS.cloth(), ferns);
  const tuftB = new Batch();
  for (let k = 0; k < 5; k++) tuftB.add(new THREE.ConeGeometry(0.09, 1, 3), 0x5a7a3a, Math.cos(k * 1.3) * 0.15, 0.45, Math.sin(k * 1.3) * 0.15, Math.sin(k * 2.1) * 0.35, 0, Math.cos(k * 2.1) * 0.35);
  const tufts = [];
  for (let i = 0; i < ctx.count(260); i++) { const a = rr(0, PI * 2), r = Math.sqrt(rnd()) * 280 + 15, x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x - fx, z - fz) < 18 || Math.hypot(x, z + 165) < 60) continue; tufts.push({ x, y: floorY(x, z), z, ry: rr(0, 6), s: rr(2.5, 5.5), color: mixHex(0x6a8a40, 0xa09a50, rnd()) }); }
  instanced(ctx, tuftB.build(), KINDS.solid(), tufts);
  for (let i = 0; i < ctx.count(16); i++) {
    const a = rr(0, PI * 2), r = rr(60, 200), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - fx, z - fz) < 20 || Math.hypot(x, z + 165) < 60) continue;
    const s = rr(1.6, 2.8), y = floorY(x, z);
    far.add(new THREE.CylinderGeometry(0.7 * s, 0.9 * s, 2.6 * s, 8), 0xf4eee0, x, y + 1.3 * s, z);
    far.add(new THREE.SphereGeometry(2 * s, 12, 6, 0, PI * 2, 0, PI / 2), 0xd8382f, x, y + 2.4 * s, z, 0, 0, 0, 1, 0.75, 1);
    for (let k = 0; k < 5; k++) { const b = k * 1.3 + i; far.add(new THREE.SphereGeometry(0.32 * s, 5, 4), 0xfffaf0, x + Math.cos(b) * 1.1 * s, y + 3.6 * s - 0.2 * s * (k % 2), z + Math.sin(b) * 1.1 * s); }
  }
  for (let i = 0; i < ctx.count(24); i++) { const a = rr(0, PI * 2), r = rr(40, 220), x = Math.cos(a) * r, z = Math.sin(a) * r; far.add(new THREE.ConeGeometry(1.1, 3, 7), 0x7a5030, x, floorY(x, z) + 1, z, PI / 2 - 0.2, rr(0, 6)); }
  for (let i = 0; i < ctx.count(14); i++) { const a = rr(0, PI * 2), r = rr(110, 260), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x, z + 165) < 70) continue; boulder(farFlat, x, floorY(x, z), z, rr(4, 11), 0x6a6862, i + 60); }

  // ---- fireflies drifting about the clearing (some up at cot height)
  const ff = [];
  for (let i = 0; i < ctx.count(60); i++) { const a = rr(0, PI * 2), r = rr(20, 190); ff.push({ x: Math.cos(a) * r, y: FY + rr(4, i % 3 ? 45 : 85), z: Math.sin(a) * r, size: rr(1.2, 2.0), color: rnd() < 0.7 ? 0xffffff : 0xfff0a0 }); }
  ctx.glowPoints(pointsMat(1, 0xd8ff70, 420), ff);

  ctx.tick((dt, t) => {
    const f = fire.update(t);
    fireHalo.userData.flicker = f; fireHalo.scale.setScalar(60 * (0.92 + 0.08 * f));
    emberMat.emissive.copy(emberMat.userData.emissive0).multiplyScalar(0.75 + 0.25 * Math.sin(t * 2.3) * Math.sin(t * 3.7 + 1));
    const lf = 1 + 0.03 * Math.sin(t * 7.1) + 0.02 * Math.sin(t * 13.3);
    lanternMat.emissive.copy(lanternMat.userData.emissive0).multiplyScalar(lf);
    lanternHalo.userData.flicker = lf;
    ctx.lightFlicker = lf;
    for (const s of steam) {
      const k = (t * 0.25 + s.userData.ph) % 1;
      s.position.set(69 + Math.sin(k * 6 + s.userData.ph * 9) * 0.6, T + 7.5 + k * 6, -60.5);
      s.scale.setScalar(1.5 + k * 3); s.material.opacity = Math.sin(k * PI) * 0.22;
    }
    return clamp(f, 0, 1.3);
  });
}

// ================================================================ GARDEN HAMMOCK
// the fabric's shape (matches world.js hammockRim): flat in the middle, curling up to y 5 along the long sides
const nearStands = z => clamp01(1 - (Math.abs(z + 68) - 12) / 5);
const hammockRim = (x, z) => { const a = Math.max(0, Math.abs(x) - 40); return a * a * 0.05 * (1 - 0.7 * nearStands(z)); };
function buildHammock(ctx) {
  const { T, FY } = ctx;
  // the background swings: a pivot at (0, 45, 0) so rotation.z turns it round the axis through (0, 45, z)
  const swing = new THREE.Group(); swing.name = 'swing'; swing.position.set(0, 45, 0);
  const inner = new THREE.Group(); inner.position.set(0, -45, 0);
  swing.add(inner); ctx.group.add(swing);
  ctx.swing = swing; ctx.bg = inner;
  const near = ctx.b('solid'), shiny = ctx.b('shiny'), metal = ctx.b('metal'), cloth = ctx.b('cloth');
  const far = ctx.b('solid', 'far'), farFlat = ctx.b('flat', 'far'), farCloth = ctx.b('cloth', 'far'), farShiny = ctx.b('shiny', 'far');
  ctx.sky = { background: 0x0a0f22, fog: 0x121a36, fogDensity: 0.0034, hemiSky: 0x7f8fd0, hemiGround: 0x22301f, hemiIntensity: 1.1, moonColor: 0xb8c8ff, moonIntensity: 1.55 };
  addSky(ctx, { zenith: 0x050817, horizon: 0x121a36, low: 0x0d1428, glow: 0x34467a, moonDir: [0.62, 0.5, 0.6], stars: 600 });
  const fabricCols = ctx.env.colors?.hammock ?? [0xf1e4c6, 0xe0574f, 0xf0ad4e, 0xf1e4c6, 0x5bb8d6, 0x6cc070];
  const ZA = -125, ZB = 120, RT = 7;     // tree trunks
  const attachA = V3(0, 45, -117.4), attachB = V3(0, 45, 112.4);

  // ---- hammock hardware (fixed): spreader bars, rope fans, rings
  const rope0 = 0xdcc79d;
  for (const [zb, att] of [[-80.6, attachA], [76.6, attachB]]) {
    near.add(new THREE.CylinderGeometry(1.1, 1.1, 108, 12), 0xa8784a, 0, 1.0, zb, 0, 0, PI / 2);
    for (const sx of [-1, 1]) near.add(new THREE.SphereGeometry(1.5, 10, 8), 0x8a5e38, sx * 54.2, 1.0, zb);
    for (let i = 0; i <= 8; i++) {
      const x = -48 + i * 12;
      near.add(new THREE.SphereGeometry(0.6, 8, 6), rope0, x, 2.05, zb);
      rope(near, V3(x, 2.0, zb), att, 0.22, rope0);
    }
    metal.add(new THREE.TorusGeometry(1.4, 0.32, 6, 16), 0x9aa0a8, att.x, att.y, att.z, 0, 0, 0);
  }
  // ---- the fabric's underside, hems along the long sides, and the ends gathered on the bars
  {
    const shellY = (x, z) => {
      const ez = Math.min(z + 80, 76 - z), ex = 50 - Math.abs(x);
      const sag = 2.6 * Math.exp(-((x / 28) ** 2)) * (1 - smooth(50, 76, Math.abs(z + 2)));
      return hammockRim(x, z) - 0.9 - sag - 0.9 * clamp01(1 - ez / 1.6) - 0.5 * clamp01(1 - ex / 1.6);
    };
    const nS = 13, w = 99.6 / nS;
    for (let i = 0; i < nS; i++) {
      const x0 = -49.8 + i * w;
      cloth.add(gridGeo(x0, x0 + w, -80, 76, 2, Math.round(lerp(24, 40, ctx.n)), shellY, true), shade(fabricCols[i % fabricCols.length], 0.82));
    }
    for (const sx of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 26; i++) { const z = lerp(-80.2, 76.2, i / 26); pts.push(V3(sx * 49.85, hammockRim(49.85, z) - 0.62, z)); }
      near.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 52, 0.55, 6), 0xc9a872);
    }
    for (const [z, zb] of [[-80, -80.3], [76, 76.3]]) {
      const pos = [], idx = [], N = 40;
      for (let i = 0; i <= N; i++) { const x = lerp(-50, 50, i / N); pos.push(x, hammockRim(x, z) - 1.15, zb, x * 1.02, 1.0, zb + (zb < 0 ? -0.3 : 0.3)); }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      cloth.add(geo, shade(fabricCols[0], 0.78));
    }
  }

  // ---- right table: a slatted garden table (fills x 51.5..73.5, z -80..-56, top at T; legs run on below the lawn)
  const teak = 0x9a6a3e, LEGBOT = FY - 26;
  {
    const n = 6, bw = (24 - (n - 1) * 0.36) / n;
    for (let i = 0; i < n; i++) near.add(new THREE.BoxGeometry(22, 1.2, bw), vary(teak, 0.06), 62.5, T - 0.6, -80 + bw / 2 + i * (bw + 0.36));
    for (const z of [-78.6, -57.4]) near.add(new THREE.BoxGeometry(19.6, 3, 0.9), shade(teak, 0.85), 62.5, T - 2.7, z);
    for (const x of [52.9, 72.1]) near.add(new THREE.BoxGeometry(0.9, 3, 21.2), shade(teak, 0.85), x, T - 2.7, -68);
    for (const x of [53.3, 71.7]) for (const z of [-78.2, -57.8]) near.add(new THREE.BoxGeometry(2.4, T - 1.2 - LEGBOT, 2.4), shade(teak, 0.9), x, (T - 1.2 + LEGBOT) / 2, z);
    for (const z of [-78.2, -57.8]) near.add(new THREE.BoxGeometry(18, 1.4, 1.2), shade(teak, 0.85), 62.5, FY + 9, z);
    for (let i = 0; i < 5; i++) near.add(new THREE.BoxGeometry(18, 0.8, 3.4), vary(teak, 0.06), 62.5, -30, -76 + i * 4);
    // a watering can on the lower shelf
    near.push(60, -29.6, -68, 0, 0.6);
    near.add(new THREE.CylinderGeometry(3.4, 3.6, 7, 16), 0x4caf7a, 0, 3.5, 0);
    near.addM(new THREE.CylinderGeometry(0.45, 0.7, 1, 8), 0x4caf7a, between(V3(2.6, 2, 0), V3(8, 8.5, 0)));
    near.add(new THREE.ConeGeometry(1.1, 1.4, 10), 0x3a9a66, 8.3, 8.9, 0, 0, 0, -0.9);
    near.add(new THREE.TorusGeometry(3, 0.4, 6, 14, PI), 0x3a9a66, -0.5, 7, 0, 0, PI / 2);
    near.pop();
  }
  // garden lantern on a post (the light)
  metal.add(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 16), 0x2c2f36, 68, T + 0.6, -74);
  metal.add(new THREE.CylinderGeometry(0.5, 0.55, 16.4, 8), 0x23262c, 68, T + 1.2 + 8.2, -74);
  metal.add(new THREE.BoxGeometry(3.6, 0.5, 3.6), 0x23262c, 68, T + 17.4, -74);
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; metal.add(new THREE.BoxGeometry(0.35, 4.2, 0.35), 0x23262c, 68 + Math.cos(a) * 1.85, T + 19.7, -74 + Math.sin(a) * 1.85); }
  metal.add(new THREE.ConeGeometry(2.9, 2.2, 4), 0x23262c, 68, T + 22.9, -74, 0, PI / 4);
  metal.add(new THREE.SphereGeometry(0.45, 8, 6), 0x23262c, 68, T + 24.3, -74);
  const gl = ctx.glow(glowMat(0xfff1c8, 0xffbf5e, 1.8));
  ctx.mesh(new THREE.BoxGeometry(3.0, 4.0, 3.0), gl, 68, T + 19.7, -74);
  const glHalo = ctx.halo(0xffc070, 11, 0.5, 68, T + 19.7, -74, 'near', gl);
  ctx.light = { pos: [68, T + 19.7, -74], color: 0xffbe78, intensity: 2500 };
  // alarm clock (mint, twin bells) with the game's face
  near.add(new THREE.BoxGeometry(4, 6.2, 8.4), 0x7fd6b8, 59.5, T + 3.1, -66);
  for (const [dy, dz, w, h] of [[2.45, 0, 0.35, 7.9], [-2.45, 0, 0.35, 7.9], [0, 3.8, 5.25, 0.35], [0, -3.8, 5.25, 0.35]]) shiny.add(new THREE.BoxGeometry(0.2, w, h), 0xfff4e0, 57.45, T + 3.1 + dy, -66 + dz);
  for (const z of [-68.6, -63.4]) metal.add(new THREE.SphereGeometry(1.6, 14, 8, 0, PI * 2, 0, PI / 2), 0xd8d8e0, 59.5, T + 6.2, z);
  metal.add(new THREE.TorusGeometry(1.3, 0.22, 5, 12, PI), 0xd8d8e0, 59.5, T + 6.2, -66, 0, PI / 2);
  clockFace(ctx);
  // a glass of lemonade: glass, lemonade, ice, a lemon slice on the rim and a striped straw
  ctx.mesh(new THREE.CylinderGeometry(2.2, 2.0, 7, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }), 69, T + 3.5, -60.5);
  ctx.mesh(new THREE.CylinderGeometry(2.06, 1.9, 5.4, 22), new THREE.MeshStandardMaterial({ color: 0xffe36b, transparent: true, opacity: 0.72, roughness: 0.1, depthWrite: false }), 69, T + 2.8, -60.5);
  const ice = new THREE.MeshStandardMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.55, roughness: 0.05 });
  for (const [dx, dz, r] of [[-0.6, 0.4, 0.4], [0.7, -0.3, 1.1], [0.1, 0.9, 2.2]]) { const c = ctx.mesh(new THREE.BoxGeometry(1.2, 1.1, 1.2), ice, 69 + dx, T + 5.3, -60.5 + dz); c.rotation.set(r, r * 0.7, 0.3); }
  near.add(new THREE.CylinderGeometry(1.5, 1.5, 0.35, 16, 1, false, 0, PI), [0xffd21f, 0xfff07a, 0xfff07a], 66.85, T + 6.8, -60.5, PI / 2, 0, PI / 2);
  near.addM(new THREE.CylinderGeometry(0.26, 0.26, 1, 8), 0xffffff, between(V3(69.3, T + 4.5, -60.3), V3(69.9, T + 8.3, -59.9)));
  near.addM(new THREE.CylinderGeometry(0.26, 0.26, 1, 8), 0xff7fb0, between(V3(69.9, T + 8.3, -59.9), V3(70.4, T + 11.4, -59.5)));

  // ---- left table: a raised wooden planter box (soil flush with its rim at T)
  {
    const plank = 0x8c6239;
    near.add(new THREE.BoxGeometry(21.6, 1, 23.6), v => shade(0x5c4330, 0.85 + 0.25 * hash2(v.x * 1.3, v.z * 1.1)), -62.5, T - 0.5, -68);
    for (const x of [-73.1, -51.9]) for (let k = 0; k < 3; k++) near.add(new THREE.BoxGeometry(0.8, 2.25, 24), vary(plank, 0.07), x, T - 1.15 - k * 2.35, -68);
    for (const z of [-79.6, -56.4]) for (let k = 0; k < 3; k++) near.add(new THREE.BoxGeometry(22, 2.25, 0.8), vary(plank, 0.07), -62.5, T - 1.15 - k * 2.35, z);
    for (const x of [-72.2, -52.8]) for (const z of [-78.8, -57.2]) near.add(new THREE.BoxGeometry(2.6, T - 7 - LEGBOT, 2.6), shade(plank, 0.85), x, (T - 7 + LEGBOT) / 2, z);
    for (const z of [-79.2, -56.8]) near.add(new THREE.BoxGeometry(25, 1, 1), shade(plank, 0.8), -62.5, -28, z, 0, 0, z < -68 ? 0.7 : -0.7);
    for (let i = 0; i < 5; i++) near.add(new THREE.BoxGeometry(18, 0.8, 3.4), vary(plank, 0.06), -62.5, -36, -76 + i * 4);
    for (const [x, z, s] of [[-58, -70, 1], [-66, -64, 0.8]]) {
      near.add(new THREE.CylinderGeometry(2.6 * s, 2 * s, 4 * s, 12), 0xc96a3f, x, -35.6 + 2 * s, z);
      near.add(new THREE.SphereGeometry(2.4 * s, 10, 8), 0x5a9a4a, x, -35.6 + 4.8 * s, z, 0, 0, 0, 1, 0.8, 1);
    }
    // tiny seedlings poking out of the soil
    for (const [x, z] of [[-53.5, -78.3], [-71.8, -57.6], [-53.2, -57.2], [-71.5, -79]]) {
      near.add(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 4), 0x6aa04a, x, T + 0.45, z);
      for (const s of [-1, 1]) near.add(new THREE.SphereGeometry(0.35, 6, 4), 0x7cc456, x + s * 0.35, T + 0.9, z, 0, 0, s * 0.5, 1, 0.3, 0.6);
    }
  }
  // upside-down terracotta troughs as steps, a seed-packet sign
  const trough = (cx, cz, y0, y1, hx, hz, c) => {
    const h = y1 - y0;
    near.add(new THREE.BoxGeometry(hx * 2 + 0.2, h - 0.4, hz * 2 + 0.2), c, cx, y0 + 0.4 + (h - 0.4) / 2, cz);
    near.add(new THREE.BoxGeometry(hx * 2 + 0.8, 0.45, hz * 2 + 0.8), shade(c, 0.88), cx, y0 + 0.225, cz);
    near.add(new THREE.CircleGeometry(0.55, 10), 0x3a2418, cx, y1 + 0.01, cz, -PI / 2);
  };
  trough(-64, -72, T, T + 1.6, 7, 5, 0xc96a3f);
  trough(-65, -73, T + 1.6, T + 3.0, 5.5, 4, 0xd4794a);
  trough(-64.5, -72.5, T + 3.0, T + 4.6, 4.5, 3.4, 0xbf6038);
  near.add(new THREE.BoxGeometry(1.4, 8, 9), 0x9a7048, -59, T + 4, -62);
  ctx.texPlane(canvasTex(220, 240, drawSeedPacket), 7.8, 7.6, -58.27, T + 4, -62, PI / 2);

  // ================================ the swinging background
  // lawn with mowing stripes inside the fence
  // (flat, so each mowing stripe is its own strip: crisp stripes for very few triangles)
  far.add(gridGeo(-700, 700, -700, 700, 24, 24, () => FY - 0.4), v => shade(0x2d4527, 0.9 + 0.15 * vnoise(v.x * 0.02, v.z * 0.02)));
  for (let i = 0, x = -230; x < 230; i++, x += 23) {
    far.add(gridGeo(x, Math.min(230, x + 23), -270, 250, 1, 12, () => FY), v => shade(i % 2 ? 0x4d7a3a : 0x426c32, 0.9 + 0.15 * vnoise(v.x * 0.04, v.z * 0.04)));
  }
  // the two trees the hammock hangs from
  const bark = 0x5a4030;
  for (const [zt, side] of [[ZA, -1], [ZB, 1]]) {
    far.add(new THREE.CylinderGeometry(9, 13, 10, 14), v => shade(bark, 0.85 + 0.2 * hash2(Math.atan2(v.z - zt, v.x) * 4, 1)), 0, FY + 5, zt);
    // 205 tall from the lawn; radius RT where the hammock rope meets it at y 45
    far.add(new THREE.CylinderGeometry(5.4, 8.5, 205, 14, 4), v => shade(bark, 0.8 + 0.3 * hash2(Math.round(Math.atan2(v.z - zt, v.x) * 3), 2)), 0, FY + 102.5, zt);
    for (const [a, y, l] of [[0.6, 70, 60], [2.6, 82, 52], [4.3, 66, 48], [5.4, 90, 44]]) {
      const b0 = V3(Math.cos(a) * 4, y, zt + Math.sin(a) * 4), b1 = V3(Math.cos(a) * l, y + l * 0.85, zt + Math.sin(a) * l * 0.7 - side * 8);
      far.addM(new THREE.CylinderGeometry(1.6, 3, 1, 8), bark, between(b0, b1));
    }
    for (let k = 0; k < 11; k++) {
      const a = rr(0, PI * 2), r = rr(0, 42);
      farFlat.add(new THREE.IcosahedronGeometry(rr(22, 34), 1), vary(0x2f5a32, 0.12), Math.cos(a) * r, rr(140, 185), zt + Math.sin(a) * r * 0.8 - side * 6, rr(0, 3), rr(0, 3), 0, 1, rr(0.75, 0.95), 1);
    }
    far.add(new THREE.TorusGeometry(RT + 0.25, 0.7, 6, 24), 0xc0392b, 0, 45, zt, PI / 2, 0, 0, 1, 1, 1.3);
  }
  // string lights between the trees and over to the shed and the house
  const bulbCols = [0xffcf6b, 0xff8fb0, 0x8fe0ff, 0xb6ff8f];
  const bulbMats = bulbCols.map(c => ctx.glow(glowMat(0xffffff, c, 1.6, { roughness: 0.4 })));
  const bulbLists = bulbCols.map(() => []), bulbHalos = [];
  const strands = [[V3(7.4, 92, ZA + 4), V3(7.4, 92, ZB - 4), 22], [V3(-7.4, 98, ZB + 3), V3(-118, 93, 252), 18], [V3(-7.2, 88, ZA - 3), V3(-154, 20, -150), 14], [V3(7.2, 86, ZB + 3), V3(175, -16, 250), 16]];
  let bi = 0;
  for (const [a, b, sag] of strands) {
    const curve = sagCurve(a, b, sag);
    far.add(new THREE.TubeGeometry(curve, 40, 0.18, 4), 0x2a2a2a);
    const n = Math.round(curve.getLength() / 7.5);
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n), k = bi++ % 4;
      far.add(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 6), 0x303030, p.x, p.y - 0.5, p.z);
      bulbLists[k].push({ x: p.x, y: p.y - 1.9, z: p.z, s: 1 });
      bulbHalos.push({ x: p.x, y: p.y - 1.9, z: p.z, size: 7, color: bulbCols[k] });
    }
  }
  const bulbGeo = new THREE.SphereGeometry(0.85, 8, 6).scale(1, 1.3, 1);
  bulbLists.forEach((list, k) => instanced(ctx, bulbGeo, bulbMats[k], list));
  ctx.glowPoints(pointsMat(0, 0xffffff, 420), bulbHalos);
  // picket fence round the garden (instanced pickets, merged rails and posts)
  const picketB = new Batch();
  picketB.add(new THREE.BoxGeometry(4.2, 34, 1.2), 0xe8e4d8, 0, 17, 0);
  picketB.add(new THREE.ConeGeometry(2.97, 3.2, 4), 0xe8e4d8, 0, 35.6, 0, 0, PI / 4, 0, 1, 1, 0.4);
  const pickets = [];
  const fenceRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 6.4), ry = Math.atan2(x1 - x0, z1 - z0) + PI / 2;
    for (let i = 0; i <= n; i++) { const t = i / n; pickets.push({ x: lerp(x0, x1, t), y: FY, z: lerp(z0, z1, t), ry, s: 1, sy: rr(0.97, 1.03) }); }
    for (const y of [9, 27]) far.addM(new THREE.BoxGeometry(L, 2.4, 1.2), 0xd8d2c4, M4((x0 + x1) / 2, FY + y, (z0 + z1) / 2 - 0, 0, ry, 0).multiply(M4(0, 0, -1.2)));
    for (let i = 0; i <= Math.ceil(L / 60); i++) { const t = Math.min(1, i * 60 / L); far.add(new THREE.BoxGeometry(3.4, 38, 3.4), 0xd8d2c4, lerp(x0, x1, t), FY + 19, lerp(z0, z1, t)); }
  };
  fenceRun(-230, -270, 230, -270); fenceRun(-230, -270, -230, 250); fenceRun(230, -270, 230, 250);
  fenceRun(-230, 250, -175, 250); fenceRun(175, 250, 230, 250);
  const pm = KINDS.solid(); instanced(ctx, picketB.build(), pm, pickets);
  // the back of the house: one warm window, the rest asleep
  {
    const hz = 256, W = 175, Hh = 150, brick = 0x7b4a3e, trim = 0xefe6d6;
    far.add(new THREE.BoxGeometry(W * 2, Hh, 110), v => shade(brick, 0.92 + 0.1 * hash2(Math.floor(v.y / 4), Math.floor(v.x / 9))), 0, FY + Hh / 2, hz + 55);
    const roofG = new THREE.BufferGeometry();
    roofG.setAttribute('position', new THREE.Float32BufferAttribute([-W - 6, 0, -8, W + 6, 0, -8, W + 6, 62, 55, -W - 6, 62, 55, -W - 6, 0, 118, W + 6, 0, 118], 3));
    roofG.setIndex([0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2]); roofG.computeVertexNormals();
    farCloth.add(roofG, 0x3a3f52, 0, FY + Hh, hz);
    far.add(new THREE.BoxGeometry(22, 50, 22), brick, 110, FY + Hh + 50, hz + 40);
    far.add(new THREE.BoxGeometry(W * 2 + 4, 4, 3), trim, 0, FY + Hh, hz - 1);
    const winDark = 0x1b2340;
    const win = (x, y, w, h, lit) => {
      far.add(new THREE.BoxGeometry(w + 4, h + 4, 1.2), trim, x, y, hz - 0.4);
      if (lit) {
        const wm = ctx.glow(glowMat(0xffe0a8, 0xffb860, 1.5));
        ctx.mesh(new THREE.PlaneGeometry(w, h), wm, x, y, hz - 1.1, 'far').rotation.y = PI;
        for (const s of [-1, 1]) farCloth.add(new THREE.PlaneGeometry(w * 0.28, h), 0xe86a8a, x + s * w * 0.36, y, hz - 1.4);
        ctx.halo(0xffb860, w * 2.6, 0.18, x, y, hz - 4, 'far', wm);
      } else farShiny.add(new THREE.BoxGeometry(w, h, 0.6), winDark, x, y, hz - 0.8);
      far.add(new THREE.BoxGeometry(w, 1.4, 1.6), trim, x, y, hz - 1.6);
      far.add(new THREE.BoxGeometry(1.4, h, 1.6), trim, x, y, hz - 1.6);
      far.add(new THREE.BoxGeometry(w + 6, 1.6, 4), trim, x, y - h / 2 - 2.5, hz - 2);
    };
    win(-92, FY + 52, 40, 30, true);
    win(92, FY + 52, 36, 30, false);
    for (const x of [-110, 0, 110]) win(x, FY + 118, 30, 28, false);
    far.add(new THREE.BoxGeometry(26, 48, 1.4), 0x2f5a6a, 10, FY + 24, hz - 0.6);
    far.add(new THREE.SphereGeometry(1.3, 8, 6), 0xd4af37, 19, FY + 24, hz - 1.8);
    for (let k = 0; k < 3; k++) far.add(new THREE.BoxGeometry(40 - k * 4, 4, 18 - k * 6), 0x9a9086, 10, FY + 2 + k * 4, hz - 9 + k * 3);
    for (const sx of [-1, 1]) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute([sx * W, 0, 0, sx * W, 0, 110, sx * W, 55, 55], 3)); gg.setIndex([0, 1, 2]); gg.computeVertexNormals(); farCloth.add(gg, brick, 0, FY + Hh, hz); }
    far.add(new THREE.CylinderGeometry(1.4, 1.4, Hh, 8), 0x8a8f98, -W + 8, FY + Hh / 2, hz - 2.5);
  }
  // the shed
  {
    const sx = -165, sz = -180, w = 70, d = 56, h = 54;
    for (const b of [far, farCloth, farShiny]) b.push(sx, FY, sz, 0, 0.35);
    far.add(new THREE.BoxGeometry(w, h, d), v => shade(0x7a5a3a, 0.88 + 0.14 * hash2(Math.floor((v.x + v.z) / 5), 3)), 0, h / 2, 0);
    for (let x = -w / 2 + 5; x < w / 2; x += 5) far.add(new THREE.BoxGeometry(0.4, h, 0.4), 0x5a4028, x, h / 2, d / 2 + 0.2);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2 - 4, h, -d / 2 - 4, -w / 2 - 4, h, d / 2 + 4, 0, h + 22, d / 2 + 4, 0, h + 22, -d / 2 - 4, w / 2 + 4, h, d / 2 + 4, w / 2 + 4, h, -d / 2 - 4], 3));
    rg.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5]); rg.computeVertexNormals();
    farCloth.add(rg, 0x3c5a4a);
    const gab = new THREE.BufferGeometry(); gab.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, h, 0, w / 2, h, 0, 0, h + 22, 0], 3)); gab.setIndex([0, 1, 2]); gab.computeVertexNormals();
    for (const z of [-d / 2, d / 2]) farCloth.add(gab, 0x7a5a3a, 0, 0, z);
    far.add(new THREE.BoxGeometry(18, 38, 1), 0x4a6a5a, -14, 19, d / 2 + 0.6);
    far.add(new THREE.SphereGeometry(0.9, 8, 6), 0xd4af37, -8, 19, d / 2 + 1.4);
    farShiny.add(new THREE.BoxGeometry(16, 13, 0.6), 0x1b2340, 16, 32, d / 2 + 0.4);
    far.add(new THREE.BoxGeometry(17.5, 1, 1.2), 0xefe6d6, 16, 32, d / 2 + 0.8); far.add(new THREE.BoxGeometry(1, 14.5, 1.2), 0xefe6d6, 16, 32, d / 2 + 0.8);
    far.add(new THREE.BoxGeometry(18, 4, 5), 0x8c6239, 16, 23.5, d / 2 + 2.6);
    for (let k = 0; k < 5; k++) far.add(new THREE.SphereGeometry(1.5, 8, 6), [0xff8fb0, 0xffe14a, 0xffffff, 0xb08fff, 0xff6a5a][k], 9.5 + k * 3.2, 26.4, d / 2 + 2.6);
    for (const b of [far, farCloth, farShiny]) b.pop();
  }
  // flower beds along the fence and the house (instanced stems and heads)
  const stems = [], heads = [];
  const bed = (x0, z0, x1, z1, n) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    far.addM(new THREE.BoxGeometry(16, 1.4, L), v => shade(0x3a2a1e, 0.85 + 0.2 * hash2(v.x * 0.5, v.z * 0.5)), M4((x0 + x1) / 2, FY + 0.4, (z0 + z1) / 2, 0, ry, 0));
    for (let i = 0; i < n; i++) {
      const t = rnd(), o = rr(-6, 6), x = lerp(x0, x1, t) + Math.cos(ry) * o, z = lerp(z0, z1, t) - Math.sin(ry) * o, h = rr(6, 13);
      stems.push({ x, y: FY, z, s: 1, sy: h });
      heads.push({ x, y: FY + h, z, s: rr(1.2, 2.0), ry: rr(0, 6), color: [0xff8fb0, 0xffe14a, 0xb08fff, 0xffffff, 0xff6a5a, 0xffa94d][i % 6] });
    }
  };
  const fb = ctx.count(60);
  bed(-214, -230, -214, 200, fb); bed(214, -230, 214, 200, fb); bed(-150, 238, -40, 238, Math.round(fb / 2)); bed(60, 238, 160, 238, Math.round(fb / 2));
  const stemGeo = new THREE.CylinderGeometry(0.18, 0.22, 1, 4).translate(0, 0.5, 0);
  instanced(ctx, stemGeo, new THREE.MeshStandardMaterial({ color: 0x4e8a3a, roughness: 0.9 }), stems);
  const headB = new Batch();
  for (let k = 0; k < 5; k++) headB.add(new THREE.OctahedronGeometry(0.75), 0xffffff, Math.cos(k * PI * 0.4) * 0.8, 0, Math.sin(k * PI * 0.4) * 0.8, 0, -k * PI * 0.4, 0, 1, 0.35, 0.8);
  headB.add(new THREE.OctahedronGeometry(0.5), 0xffd23a, 0, 0.18, 0, 0, 0, 0, 1, 0.6, 1);
  instanced(ctx, headB.build(), KINDS.solid(), heads);
  // two garden gnomes keeping watch, a birdbath, stepping stones, and Gerald's slippers and book under the hammock
  const gnome = (x, z, ry, s, hatC) => {
    far.push(x, FY, z, 0, ry, 0, s);
    far.add(new THREE.CylinderGeometry(3.2, 4.2, 8, 14), 0x3a6fb0, 0, 4, 0);
    far.add(new THREE.CylinderGeometry(3.3, 3.3, 1, 14), 0x4a3020, 0, 5.4, 0);
    far.add(new THREE.SphereGeometry(1, 12, 10), 0xf2c2a0, 0, 10, 0, 0, 0, 0, 2.6, 2.6, 2.6);
    far.add(new THREE.SphereGeometry(0.9, 10, 8), 0xf09a8a, 0, 9.6, 2.6);
    far.add(new THREE.ConeGeometry(2.6, 5.5, 12), 0xf6f2ea, 0, 6.8, 1.6, PI, 0, 0, 1, 1, 0.6);
    far.add(new THREE.ConeGeometry(3, 9, 12), hatC, 0, 15.6, -0.4, -0.18);
    for (const sx of [-1, 1]) { far.add(new THREE.SphereGeometry(0.35, 6, 4), 0x222222, sx * 1.05, 10.7, 2.3); far.add(new THREE.SphereGeometry(1.3, 8, 6), 0x4a3020, sx * 1.6, 0.6, 1.2, 0, 0, 0, 1, 0.6, 1.5); }
    far.pop();
  };
  gnome(100, 30, -1.4, 1.1, 0xe0413a); gnome(-96, 88, 1.2, 1.0, 0xe0413a); gnome(-120, -200, 0.6, 0.9, 0x4caf50);
  far.add(new THREE.CylinderGeometry(2.6, 4.5, 26, 12), 0xb8b2a6, 140, FY + 13, -40);
  far.add(new THREE.CylinderGeometry(11, 6, 3.4, 18), 0xc4beb2, 140, FY + 27.6, -40);
  farShiny.add(new THREE.CircleGeometry(9.6, 18), 0x5a7aa8, 140, FY + 29.0, -40, -PI / 2);
  for (let i = 0; i < 7; i++) { const z = 230 - i * 15, x = Math.sin(i * 0.9) * 6; farFlat.add(new THREE.CylinderGeometry(rr(5, 6.5), rr(5.5, 7), 1.2, 9), vary(0x9a958c, 0.08), x, FY + 0.4, z, 0, rr(0, 3)); }
  for (const [x, z, ry] of [[14, 8, 0.3], [21, 12, 0.5]]) {
    far.push(x, FY, z, 0, ry);
    far.add(new THREE.SphereGeometry(1, 12, 8), 0x5b7fd0, 0, 1.1, 0, 0, 0, 0, 3.4, 1.6, 7);
    far.add(new THREE.SphereGeometry(1, 12, 8), 0xf6f2ea, 0, 2.0, 3.2, 0, 0, 0, 3.0, 1.4, 2.6);
    far.pop();
  }
  far.push(-16, FY + 0.5, 18, 0, 0.7);
  far.add(new THREE.BoxGeometry(11, 0.9, 15), 0x2f6a8a, -5.6, 0.45, 0, 0, 0, 0.18);
  far.add(new THREE.BoxGeometry(11, 0.9, 15), 0x2f6a8a, 5.6, 0.45, 0, 0, 0, -0.18);
  far.add(new THREE.BoxGeometry(10, 0.6, 14), 0xf6f0e0, -5.4, 1.1, 0, 0, 0, 0.18);
  far.add(new THREE.BoxGeometry(10, 0.6, 14), 0xf6f0e0, 5.4, 1.1, 0, 0, 0, -0.18);
  far.pop();
  // round trees and hedges beyond the fence
  const ballTree = new Batch();
  ballTree.add(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), 0x4a3426, 0, 0.25, 0);
  ballTree.add(new THREE.IcosahedronGeometry(0.42, 1), 0x2c4e30, 0, 0.75, 0);
  ballTree.add(new THREE.IcosahedronGeometry(0.3, 1), 0x335a36, 0.25, 0.95, 0.1);
  const nb = [];
  for (let i = 0; i < ctx.count(36); i++) { const a = rr(0, PI * 2), r = rr(300, 520), x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 240 && Math.abs(x) < 200) continue; const s = rr(100, 190); nb.push({ x, y: FY - 2, z, ry: rr(0, 6), s, color: shade(0xffffff, rr(0.7, 1.05)) }); }
  instanced(ctx, ballTree.build(), KINDS.flat(), nb);

  ctx.tick((dt, t) => {
    bulbMats.forEach((m, k) => m.emissive.copy(m.userData.emissive0).multiplyScalar(0.8 + 0.2 * Math.sin(t * (1.3 + k * 0.37) + k * 1.7)));
    const lf = 1 + 0.035 * Math.sin(t * 6.3) + 0.02 * Math.sin(t * 15.7);
    gl.emissive.copy(gl.userData.emissive0).multiplyScalar(lf);
    glHalo.userData.flicker = lf;
    ctx.lightFlicker = lf;
  });
}

// ================================================================ CRITTERS
function cmat(color, roughness = 0.85, metalness = 0, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o }); }
function critterAdd(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
const wrapAng = a => { while (a > PI) a -= PI * 2; while (a < -PI) a += PI * 2; return a; };

export function buildCritter(kind) {
  if (kind === 'gull') return buildGull();
  if (kind === 'raccoon') return buildRaccoon();
  throw new Error('scenery: unknown critter ' + kind);
}

/** Captain Squawk: a big round cartoon seagull in a captain's hat. The group's origin is the middle of his body. */
function buildGull() {
  const g = new THREE.Group(); g.name = 'gull';
  const root = new THREE.Group(); root.scale.setScalar(0.92); g.add(root);
  const white = cmat(0xfbfbf7), grey = cmat(0x9aa6b5, 0.8), dark = cmat(0x2b2f38, 0.7), yellow = cmat(0xffc93c, 0.45), orange = cmat(0xff8a3d, 0.6), red = cmat(0xe0453a, 0.5);
  const navy = cmat(0x26375f, 0.65), gold = cmat(0xf2c14e, 0.35, 0.6), black = new THREE.MeshBasicMaterial({ color: 0x111111 }), shineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sph = new THREE.SphereGeometry(1, 22, 16);
  const body = new THREE.Group(); root.add(body);
  critterAdd(body, sph, white, 0, 0, 0, 4.4, 4.1, 5.4);
  critterAdd(body, sph, grey, 0, 1.6, -0.6, 3.9, 2.9, 4.9);
  const tail = critterAdd(body, new THREE.ConeGeometry(2.3, 4.6, 5), grey, 0, 1.0, -6.1, 1, 1, 0.35); tail.rotation.x = -PI / 2;
  const tip = critterAdd(body, new THREE.ConeGeometry(1.5, 1.8, 5), dark, 0, 1.0, -8.3, 1, 1, 0.3); tip.rotation.x = -PI / 2;
  // head, beak, eyes, angry brows and the hat
  const head = new THREE.Group(); head.position.set(0, 3.5, 4.0); body.add(head);
  critterAdd(head, sph, white, 0, 0, 0, 3.0, 2.8, 2.9);
  const beakU = critterAdd(head, new THREE.ConeGeometry(0.95, 3.6, 12), yellow, 0, -0.25, 3.95, 1, 1, 0.7); beakU.rotation.x = PI / 2;
  const beakLow = new THREE.Group(); beakLow.position.set(0, -0.75, 2.4); head.add(beakLow);
  const bl = critterAdd(beakLow, new THREE.ConeGeometry(0.78, 2.8, 12), yellow, 0, 0, 1.3, 1, 1, 0.55); bl.rotation.x = PI / 2;
  critterAdd(beakLow, sph, red, 0, -0.05, 2.2, 0.32, 0.3, 0.3);
  const brows = [];
  for (const s of [-1, 1]) {
    critterAdd(head, sph, cmat(0xffffff, 0.3), s * 1.3, 0.75, 2.2, 0.9, 1.0, 0.65);
    critterAdd(head, sph, black, s * 1.38, 0.68, 2.78, 0.42, 0.5, 0.15);
    critterAdd(head, sph, shineM, s * 1.22, 0.95, 2.9, 0.13, 0.13, 0.06);
    const br = critterAdd(head, new THREE.BoxGeometry(1.6, 0.36, 0.45), dark, s * 1.3, 1.75, 2.45); brows.push({ br, s });
  }
  const hat = new THREE.Group(); hat.position.set(0, 2.2, -0.2); hat.rotation.x = -0.12; head.add(hat);
  critterAdd(hat, new THREE.CylinderGeometry(2.05, 1.95, 1.4, 18), navy, 0, 0.55, 0);
  critterAdd(hat, new THREE.CylinderGeometry(2.4, 2.25, 0.55, 18), white, 0, 1.45, 0);
  critterAdd(hat, new THREE.TorusGeometry(2.0, 0.13, 5, 18), gold, 0, 0.2, 0).rotation.x = PI / 2;
  critterAdd(hat, new THREE.CylinderGeometry(1.7, 1.7, 0.18, 14, 1, false, -PI / 2, PI), dark, 0, -0.05, 0.5);
  critterAdd(hat, new THREE.TorusGeometry(0.38, 0.09, 4, 10), gold, 0, 0.75, 2.05);
  critterAdd(hat, new THREE.BoxGeometry(0.14, 0.9, 0.12), gold, 0, 0.95, 2.05);
  // wings: shoulder -> inner wing -> outer wing with black tips
  const wings = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 3.5, 1.7, 0.4); body.add(sh);
    critterAdd(sh, sph, grey, s * 3.9, 0, -0.3, 4.4, 0.6, 2.7);
    const out = new THREE.Group(); out.position.set(s * 7.8, 0, -0.5); sh.add(out);
    critterAdd(out, sph, grey, s * 3.0, 0, -0.5, 3.7, 0.5, 2.1);
    critterAdd(out, sph, dark, s * 5.6, 0, -0.9, 2.2, 0.45, 1.5);
    for (const d of [0, 1]) critterAdd(out, sph, white, s * (5.9 + d * 0.9), 0.32, -0.7 - d * 0.3, 0.32, 0.1, 0.32);
    wings.push({ sh, out, s });
  }
  // legs and webbed feet
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(s * 1.4, -3.4, 0.6); body.add(l);
    critterAdd(l, new THREE.CylinderGeometry(0.3, 0.3, 2.8, 6), orange, 0, -1.4, 0);
    critterAdd(l, new THREE.ConeGeometry(1.1, 2.0, 3), orange, 0, -2.75, 0.8, 1, 1, 0.3).rotation.x = PI / 2;
    legs.push(l);
  }
  const u = g.userData;
  Object.assign(u, { body, head, beakLow, wings, legs, brows, alt: null, yaw: null, roll: 0, pitch: 0, ph: 0, sweep: 0, legsK: 0, seen: -1 });
  u.sync = (c, dt, time) => {
    dt = clamp(dt || 0.016, 0, 0.1);
    const st = c.state, t = Math.max(0, c.t || 0);
    let alt, hz, amp, pitch, beak = 0, legsK = 0, sweep = 0, angry = 0, headX = 0;
    if (st === 'enter') { alt = 10 + 46 * Math.exp(-t * 0.9); hz = 0.9; amp = 0.2; pitch = 0.2; }
    else if (st === 'crouch') { alt = 5 + Math.sin(time * 7) * 0.35; hz = 4.2; amp = 0.75; pitch = 0.5; beak = 0.45 + 0.25 * Math.sin(time * 22); angry = 1; headX = 0.35; }
    else if (st === 'pounce') { alt = 4.3; hz = 0; amp = 0; pitch = 0.7; beak = 0.8; legsK = 1; sweep = 1; angry = 1; headX = 0.2; }
    else if (st === 'leave') { alt = 10 + t * 14; hz = 2.6; amp = 0.8; pitch = -0.35; }
    else { alt = 10 + Math.sin(time * 1.3) * 1.2; hz = 1.8; amp = 0.6; pitch = 0.05; headX = 0.15; }
    const target = c.y + alt;
    if (u.alt == null || time - u.seen > 1) { u.alt = st === 'enter' ? c.y + 56 : target; u.yaw = c.yaw; }
    u.seen = time;
    const rate = st === 'pounce' ? 16 : st === 'leave' ? 4 : 3;
    u.alt += (target - u.alt) * (1 - Math.exp(-dt * rate));
    u.alt = Math.max(u.alt, c.y + 3.6);
    g.position.set(c.x, u.alt, c.z);
    g.rotation.y = c.yaw;
    const dy = wrapAng(c.yaw - u.yaw); u.yaw = c.yaw;
    const turn = dt > 0 ? dy / dt : 0;
    u.roll += (clamp(-turn * 0.35, -0.7, 0.7) - u.roll) * (1 - Math.exp(-dt * 5));
    u.pitch += (pitch - u.pitch) * (1 - Math.exp(-dt * 6));
    body.rotation.set(u.pitch, 0, u.roll);
    u.ph += dt * hz * PI * 2;
    u.sweep += (sweep - u.sweep) * (1 - Math.exp(-dt * 10));
    u.legsK += (legsK - u.legsK) * (1 - Math.exp(-dt * 10));
    const f = Math.sin(u.ph) * amp;
    for (const w of wings) {
      w.sh.rotation.set(0, w.s * u.sweep * 0.9, w.s * (f + 0.12 + u.sweep * 0.3));
      w.out.rotation.z = w.s * (Math.sin(u.ph - 0.7) * amp * 0.7 + 0.05 - u.sweep * 0.25);
    }
    for (const l of legs) l.rotation.x = lerp(1.25, -0.9, u.legsK);
    head.rotation.x += (headX - head.rotation.x) * (1 - Math.exp(-dt * 6));
    head.rotation.y = st === 'prowl' ? Math.sin(time * 0.9) * 0.35 : 0;
    beakLow.rotation.x = clamp(beak, 0, 1) * 0.6;
    for (const b of brows) b.br.rotation.z = b.s * (0.25 + angry * 0.25);
  };
  return g;
}

/** Bandit: a chubby raccoon with a bandit mask and a stripy tail. The group's origin is on the ground under him. */
function buildRaccoon() {
  const g = new THREE.Group(); g.name = 'raccoon';
  const fur = cmat(0x8d929c, 0.95), light = cmat(0xe2dccf, 0.95), dark = cmat(0x34363d, 0.9), mask = cmat(0x3a3c46, 0.85), noseM = cmat(0x16161a, 0.35);
  const black = new THREE.MeshBasicMaterial({ color: 0x0d0d10 }), shineM = new THREE.MeshBasicMaterial({ color: 0xffffff }), pink = cmat(0xf2a0a8, 0.6);
  const sph = new THREE.SphereGeometry(1, 22, 16);
  const body = new THREE.Group(); body.position.y = 6; g.add(body);
  critterAdd(body, sph, fur, 0, 0, 0, 4.3, 3.9, 5.6);
  critterAdd(body, sph, light, 0, -1.1, 1.2, 3.4, 3.0, 4.4);
  const rear = new THREE.Group(); rear.position.set(0, 0, -3.8); body.add(rear);
  critterAdd(rear, sph, fur, 0, 0.1, 0, 4.8, 4.3, 4.2);
  const tail = new THREE.Group(); tail.position.set(0, 1.0, -3.6); rear.add(tail);
  const tc = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, 1.2, -3), V3(0, 4, -5.2), V3(0, 7.6, -5.6), V3(0, 10.4, -4.2)]);
  for (let i = 0; i < 9; i++) {
    const p = tc.getPoint(i / 8), r = lerp(1.75, 1.15, i / 8);
    critterAdd(tail, sph, i % 2 || i === 8 ? dark : light, p.x, p.y, p.z, r, r, r * 1.1);
  }
  const legs = [];
  for (const [x, z] of [[-2.5, 3.4], [2.5, 3.4], [-2.6, -4.2], [2.6, -4.2]]) {
    const piv = new THREE.Group(); piv.position.set(x, 4.3, z); g.add(piv);
    critterAdd(piv, new THREE.CapsuleGeometry(1.25, 2.2, 6, 12), fur, 0, -1.7, 0);
    critterAdd(piv, sph, dark, 0, -3.75, 0.45, 1.35, 0.75, 1.65);
    legs.push(piv);
  }
  const head = new THREE.Group(); head.position.set(0, 8.7, 5.9); g.add(head);
  critterAdd(head, sph, fur, 0, 0, 0, 3.7, 3.3, 3.3);
  for (const s of [-1, 1]) critterAdd(head, sph, light, s * 2.1, -1.0, 0.8, 1.9, 1.6, 1.6);
  critterAdd(head, sph, light, 0, -1.0, 2.6, 1.6, 1.25, 1.9);
  critterAdd(head, sph, noseM, 0, -0.55, 4.45, 0.58, 0.46, 0.46);
  critterAdd(head, sph, mask, 0, 0.45, 2.3, 3.2, 1.1, 1.3);
  const ears = [];
  for (const s of [-1, 1]) {
    critterAdd(head, sph, mask, s * 1.35, 0.35, 2.75, 1.3, 1.15, 0.8);
    critterAdd(head, sph, black, s * 1.35, 0.45, 3.25, 0.62, 0.72, 0.4);
    critterAdd(head, sph, shineM, s * 1.16, 0.8, 3.58, 0.27, 0.27, 0.08);
    critterAdd(head, sph, shineM, s * 1.5, 0.2, 3.6, 0.12, 0.12, 0.05);
    critterAdd(head, sph, light, s * 1.35, 1.55, 2.55, 1.2, 0.5, 0.6);
    const e = new THREE.Group(); e.position.set(s * 2.3, 2.5, -0.3); head.add(e);
    critterAdd(e, sph, fur, 0, 0, 0, 1.15, 1.25, 0.5);
    critterAdd(e, sph, pink, 0, -0.05, 0.3, 0.6, 0.72, 0.25);
    ears.push(e);
  }
  const u = g.userData;
  Object.assign(u, { body, rear, tail, legs, head, ears, walk: 0 });
  u.sync = (c, dt, time) => {
    dt = clamp(dt || 0.016, 0, 0.1);
    const st = c.state, crouch = st === 'crouch', pounce = st === 'pounce';
    const k = pounce ? clamp((c.t || 0) / 0.45, 0, 1) : 0;
    g.position.set(c.x, c.y, c.z);   // the sim already puts the leap into c.y
    g.rotation.y = c.yaw;
    u.walk += (c.sp || 0) * dt * 0.6;
    const w = u.walk, moving = (c.sp || 0) > 0.5;
    legs.forEach((l, i) => {
      if (pounce) l.rotation.x = i < 2 ? -1.1 : 0.9;
      else l.rotation.x = moving ? Math.sin(w + (i % 2 ? PI : 0) + (i > 1 ? PI / 2 : 0)) * 0.6 : 0;
    });
    body.position.y = crouch ? 4.7 : 6 + (moving ? Math.abs(Math.sin(w)) * 0.3 : 0);
    body.rotation.x = crouch ? 0.14 : pounce ? -0.3 : 0;
    const wig = crouch ? Math.sin(time * 20) : 0;
    rear.rotation.y = wig * 0.3; rear.position.x = wig * 0.4;
    tail.rotation.x = -0.25 + Math.sin(time * (crouch ? 9 : 2.2)) * 0.15 + (pounce ? 0.6 : 0);
    tail.rotation.z = crouch ? wig * 0.5 : Math.sin(time * 1.6) * 0.3;
    head.position.y = crouch ? 7.2 : 8.7;
    head.rotation.y = crouch || pounce ? 0 : Math.sin(time * 0.8) * 0.3;
    head.rotation.x = crouch ? 0.15 : 0;
    ears.forEach((e, i) => { e.rotation.z = (crouch ? 0.45 : 0.08 + (Math.sin(time * 3 + i * 2) > 0.95 ? 0.3 : 0)) * (i ? -1 : 1); });
  };
  return g;
}
