// Everything you see: Gerald, the bed and the bedroom, goblins, loot, hands, effects and the camera.
// The game hands render() a "view" each frame (the latest state, already interpolated); this file only draws it.
import * as THREE from '../vendor/three.min.js';
import { GRID, BED, MAT, SPOTS, SEATS, STASH_R, NIGHTSTAND_TOP, FLOOR_Y } from '../shared/world.js';
import { LOOT, LOOT_IDS, PHYS, MAPS } from '../shared/data.js';
import { buildSet, buildCritter } from './scenery.js';
import { ST, LS, aimDir, throwSpeed, swingPower } from '../shared/sim.js';
import { Goblin } from './goblin.js';
import { buildLoot } from './lootmesh.js';
import { colorHex } from './cosmetics.js';

const NX = GRID.nx, NZ = GRID.nz, N = NX * NZ;
const tmpV = new THREE.Vector3(), tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();

// ---------------------------------------------------------------- colours of Gerald and the bed
const BLANKET = [0xd9534f, 0xf0ad4e, 0x6cc070, 0x5bc0de, 0x9b6bd0, 0xf7dfa0, 0xe57fb0];
function hash(a, b) { const s = Math.sin(a * 91.7 + b * 47.3) * 43758.5453; return s - Math.floor(s); }
// the beach towel, the camp cot, the hammock: [stripe colours] and how they run
const TOWEL = [0xff6b6b, 0xfff6e6, 0x2ec4b6, 0xffd166, 0xfff6e6, 0x3a86ff];
const TOWEL2 = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2];
const HAMMOCK = [0xe85d5d, 0xf2a541, 0xf6d860, 0x7cc47f, 0x5aa9e6, 0xa78bd6];
const band = (list, v, w) => list[((Math.floor((v + 400) / w) % list.length) + list.length) % list.length];
function awayColor(map, m, x, z, h) {
  if (map === 'beach') switch (m) {
    case MAT.sheet: return Math.abs(x) > 29.5 || z < -77.5 || z > 69 ? 0xfff6e6 : band(TOWEL, x, 5.2);
    case MAT.sand: { const wet = Math.min(1, Math.max(0, -h / 3)); tmpC.setHex(0xe3bf7e).lerp(new THREE.Color(0x8f7346), wet); return tmpC.getHex(); }
    case MAT.pillow: return band([0x3a86ff, 0xfff6e6], z, 2.2);
    case MAT.blanket: return band(TOWEL2, z, 6.5);
    case MAT.shirt: { const f = hash(Math.floor((x + 200) / 3.4), Math.floor((z + 200) / 3.4)); const fx = ((x + 200) / 3.4) % 1 - 0.5, fz = ((z + 200) / 3.4) % 1 - 0.5; return f > 0.55 && fx * fx + fz * fz < 0.09 ? (f > 0.8 ? 0xffd166 : 0xff7aa8) : 0x1f9e8f; }
    case MAT.pocket: return 0x177a6e;
    case MAT.sock: return h > 17 ? 0x3a86ff : 0xfafaf4;
  }
  if (map === 'camp') switch (m) {
    case MAT.sheet: return Math.abs(x) > 47 ? 0x5a4632 : (Math.floor((x + 200) / 1.6) + Math.floor((z + 200) / 1.6)) % 2 ? 0x6f7d4a : 0x66733f;
    case MAT.pillow: return (Math.floor((x + 200) / 4) + Math.floor((z + 200) / 4)) % 2 ? 0xb5523b : 0xd9a066;
    case MAT.blanket: { const zz = ((z + 200) % 6); if (z < BED.z0 + 84) return 0xf08a24; return zz < 0.45 ? 0x1e3a66 : 0x2f5d9e; }
    case MAT.shirt: { const a = Math.floor((x + 200) / 3) % 3 === 0, b = Math.floor((z + 200) / 3) % 3 === 0; return a && b ? 0x5a1717 : a || b ? 0x8e2a2a : 0xc0433c; }
    case MAT.pocket: return 0x8f2c2c;
    case MAT.sock: return h > 17 ? 0x4f7a4a : 0xcfc3ae;
  }
  if (map === 'hammock') switch (m) {
    case MAT.sheet: return band(HAMMOCK, x, 4.6);
    case MAT.pillow: return Math.floor((z + 200) / 2.5) % 2 ? 0xf2e6c8 : 0xf0c0c8;
    case MAT.blanket: return Math.floor((z + 200) / 4) % 4 === 0 ? 0xd96c6c : 0xefe3cf;
    case MAT.shirt: return Math.floor((z + 200) / 2.2) % 2 ? 0xb79ad9 : 0xeae0fa;
    case MAT.pocket: return 0x9c7fc4;
    case MAT.sock: return h > 17 ? 0x6cc070 : 0xf6d860;
  }
  return -1;
}
function geraldColor(m, x, z, h, map = 'bedroom') {
  if (map !== 'bedroom') { const c = awayColor(map, m, x, z, h); if (c >= 0) return c; }
  switch (m) {
    case MAT.sand: return 0xe9d5a3;
    case MAT.sheet: {
      const gx = Math.round(x / 3.2) * 3.2, gz = Math.round(z / 3.2) * 3.2;
      const dot = (Math.round(x / 3.2) + Math.round(z / 3.2)) % 2 === 0 && Math.hypot(x - gx, z - gz) < 0.75;
      return dot ? 0xf2f5ff : 0xb9c6e4;
    }
    case MAT.pillow: return Math.floor((x + 200) / 2.5) % 2 ? 0xf6f2ea : 0xd9e2f4;
    case MAT.skin: {
      const ch = Math.min(Math.hypot(x + 7.2, z + 51), Math.hypot(x - 7.2, z + 51));
      return ch < 3.2 ? 0xf7a090 : 0xf2b48f;
    }
    case MAT.shirt: return Math.floor((z + 200) / 2.2) % 2 ? 0x7ea6dd : 0xeaf0fa;
    case MAT.blanket: {
      const px = Math.floor((x + 200) / 9), pz = Math.floor((z + 200) / 9);
      const fx = ((x + 200) / 9) % 1, fz = ((z + 200) / 9) % 1;
      if (fx < 0.04 || fz < 0.04) return 0x7a5a48;
      return BLANKET[Math.floor(hash(px, pz) * BLANKET.length)];
    }
    case MAT.hair: return 0x5b3a24;
    case MAT.beard: return 0x734b2d;
    case MAT.brow: return 0x4b2f1d;
    case MAT.lips: return 0xd97a76;
    case MAT.lid: return z > -56.2 ? 0x6b4636 : 0xe8a98a;
    case MAT.sock: return Math.floor(h / 1.6) % 2 ? 0xe04848 : 0xf7f1e8;
    case MAT.toe: return 0xf2b48f;
    case MAT.pocket: return 0x5f8fd0;
    case MAT.button: return 0xfff4d0;
    case MAT.nose: return 0xf6a68c;
    case MAT.navel: return 0xc98a72;
    case MAT.mouth: return 0x7a2f35;
    case MAT.ear: return 0xeeaa8b;
    default: return 0xff00ff;
  }
}

