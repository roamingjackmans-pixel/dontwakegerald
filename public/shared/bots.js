// Computer goblins. Each bot fills in its own input every step, exactly like a player's controller would.
import { B, ST, LS, swingPower, aimDir, throwSpeed } from './sim.js';
import { LOOT, BOT_SKILL, PHYS, REGIONS, ITEMS } from './data.js';
import { STASH_R } from './world.js';

const hyp = Math.hypot;

/** how hard to swing (0..1) to lob something `dist` away and `dh` up, at the bots' fixed aim pitch */
function solvePower(dist, dh, golf, mass, g) {
  const pitch = 0.18;
  const d = aimDir(0, pitch);
  let best = 0.5, err = 1e9;
  for (let pw = 0.12; pw <= 1.0001; pw += 0.02) {
    const sp = throwSpeed(pw, golf) / Math.sqrt(1 + mass * 0.25);
    const vh = d[2] * sp, vy = d[1] * sp + 1;
    // time to come back down to dh (relative to the throw height)
    const disc = vy * vy - 2 * g * (dh - 0);
    if (disc < 0) continue;
    const t = (vy + Math.sqrt(disc)) / g;
    const land = vh * t;
    const e = Math.abs(land - dist);
    if (e < err) { err = e; best = pw; }
  }
  return { power: best, pitch, err };
}

