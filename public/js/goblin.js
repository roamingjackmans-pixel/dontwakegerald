// A goblin: a wobbly bean with stubby limbs, big eyes, a hat and a name tag, animated procedurally.
import * as THREE from '../vendor/three.min.js';
import { buildHat, buildEyes, bodyMaterial } from './cosmetics.js';
import { ST } from '../shared/sim.js';

const PROFILE = [[0, 0], [0.26, 0.02], [0.39, 0.1], [0.45, 0.3], [0.46, 0.62], [0.43, 0.9], [0.36, 1.1], [0.22, 1.25], [0, 1.3]].map(([r, y]) => new THREE.Vector2(r, y));
const BODY_GEO = new THREE.LatheGeometry(PROFILE, 22);
const LIMB_GEO = new THREE.CapsuleGeometry(0.085, 0.26, 4, 8);
const LEG_GEO = new THREE.CapsuleGeometry(0.1, 0.16, 4, 8);
const HAND_GEO = new THREE.SphereGeometry(0.1, 8, 6);
const MOUTH_GEO = new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a0d12, roughness: 0.6 });

function tagTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px Fredoka, "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(10,8,25,0.85)';
  g.strokeText(text, 128, 34);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Goblin {
  constructor({ name, color, cos = {}, local = false }) {
    this.root = new THREE.Group();
    this.wob = new THREE.Group();      // tilt + squash
    this.spinG = new THREE.Group();    // ragdoll tumble
    this.root.add(this.spinG);
    this.spinG.add(this.wob);
    this.local = local;
    const bodyM = bodyMaterial(cos.color || 'red').clone();
    if (!cos.color) bodyM.color.setHex(color);
    this.bodyMat = bodyM;
    const body = new THREE.Mesh(BODY_GEO, bodyM);
    body.castShadow = true;
    this.wob.add(body);
    this.body = body;
    // face
    this.eyes = buildEyes(cos.eyes || 'normal', cos.color || undefined);
    if (!cos.color && this.eyes.userData.setSkin) this.eyes.userData.setSkin(color);
    this.eyes.position.set(0, 0.92, 0.38);
    this.wob.add(this.eyes);
    this.mouth = new THREE.Mesh(MOUTH_GEO, darkMat);
    this.mouth.position.set(0, 0.66, 0.43);
    this.mouth.rotation.x = Math.PI;
    this.mouth.scale.set(1.2, 0.5, 0.5);
    this.wob.add(this.mouth);
    // hat
    this.hat = buildHat(cos.hat || 'none');
    this.hat.position.set(0, 1.25, 0);
    this.wob.add(this.hat);
    // arms (pivot at the shoulder) and legs (pivot at the hip)
    const limbM = bodyM;
    this.arms = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.43, 0.68, 0);
      const a = new THREE.Mesh(LIMB_GEO, limbM); a.position.y = -0.2; a.castShadow = true; piv.add(a);
      const h = new THREE.Mesh(HAND_GEO, limbM); h.position.y = -0.38; piv.add(h);
      piv.rotation.z = s * 0.25;
      this.wob.add(piv);
      return piv;
    });
    this.legs = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.17, 0.2, 0);
      const l = new THREE.Mesh(LEG_GEO, limbM); l.position.y = -0.1; l.castShadow = true; piv.add(l);
      this.wob.add(piv);
      return piv;
    });
    // name tag
    if (!local) {
      this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(name, color), depthTest: false, transparent: true }));
      this.tag.scale.set(2.2, 0.55, 1);
      this.tag.position.y = 2.1;
      this.tag.renderOrder = 10;
      this.root.add(this.tag);
    }
    // state for animation
    this.a = { walk: 0, tiltX: 0, tiltZ: 0, vtX: 0, vtZ: 0, sq: 1, vsq: 0, blink: 2, spinX: 0, spinZ: 0, lastVy: 0, swingAnim: 0, slapAnim: 0, side: 1, look: [0, 0] };
    this.scale = 1;
  }
  setTagText(name, color) {
    if (!this.tag) return;
    this.tag.material.map.dispose();
    this.tag.material.map = tagTexture(name, color);
  }
  /** play a one-off action animation */
  play(kind) {
    if (kind === 'swing') this.a.swingAnim = 1;
    if (kind === 'slap') { this.a.slapAnim = 1; this.a.side = -this.a.side; }
  }
  /**
   * s: { x, y, z, vx, vy, vz, yaw, st, flags, swingT, emote, talk, carry, scale }
   */
  update(s, dt, t) {
    const a = this.a;
    const scale = s.scale || 1;
    this.root.position.set(s.x, s.y, s.z);
    this.root.scale.setScalar(scale);
    this.root.visible = s.st !== ST.OUT && s.st !== ST.SPEC;
    const yaw = s.yaw;
    const sp = Math.hypot(s.vx, s.vz);
    const grounded = s.flags & 1, climbing = s.flags & 2, swinging = s.flags & 4, holding = s.flags & 8;
    // ---- tumbling (ragdoll)
    if (s.st === ST.RAG) {
      a.spinX += (s.vz * Math.cos(yaw) + s.vx * Math.sin(yaw)) * dt * 1.6 + dt * 3;
      a.spinZ += (s.vx * Math.cos(yaw) - s.vz * Math.sin(yaw)) * dt * 1.2;
    } else {
      a.spinX *= Math.max(0, 1 - dt * 10); a.spinZ *= Math.max(0, 1 - dt * 10);
      a.spinX = ((a.spinX + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }
    this.spinG.rotation.set(0, yaw, 0);
    this.spinG.position.y = s.st === ST.RAG ? 0.6 : 0;
    this.wob.position.y = s.st === ST.RAG ? -0.6 : 0;
    // ---- springy tilt toward acceleration
    const ax = (s.vx - (a.pvx ?? s.vx)) / Math.max(dt, 1e-3), az = (s.vz - (a.pvz ?? s.vz)) / Math.max(dt, 1e-3);
    a.pvx = s.vx; a.pvz = s.vz;
    const fwdAcc = ax * Math.sin(yaw) + az * Math.cos(yaw), sideAcc = ax * Math.cos(yaw) - az * Math.sin(yaw);
    const targetX = Math.max(-0.5, Math.min(0.5, sp * 0.035 + fwdAcc * 0.012 + (climbing ? -0.35 : 0)));
    const targetZ = Math.max(-0.4, Math.min(0.4, -sideAcc * 0.01));
    a.vtX += ((targetX - a.tiltX) * 140 - a.vtX * 12) * dt; a.tiltX += a.vtX * dt;
    a.vtZ += ((targetZ - a.tiltZ) * 140 - a.vtZ * 12) * dt; a.tiltZ += a.vtZ * dt;
    // ---- squash and stretch
    if (grounded && a.lastVy < -6) a.vsq -= Math.min(6, -a.lastVy * 0.35);
    a.lastVy = s.vy;
    let sqT = 1;
    if (!grounded && s.st === 0) sqT = 1 + Math.max(-0.12, Math.min(0.15, s.vy * 0.012));
    a.vsq += ((sqT - a.sq) * 260 - a.vsq * 14) * dt; a.sq += a.vsq * dt;
    let sx = 1 / Math.sqrt(Math.max(0.5, a.sq)), sy = a.sq;
    if (s.st === ST.FLAT) { sx = 1.7; sy = 0.12; }
    // breathing idle bob
    const breathe = 1 + Math.sin(t * 2.4 + this.root.id) * 0.015;
    this.wob.scale.set(sx, sy * breathe, sx);
    this.wob.rotation.set(a.tiltX + (s.st === ST.RAG ? a.spinX : 0), 0, a.tiltZ + (s.st === ST.RAG ? a.spinZ : 0));
    // ---- limbs
    a.walk += sp * dt * 2.6;
    const swing = grounded && sp > 0.4 ? Math.sin(a.walk) * Math.min(1, sp / 6) : 0;
    let armL = -swing * 0.9, armR = swing * 0.9, armOutL = 0.25, armOutR = 0.25, legL = swing * 0.9, legR = -swing * 0.9;
    if (!grounded && s.st === 0) { armL = armR = -2.4; armOutL = armOutR = 0.6; legL = 0.6; legR = -0.3; }
    if (s.carry || holding) { armL = armR = -2.9; armOutL = armOutR = 0.15; }
    if (climbing) { const c = Math.sin(t * 10); armL = -2.6 + c * 0.5; armR = -2.6 - c * 0.5; legL = c * 0.6; legR = -c * 0.6; }
    if (swinging && !s.carry) {
      // wind up: arms back, the further the more power
      const p = s.swingT >= 0 ? Math.min(1, ((s.swingT / 0.95) % 2 < 1 ? (s.swingT / 0.95) % 2 : 2 - (s.swingT / 0.95) % 2)) : 0;
      armL = armR = 0.6 + p * 1.6; armOutL = armOutR = 0.1;
      this.wob.rotation.y = p * 0.9;
    } else if (swinging && s.carry) {
      armL = armR = -2.6 + 0.5; this.wob.rotation.y = 0.5;
    } else this.wob.rotation.y = 0;
    if (a.swingAnim > 0) { a.swingAnim = Math.max(0, a.swingAnim - dt * 4); const k = a.swingAnim; armL = armR = -2.2 * (1 - k) + 1.6 * k; this.wob.rotation.y = -0.9 * (1 - k) + 0.9 * k; }
    if (a.slapAnim > 0) { a.slapAnim = Math.max(0, a.slapAnim - dt * 6); const k = Math.sin(a.slapAnim * Math.PI); if (a.side > 0) { armR = -1.5 * k; armOutR = 1.4 * k; } else { armL = -1.5 * k; armOutL = 1.4 * k; } }
    if (s.st === ST.RAG || s.st === ST.HELD) {
      const f = t * (s.st === ST.HELD ? 22 : 13);
      armL = Math.sin(f) * 1.6 - 1.4; armR = Math.cos(f * 1.1) * 1.6 - 1.4; armOutL = armOutR = 0.9 + Math.sin(f * 0.7) * 0.4;
      legL = Math.sin(f * 1.3) * 1.2; legR = Math.cos(f * 1.2) * 1.2;
    }
    if (s.st === ST.FLAT) { armL = armR = 0; armOutL = armOutR = 1.5; legL = legR = 0; }
    // emotes
    if (s.emote && s.st === 0) {
      const e = s.emote, k = t * 6;
      if (e === 'wave') { armR = -2.6; armOutR = 0.6 + Math.sin(k * 1.5) * 0.5; }
      else if (e === 'dance') { armL = -2 + Math.sin(k) * 0.8; armR = -2 - Math.sin(k) * 0.8; legL = Math.sin(k) * 0.5; legR = -legL; this.wob.rotation.y = Math.sin(k * 0.5) * 0.7; this.wob.position.y = Math.abs(Math.sin(k)) * 0.15; }
      else if (e === 'flex') { armL = armR = -1.6; armOutL = armOutR = 1.4 + Math.sin(k) * 0.15; }
      else if (e === 'spin') { this.wob.rotation.y = t * 12; armOutL = armOutR = 1.5; }
      else if (e === 'cry') { armL = armR = -2.2; armOutL = armOutR = -0.3; this.wob.rotation.x += Math.sin(k * 2) * 0.05; }
      else if (e === 'laugh') { this.wob.rotation.x -= 0.3 + Math.abs(Math.sin(k * 2)) * 0.2; armL = armR = -0.5; }
      else if (e === 'point') { armR = -1.6; armOutR = 0.1; }
      else if (e === 'sleep') { this.wob.rotation.x = -1.4; this.wob.position.y = 0.4; }
      else if (e === 'jump') { this.wob.position.y = Math.abs(Math.sin(k)) * 0.6; armL = armR = -2.8; }
      else if (e === 'taunt') { this.wob.rotation.y = Math.PI + Math.sin(k) * 0.3; this.wob.rotation.x = 0.5; }
      else if (e === 'shrug') { armL = armR = -0.8; armOutL = armOutR = 1.3; }
      else if (e === 'bow') { this.wob.rotation.x = 0.9; }
    } else this.wob.position.y = s.st === ST.RAG ? -0.6 : 0;
    // frozen with fear while Gerald is awake
    if (s.scared && s.st === 0) { this.wob.position.x = Math.sin(t * 60) * 0.015; armL = armR = -0.3; armOutL = armOutR = 0.6; }
    else this.wob.position.x = 0;
    const lerp = (o, v) => o + (v - o) * Math.min(1, dt * 18);
    this.arms[0].rotation.x = lerp(this.arms[0].rotation.x, armL); this.arms[0].rotation.z = lerp(this.arms[0].rotation.z, -armOutL);
    this.arms[1].rotation.x = lerp(this.arms[1].rotation.x, armR); this.arms[1].rotation.z = lerp(this.arms[1].rotation.z, armOutR);
    this.legs[0].rotation.x = lerp(this.legs[0].rotation.x, legL);
    this.legs[1].rotation.x = lerp(this.legs[1].rotation.x, legR);
    // ---- face: blink, look, talk
    a.blink -= dt;
    let lid = 0;
    if (a.blink < 0.12) lid = 1;
    if (a.blink < 0) a.blink = 1.5 + Math.random() * 3.5;
    if (s.st === ST.FLAT || (s.emote === 'sleep')) lid = 1;
    for (const l of this.eyes.userData.lids || []) l.scale.y = lid;
    for (const sp of this.eyes.userData.spin || []) sp.rotation.z += dt * 4;
    const lx = s.st === ST.RAG ? Math.sin(t * 20) * 0.04 : (a.look[0] || 0), ly = s.st === ST.RAG ? Math.cos(t * 17) * 0.04 : (a.look[1] || 0);
    for (const p of this.eyes.userData.pupils || []) { p.position.x = p.userData.bx === undefined ? (p.userData.bx = p.position.x) + lx : p.userData.bx + lx; p.position.y = (p.userData.by ?? (p.userData.by = p.position.y)) + ly; }
    const open = s.st === ST.RAG || s.st === ST.HELD || s.scared ? 1 : Math.min(1, (s.talk || 0) * 2.2);
    this.mouth.scale.set(1.2 - open * 0.3, 0.5 + open * 1.6, 0.5);
    // the name tag sits above the hat
    if (this.tag) { this.tag.position.y = 2.05 + (this.hatHeight || 0); this.tag.visible = s.st !== ST.OUT; }
  }
  setLook(x, y) { this.a.look = [x, y]; }
  dispose() { this.root.removeFromParent(); this.bodyMat.dispose(); if (this.tag) this.tag.material.dispose(); }
}