// ---------------------------------------------------------------- the Gerald surface shader
const GLSL_NOISE = `
float dwgHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dwgNoise(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(dwgHash(i), dwgHash(i+vec3(1,0,0)), u.x), mix(dwgHash(i+vec3(0,1,0)), dwgHash(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(dwgHash(i+vec3(0,0,1)), dwgHash(i+vec3(1,0,1)), u.x), mix(dwgHash(i+vec3(0,1,1)), dwgHash(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }`;
function geraldShader(mat, uniforms, depth = false) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float hAF; attribute float hAB; attribute float hBF; attribute float sideA; attribute float breathM; attribute float mouthM;
        ${depth ? '' : 'attribute vec3 normalB; attribute vec3 colorB;'}
        uniform float uMorph, uBreath, uMouth, uLiftL, uLiftR; uniform vec4 uBumps[8];
        varying vec3 vWPos;
        float dwgHeight(vec3 p){
          float lift = sideA < 0.5 ? 0.0 : (sideA < 1.5 ? uLiftL : uLiftR);
          float ha = mix(hAF, hAB, lift);
          float h = mix(ha, hBF, uMorph) + breathM * uBreath - mouthM * uMouth * 2.2;
          for (int i = 0; i < 8; i++) { vec4 b = uBumps[i]; if (b.z > 0.0) { float dx = p.x-b.x, dz = p.z-b.y; float d2 = (dx*dx + dz*dz) / (b.z*b.z); if (d2 < 4.0) h += b.w * exp(-d2 * 2.0); } }
          return h;
        }`)
      .replace('#include <beginnormal_vertex>', depth ? '#include <beginnormal_vertex>' : `vec3 objectNormal = normalize(mix(normal, normalB, uMorph));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, dwgHeight(position), position.z); vWPos = transformed;`)
      .replace('#include <color_vertex>', depth ? '#include <color_vertex>' : `#include <color_vertex>
        vColor.rgb = mix(color.rgb, colorB, uMorph);`);
    if (!depth) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; uniform vec4 uSpots[4]; uniform float uTime;
          ${GLSL_NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fab = dwgNoise(vWPos * 3.0) * 0.6 + dwgNoise(vWPos * 9.0) * 0.4;
          diffuseColor.rgb *= 0.9 + 0.13 * fab;
          for (int i = 0; i < 4; i++) { vec4 s = uSpots[i]; if (s.z > 0.0) { float d = length(vWPos.xz - s.xy) / s.z; if (d < 1.0) { float k = smoothstep(1.0, 0.55, d) * abs(s.w);
            if (s.w > 0.0) diffuseColor.rgb *= 1.0 - 0.75 * k; else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.35, 0.3), k * (0.5 + 0.5 * sin(uTime * 12.0))); } } }`);
    }
  };
  mat.customProgramCacheKey = () => 'gerald' + (depth ? 'd' : '');
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d1c);
    this.scene.fog = new THREE.FogExp2(0x0d1024, 0.0062);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
    this.time = 0;
    this.uniforms = {
      uMorph: { value: 0 }, uBreath: { value: 0 }, uMouth: { value: 0 }, uLiftL: { value: 0 }, uLiftR: { value: 0 },
      uBumps: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uSpots: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uTime: { value: 0 },
    };
    this.goblins = new Map();
    this.lootMeshes = new Map();
    this.propMeshes = new Map();
    this.quality = 'high';
    this.lights();
    this.buildRoom();
    this.buildFx();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 0.75 : Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.75 : 1.2));
    this.moon.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048);
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; }
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x7f8fd0, 0x2a1e2e, 1.15);
    s.add(this.hemi);
    const moon = this.moon = new THREE.DirectionalLight(0xb4c6ff, 1.6);
    moon.position.set(120, 160, 30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const c = moon.shadow.camera; c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 500;
    moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.05;
    s.add(moon); s.add(moon.target);
    this.lamp = new THREE.PointLight(0xffb36b, 2600, 0, 1.75);
    this.lamp.position.set(68, NIGHTSTAND_TOP + 19, -74);
    s.add(this.lamp);
    // a soft fill so faces read in the dark
    this.fill = new THREE.DirectionalLight(0xffd9b0, 0.35);
    this.fill.position.set(-60, 80, 120);
    s.add(this.fill);
  }

  // ---------------------------------------------------------------- Gerald
  /** (re)build the Gerald mesh for the world's current poses */
  setWorld(world) {
    this.world = world;
    if (!this.gerald) this.buildGerald();
    this.syncPoses(true);
    this.buildStrands();
  }
  buildGerald() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = GRID.x0 + (i % NX) * GRID.cell; pos[i * 3 + 2] = GRID.z0 + Math.floor(i / NX) * GRID.cell; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    for (const [k, n] of [['hAF', 1], ['hAB', 1], ['hBF', 1], ['sideA', 1], ['breathM', 1], ['mouthM', 1], ['normal', 3], ['normalB', 3], ['color', 3], ['colorB', 3]]) {
      geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n));
    }
    const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    let k = 0;
    for (let r = 0; r < NZ - 1; r++) for (let c = 0; c < NX - 1; c++) {
      const i = r * NX + c;
      idx[k++] = i; idx[k++] = i + NX; idx[k++] = i + 1;
      idx[k++] = i + 1; idx[k++] = i + NX; idx[k++] = i + NX + 1;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 120);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(BED.x0, -10, BED.z0), new THREE.Vector3(BED.x1, 40, BED.z1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    geraldShader(mat, this.uniforms);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    geraldShader(depthMat, this.uniforms, true);
    mesh.customDepthMaterial = depthMat;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.gerald = mesh;
    const W = this.world;
    geo.attributes.breathM.array.set(W.breathM);
    geo.attributes.mouthM.array.set(W.mouthM);
  }
  poseNormals(P) {
    if (P._normals) return P._normals;
    const n = new Float32Array(N * 3), h = P.full;
    for (let r = 0; r < NZ; r++) for (let c = 0; c < NX; c++) {
      const i = r * NX + c;
      const hl = h[c > 1 ? i - 2 : c > 0 ? i - 1 : i], hr = h[c < NX - 2 ? i + 2 : c < NX - 1 ? i + 1 : i], hd = h[r > 1 ? i - 2 * NX : r > 0 ? i - NX : i], hu = h[r < NZ - 2 ? i + 2 * NX : r < NZ - 1 ? i + NX : i];
      let nx = (hl - hr), ny = 4 * GRID.cell, nz = (hd - hu);
      const l = Math.hypot(nx, ny, nz);
      n[i * 3] = nx / l; n[i * 3 + 1] = ny / l; n[i * 3 + 2] = nz / l;
    }
    return (P._normals = n);
  }
  poseColors(P) {
    if (P._colors) return P._colors;
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const x = GRID.x0 + (i % NX) * GRID.cell, z = GRID.z0 + Math.floor(i / NX) * GRID.cell;
      tmpC.setHex(geraldColor(P.mat[i], x, z, P.full[i], P.map));
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    return (P._colors = col);
  }
  syncPoses(force) {
    const W = this.world, g = this.gerald.geometry, at = g.attributes;
    if (!force && W.A === this._pA && W.B === this._pB) return;
    this._pA = W.A; this._pB = W.B;
    at.hAF.array.set(W.A.full); at.hAB.array.set(W.A.base); at.sideA.array.set(W.A.side);
    at.hBF.array.set(W.B.full);
    at.normal.array.set(this.poseNormals(W.A)); at.normalB.array.set(this.poseNormals(W.B));
    at.color.array.set(this.poseColors(W.A)); at.colorB.array.set(this.poseColors(W.B));
    for (const k of ['hAF', 'hAB', 'hBF', 'sideA', 'normal', 'normalB', 'color', 'colorB']) at[k].needsUpdate = true;
  }
  buildStrands() {
    if (this.strands) { this.strands.removeFromParent(); this.strands.geometry.dispose(); }
    const list = this.world.strands;
    // a tapered, slightly curved strand 1 unit tall
    const geo = new THREE.CylinderGeometry(0.018, 0.075, 1, 5, 4, true);
    geo.translate(0, 0.5, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + y * y * 0.35); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0xffffff });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.uniforms.uWind = this.windU = this.windU || { value: 0 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float sway = sin(uTime * 1.7 + instanceMatrix[3].x * 0.4 + instanceMatrix[3].z * 0.3) * (0.08 + uWind * 0.25);
          transformed.x += sway * position.y * position.y;`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, list.length + 40);
    const cols = [new THREE.Color(0x5b3a24), new THREE.Color(0x6e4529), new THREE.Color(0x3f2617), new THREE.Color(0x2a1a12)];
    let n = 0;
    for (const s of list) {
      const [x, y, z, hgt, lx, lz, kind] = s;
      tmpQ.setFromEuler(new THREE.Euler(lz * 1.2, Math.atan2(lx, lz) + Math.PI, -lx * 1.2));
      const th = kind === 1 ? 1.5 : kind === 2 ? 1.6 : 1.2;
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(th, hgt, th));
      mesh.setMatrixAt(n, tmpM);
      mesh.setColorAt(n, tmpC.copy(cols[kind]).multiplyScalar(0.85 + Math.random() * 0.3));
      n++;
    }
    // eyelashes along the bottom of each closed eyelid
    for (const e of SPOTS.eyes) for (let k = 0; k < 20; k++) {
      const x = e.x - 2.4 + k * 0.25, z = -55.95 - Math.abs(k - 9.5) * 0.02;
      const y = this.world.heightAt(x, z) - 0.15;
      tmpQ.setFromEuler(new THREE.Euler(1.1, 0, (k - 9.5) * 0.04));
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(0.7, 1.1, 0.7));
      mesh.setMatrixAt(n, tmpM);
      mesh.setColorAt(n, cols[3]);
      n++;
    }
    mesh.count = n;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.strands = mesh;
  }

  // ---------------------------------------------------------------- the bedroom
  buildRoom() {
    const s = new THREE.Group();
    this.scene.add(s);
    const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
    const add = (geo, mat, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; s.add(o); return o; };
    const T = NIGHTSTAND_TOP;
    // mattress sides, bed frame, legs
    add(new THREE.BoxGeometry(BED.x1 - BED.x0, 7, BED.z1 - BED.z0), m(0xdfe3ee), 0, -3.8, (BED.z0 + BED.z1) / 2, false);
    const wood = m(0x6b4426, { roughness: 0.6 });
    add(new THREE.BoxGeometry(104, 6, 162), wood, 0, -10, -2, false);
    for (const [x, z] of [[-50, -78], [50, -78], [-50, 74], [50, 74]]) add(new THREE.BoxGeometry(5, 45, 5), wood, x, -35, z, false);
    // headboard with a rounded top, footboard
    const hb = add(new THREE.BoxGeometry(112, 95, 7), wood, 0, -7.5, -84);
    const hbTop = add(new THREE.CylinderGeometry(3.6, 3.6, 112, 16), m(0x7a5030, { roughness: 0.5 }), 0, 40, -84); hbTop.rotation.z = Math.PI / 2;
    for (const x of [-30, -10, 10, 30]) add(new THREE.SphereGeometry(2.2, 12, 8), m(0x8a5c38, { roughness: 0.4 }), x, 43.5, -84);
    add(new THREE.BoxGeometry(106, 58, 3.2), wood, 0, -24, 78);
    // blanket hanging over the sides
    for (const sx of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(68, 10, 34, 5);
      const p = geo.attributes.position;
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i);
        p.setZ(i, Math.sin(u * 0.9) * 0.5 * (0.5 - v / 10) + 0.2);
        const z = 34 + u, px = Math.floor((sx * 50 + 200) / 9), pz = Math.floor((z + 200) / 9);
        tmpC.setHex(BLANKET[Math.floor(hash(px, pz) * BLANKET.length)]).multiplyScalar(0.8);
        cols[i * 3] = tmpC.r; cols[i * 3 + 1] = tmpC.g; cols[i * 3 + 2] = tmpC.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const o = add(geo, m(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), sx * 50.6, -4.2, 34, false);
      o.rotation.y = sx * Math.PI / 2;
    }
    // nightstands
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(22, T - FLOOR_Y, 24), m(0x7d5232, { roughness: 0.55 }), sx * 62.5, (T + FLOOR_Y) / 2, -68);
      add(new THREE.BoxGeometry(23, 1, 25), m(0x8f6038, { roughness: 0.4 }), sx * 62.5, T - 0.4, -68, false);
      for (const y of [-12, -30]) { add(new THREE.BoxGeometry(0.6, 12, 18), m(0x6a4428), sx * 51.2, y, -68, false); add(new THREE.SphereGeometry(0.9, 8, 6), m(0xd4af37, { metalness: 0.8, roughness: 0.3 }), sx * 50.8, y, -68, false); }
    }
    // lamp
    add(new THREE.CylinderGeometry(3, 3.4, 1.2, 20), m(0x2e2e38, { metalness: 0.4 }), 68, T + 0.6, -74);
    add(new THREE.CylinderGeometry(0.55, 0.55, 22, 10), m(0xb89a5a, { metalness: 0.7, roughness: 0.35 }), 68, T + 11, -74);
    const shade = add(new THREE.CylinderGeometry(4.5, 8, 9, 24, 1, true), m(0xffe1b0, { side: THREE.DoubleSide, emissive: 0xffb060, emissiveIntensity: 0.9, roughness: 0.9 }), 68, T + 22, -74, false);
    this.lampShade = shade;
    // the alarm clock (it shows the night's time)
    add(new THREE.BoxGeometry(4, 6.2, 8.4), m(0xd23c3c, { roughness: 0.4 }), 59.5, T + 3.1, -66);
    for (const z of [-68.8, -63.2]) add(new THREE.SphereGeometry(1.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(0xd8d8e0, { metalness: 0.8, roughness: 0.25 }), 59.5, T + 6.2, z);
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 160;
    this.clockCanvas = cc;
    this.clockTex = new THREE.CanvasTexture(cc); this.clockTex.colorSpace = THREE.SRGBColorSpace;
    const face = add(new THREE.PlaneGeometry(7.2, 4.5), new THREE.MeshBasicMaterial({ map: this.clockTex, toneMapped: false }), 57.45, T + 3.1, -66, false);
    face.rotation.y = -Math.PI / 2;
    this.drawClock('11:00', 'PM');
    // glass of water
    add(new THREE.CylinderGeometry(2.2, 2, 7, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }), 69, T + 3.5, -60.5, false);
    add(new THREE.CylinderGeometry(2.05, 1.9, 5, 24), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }), 69, T + 2.6, -60.5, false);
    // books and a photo of Mr. Biscuits on the left
    add(new THREE.BoxGeometry(14, 1.6, 10), m(0x2f5f9f), -64, T + 0.8, -72);
    add(new THREE.BoxGeometry(11, 1.4, 8), m(0xa83a3a), -65, T + 2.3, -73);
    add(new THREE.BoxGeometry(9, 1.6, 6.8), m(0x3a8a4a), -64.5, T + 3.8, -72.5);
    const pc = document.createElement('canvas'); pc.width = 256; pc.height = 256;
    drawCatPhoto(pc.getContext('2d'));
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.BoxGeometry(1.4, 8, 9), m(0xd4af37, { metalness: 0.7, roughness: 0.3 }), -59, T + 4, -62);
    const photo = add(new THREE.PlaneGeometry(7.4, 6.6), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.6 }), -58.25, T + 4, -62, false);
    photo.rotation.y = Math.PI / 2;
    // floor, rug, walls, window with the moon
    add(new THREE.PlaneGeometry(700, 700), m(0x3b2a20, { roughness: 0.9 }), 0, FLOOR_Y, 0, false).rotation.x = -Math.PI / 2;
    const rug = add(new THREE.CircleGeometry(95, 48), m(0x6a2f4a, { roughness: 1 }), 0, FLOOR_Y + 0.1, 30, false); rug.rotation.x = -Math.PI / 2;
    const wallM = m(0x2b3150, { roughness: 0.95 });
    add(new THREE.BoxGeometry(400, 260, 2), wallM, 0, 75, -92, false);
    add(new THREE.BoxGeometry(2, 260, 420), wallM, 160, 75, 60, false);
    add(new THREE.BoxGeometry(2, 260, 420), wallM, -160, 75, 60, false);
    add(new THREE.BoxGeometry(400, 260, 2), wallM, 0, 75, 260, false);
    const win = add(new THREE.PlaneGeometry(90, 80), new THREE.MeshBasicMaterial({ color: 0x1a2350 }), 158.5, 70, 10, false); win.rotation.y = -Math.PI / 2;
    const moonDisc = add(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), 158, 86, -8, false); moonDisc.rotation.y = -Math.PI / 2;
    for (const [y, w, h] of [[70, 2, 82], [30, 92, 2], [110, 92, 2], [70, 92, 2]]) { const o = add(new THREE.BoxGeometry(2.5, h, w === 2 ? 2 : w), m(0xe8e0d0), 157.5, y, 10, false); if (w === 2) o.scale.set(1, 1, 1); }
    // stars outside
    const sg = new THREE.BufferGeometry(); const sp = [];
    for (let i = 0; i < 80; i++) sp.push(157.8, 32 + Math.random() * 76, -32 + Math.random() * 84);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true })));
    // a dresser and a door with light under it
    add(new THREE.BoxGeometry(60, 70, 30), m(0x5a3a26), -110, FLOOR_Y + 35, 150, false);
    add(new THREE.BoxGeometry(2, 140, 60), m(0x4a3020), -158.5, FLOOR_Y + 70, 140, false);
    add(new THREE.PlaneGeometry(56, 1.6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), -157, FLOOR_Y + 0.9, 140, false).rotation.y = Math.PI / 2;
    this.sets = {
      bedroom: {
        group: s, swing: null, glows: [shade.material], extraLight: null, lightFlicker: 1,
        light: { pos: [68, T + 19, -74], color: 0xffb36b, intensity: 2600 },
        sky: { background: 0x0b0d1c, fog: 0x0d1024, fogDensity: 0.0062, hemiSky: 0x7f8fd0, hemiGround: 0x2a1e2e, hemiIntensity: 1.15, moonColor: 0xb4c6ff, moonIntensity: 1.6 },
        update() {}, setDim(k) { shade.material.emissiveIntensity = 0.9 * k; },
      },
    };
    this.mapId = null;
    this.critters = {};
    // the sea around the beach (it rises with the tide)
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), new THREE.MeshStandardMaterial({ color: 0x24639e, transparent: true, opacity: 0.66, roughness: 0.15, metalness: 0.25, depthWrite: false }));
    this.sea.rotation.x = -Math.PI / 2; this.sea.visible = false; this.sea.renderOrder = 2;
    this.scene.add(this.sea);
    this.setMap('bedroom');
  }
  /** switch the scenery, lights and Gerald's outfit to another map (built the first time it's needed) */
  setMap(id) {
    if (!MAPS[id]) id = 'bedroom';
    if (id === this.mapId) return;
    if (!this.sets[id]) {
      try {
        const set = buildSet(id, { THREE, T: NIGHTSTAND_TOP, FLOOR_Y, clockTex: this.clockTex, quality: this.quality, colors: { cot: 0x6f7d4a, hammock: HAMMOCK } });
        this.scene.add(set.group);
        this.sets[id] = set;
      } catch (e) { console.error('scenery', id, e); id = 'bedroom'; }
    }
    this.mapId = id;
    for (const [k, st] of Object.entries(this.sets)) st.group.visible = k === id;
    const S = this.set = this.sets[id], sky = S.sky;
    this.scene.background.setHex(sky.background);
    this.scene.fog.color.setHex(sky.fog); this.fogBase = sky.fogDensity;
    this.hemi.color.setHex(sky.hemiSky); this.hemi.groundColor.setHex(sky.hemiGround); this.hemiBase = sky.hemiIntensity;
    this.moon.color.setHex(sky.moonColor); this.moonBase = sky.moonIntensity;
    this.lamp.position.set(...S.light.pos); this.lamp.color.setHex(S.light.color); this.lampBase = S.light.intensity; this.lampK = this.lampK ?? S.light.intensity;
    if (S.extraLight) {
      if (!this.extraLight) { this.extraLight = new THREE.PointLight(0xff9040, 0, 0, 1.75); this.scene.add(this.extraLight); }
      this.extraLight.position.set(...S.extraLight.pos); this.extraLight.color.setHex(S.extraLight.color); this.extraBase = S.extraLight.intensity;
    } else this.extraBase = 0;
    if (this.extraLight) this.extraLight.visible = this.extraBase > 0;
    this.sea.visible = id === 'beach';
  }
  drawClock(time, ampm, alarm = false) {
    const g = this.clockCanvas.getContext('2d');
    g.fillStyle = '#120a0a'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = alarm && (Date.now() / 250 | 0) % 2 ? '#ffd0d0' : '#ff3b3b';
    g.shadowColor = '#ff2020'; g.shadowBlur = 18;
    g.font = '700 92px "Courier New", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(time, 128, 78);
    g.font = '700 26px "Courier New", monospace'; g.shadowBlur = 8;
    g.fillText(ampm, 222, 138);
    this.clockTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- effects, hands, eyes, stashes
  buildFx() {
    const s = this.scene;
    // particles
    const PN = 1600;
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(PN * 3); this.pCol = new Float32Array(PN * 3); this.pSize = new Float32Array(PN);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a, a); }`,
    });
    this.particles = new THREE.Points(pg, pm);
    this.particles.frustumCulled = false;
    s.add(this.particles);
    this.parts = [];
    this.PN = PN;
    // ripples (noise rings)
    this.ripples = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    // popups
    this.popups = [];
    // Gerald's swatting hands
    this.hands = ['L', 'R'].map(side => { const h = buildGiantHand(side); h.visible = false; s.add(h); return h; });
    // his eyes when he wakes
    this.eyeballs = SPOTS.eyes.map(e => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
      const iris = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshStandardMaterial({ color: 0x4a8a5a, roughness: 0.3 }));
      iris.position.z = 2.58;
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      pupil.position.z = 2.6;
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.35, 0.35, 2.62);
      const look = new THREE.Group(); look.add(iris, pupil, glint);
      g.add(ball, look);
      g.userData.look = look;
      g.position.set(e.x, e.y - 2, e.z);
      g.visible = false;
      s.add(g);
      return g;
    });
    this.eyeLight = new THREE.SpotLight(0xfff0c0, 0, 140, 0.35, 0.6, 1);
    this.eyeLight.position.set(0, 30, -57);
    s.add(this.eyeLight); s.add(this.eyeLight.target);
    // stashes: bottle caps with flags
    this.stashMeshes = SEATS.map(([x, z], i) => {
      const g = new THREE.Group();
      const capM = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.35 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(STASH_R + 0.25, STASH_R + 0.25, 0.7, 28, 1, true), capM);
      cap.position.y = 0.35; cap.castShadow = true; cap.receiveShadow = true;
      const ridges = new THREE.Mesh(new THREE.TorusGeometry(STASH_R + 0.25, 0.12, 6, 28), capM); ridges.rotation.x = Math.PI / 2; ridges.position.y = 0.7;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(STASH_R + 0.2, 28), new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }));
      pole.position.set(STASH_R * 0.8, 2.1, -STASH_R * 0.3);
      const flagM = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), flagM);
      flag.position.set(STASH_R * 0.8 + 0.9, 3.6, -STASH_R * 0.3);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      label.position.set(0, 4.6, 0); label.renderOrder = 9;
      g.add(cap, ridges, floor, pole, flag, label);
      g.position.set(x, 0, z);
      g.visible = false;
      g.userData = { capM, flagM, flag, label, key: '' };
      s.add(g);
      return g;
    });
    // aiming arc
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    this.arc = new THREE.Line(ag, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.85, depthTest: false }));
    this.arc.renderOrder = 8; this.arc.frustumCulled = false; this.arc.visible = false;
    s.add(this.arc);
    // the line is only a pixel wide, so the arc is drawn as a trail of glowing dots too
    this.arcDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }), 40);
    this.arcDots.renderOrder = 8; this.arcDots.frustumCulled = false; this.arcDots.count = 0;
    s.add(this.arcDots);
    this.arcEnd = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.arcEnd.renderOrder = 8; this.arcEnd.visible = false;
    s.add(this.arcEnd);
    // flood water
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(BED.x1 - BED.x0 + 2, BED.z1 - BED.z0 + 2, 40, 60), new THREE.MeshStandardMaterial({ color: 0x3a8ad8, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, depthWrite: false }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(0, -5, (BED.z0 + BED.z1) / 2); this.water.visible = false;
    s.add(this.water);
    // Zzz drifting up from Gerald
    this.zzz = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('Z', '#cfe0ff', 120), transparent: true, depthWrite: false }));
      sp.userData.t = i * 0.8;
      s.add(sp); this.zzz.push(sp);
    }
    // ball & chain balls
    this.balls = new Map();
  }
  // particles
  emit(x, y, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.PN) this.parts.shift();
      const sp = o.speed ?? 4, a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u);
      const c = new THREE.Color(o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color ?? 0xffffff));
      this.parts.push({
        x, y, z, vx: Math.cos(a) * q * sp * (o.flat ? 1.4 : 1), vy: (o.flat ? Math.abs(u) * 0.5 : u) * sp + (o.up || 0), vz: Math.sin(a) * q * sp * (o.flat ? 1.4 : 1),
        life: (o.life ?? 0.8) * (0.6 + Math.random() * 0.8), age: 0, size: (o.size ?? 0.35) * (0.6 + Math.random() * 0.8), r: c.r, g: c.g, b: c.b, grav: o.grav ?? 4, drag: o.drag ?? 1.5,
      });
    }
  }
  ripple(x, z, color, size = 1) {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    const y = (this.world ? this.world.heightAt(x, z) : 0) + 0.25;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, t: 0, size: Math.min(9, 1.5 + size * 1.2) });
  }
  popup(x, y, z, text, color = '#ffe066', big = false) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, color, big ? 90 : 64), transparent: true, depthTest: false, depthWrite: false }));
    sp.position.set(x, y, z); sp.renderOrder = 12;
    const w = (big ? 1.4 : 1) * (0.55 + text.length * 0.3);
    sp.scale.set(w, w * 0.32, 1);
    this.scene.add(sp);
    this.popups.push({ sp, t: 0, life: big ? 2.2 : 1.4 });
  }
  shake(a) { this.shakeAmt = Math.min(1.6, (this.shakeAmt || 0) + a); }

  // ---------------------------------------------------------------- per frame
  /**
   * view: { world, players[], loot (Map), props[], hands[], stashes[], water, eyes, look, phase, mode, me, cam }
   */
  render(view, dt) {
    this.time += dt;
    const W = view.world, U = this.uniforms;
    if (W !== this.world) this.setWorld(W);
    this.setMap(view.map || 'bedroom');
    this.syncPoses(false);
    U.uMorph.value = W.morph; U.uBreath.value = W.breath; U.uMouth.value = W.mouth; U.uLiftL.value = W.liftL; U.uLiftR.value = W.liftR; U.uTime.value = this.time;
    for (let i = 0; i < 8; i++) { const b = W.bumps[i]; if (b) U.uBumps.value[i].set(b.x, b.z, b.r, b.a); else U.uBumps.value[i].set(0, 0, 0, 0); }
    if (this.windU) this.windU.value = view.wind || 0;
    // hand shadows on the ground / feather target / flashing danger spots
    let si = 0;
    for (const sp of view.spots || []) { if (si < 4) U.uSpots.value[si++].set(sp.x, sp.z, sp.r, sp.a); }
    for (; si < 4; si++) U.uSpots.value[si].set(0, 0, 0, 0);
    // dream lighting
    const dark = view.dream === 'dark', S = this.set;
    const fire = S.update(dt, this.time);
    this.lampK += ((dark ? 0 : this.lampBase) - this.lampK) * Math.min(1, dt * 3);
    this.lamp.intensity = this.lampK * (S.lightFlicker || 1);
    if (this.extraLight && this.extraBase) this.extraLight.intensity = this.extraBase * (dark ? 0.35 : 1) * (typeof fire === 'number' ? fire : 1);
    if (this._dim !== dark) { this._dim = dark; S.setDim(dark ? 0 : 1); }
    this.hemi.intensity = dark ? 0.35 : this.hemiBase;
    this.moon.intensity = dark ? 0.45 : this.moonBase;
    this.scene.fog.density = dark ? this.fogBase * 1.9 : this.fogBase;
    if (S.swing) S.swing.rotation.z = view.sway || 0;
    this.syncPlayers(view, dt);
    this.syncLoot(view, dt);
    this.syncProps(view, dt);
    this.syncHands(view, dt);
    this.syncStashes(view);
    this.syncEyes(view, dt);
    this.syncCat(view.cat, dt);
    // water
    this.water.visible = view.water > 0 && this.mapId !== 'beach';
    if (this.sea.visible) { this.sea.position.y = view.water ?? -3; this.sea.material.opacity = 0.64 + Math.sin(this.time * 0.9) * 0.04; }
    if (this.water.visible) { this.water.position.y = view.water; this.water.material.opacity = 0.5 + Math.sin(this.time * 1.3) * 0.04; }
    // Zzz from his mouth while he sleeps
    for (const z of this.zzz) {
      z.userData.t += dt;
      const k = (z.userData.t % 3.2) / 3.2;
      z.visible = view.mode === 'sleep';
      z.position.set(SPOTS.mouth.x + Math.sin(k * 6 + z.id) * 2 + k * 4, SPOTS.mouth.y + 2 + k * 14, SPOTS.mouth.z - 1);
      z.scale.setScalar(1.5 + k * 3);
      z.material.opacity = Math.sin(k * Math.PI) * 0.85;
    }
    this.stepFx(dt);
    this.updateCamera(view, dt);
    // the shadow camera follows the action near the camera
    const tgt = this.camTarget || tmpV.set(0, 0, 0);
    this.moon.target.position.set(tgt.x, 0, tgt.z);
    this.moon.position.set(tgt.x + 120, 160, tgt.z + 30);
    this.renderer.render(this.scene, this.camera);
  }
  syncPlayers(view, dt) {
    const seen = new Set();
    for (const p of view.players) {
      seen.add(p.seat);
      let g = this.goblins.get(p.seat);
      const key = p.name + '|' + p.color + '|' + JSON.stringify(p.cos || {});
      if (g && g.key !== key) { g.dispose(); this.goblins.delete(p.seat); g = null; }
      if (!g) {
        g = new Goblin({ name: p.name, color: p.color, cos: p.cos, local: p.seat === view.me });
        g.key = key;
        const hb = new THREE.Box3().setFromObject(g.hat);
        g.hatHeight = Math.max(0, hb.max.y - 1.25);
        this.scene.add(g.root);
        this.goblins.set(p.seat, g);
      }
      if (p.fx && p.fx.ball > 0) {
        let b = this.balls.get(p.seat);
        if (!b) { b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.6, roughness: 0.4 })); b.castShadow = true; this.scene.add(b); this.balls.set(p.seat, b); b.position.set(p.x, p.y, p.z); }
        const bx = p.x - Math.sin(p.yaw) * 1.6, bz = p.z - Math.cos(p.yaw) * 1.6;
        b.position.x += (bx - b.position.x) * Math.min(1, dt * 6); b.position.z += (bz - b.position.z) * Math.min(1, dt * 6);
        b.position.y = this.world.groundAt(b.position.x, b.position.z, p.y + 1) + 0.55;
      } else if (this.balls.has(p.seat)) { this.balls.get(p.seat).removeFromParent(); this.balls.delete(p.seat); }
      g.update(p, dt, this.time);
      // look at whoever is nearest (or at the camera for the local player)
      g.setLook(Math.sin(this.time * 0.7 + p.seat) * 0.025, 0);
    }
    for (const [seat, g] of this.goblins) if (!seen.has(seat)) { g.dispose(); this.goblins.delete(seat); }
  }
  syncLoot(view, dt) {
    const seen = new Set();
    const me = view.players.find(p => p.seat === view.me);
    for (const l of view.loot.values()) {
      if (l.st === LS.GONE) continue;
      seen.add(l.id);
      let o = this.lootMeshes.get(l.id);
      if (!o) {
        o = buildLoot(l.type);
        o.userData.spinSeed = Math.random() * 6;
        this.scene.add(o);
        this.lootMeshes.set(l.id, o);
        const def = LOOT[l.type];
        if (def.jackpot || def.glow) {
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: def.glow || def.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          glow.scale.setScalar(def.r * (def.jackpot ? 6 : 4));
          o.add(glow);
          o.userData.glow = glow;
        }
      }
      o.position.set(l.x, l.y, l.z);
      const def = LOOT[l.type];
      if (l.st === LS.FREE) o.rotation.y += dt * (def.floaty ? 0.8 : 0) + (Math.hypot(l.vx || 0, l.vz || 0) > 0.5 ? dt * 6 : 0);
      if (l.st === LS.CARRIED) o.rotation.y = this.time * 1.5;
      if (o.userData.spin) o.userData.spin.rotation.y += dt * 2;
      if (o.userData.glow) o.userData.glow.material.opacity = 0.55 + Math.sin(this.time * 3 + o.userData.spinSeed) * 0.25;
      // a value tag when you're close (or it's a jackpot)
      const d = me ? Math.hypot(me.x - l.x, me.z - l.z) : 99;
      const showTag = l.st === LS.FREE && (d < 7 || (def.jackpot && d < 30)) || (view.target === l.id);
      if (showTag) {
        if (!o.userData.tag || o.userData.tagV !== l.value) {
          if (o.userData.tag) { o.remove(o.userData.tag); o.userData.tag.material.map.dispose(); o.userData.tag.material.dispose(); }
          const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('$' + l.value, def.jackpot ? '#ffd84a' : '#ffffff', 56), transparent: true, depthTest: false }));
          t.renderOrder = 9; t.position.y = def.r + 0.7; t.scale.set(1.3, 0.42, 1);
          o.add(t); o.userData.tag = t; o.userData.tagV = l.value;
        }
        o.userData.tag.visible = true;
        o.userData.tag.material.color.setHex(view.target === l.id ? 0x7dffb0 : 0xffffff);
      } else if (o.userData.tag) o.userData.tag.visible = false;
    }
    for (const [id, o] of this.lootMeshes) if (!seen.has(id)) { o.removeFromParent(); this.lootMeshes.delete(id); }
  }
  syncProps(view, dt) {
    const seen = new Set();
    for (const pr of view.props) {
      seen.add(pr.id);
      let o = this.propMeshes.get(pr.id);
      if (!o) { o = buildProp(pr.kind); this.scene.add(o); this.propMeshes.set(pr.id, o); }
      o.position.set(pr.x, pr.y, pr.z);
      if (pr.kind === 'decoy') { o.rotation.y = pr.yaw; o.position.y += Math.abs(Math.sin(this.time * 12)) * 0.15; }
      if (pr.kind === 'cloud') { o.rotation.y += dt * 0.3; o.scale.setScalar(1 + Math.sin(this.time * 2) * 0.05); if (Math.random() < dt * 8) this.emit(pr.x + (Math.random() - 0.5) * 6, pr.y + Math.random() * 3, pr.z + (Math.random() - 0.5) * 6, 1, { color: 0x887766, speed: 0.6, grav: -0.5, life: 1.4, size: 0.9 }); }
      if (pr.kind.startsWith('p_')) o.rotation.x += dt * 8;
    }
    for (const [id, o] of this.propMeshes) if (!seen.has(id)) { o.removeFromParent(); this.propMeshes.delete(id); }
  }
  syncHands(view, dt) {
    view.hands.forEach((h, i) => {
      const m = this.hands[i];
      m.visible = !!h.active;
      if (!h.active) return;
      m.position.set(h.x, h.y, h.z);
      m.rotation.set(0, h.yaw, 0);
      const st = h.state;
      // fingers curl to scratch, splay to slam, the index finger flicks
      const f = m.userData.fingers;
      const curl = st === 5 ? 0.6 + Math.sin(this.time * 20) * 0.3 : st === 3 || st === 4 ? -0.15 : st === 6 ? 0 : 0.25;
      f.forEach((fg, k) => { fg.rotation.x = k === 1 && st === 6 ? -1.2 + Math.min(1.6, (this.time * 10) % 2) : curl; });
    });
  }
  syncStashes(view) {
    this.stashMeshes.forEach((g, i) => {
      const s = view.stashes[i];
      g.visible = !!s;
      if (!s) return;
      const ud = g.userData;
      g.position.y = this.world.heightAt(SEATS[i][0], SEATS[i][1]) + 0.02;
      ud.flag.rotation.y = Math.sin(this.time * 2 + i) * 0.25;
      const key = s.name + s.color + s.value + (s.alert ? 'a' : '');
      if (ud.key !== key) {
        ud.key = key;
        ud.capM.color.setHex(s.color); ud.flagM.color.setHex(s.color);
        if (ud.label.material.map) ud.label.material.map.dispose();
        ud.label.material.map = textTexture(`${s.name}  $${s.value}`, s.alert ? '#ff6b6b' : '#ffffff', 52, s.color);
        ud.label.material.needsUpdate = true;
      }
      const img = ud.label.material.map && ud.label.material.map.image;
      const asp = img ? img.width / img.height : 5;
      ud.label.scale.set(0.75 * asp, 0.75, 1);
      // up close the tag would fill the screen: fade it out (you know whose bottle cap you're standing in)
      const cd = this.camera.position.distanceTo(g.position);
      ud.label.material.opacity = Math.max(0, Math.min(1, (cd - 7) / 6));
      ud.label.visible = ud.label.material.opacity > 0.02;
    });
  }
  syncCat(c, dt) {
    const kind = (MAPS[this.mapId] || MAPS.bedroom).critter;
    for (const [k, m] of Object.entries(this.critters)) if (!c || k !== kind) m.visible = false;
    if (c && kind !== 'cat') {
      let m = this.critters[kind];
      if (!m) { m = this.critters[kind] = buildCritter(kind); this.scene.add(m); }
      if (this.cat) this.cat.visible = false;
      m.visible = true;
      m.userData.sync(c, dt, this.time);
      return;
    }
    if (!c) { if (this.cat) this.cat.visible = false; return; }
    if (!this.cat) { this.cat = buildCat(); this.scene.add(this.cat); }
    const m = this.cat, u = m.userData;
    m.visible = true;
    m.position.set(c.x, c.y, c.z);
    m.rotation.y = c.yaw;
    u.walk = (u.walk || 0) + (c.sp || 0) * dt * 0.55;
    const w = u.walk;
    u.legs.forEach((l, i) => { l.rotation.x = (c.sp > 0.5 ? Math.sin(w + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.55 : 0); });
    const crouch = c.state === 'crouch', pounce = c.state === 'pounce';
    u.body.position.y = crouch ? 5.2 : 7;
    u.body.rotation.x = crouch ? 0.15 : pounce ? -0.25 : 0;
    u.rear.rotation.y = crouch ? Math.sin(this.time * 22) * 0.25 : 0;
    u.tail.rotation.x = -0.6 + Math.sin(this.time * (crouch ? 9 : 2.4)) * 0.25;
    u.tail.rotation.z = Math.sin(this.time * 1.7) * 0.4;
    u.head.rotation.y = Math.sin(this.time * 0.9) * 0.25;
    u.head.position.y = crouch ? 8.4 : 10.2;
    u.ears.forEach(e => e.rotation.z = (crouch ? 0.5 : 0.1) * Math.sign(e.position.x));
    u.pupils.forEach(p => p.scale.x = crouch || pounce ? 1.6 : 0.6);
  }
  syncEyes(view, dt) {
    const k = view.eyes || 0;
    const target = view.players.find(p => p.seat === view.look) || null;
    this.eyeballs.forEach((g, i) => {
      g.visible = k > 0.02;
      const e = SPOTS.eyes[i];
      g.position.y = e.y - 2.4 + k * 2.6;
      g.scale.setScalar(0.4 + k * 0.6);
      const look = g.userData.look;
      if (target) { g.lookAt(target.x, target.y + 1, target.z); }
      else g.rotation.set(-Math.PI / 2 + Math.sin(this.time * 2) * 0.3, 0, 0);
      look.scale.setScalar(1);
    });
    this.eyeLight.intensity = k > 0.5 ? 6000 * k : 0;
    if (target) this.eyeLight.target.position.set(target.x, target.y, target.z);
  }
  stepFx(dt) {
    // particles
    const ps = this.parts;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.grav * dt; p.vx *= 1 - p.drag * dt; p.vz *= 1 - p.drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const fade = 1 - p.age / p.life;
      this.pPos[w * 3] = p.x; this.pPos[w * 3 + 1] = p.y; this.pPos[w * 3 + 2] = p.z;
      this.pCol[w * 3] = p.r * fade; this.pCol[w * 3 + 1] = p.g * fade; this.pCol[w * 3 + 2] = p.b * fade;
      this.pSize[w] = p.size * (0.5 + fade * 0.5);
      ps[w++] = p;
    }
    ps.length = w;
    const g = this.particles.geometry;
    g.setDrawRange(0, w);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
    // ripples
    this.ripples = this.ripples.filter(r => {
      r.t += dt;
      const k = r.t / 0.9;
      if (k >= 1) { r.mesh.removeFromParent(); r.mesh.material.dispose(); return false; }
      r.mesh.scale.setScalar(0.5 + k * r.size);
      r.mesh.material.opacity = (1 - k) * 0.85;
      return true;
    });
    // popups
    this.popups = this.popups.filter(p => {
      p.t += dt;
      if (p.t >= p.life) { p.sp.removeFromParent(); p.sp.material.map.dispose(); p.sp.material.dispose(); return false; }
      p.sp.position.y += dt * 1.6;
      p.sp.material.opacity = Math.min(1, (p.life - p.t) * 2.5);
      return true;
    });
  }

  // ---------------------------------------------------------------- camera
  updateCamera(view, dt) {
    const cam = view.cam;   // { yaw, pitch, dist, tx, ty, tz, fov, mode }
    if (!cam) return;
    const W = this.world;
    this.camera.fov += ((cam.fov || 70) - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();
    const t = this.camTarget || (this.camTarget = new THREE.Vector3(cam.tx, cam.ty, cam.tz));
    const k = Math.min(1, dt * (cam.snap ? 60 : 14));
    t.x += (cam.tx - t.x) * k; t.y += (cam.ty - t.y) * Math.min(1, dt * 9); t.z += (cam.tz - t.z) * k;
    // never look from inside Gerald: keep the target above his surface
    t.y = Math.max(t.y, W.heightAt(t.x, t.z) + 0.6);
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    // how far back the camera can go along this pitch before it hits Gerald
    const clearDist = pitch => {
      const cp = Math.cos(pitch), spp = Math.sin(pitch);
      for (let d = 0.8; d <= cam.dist; d += 0.4) {
        const x = t.x - fx * cp * d, z = t.z - fz * cp * d, y = t.y + spp * d;
        if (W.heightAt(x, z) > y - 0.35) return Math.max(0.8, d - 0.4);
      }
      return cam.dist;
    };
    // something behind you (his arm, his belly)? rise up over it rather than jamming the camera into your back
    let pitch = cam.pitch, dist = clearDist(pitch);
    if (dist < cam.dist * 0.7) {
      for (let p = pitch + 0.12; p <= 1.3; p += 0.12) { const d = clearDist(p); if (d >= cam.dist * 0.7) { pitch = p; dist = d; break; } }
    }
    // ease the automatic lift so it doesn't snap
    this.camLift = (this.camLift ?? 0) + ((pitch - cam.pitch) - (this.camLift ?? 0)) * Math.min(1, dt * 6);
    pitch = cam.pitch + this.camLift;
    dist = Math.min(dist, clearDist(pitch));
    // walled in on every side: stay back anyway. His surface is see-through from behind, so you still see yourself.
    const buried = dist < 3;
    if (buried) dist = Math.min(cam.dist, 3.2);
    const cp = Math.cos(pitch), spp = Math.sin(pitch);
    let x = t.x - fx * cp * dist, z = t.z - fz * cp * dist, y = t.y + spp * dist;
    if (!buried) y = Math.max(y, W.heightAt(x, z) + 0.5);
    if (this.shakeAmt > 0) {
      const s = this.shakeAmt * 0.35;
      x += (Math.random() - 0.5) * s; y += (Math.random() - 0.5) * s; z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    this.camera.position.set(x, y, z);
    this.camera.lookAt(t.x, t.y, t.z);
  }
  /** draw the throwing arc for the local player (from, aim yaw/pitch, power, golf) */
  setArc(on, p, yaw, pitch, power, golf, mass) {
    this.arc.visible = on; this.arcEnd.visible = on;
    if (!on) { this.arcDots.count = 0; return; }
    const W = this.world;
    const d = aimDir(yaw, pitch);
    const sp = throwSpeed(power, golf) / Math.sqrt(1 + mass * 0.25);
    let x = p.x + d[0] * 0.5, y = p.y + PHYS.carryHeight * (p.scale || 1), z = p.z + d[2] * 0.5;
    let vx = d[0] * sp + p.vx * 0.5, vy = d[1] * sp + 1, vz = d[2] * sp + p.vz * 0.5;
    const g = PHYS.gravity * (this.gravity || 1);
    const pos = this.arc.geometry.attributes.position;
    let n = 0;
    for (; n < 60; n++) {
      pos.setXYZ(n, x, y, z);
      const step = 0.05;
      vy -= g * step; x += vx * step; y += vy * step; z += vz * step;
      if (y <= W.groundAt(x, z, y + 0.5, 0.5)) { n++; pos.setXYZ(n < 60 ? n : 59, x, W.groundAt(x, z, y + 0.5, 0.5) + 0.1, z); n = Math.min(60, n + 1); break; }
    }
    pos.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, n);
    this.arc.computeLineDistances();
    const last = n - 1;
    this.arcEnd.position.set(pos.getX(last), pos.getY(last) + 0.05, pos.getZ(last));
    this.arcEnd.scale.setScalar(0.9 + Math.sin(this.time * 8) * 0.1);
    this.arc.material.color.setHSL(0.33 - power * 0.33, 0.9, 0.6);
    // dots along the arc, drifting forward so it reads as motion
    let k = 0;
    const off = (this.time * 4) % 1;
    for (let i = 0; i + 1 < n && k < 40; i++) {
      const f = off;
      tmpV.set(pos.getX(i) + (pos.getX(i + 1) - pos.getX(i)) * f, pos.getY(i) + (pos.getY(i + 1) - pos.getY(i)) * f, pos.getZ(i) + (pos.getZ(i + 1) - pos.getZ(i)) * f);
      const sc = 1 - i / (n + 4) * 0.5;
      tmpM.compose(tmpV, tmpQ.identity(), tmpS.set(sc, sc, sc));
      this.arcDots.setMatrixAt(k++, tmpM);
    }
    this.arcDots.count = k;
    this.arcDots.instanceMatrix.needsUpdate = true;
    this.arcDots.material.color.setHSL(0.33 - power * 0.33, 0.95, 0.65);
  }
}