export function botThink(sim, p, dt) {
  const sk = BOT_SKILL[p.skill] || BOT_SKILL.normal;
  const ai = p.ai || (p.ai = { think: 0, goal: null, stuck: 0, last: [p.x, p.z], jump: 0, swingTo: -1, mash: 0, freezeT: -1, itemT: 4 + sim.rnd() * 6, emoteT: 0, wander: null });
  const inp = { mx: 0, mz: 0, yaw: p.yaw, pitch: 0.18, b: 0, p: 0, sl: 0, v: 0, em: 0 };
  const g = sim.g;
  const set = () => { p.input = { ...inp, p: (p.input.p || 0) | inp.p }; };

  if (p.st === ST.HELD) {
    ai.mash -= dt;
    if (ai.mash <= 0) { ai.mash = 0.12 + (1 - sk.aim) * 0.25 + sim.rnd() * 0.1; inp.p |= B.JUMP; }
    return set();
  }
  if (p.st !== ST.OK) return set();

  // Gerald is awake: freeze (after a reaction delay; dozy bots sometimes don't)
  if (g.mode === 'waking' || g.mode === 'awake') {
    if (ai.freezeT < 0) ai.freezeT = sk.react * (0.6 + sim.rnd() * 0.8) + (sim.rnd() < 0.25 - sk.care * 0.25 ? 1.5 : 0);
    ai.freezeT -= dt;
    if (ai.freezeT <= 0) return set();
    // keep doing whatever we were doing until we notice
  } else ai.freezeT = -1;

  // Mr. Biscuits chases movement: careful bots hold still while he's close
  const cat = sim.cat;
  if (cat && (cat.state === 'prowl' || cat.state === 'crouch')) {
    const d = Math.hypot(p.x - cat.x, p.z - cat.z);
    if (ai.catCalm === undefined) ai.catCalm = sim.rnd() < sk.care + 0.25;
    if (d < 17 && ai.catCalm) return set();
  } else ai.catCalm = undefined;

  const carried = p.carry ? sim.loot.get(p.carry) : null;
  const myStash = sim.stashOf(p);
  const noise = g.noise;

  // a hand is coming for us: run
  for (const h of Object.values(g.hands)) {
    if ((h.state === 'aim' || h.state === 'lift') && (h.kind === 'swat' || h.kind === 'scratch')) {
      const d = hyp(p.x - h.tx, p.z - h.tz);
      if (d < 8 && sim.rnd() < sk.care + 0.3) {
        const away = [(p.x - h.tx) / (d || 1), (p.z - h.tz) / (d || 1)];
        inp.mx = away[0]; inp.mz = away[1]; inp.b |= B.SPRINT;
        steerSafe(sim, p, inp);
        unstick(sim, p, ai, inp, dt);
        return set();
      }
    }
  }

  // think now and then
  ai.think -= dt;
  const busy = ai.goal && ((ai.goal.kind === 'raid' && p.stealT > 0) || (ai.goal.kind === 'stash' && ai.swingTo >= 0));
  if ((ai.think <= 0 && !busy) || !ai.goal || goalGone(sim, p, ai.goal)) {
    ai.think = 0.35 + sim.rnd() * 0.4;
    ai.goal = pickGoal(sim, p, sk, carried, myStash);
  }
  const goal = ai.goal;
  let tx = p.x, tz = p.z, sprint = false;
  if (goal) {
    if (goal.kind === 'loot') { const l = sim.loot.get(goal.id); if (l) { tx = l.x; tz = l.z; } }
    else if (goal.kind === 'stash' || goal.kind === 'raid') { const s = sim.stashes[goal.seat]; tx = s.x; tz = s.z; }
    else if (goal.kind === 'hunt') { const q = sim.players[goal.seat]; if (q) { tx = q.x; tz = q.z; } }
    else if (goal.kind === 'spot') { tx = goal.x; tz = goal.z; }
  }
  const dx = tx - p.x, dz = tz - p.z, dist = hyp(dx, dz);
  if (dist > 0.3) { inp.mx = dx / dist; inp.mz = dz / dist; }
  // be careful when he's close to waking
  const careful = noise > 55 * (1.1 - sk.care * 0.4);
  sprint = dist > 6 && !careful && p.stamina > 25;
  if (sprint) inp.b |= B.SPRINT;
  inp.yaw = Math.atan2(dx, dz);

  if (goal && goal.kind === 'loot' && dist < 1.4 && !carried && p.actCd <= 0) { inp.p |= B.GRAB; inp.mx *= 0.3; inp.mz *= 0.3; }
  if (goal && goal.kind === 'stash' && carried) {
    // lob it in from a distance like a pro, or just walk it in
    const golf = sim.nm.golf * (p.fx.driver > 0 ? 2 : 1);
    const gr = PHYS.gravity * (sim.nm.gravity || 1);
    const canThrow = dist > 9 && dist < 22 * golf && sim.rnd() < sk.aim + 0.1 && p.grounded;
    if (ai.swingTo >= 0 || canThrow) {
      if (ai.swingTo < 0) {
        const dh = sim.world.heightAt(tx, tz) - (p.y + PHYS.carryHeight);
        const sol = solvePower(dist, dh, golf, LOOT[carried.type].mass, gr);
        ai.swingTo = Math.max(0.12, Math.min(1, sol.power + (sim.rnd() - 0.5) * (1 - sk.aim) * 0.5));
        ai.aimYaw = Math.atan2(dx, dz) + (sim.rnd() - 0.5) * (1 - sk.aim) * 0.3;
      }
      inp.mx = inp.mz = 0;
      inp.yaw = ai.aimYaw;
      inp.pitch = 0.18;
      const t = p.swingT;
      const pw = t >= 0 ? swingPower(t) : 0;
      if (t < 0 || Math.abs(pw - ai.swingTo) > 0.035 || t < 0.05) inp.b |= B.SWING;
      else ai.swingTo = -1;
      if (t > 3) ai.swingTo = -1;
    } else if (dist < STASH_R - 0.6) { inp.p |= B.GRAB; ai.goal = null; }
  } else ai.swingTo = -1;
  if (goal && goal.kind === 'hunt') {
    const q = sim.players[goal.seat];
    if (q && dist < 1.7 && p.slapCd <= 0) inp.p |= B.SLAP;
    else if (q && dist < 4 && dist > 2.4 && sim.rnd() < sk.aggro * 0.05) inp.p |= B.DIVE;
    else if (q && dist < 2 && sim.rnd() < sk.aggro * 0.04 && !q.carry) inp.p |= B.GRAB;
  }
  if (goal && goal.kind === 'raid') {
    if (dist < STASH_R - 0.4) { inp.b |= B.INTERACT; inp.mx = inp.mz = 0; }
  }
  // carrying someone? throw them off the bed
  if (p.holding >= 0) {
    const out = p.x < 0 ? -1 : 1;
    inp.yaw = Math.atan2(out, 0);
    if (p.swingT < 0 || swingPower(p.swingT) < 0.9) inp.b |= B.SWING;
  }
  // items
  ai.itemT -= dt;
  if (ai.itemT <= 0) { ai.itemT = 2 + sim.rnd() * 4; useSomething(sim, p, sk, inp, carried, myStash, noise); }
  // a little celebration after banking something big
  if (ai.emoteT > 0) { ai.emoteT -= dt; }
  steerSafe(sim, p, inp, tx, tz);
  unstick(sim, p, ai, inp, dt);
  set();
}

