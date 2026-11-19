// Little 3D models for every kind of loot, built from primitives. Each builder fits its thing inside the loot's
// radius r (from data.js) and returns a Group centred on the loot's position.
import * as THREE from '../vendor/three.min.js';
import { LOOT, LOOT_IDS } from '../shared/data.js';

const mats = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o }));
  return mats.get(key);
}
const gold = () => mat(0xffcf3d, { metalness: 0.85, roughness: 0.25, emissive: 0x3a2400, emissiveIntensity: 0.6 });
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; }

const BUILD = {
  crumb(r) {
    const g = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(r * 0.85, 0);
    const o = mesh(geo, mat(0xc98a3c, { roughness: 0.95 })); o.scale.set(1, 0.7, 1.1); o.rotation.set(0.4, 0.8, 0.2);
    g.add(o);
    return g;
  },
  cheerio(r) { const g = new THREE.Group(); const o = mesh(new THREE.TorusGeometry(r * 0.62, r * 0.32, 8, 16), mat(0xe2b45a, { roughness: 0.9 })); o.rotation.x = Math.PI / 2; g.add(o); return g; },
  gumball(r) { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(r * 0.95, 16, 12), mat(0xff6fae, { roughness: 0.15, emissive: 0x330011 }))); return g; },
  earbud(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r * 0.6, 14, 10), gold()));
    const stem = mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.2, r * 1.2, 8), gold(), r * 0.3, -r * 0.5, 0); stem.rotation.z = 0.4; g.add(stem);
    g.add(mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), mat(0xffffff, { roughness: 0.3 }), -r * 0.35, r * 0.25, 0));
    return g;
  },
  wish(r) {
    const g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-r, -r * 0.3, 0), new THREE.Vector3(0, r * 0.9, 0), new THREE.Vector3(r, -r * 0.2, 0));
    g.add(mesh(new THREE.TubeGeometry(curve, 12, r * 0.07, 6), mat(0x5a3a22, { emissive: 0xffd36a, emissiveIntensity: 0.8 })));
    g.add(mesh(new THREE.OctahedronGeometry(r * 0.25), mat(0xfff2a8, { emissive: 0xffe066, emissiveIntensity: 1.5 }), r, -r * 0.2, 0));
    return g;
  },
  jelly(r) {
    const g = new THREE.Group();
    const cols = [0x7fe05a, 0xff5a5a, 0xffd23a, 0xb06bff, 0xff9a3d, 0xffffff];
    const o = mesh(new THREE.CapsuleGeometry(r * 0.55, r * 0.7, 6, 12), mat(cols[(Math.random() * cols.length) | 0], { roughness: 0.2 }));
    o.rotation.z = Math.PI / 2; o.scale.set(1, 1, 0.85); g.add(o);
    return g;
  },
  duck(r) {
    const g = new THREE.Group();
    const y = mat(0xffd23a, { roughness: 0.3 });
    const b = mesh(new THREE.SphereGeometry(r * 0.75, 14, 10), y, 0, -r * 0.2, 0); b.scale.set(1, 0.8, 1.2); g.add(b);
    g.add(mesh(new THREE.SphereGeometry(r * 0.45, 12, 10), y, 0, r * 0.45, r * 0.35));
    const beak = mesh(new THREE.ConeGeometry(r * 0.18, r * 0.4, 8), mat(0xff8a1f), 0, r * 0.4, r * 0.85); beak.rotation.x = Math.PI / 2; g.add(beak);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r * 0.08, 6, 4), mat(0x111111), s * r * 0.2, r * 0.58, r * 0.72));
    const tail = mesh(new THREE.ConeGeometry(r * 0.25, r * 0.4, 8), y, 0, 0, -r * 0.9); tail.rotation.x = -2.2; g.add(tail);
    return g;
  },
  coin(r) {
    const g = new THREE.Group();
    const c = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.22, 24), mat(0xc0703a, { metalness: 0.8, roughness: 0.35 }));
    g.add(c);
    const rim = mesh(new THREE.TorusGeometry(r * 0.88, r * 0.06, 6, 24), mat(0xd9884a, { metalness: 0.8, roughness: 0.3 }), 0, r * 0.11, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
    return g;
  },
  button(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.25, 20), mat(0xf5f0e0, { roughness: 0.4 })));
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.1, r * 0.3, 6), mat(0x8a7a5a), a * r * 0.22, 0.01, b * r * 0.22));
    return g;
  },
  mint(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.4, 20), mat(0xf4fffa, { roughness: 0.3 })));
    for (let k = 0; k < 6; k++) { const s = mesh(new THREE.BoxGeometry(r * 0.9, r * 0.42, r * 0.14), mat(0xff4d6d)); s.rotation.y = k * Math.PI / 3; g.add(s); }
    return g;
  },
  sprinkle(r) {
    const cols = [0xff4d6d, 0x3fb7ff, 0x7bd94c, 0xffc233, 0xb06bff, 0xffffff];
    const g = new THREE.Group();
    const o = mesh(new THREE.CapsuleGeometry(r * 0.32, r * 1.1, 4, 8), mat(cols[(Math.random() * cols.length) | 0], { roughness: 0.4 }));
    o.rotation.z = Math.PI / 2; o.rotation.y = Math.random() * 3; g.add(o);
    return g;
  },
  bubble(r) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xe6d0ff, emissive: 0x7744cc, emissiveIntensity: 0.5, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2, depthWrite: false });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m));
    // a tiny dream inside: a little star or a sheep
    const inner = Math.random() < 0.5
      ? mesh(new THREE.OctahedronGeometry(r * 0.35), mat(0xffe680, { emissive: 0xffcc33, emissiveIntensity: 1.2 }))
      : (() => { const s = new THREE.Group(); s.add(mesh(new THREE.SphereGeometry(r * 0.32, 10, 8), mat(0xffffff, { roughness: 1 }))); s.add(mesh(new THREE.SphereGeometry(r * 0.14, 8, 6), mat(0x333333), 0, r * 0.05, r * 0.32)); return s; })();
    g.add(inner);
    g.userData.spin = inner;
    return g;
  },
  glasses(r) {
    const g = new THREE.Group();
    const fr = mat(0x6a3e22, { roughness: 0.4 });
    for (const s of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(r * 0.36, r * 0.07, 8, 20), fr, s * r * 0.45, 0, 0); g.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.34, 20), new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }));
      lens.position.set(s * r * 0.45, 0, 0); g.add(lens);
      const arm = mesh(new THREE.BoxGeometry(r * 0.06, r * 0.06, r * 1.0), fr, s * r * 0.82, 0, -r * 0.5); g.add(arm);
    }
    const bridge = mesh(new THREE.TorusGeometry(r * 0.12, r * 0.05, 6, 10, Math.PI), fr, 0, r * 0.05, 0); g.add(bridge);
    g.rotation.x = -0.3;
    return g;
  },
  watch(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 0.3, 24), gold()));
    const face = mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, r * 0.32, 24), mat(0xfffbea, { roughness: 0.3 })); g.add(face);
    const hand1 = mesh(new THREE.BoxGeometry(r * 0.06, r * 0.05, r * 0.5), mat(0x222222), 0, r * 0.18, -r * 0.2); g.add(hand1);
    const hand2 = mesh(new THREE.BoxGeometry(r * 0.35, r * 0.05, r * 0.06), mat(0x222222), r * 0.15, r * 0.18, 0); g.add(hand2);
    const loop = mesh(new THREE.TorusGeometry(r * 0.22, r * 0.06, 6, 12), gold(), 0, 0, r * 1.0); loop.rotation.x = Math.PI / 2; g.add(loop);
    g.userData.tick = hand1;
    return g;
  },
  ring(r) {
    const g = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(r * 0.7, r * 0.17, 12, 28), gold()); g.add(band);
    const gem = mesh(new THREE.OctahedronGeometry(r * 0.32), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x88ccff, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.1 }), 0, r * 0.95, 0);
    gem.scale.y = 1.3; g.add(gem);
    g.userData.spin = gem;
    return g;
  },
  globe(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.85, r * 0.45, 20), mat(0x7a4a2a, { roughness: 0.6 }), 0, -r * 0.65, 0));
    const glass = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 20, 14), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.3, roughness: 0.02, depthWrite: false }));
    glass.position.y = r * 0.15; g.add(glass);
    const tree = mesh(new THREE.ConeGeometry(r * 0.3, r * 0.7, 8), mat(0x2f8f4e), 0, r * 0.05, 0); g.add(tree);
    g.add(mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, r * 0.08, 16), mat(0xffffff), 0, -r * 0.35, 0));
    return g;
  },
  phone(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(r * 1.1, r * 0.22, r * 2.0), mat(0x222831, { roughness: 0.25, metalness: 0.4 })));
    const scr = mesh(new THREE.BoxGeometry(r * 0.95, r * 0.02, r * 1.75), new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x4a7dff, emissiveIntensity: 0.9, roughness: 0.1 }), 0, r * 0.12, 0); g.add(scr);
    g.userData.screen = scr;
    return g;
  },
  remote(r) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(r * 0.7, r * 0.35, r * 2.1), mat(0x2d2d33, { roughness: 0.5 })));
    const cols = [0xff4d4d, 0x4dff88, 0xffd84d, 0x4da6ff];
    for (let k = 0; k < 8; k++) g.add(mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.08, r * 0.1, 8), mat(k < 4 ? cols[k] : 0x999999), ((k % 2) - 0.5) * r * 0.3, r * 0.2, -r * 0.6 + Math.floor(k / 2) * r * 0.35));
    return g;
  },
  golfball(r) { const g = new THREE.Group(); g.add(mesh(new THREE.IcosahedronGeometry(r, 2), mat(0xffffff, { roughness: 0.6, flatShading: true }))); return g; },
  pea(r) { const g = new THREE.Group(); g.add(mesh(new THREE.SphereGeometry(r, 16, 12), mat(0xfff25a, { emissive: 0xaa8800, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 }))); return g; },
};

/** a new Object3D for loot of this type */
export function buildLoot(type) {
  const def = LOOT[type];
  const make = BUILD[type] || BUILD.crumb;
  const g = make(def.r);
  g.userData.type = type;
  return g;
}
export { LOOT_IDS };