// ---------------------------------------------------------------- helpers
const textCache = new Map();
export function textTexture(text, color = '#fff', size = 64, bg = null) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `800 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w; c.height = Math.ceil(size * 1.5);
  g.font = `800 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (bg != null) {
    g.fillStyle = 'rgba(12,10,30,0.72)';
    const r = size * 0.4;
    g.beginPath(); g.roundRect(4, 4, w - 8, c.height - 8, r); g.fill();
    g.strokeStyle = '#' + bg.toString(16).padStart(6, '0'); g.lineWidth = 5; g.stroke();
  }
  g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(10,8,25,0.9)';
  g.strokeText(text, w / 2, c.height / 2 + 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** Mr. Biscuits: a big fluffy orange tabby, about ten goblins tall */
function buildCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf0a24a, roughness: 0.95 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfbe6c2, roughness: 0.95 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc8742a, roughness: 0.95 });
  const add = (parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
  const sph = new THREE.SphereGeometry(1, 24, 16);
  const body = new THREE.Group(); body.position.y = 7; g.add(body);
  add(body, sph, fur, 0, 0, 0, 4.6, 4.2, 8.2);
  add(body, sph, cream, 0, -1.2, 1.5, 3.6, 3.4, 6);
  for (const z of [-4, -1.5, 1, 3.5]) add(body, new THREE.TorusGeometry(4.3, 0.35, 6, 20, Math.PI), stripe, 0, 0.4, z, 1, 0.95, 1).rotation.set(0, Math.PI / 2, 0);
  const rear = new THREE.Group(); rear.position.set(0, 0, -5); body.add(rear);
  add(rear, sph, fur, 0, 0.3, 0, 4.4, 4, 3.6);
  const tail = new THREE.Group(); tail.position.set(0, 1.5, -3); rear.add(tail);
  const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, -3), new THREE.Vector3(0, 8, -4), new THREE.Vector3(0, 11, -2)]);
  add(tail, new THREE.TubeGeometry(tc, 20, 1.1, 10), fur, 0, 0, 0);
  add(tail, sph, cream, 0, 11, -2, 1.2, 1.2, 1.2);
  const legs = [];
  for (const [x, z] of [[-2.6, 4.5], [2.6, 4.5], [-2.6, -4.5], [2.6, -4.5]]) {
    const piv = new THREE.Group(); piv.position.set(x, 5.5, z); g.add(piv);
    add(piv, new THREE.CapsuleGeometry(1.3, 3.6, 6, 12), fur, 0, -2.8, 0);
    add(piv, sph, cream, 0, -5.2, 0.6, 1.5, 0.9, 1.9);
    legs.push(piv);
  }
  const head = new THREE.Group(); head.position.set(0, 10.2, 7.8); g.add(head);
  add(head, sph, fur, 0, 0, 0, 4.2, 3.6, 3.6);
  add(head, sph, cream, 0, -1.2, 2.4, 2.4, 1.7, 1.6);
  add(head, sph, new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.4 }), 0, -0.3, 3.85, 0.55, 0.4, 0.4);
  const ears = [];
  for (const s of [-1, 1]) {
    const e = add(head, new THREE.ConeGeometry(1.4, 2.8, 4), fur, s * 2.3, 3.4, 0.2); ears.push(e);
    add(e, new THREE.ConeGeometry(0.8, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0xffb3c1 }), 0, -0.2, 0.35);
  }
  const pupils = [];
  for (const s of [-1, 1]) {
    add(head, sph, new THREE.MeshStandardMaterial({ color: 0x9be36b, emissive: 0x3a7a1a, emissiveIntensity: 0.6, roughness: 0.2 }), s * 1.5, 0.7, 3.0, 1.05, 1.15, 0.6);
    const p = add(head, sph, new THREE.MeshBasicMaterial({ color: 0x111111 }), s * 1.5, 0.7, 3.55, 0.6, 1.0, 0.2); pupils.push(p);
    add(head, sph, new THREE.MeshBasicMaterial({ color: 0xffffff }), s * 1.25, 1.1, 3.7, 0.22, 0.22, 0.1);
  }
  const wm = new THREE.LineBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) for (const dy of [-0.3, 0.1]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * 1.2, -0.6 + dy, 3.6), new THREE.Vector3(s * 5.5, -0.2 + dy * 3, 3.2)]);
    head.add(new THREE.Line(geo, wm));
  }
  // a little bell collar
  add(g, new THREE.TorusGeometry(3.1, 0.35, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd93a5a }), 0, 8.3, 6.6).rotation.x = Math.PI / 2.4;
  add(g, sph, new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.3 }), 0, 6.4, 8.6, 0.8, 0.8, 0.8);
  g.userData = { body, rear, tail, legs, head, ears, pupils };
  return g;
}
function buildGiantHand(side) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2b48f, roughness: 0.75 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  palm.scale.set(3.8, 1.7, 4.0); palm.castShadow = true;
  g.add(palm);
  const fingers = [];
  [-2.4, -0.8, 0.8, 2.4].forEach((x, k) => {
    const piv = new THREE.Group(); piv.position.set(x, 0, 3.0);
    const len = [3.4, 4.4, 4.2, 3.2][k];
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, len, 6, 12), skin);
    f.rotation.x = Math.PI / 2; f.position.z = len / 2; f.castShadow = true;
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6), new THREE.MeshStandardMaterial({ color: 0xffd8d0, roughness: 0.3 }));
    nail.scale.set(1, 0.4, 1.2); nail.position.set(0, 0.62, len + 0.3);
    piv.add(f, nail);
    g.add(piv);
    fingers.push(piv);
  });
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 3.2, 6, 12), skin);
  th.position.set(side === 'L' ? 4.2 : -4.2, 0, 0.8); th.rotation.set(Math.PI / 2, 0, side === 'L' ? -0.7 : 0.7); th.castShadow = true;
  g.add(th);
  // striped pajama cuff
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x7ea6dd, roughness: 0.8, side: THREE.DoubleSide }));
  cuff.rotation.x = Math.PI / 2; cuff.position.z = -5.2;
  g.add(cuff);
  g.userData.fingers = fingers;
  return g;
}
function buildProp(kind) {
  const g = new THREE.Group();
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (kind === 'banana') { const b = add(new THREE.TorusGeometry(0.6, 0.18, 8, 16, Math.PI * 0.9), m(0xffe14a), 0, 0.2, 0); b.rotation.x = -Math.PI / 2; for (const a of [0.4, 1.4, 2.4]) { const p = add(new THREE.CapsuleGeometry(0.12, 0.6, 4, 6), m(0xf5d03a), Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5); p.rotation.z = Math.PI / 2; p.rotation.y = -a; } }
  else if (kind === 'trap') { add(new THREE.BoxGeometry(1.2, 0.15, 1.8), m(0xc49a6c), 0, 0.08, 0); add(new THREE.TorusGeometry(0.45, 0.05, 6, 12, Math.PI), m(0xb0b0b8, { metalness: 0.9, roughness: 0.3 }), 0, 0.16, 0.2).rotation.x = -Math.PI / 2; add(new THREE.BoxGeometry(0.3, 0.12, 0.3), m(0xffd23a), 0, 0.2, -0.3); }
  else if (kind === 'decoy') { add(new THREE.CapsuleGeometry(0.25, 0.3, 4, 8), m(0xff8a3d), 0, 0.45, 0); for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 6, 4), m(0x111111), s * 0.1, 0.62, 0.22); const key = add(new THREE.TorusGeometry(0.15, 0.04, 6, 10), m(0xd4af37, { metalness: 0.8 }), 0, 0.5, -0.32); key.rotation.y = Math.PI / 2; }
  else if (kind === 'cloud') { for (let i = 0; i < 9; i++) { const s = add(new THREE.SphereGeometry(1.2 + Math.random() * 1.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9a8f80, transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 }), (Math.random() - 0.5) * 6, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 6); s.castShadow = false; } }
  else if (kind === 'p_feather') { const f = add(new THREE.SphereGeometry(0.5, 10, 6), m(0xffffff)); f.scale.set(0.3, 0.08, 1.4); }
  else if (kind === 'p_pepper') { add(new THREE.CylinderGeometry(0.25, 0.3, 0.7, 10), m(0xeeeeee)); add(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0xaaaaaa, { metalness: 0.8 }), 0, 0.35, 0); }
  else if (kind === 'p_chain') { add(new THREE.SphereGeometry(0.5, 12, 8), m(0x222228, { metalness: 0.6 })); }
  else add(new THREE.SphereGeometry(0.3, 8, 6), m(0xffffff));
  return g;
}
function drawCatPhoto(g) {
  g.fillStyle = '#f4e3c1'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#d98b3a';
  g.beginPath(); g.ellipse(128, 160, 70, 60, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(128, 100, 52, 46, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(84, 80); g.lineTo(92, 30); g.lineTo(118, 64); g.fill();
  g.beginPath(); g.moveTo(172, 80); g.lineTo(164, 30); g.lineTo(138, 64); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.arc(110, 98, 7, 0, 7); g.arc(146, 98, 7, 0, 7); g.fill();
  g.fillStyle = '#e88a9a'; g.beginPath(); g.moveTo(122, 112); g.lineTo(134, 112); g.lineTo(128, 120); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 2;
  for (const s of [-1, 1]) for (const dy of [-4, 4]) { g.beginPath(); g.moveTo(128 + s * 14, 118 + dy); g.lineTo(128 + s * 54, 112 + dy * 2); g.stroke(); }
  g.fillStyle = '#5a3a20'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('Mr. Biscuits', 128, 238);
}