function goalGone(sim, p, goal) {
  if (goal.kind === 'loot') { const l = sim.loot.get(goal.id); return !l || l.st !== LS.FREE; }
  if (goal.kind === 'stash') return !p.carry;
  if (goal.kind === 'hunt') { const q = sim.players[goal.seat]; return !q || q.st === ST.OUT || (!q.carry && !goal.any); }
  if (goal.kind === 'raid') return !!p.carry || !sim.stashes[goal.seat].items.length;
  return false;
}

function pickGoal(sim, p, sk, carried, myStash) {
  if (carried || p.holding >= 0) return { kind: 'stash', seat: myStash.seat };
  const noise = sim.g.noise;
  // pick on someone carrying something nice nearby
  if (sim.rnd() < sk.aggro) {
    let best = null, bs = 0;
    for (const q of sim.list) {
      if (q === p || sim.sameTeam(p, q) || q.st !== ST.OK || !q.carry) continue;
      const l = sim.loot.get(q.carry);
      const d = hyp(q.x - p.x, q.z - p.z);
      if (!l || d > 14) continue;
      const s = l.value / (d + 3);
      if (s > bs) { bs = s; best = q; }
    }
    if (best && bs > 4) return { kind: 'hunt', seat: best.seat };
  }
  // raid a rich stash
  if (sim.mods.raids && sim.rnd() < sk.aggro * 0.45 && sim.phase === 'night') {
    let best = null, bv = 0;
    for (const s of sim.stashes) {
      if (s === myStash || sim.stashTeamIs(s, p.team) || !s.items.length) continue;
      const d = hyp(s.x - p.x, s.z - p.z);
      const v = s.items.reduce((a, id) => a + (sim.loot.get(id)?.value || 0), 0);
      if (d < 45 && v / (d + 10) > bv) { bv = v / (d + 10); best = s; }
    }
    if (best && bv > 3) return { kind: 'raid', seat: best.seat };
  }
  // the best loot for the walk
  let best = null, bs = 0;
  for (const l of sim.loot.values()) {
    if (l.st !== LS.FREE) continue;
    if (l.thrower === p.seat && sim.t - (l.throwT || 0) < 3) continue;   // just threw it
    const def = LOOT[l.type];
    const d = hyp(l.x - p.x, l.z - p.z) + Math.max(0, l.y - p.y) * 1.5;
    if (l.y > 40) continue;
    let s = l.value * (0.6 + sk.greed * 0.6) / (d + 10);
    // careful bots avoid the touchy bits of his face when he's restless
    const reg = sim.world.regionAt(l.x, l.z);
    if (reg >= 0 && noise > 45) s /= 1 + (REGIONS[reg].sens - 1) * sk.care;
    if (def.mass > 3) s *= 0.75;
    // someone else is already going for it
    for (const q of sim.list) if (q !== p && q.ai && q.ai.goal && q.ai.goal.kind === 'loot' && q.ai.goal.id === l.id) s *= 0.55;
    s *= 0.8 + sim.rnd() * 0.4;
    if (s > bs) { bs = s; best = l; }
  }
  if (best) return { kind: 'loot', id: best.id };
  return { kind: 'spot', x: (sim.rnd() - 0.5) * 70, z: -60 + sim.rnd() * 120 };
}

