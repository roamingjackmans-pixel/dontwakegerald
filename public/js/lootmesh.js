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

  // ----- the beach -----
  shell(r) { // a peachy scallop: a fan with ribs and two little hinge "ears"
    const g = new THREE.Group();
    const R = r * 0.92, open = Math.PI * 0.8, hz = -r * 0.45;
    g.add(mesh(new THREE.CylinderGeometry(R, R, r * 0.1, 14, 1, false, -open / 2, open), mat(0xffe3d4, { roughness: 0.45 }), 0, -r * 0.04, hz));
    const rib = mat(0xf09a84, { roughness: 0.5 });
    for (let k = 0; k < 7; k++) {
      const a = -open / 2 + (k + 0.5) * open / 7, hump = Math.cos(a * 1.1); // middle ribs ride higher: a domed shell
      const o = mesh(new THREE.ConeGeometry(r * 0.11, R * 0.97, 6), rib, Math.sin(a) * R * 0.5, r * 0.02 + r * 0.06 * hump, hz + Math.cos(a) * R * 0.5);
      o.rotation.set(-Math.PI / 2, a, 0, 'YXZ'); o.scale.set(1, 1, 0.4 + 0.9 * hump * hump); // apex at the hinge
      g.add(o);
    }
    g.add(mesh(new THREE.BoxGeometry(r * 0.5, r * 0.12, r * 0.16), rib, 0, r * 0.02, hz - r * 0.02));
    return g;
  },
  seaglass(r) { // a frosted, wave-worn pebble of green glass with a brighter core
    const g = new THREE.Group();
    const core = mesh(new THREE.IcosahedronGeometry(r * 0.48, 1), mat(0xc8fff0, { roughness: 0.4, emissive: 0x3fbf98, emissiveIntensity: 0.55 }));
    core.scale.set(1.1, 0.5, 0.8); g.add(core);
    const shell = mesh(new THREE.IcosahedronGeometry(r * 0.8, 1), mat(0x7fe0c0, { roughness: 0.55, transparent: true, opacity: 0.78, emissive: 0x1f7a5e, emissiveIntensity: 0.45 }));
    shell.scale.set(1.12, 0.52, 0.82); shell.rotation.y = 0.5; g.add(shell);
    return g;
  },
  conch(r) { // a golden spiral conch: a long swirly cone with knobs on the shoulder and a flared pink trumpet mouth
    const g = new THREE.Group();
    const ridge = mat(0xffe9a6, { metalness: 0.8, roughness: 0.2, emissive: 0x6a4800, emissiveIntensity: 0.9 });
    const inner = new THREE.Group(); inner.rotation.z = 0.3; g.add(inner); // mouth tipped up so you can see the pink inside
    // the shell, apex at -x, mouth end at +x (lathed about y, then laid along x)
    const prof = [[0, -0.92], [0.1, -0.74], [0.21, -0.52], [0.33, -0.28], [0.44, -0.04], [0.49, 0.16], [0.46, 0.34], [0.36, 0.46], [0, 0.48]];
    const radAt = y => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [x0, y0] = prof[i - 1], [x1, y1] = prof[i]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return 0; };
    const body = mat(0xffcf6a, { metalness: 0.55, roughness: 0.3, emissive: 0x4a3000, emissiveIntensity: 0.7 }); // softer than gold(), so the shiny ridge stands out
    const shell = mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 16), body, -r * 0.05, 0, 0);
    shell.rotation.z = -Math.PI / 2; inner.add(shell);
    const pts = []; // a ridge spiralling from the shoulder to the tip
    for (let i = 0; i <= 80; i++) {
      const s = i / 80, y = 0.2 - s * 1.08, a = s * Math.PI * 2 * 4.5, rad = (radAt(y) + 0.015) * r;
      pts.push(new THREE.Vector3(y * r - r * 0.05, Math.cos(a) * rad, Math.sin(a) * rad));
    }
    inner.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, r * 0.05, 6), ridge));
    for (let k = 0; k < 7; k++) { // knobs around the shoulder
      const a = k / 7 * Math.PI * 2;
      const kn = mesh(new THREE.ConeGeometry(r * 0.08, r * 0.22, 6), ridge, -r * 0.05, Math.cos(a) * r * 0.47, Math.sin(a) * r * 0.47);
      kn.rotation.x = a; inner.add(kn);
    }
    const mouthGeo = new THREE.ConeGeometry(r * 0.42, r * 0.34, 18, 1, true); // gold outside, pink inside
    for (const m of [body, mat(0xffa894, { roughness: 0.35, emissive: 0x5a2014, emissiveIntensity: 0.5, side: THREE.BackSide })]) {
      const mo = mesh(mouthGeo, m, r * 0.4, 0, 0); mo.rotation.z = Math.PI / 2; inner.add(mo);
    }
    const lip = mesh(new THREE.TorusGeometry(r * 0.42, r * 0.045, 8, 26), ridge, r * 0.57, 0, 0); lip.rotation.y = Math.PI / 2; inner.add(lip);
    return g;
  },
  pail(r) { // bright blue toy bucket full of sand, a yellow handle and a little yellow spade
    const g = new THREE.Group();
    const H = r * 0.9, yb = -r * 0.52, yt = yb + H, Rt = r * 0.56, Rb = r * 0.42;
    const blue = mat(0x3fa9f5, { roughness: 0.35 }), dark = mat(0x2a82cc, { roughness: 0.35 }), yel = mat(0xffd23a, { roughness: 0.35 });
    g.add(mesh(new THREE.CylinderGeometry(Rt, Rb, H, 20, 1, true), mat(0x3fa9f5, { roughness: 0.35, side: THREE.DoubleSide }), 0, yb + H / 2, 0));
    g.add(mesh(new THREE.CylinderGeometry(Rb, Rb, r * 0.04, 20), blue, 0, yb + r * 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(Rb + (Rt - Rb) * 0.5 + r * 0.01, Rb + (Rt - Rb) * 0.36 + r * 0.01, H * 0.14, 20, 1, true), mat(0xffffff, { roughness: 0.4 }), 0, yb + H * 0.43, 0)); // white band
    const rim = mesh(new THREE.TorusGeometry(Rt, r * 0.045, 6, 24), dark, 0, yt, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
    g.add(mesh(new THREE.CylinderGeometry(Rt * 0.95, Rt * 0.95, r * 0.05, 20), mat(0xf0d39a, { roughness: 1 }), 0, yt - r * 0.12, 0)); // sand
    const handle = mesh(new THREE.TorusGeometry(Rt, r * 0.035, 6, 20, Math.PI), yel, 0, yt, 0); handle.rotation.x = -0.55; g.add(handle);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r * 0.06, 8, 6), yel, s * Rt, yt, 0));
    const spade = new THREE.Group(); spade.position.set(r * 0.18, yt - r * 0.12, r * 0.15); spade.rotation.set(0.15, 0, -0.45); g.add(spade);
    spade.add(mesh(new THREE.CylinderGeometry(r * 0.04, r * 0.04, r * 0.6, 8), yel, 0, r * 0.05, 0));
    const blade = mesh(new THREE.SphereGeometry(1, 12, 8), yel, 0, r * 0.42, 0); blade.scale.set(r * 0.16, r * 0.16, r * 0.04); spade.add(blade);
    return g;
  },

  // ----- the campout -----
  marshmallow(r) { // a soft white puck with rounded edges, toasted golden on top
    const g = new THREE.Group();
    const R = r * 0.66, h = r * 0.5, c = r * 0.2;
    const prof = [new THREE.Vector2(0, -h)];
    for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; prof.push(new THREE.Vector2(R - c + Math.cos(a) * c, -h + c + Math.sin(a) * c)); }
    const top = [];
    for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2; top.push(new THREE.Vector2(R - c + Math.cos(a) * c, h - c + Math.sin(a) * c)); }
    const inner = new THREE.Group(); inner.rotation.z = 0.12; g.add(inner);
    inner.add(mesh(new THREE.LatheGeometry([...prof, ...top, new THREE.Vector2(0, h)], 16), mat(0xfff7f0, { roughness: 0.9 })));
    const cap = mesh(new THREE.LatheGeometry([...top.slice(2), new THREE.Vector2(0, h)], 16), mat(0xf5d7a4, { roughness: 0.85 }));
    cap.scale.setScalar(1.015); inner.add(cap);
    return g;
  },
  acorn(r) { // glossy brown nut, a scaly cap with a lip and a little stalk
    const g = new THREE.Group();
    const nut = mesh(new THREE.SphereGeometry(r * 0.5, 14, 10), mat(0xa86a32, { roughness: 0.4 }), 0, -r * 0.12, 0); nut.scale.set(0.9, 1.15, 0.9); g.add(nut);
    const tip = mesh(new THREE.ConeGeometry(r * 0.08, r * 0.16, 8), mat(0x6b4a2a), 0, -r * 0.74, 0); tip.rotation.x = Math.PI; g.add(tip);
    const capM = mat(0x6e4a26, { roughness: 1, flatShading: true });
    const cap = mesh(new THREE.SphereGeometry(r * 0.56, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), capM, 0, r * 0.12, 0); cap.scale.y = 0.72; g.add(cap);
    const lip = mesh(new THREE.TorusGeometry(r * 0.54, r * 0.07, 6, 16), capM, 0, r * 0.12, 0); lip.rotation.x = Math.PI / 2; g.add(lip);
    const stem = mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.07, r * 0.26, 6), mat(0x5a3a1e), r * 0.04, r * 0.6, 0); stem.rotation.z = -0.35; g.add(stem);
    return g;
  },
  compass(r) { // brass case, cream face, a compass rose and a red-and-white needle, with a ring to hang it from
    const g = new THREE.Group();
    const brass = mat(0xd9a441, { metalness: 0.8, roughness: 0.3, emissive: 0x2e1d00, emissiveIntensity: 0.6 });
    const dark = mat(0xa8792a, { metalness: 0.8, roughness: 0.35, emissive: 0x1e1200, emissiveIntensity: 0.5 });
    const R = r * 0.72, top = r * 0.15;
    g.add(mesh(new THREE.CylinderGeometry(R, R * 1.04, r * 0.26, 28), brass, 0, r * 0.02, 0));
    const bezel = mesh(new THREE.TorusGeometry(R * 0.97, r * 0.06, 8, 28), dark, 0, top, 0); bezel.rotation.x = Math.PI / 2; g.add(bezel);
    g.add(mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.88, r * 0.02, 28), mat(0xfff3d6, { roughness: 0.4 }), 0, top, 0));
    const ink = mat(0x5a4632, { roughness: 0.6 });
    for (let k = 0; k < 8; k++) { // rose: long N/E/S/W points, short diagonals
      const a = k * Math.PI / 4, len = r * (k % 2 ? 0.28 : 0.5);
      const pt = mesh(new THREE.ConeGeometry(r * (k % 2 ? 0.05 : 0.07), len, 4), ink, Math.sin(a) * len / 2, top + r * 0.015, Math.cos(a) * len / 2);
      pt.rotation.set(Math.PI / 2, a, 0, 'YXZ'); pt.scale.z = 0.25; g.add(pt);
    }
    const needle = new THREE.Group(); needle.position.y = top + r * 0.05; needle.rotation.y = 0.45; g.add(needle);
    for (const [c, s] of [[0xe8322a, 1], [0xf4f4f4, -1]]) {
      const n = mesh(new THREE.ConeGeometry(r * 0.08, r * 0.52, 4), mat(c, { roughness: 0.4, emissive: c === 0xe8322a ? 0x400000 : 0x000000 }), 0, 0, s * r * 0.26);
      n.rotation.x = s * Math.PI / 2; n.scale.z = 0.3; needle.add(n);
    }
    g.add(mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, r * 0.07, 10), dark, 0, top + r * 0.06, 0));
    const crown = mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.07, r * 0.1, 10), brass, 0, r * 0.03, R + r * 0.02); crown.rotation.x = Math.PI / 2; g.add(crown);
    const loop = mesh(new THREE.TorusGeometry(r * 0.12, r * 0.035, 6, 14), brass, 0, r * 0.03, R + r * 0.16); loop.rotation.y = Math.PI / 2; g.add(loop);
    return g;
  },
  harmonica(r) { // silver cover plates around a wooden comb with a row of square holes
    const g = new THREE.Group();
    const silver = mat(0xc8ccd6, { metalness: 0.45, roughness: 0.28, emissive: 0x3a3e48, emissiveIntensity: 0.6 }); // (full metal goes black with no env map)
    const L = r * 1.66, W = r * 0.46;
    const inner = new THREE.Group(); inner.rotation.x = -0.45; g.add(inner); // holes tilted up toward the camera
    inner.add(mesh(new THREE.BoxGeometry(L * 0.97, r * 0.14, W), mat(0xb9824a, { roughness: 0.6 })));
    for (const s of [-1, 1]) inner.add(mesh(new THREE.BoxGeometry(L, r * 0.09, W * 0.9), silver, 0, s * r * 0.11, -W * 0.05));
    inner.add(mesh(new THREE.BoxGeometry(L * 0.55, r * 0.02, W * 0.5), mat(0x8e95a3, { metalness: 0.45, roughness: 0.35, emissive: 0x23262d, emissiveIntensity: 0.6 }), 0, r * 0.16, -W * 0.05)); // name plate
    const hole = mat(0x0a0a0c, { roughness: 1 });
    for (let k = 0; k < 10; k++) inner.add(mesh(new THREE.BoxGeometry(L * 0.055, r * 0.1, r * 0.03), hole, (k - 4.5) * L * 0.088, 0, W / 2));
    return g;
  },

  // ----- the back-garden hammock -----
  strawberry(r) { // a plump red berry with yellow seeds and a green leafy top
    const g = new THREE.Group();
    const k = r * 1.18; // (sized in units of k so the whole berry fills its radius)
    const prof = [[0, -0.72], [0.2, -0.6], [0.38, -0.38], [0.5, -0.1], [0.54, 0.12], [0.5, 0.3], [0.38, 0.42], [0, 0.46]].map(([x, y]) => new THREE.Vector2(x * k, y * k));
    g.add(mesh(new THREE.LatheGeometry(prof, 14), mat(0xff4a5a, { roughness: 0.35 })));
    const rings = [[-0.52, 0.26, 5], [-0.3, 0.42, 7], [-0.06, 0.51, 8], [0.18, 0.53, 8], [0.36, 0.43, 6]];
    const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(k * 0.035, 4, 3), mat(0xffe27a, { roughness: 0.5 }), rings.reduce((a, x) => a + x[2], 0));
    const m4 = new THREE.Matrix4();
    let n = 0;
    rings.forEach(([y, rad, cnt], i) => { for (let j = 0; j < cnt; j++) { const a = (j + i * 0.5) / cnt * Math.PI * 2; m4.makeTranslation(Math.cos(a) * rad * k, y * k, Math.sin(a) * rad * k); seeds.setMatrixAt(n++, m4); } });
    seeds.castShadow = true; g.add(seeds);
    const leaf = mat(0x3aa845, { roughness: 0.6 });
    for (let j = 0; j < 6; j++) {
      const a = j / 6 * Math.PI * 2, len = k * 0.4;
      const lf = mesh(new THREE.ConeGeometry(k * 0.12, len, 4), leaf, Math.sin(a) * len * 0.45, k * 0.43, Math.cos(a) * len * 0.45);
      lf.rotation.set(Math.PI / 2 + 0.3, a, 0, 'YXZ'); lf.scale.z = 0.35; g.add(lf);
    }
    g.add(mesh(new THREE.CylinderGeometry(k * 0.035, k * 0.05, k * 0.2, 6), leaf, 0, k * 0.55, 0));
    return g;
  },
  petal(r) { // a soft, cupped rose petal: pale at the base, pinker toward the curled tip
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, -0.78 * r);
    s.bezierCurveTo(0.42 * r, -0.62 * r, 0.82 * r, 0.1 * r, 0.6 * r, 0.52 * r);
    s.quadraticCurveTo(0.36 * r, 0.82 * r, 0, 0.74 * r); // a broad, rounded top with only a hint of a dip
    s.quadraticCurveTo(-0.36 * r, 0.82 * r, -0.6 * r, 0.52 * r);
    s.bezierCurveTo(-0.82 * r, 0.1 * r, -0.42 * r, -0.62 * r, 0, -0.78 * r);
    const geo = new THREE.ShapeGeometry(s, 8);
    const pos = geo.attributes.position, col = [], c0 = new THREE.Color(0xffc9dc), c1 = new THREE.Color(0xff6f9f), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / r, y = pos.getY(i) / r;
      pos.setZ(i, (0.75 * x * x - 0.35 * Math.max(0, y) * Math.max(0, y)) * r); // cup across, tip curls back
      c.copy(c0).lerp(c1, Math.min(1, (y + 0.75) / 1.1)); col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const o = mesh(geo, mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.65, emissive: 0x3a0c1c, emissiveIntensity: 0.35 }), 0, -r * 0.08, 0);
    o.rotation.x = -Math.PI / 2 + 0.3; g.add(o);
    return g;
  },
  lemonade(r) { // a glass tumbler of yellow lemonade with ice, a striped straw and a lemon slice on the rim
    const g = new THREE.Group();
    const H = r * 1.15, yb = -r * 0.66, yt = yb + H, Rt = r * 0.46, Rb = r * 0.38;
    const radAt = y => Rb + (Rt - Rb) * (y - yb) / H;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(Rt, Rb, H, 20, 1, true), mat(0xe6f8ff, { transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = yb + H / 2; glass.renderOrder = 1; g.add(glass);
    g.add(mesh(new THREE.CylinderGeometry(Rb * 0.98, Rb, r * 0.1, 20), mat(0xdff4ff, { transparent: true, opacity: 0.55, roughness: 0.05 }), 0, yb + r * 0.05, 0));
    const ly0 = yb + r * 0.1, ly1 = yb + H * 0.8;
    g.add(mesh(new THREE.CylinderGeometry(radAt(ly1) * 0.96, radAt(ly0) * 0.96, ly1 - ly0, 20), mat(0xfff27a, { roughness: 0.25, emissive: 0x6a5a00, emissiveIntensity: 0.45 }), 0, (ly0 + ly1) / 2, 0));
    const ice = mat(0xf2fbff, { transparent: true, opacity: 0.7, roughness: 0.1 });
    for (const [x, z, a] of [[-r * 0.14, r * 0.1, 0.4], [r * 0.12, -r * 0.12, 1.1]]) { const c = mesh(new THREE.BoxGeometry(r * 0.2, r * 0.18, r * 0.2), ice, x, ly1 + r * 0.02, z); c.rotation.set(0.3, a, 0.2); g.add(c); }
    const straw = new THREE.Group(); straw.position.set(-r * 0.1, yt - r * 0.08, -r * 0.12); straw.rotation.z = 0.35; g.add(straw);
    straw.add(mesh(new THREE.CylinderGeometry(r * 0.04, r * 0.04, r * 1.0, 8), mat(0xffffff, { roughness: 0.4 })));
    for (let k = 0; k < 4; k++) straw.add(mesh(new THREE.CylinderGeometry(r * 0.043, r * 0.043, r * 0.08, 8), mat(0xff4d6d, { roughness: 0.4 }), 0, r * (0.06 + k * 0.12), 0));
    const slice = new THREE.Group(); slice.position.set(Rt, yt - r * 0.04, 0); slice.rotation.x = Math.PI / 2; g.add(slice);
    slice.add(mesh(new THREE.CylinderGeometry(r * 0.24, r * 0.24, r * 0.07, 16), mat(0xffd21f, { roughness: 0.4 })));
    slice.add(mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, r * 0.075, 16), mat(0xfff59a, { roughness: 0.5, emissive: 0x5a5000, emissiveIntensity: 0.4 })));
    for (let k = 0; k < 4; k++) { const l = mesh(new THREE.BoxGeometry(r * 0.38, r * 0.08, r * 0.014), mat(0xfffbe6, { roughness: 0.6 })); l.rotation.y = k * Math.PI / 4; slice.add(l); }
    return g;
  },
  gnome(r) { // a tiny garden gnome: red pointy hat, big white beard, rosy nose, blue tunic and a belt
    const g = new THREE.Group();
    const blue = mat(0x3d6fd6, { roughness: 0.55 }), skin = mat(0xffc8a2, { roughness: 0.6 });
    for (const s of [-1, 1]) { const b = mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), mat(0x4a2f1e, { roughness: 0.7 }), s * r * 0.15, -r * 0.88, r * 0.05); b.scale.set(1, 0.65, 1.4); g.add(b); }
    g.add(mesh(new THREE.CylinderGeometry(r * 0.27, r * 0.4, r * 0.62, 16), blue, 0, -r * 0.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.365, r * 0.37, r * 0.08, 16), mat(0x3a2414, { roughness: 0.7 }), 0, -r * 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(r * 0.11, r * 0.09, r * 0.03), gold(), 0, -r * 0.6, r * 0.37));
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(r * 0.08, r * 0.22, 4, 8), blue, s * r * 0.33, -r * 0.42, r * 0.04); arm.rotation.z = s * 0.45; g.add(arm);
      g.add(mesh(new THREE.SphereGeometry(r * 0.075, 8, 6), skin, s * r * 0.41, -r * 0.56, r * 0.08));
    }
    g.add(mesh(new THREE.SphereGeometry(r * 0.25, 14, 10), skin, 0, -r * 0.02, 0));
    const beard = mesh(new THREE.ConeGeometry(r * 0.3, r * 0.56, 12), mat(0xfafafa, { roughness: 0.9 }), 0, -r * 0.3, r * 0.17); beard.rotation.x = Math.PI - 0.3; g.add(beard);
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r * 0.09, 8, 6), mat(0xfafafa, { roughness: 0.9 }), s * r * 0.1, -r * 0.06, r * 0.22)); // moustache
    g.add(mesh(new THREE.SphereGeometry(r * 0.085, 10, 8), mat(0xff9f88, { roughness: 0.5 }), 0, 0, r * 0.26));
    for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(r * 0.03, 6, 4), mat(0x111111), s * r * 0.09, r * 0.07, r * 0.22));
    const hat = new THREE.Group(); hat.position.y = r * 0.12; hat.rotation.set(-0.08, 0, -0.16); g.add(hat);
    hat.add(mesh(new THREE.ConeGeometry(r * 0.3, r * 0.78, 14), mat(0xe0413a, { roughness: 0.45 }), 0, r * 0.39, 0));
    return g;
  },
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