const onStand = (x, z) => Math.abs(x) > 51.3 && Math.abs(x) < 73.5 && z > -80 && z < -56;
/** don't run off the edge of the bed (but hop over to the nightstands on purpose) */
function steerSafe(sim, p, inp, tx, tz) {
  const ahead = 2.2;
  if (tx !== undefined) {
    const goingOut = onStand(tx, tz) && !onStand(p.x, p.z), goingIn = onStand(p.x, p.z) && !onStand(tx, tz);
    if (goingOut && Math.abs(p.x) > 47.8 && p.grounded && Math.sign(inp.mx) === Math.sign(p.x)) { inp.p |= B.JUMP; inp.b |= B.SPRINT; return; }
    if (goingOut && Math.abs(p.x) > 46) return;
    if (goingIn && Math.abs(p.x) < 53.5 && p.grounded) { inp.p |= B.JUMP; return; }
    if (goingIn || onStand(p.x, p.z)) return;
  }
  const ax = p.x + inp.mx * ahead, az = p.z + inp.mz * ahead;
  if (!sim.world.onBed(ax, az) || sim.world.heightAt(ax, az) < -2) {
    if (sim.world.onBed(p.x, p.z) && !(p.y > 7 && Math.abs(p.x) > 50)) {
      // turn toward the middle of the bed
      const cx = -p.x, cz = -p.z * 0.3, d = hyp(cx, cz) || 1;
      inp.mx = cx / d; inp.mz = cz / d;
    }
  }
}

/** jump over things and wiggle loose when stuck */
function unstick(sim, p, ai, inp, dt) {
  const moved = hyp(p.x - ai.last[0], p.z - ai.last[1]);
  ai.last = [p.x, p.z];
  const trying = inp.mx * inp.mx + inp.mz * inp.mz > 0.1;
  if (trying && moved < 0.02 * 60 * dt && !p.climbing) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
  if (ai.stuck > 0.5 && p.grounded) { inp.p |= B.JUMP; ai.stuck = 0.2; }
  if (ai.stuck > 0.45 && !p.grounded) { const a = Math.atan2(inp.mx, inp.mz) + 1.2; inp.mx = Math.sin(a); inp.mz = Math.cos(a); }
  // out of stamina on a steep climb: give up on that goal
  if (p.stamina < 3 && !p.grounded && ai.goal) { ai.goal = null; ai.think = 1.5; }
}

function useSomething(sim, p, sk, inp, carried, myStash, noise) {
  if (sim.rnd() > sk.items) return;
  const slots = p.inv.map((id, k) => [id, k]).filter(([id]) => id);
  if (!slots.length) return;
  const near = sim.list.filter(q => q !== p && !sim.sameTeam(p, q) && q.st === ST.OK).map(q => ({ q, d: hyp(q.x - p.x, q.z - p.z) })).sort((a, b) => a.d - b.d);
  for (const [id, k] of slots) {
    let ok = false;
    switch (id) {
      case 'lullaby': ok = noise > 72; break;
      case 'kazoo': ok = near[0] && near[0].d < 12 && noise > 35; break;
      case 'coffee': ok = !!carried && hyp(myStash.x - p.x, myStash.z - p.z) > 25; break;
      case 'magnet': ok = !carried && sim.rnd() < 0.3; break;
      case 'banana': ok = near[0] && near[0].d < 7; break;
      case 'trap': ok = hyp(myStash.x - p.x, myStash.z - p.z) < STASH_R + 1 && myStash.items.length > 1; break;
      case 'decoy': ok = noise > 55; break;
      case 'rocket': ok = sim.rnd() < 0.15; break;
      case 'feather': case 'pepper': case 'chain':
        if (near[0] && near[0].d < 18 && near[0].d > 4) { inp.yaw = Math.atan2(near[0].q.x - p.x, near[0].q.z - p.z); inp.pitch = Math.min(0.6, -0.05 + near[0].d * 0.012); ok = true; }
        break;
      case 'floss': ok = false; break;
    }
    if (ok) { inp.sl = k; inp.p |= B.USE; return; }
  }
}
