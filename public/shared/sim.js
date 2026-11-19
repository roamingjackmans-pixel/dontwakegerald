// The game itself. The host's browser runs one Sim and steps it 60 times a second; guests get snapshots.
// Practice games run the same Sim with only the local player and bots. Nothing in here touches the DOM, so the
// headless tests (tools/simtest.mjs) run it in Node.
import { World, SEATS, STASH_R, SPOTS, POSE_IDS, BED, NIGHTSTAND_TOP, FLOOR_Y } from './world.js';
import {
  PHYS, NOISE, REGIONS, REGION, LOOT, LOOT_IDS, LOOT_INDEX, carryMul, ITEMS, ITEM_IDS, INV_SLOTS, DREAMS, DREAM_IDS,
  MOD_DEFAULTS, SLEEP_TALK, WAKE_LINES, SETTLE_LINES, BOT_SKILL, AWARDS, SEAT_COLORS, TEAM_COLORS,
} from './data.js';

export const B = { JUMP: 1, SPRINT: 2, GRAB: 4, SWING: 8, SLAP: 16, DIVE: 32, USE: 64, INTERACT: 128, EMOTE: 256 };
export const ST = { OK: 0, RAG: 1, HELD: 2, FLAT: 3, OUT: 4, SPEC: 5, ZIP: 6 };
export const LS = { FREE: 0, CARRIED: 1, STASH: 2, GONE: 3 };
export const PH = { LOBBY: 'lobby', INTRO: 'intro', NIGHT: 'night', DAWN: 'dawn', RESULTS: 'results', SHOP: 'shop', FINAL: 'final' };
export const PHASE_LEN = { intro: 5, dawn: 3, results: 10, shop: 40, final: 25 };

const NEG = -1e4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const r2 = v => Math.round(v * 100) / 100;

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** golf-style power meter: 0 -> 1 -> 0 -> 1 ... over time held */
export function swingPower(t) { const c = (t / 0.95) % 2; return c < 1 ? c : 2 - c; }
export function aimDir(yaw, pitch) {
  const el = clamp(pitch + 0.32, -0.25, 1.25);
  return [Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)];
}
export function throwSpeed(power, golf) { return (7 + 22 * power) * golf; }

export class Sim {
  /**
   * opts: { seed, mods, roster: [{ seat, pid, name, cos, bot, color }], practice }
   */
  constructor(opts = {}) {
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.rnd = mulberry(this.seed);
    this.mods = { ...MOD_DEFAULTS, ...(opts.mods || {}) };
    this.dreamPool = opts.dreamPool || DREAM_IDS.filter(d => d !== 'none');
    this.world = new World('back');
    for (const pose of POSE_IDS) this.world.pose(pose);   // build every pose now, not mid-game
    this.t = 0;
    this.phase = PH.LOBBY;
    this.phaseT = 0;
    this.night = 0;
    this.dream = 'none';
    this.dreamsUsed = [];
    this.players = [];          // by seat index (may contain null)
    this.loot = new Map();
    this.nextLoot = 1;
    this.props = [];            // bananas, traps, clouds, decoys, projectiles, balls
    this.nextProp = 1;
    this.stashes = SEATS.map(([x, z], i) => ({ seat: i, x, z, items: [], alert: 0 }));
    this.events = [];
    this.noiseLog = [];
    this.water = -5;
    this.final = null;
    this.awardsTonight = null;
    this.chains = [];           // [[seatA, seatB]]
    this.g = this._newGerald();
    this.practice = !!opts.practice;
    for (const r of opts.roster || []) this.addPlayer(r);
    this.enterLobby();
  }

  // ---------------------------------------------------------------- players
  addPlayer(r) {
    const seat = r.seat ?? this.players.findIndex(p => !p);
    const s = seat < 0 ? this.players.length : seat;
    const [sx, sz] = SEATS[s % SEATS.length];
    const p = {
      seat: s, pid: r.pid || ('bot' + s), name: r.name || 'Goblin', bot: !!r.bot, skill: r.skill || this.mods.botSkill,
      cos: r.cos || {}, color: r.color ?? SEAT_COLORS[s % SEAT_COLORS.length], team: s,
      x: sx, y: 1, z: sz, vx: 0, vy: 0, vz: 0, yaw: sx < 0 ? Math.PI / 2 : -Math.PI / 2, grounded: false, airT: 0,
      st: ST.OK, stT: 0, stamina: PHYS.staminaMax, carry: 0, holding: -1, heldBy: -1, escape: 0,
      swingT: -1, slapCd: 0, actCd: 0, climbing: false, sel: 0, inv: [null, null, null], fx: {}, emote: 0, emoteT: 0,
      cash: this.mods.startCash, tonight: 0, stats: newStats(), totals: newStats(),
      input: { mx: 0, mz: 0, yaw: 0, pitch: 0, b: 0, p: 0, sl: 0, v: 0, em: 0 }, prevB: 0, seq: 0,
      lastHitBy: -1, lastHitT: -99, stealT: 0, stealFrom: -1, speedMul: 1, talk: 0, spawnGrace: 0, scale: 1, joined: this.t,
      ai: null, away: false,
    };
    this.players[s] = p;
    this.assignTeams();
    this.spawnAtStash(p);
    return p;
  }
  removePlayer(seat) { const p = this.players[seat]; if (!p) return; this.dropEverything(p); this.players[seat] = null; this.assignTeams(); }
  /** a human left mid-game: a bot takes over the seat (cash and all) */
  botify(seat, name) { const p = this.players[seat]; if (!p) return; p.bot = true; p.pid = 'bot' + seat; p.name = name || p.name + ' (bot)'; p.ai = null; p.input = { mx: 0, mz: 0, yaw: p.yaw, pitch: 0, b: 0, p: 0, sl: 0, v: 0, em: 0 }; }
  /** a human takes over a bot's seat (mid-game join) */
  humanize(seat, r) { const p = this.players[seat]; if (!p) return; p.bot = false; p.pid = r.pid; p.name = r.name; p.cos = r.cos || {}; if (r.color != null) p.color = r.color; p.ai = null; }
  get list() { return this.players.filter(Boolean); }
  assignTeams() {
    const ps = this.list;
    const mode = this.mods.teams;
    for (const p of ps) {
      if (mode === 'duos') p.team = Math.floor(p.seat / 2) * 2;
      else if (mode === 'two') p.team = SEATS[p.seat][0] < 0 ? 0 : 1;
      else p.team = p.seat;
    }
  }
  teamColor(p) { return this.mods.teams === 'ffa' ? p.color : this.mods.teams === 'two' ? TEAM_COLORS[p.team] : p.color; }
  stashOf(p) { return this.stashes[this.mods.teams === 'ffa' ? p.seat : this.mods.teams === 'duos' ? p.team : (p.team === 0 ? 0 : 1)]; }
  sameTeam(a, b) { return a && b && a.team === b.team; }
  spawnAtStash(p) {
    const s = this.stashOf(p);
    const ang = this.rnd() * Math.PI * 2;
    p.x = s.x + Math.cos(ang) * 1.2; p.z = s.z + Math.sin(ang) * 1.2;
    p.y = this.world.groundAt(p.x, p.z, 50) + 0.05;
    p.vx = p.vy = p.vz = 0;
    p.yaw = Math.atan2(-s.x, 0 - s.z * 0.3);
    p.st = ST.OK; p.stT = 0; p.stamina = PHYS.staminaMax; p.grounded = true; p.spawnGrace = 2;
  }
  /** a remote player's inputs, one per host step, so their client can replay exactly */
  queueInput(seat, list) {
    const p = this.players[seat];
    if (!p || p.bot) return;
    p.inq = p.inq || [];
    for (const inp of list) if (!(inp.seq <= (p.lastQ || 0))) { p.inq.push(inp); p.lastQ = inp.seq; }
    if (p.inq.length > 8) { let press = 0; while (p.inq.length > 3) press |= p.inq.shift().p || 0; p.inq[0].p = (p.inq[0].p || 0) | press; }
  }
  setInput(seat, inp) {
    const p = this.players[seat];
    if (!p || p.bot) return;
    const press = (p.input.p || 0) | (inp.p || 0);   // presses not yet consumed are kept
    p.input = { ...inp, p: press };
    if (inp.seq) p.seq = inp.seq;
  }

  // ---------------------------------------------------------------- events
  ev(e) { this.events.push(e); }
  sfx(n, x, y, z, extra) { this.ev({ e: 'sfx', n, x: r2(x), y: r2(y), z: r2(z), ...extra }); }
  feed(text) { this.ev({ e: 'feed', text }); }
  announce(text, sub = '', kind = '') { this.ev({ e: 'ann', text, sub, kind }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  // ---------------------------------------------------------------- phases
  enterLobby() {
    this.phase = PH.LOBBY; this.phaseT = 0; this.night = 0; this.dream = 'none'; this.dreamsUsed = [];
    this.world.setPose('back'); this.g = this._newGerald(); this.water = -5; this.chains = []; this.cat = null;
    this.clearLoot(); this.props = [];
    for (const s of this.stashes) s.items = [];
    for (const p of this.list) { p.cash = this.mods.startCash; p.tonight = 0; p.stats = newStats(); p.totals = newStats(); p.inv = [null, null, null]; p.fx = {}; this.spawnAtStash(p); }
    // a few toys to practice grabbing and throwing with
    for (let k = 0; k < 14; k++) this.spawnRandomLoot(this.rnd() < 0.5 ? 'golfball' : 'coin', REGION.bed);
    for (let k = 0; k < 8; k++) this.spawnRandomLoot('crumb', REGION.chest);
    this.final = null;
  }
  setMods(mods) { this.mods = { ...MOD_DEFAULTS, ...mods }; this.assignTeams(); }
  startMatch() {
    for (const p of this.list) { p.cash = this.mods.startCash; p.totals = newStats(); p.inv = [null, null, null]; p.fx = {}; }
    this.night = 0;
    this.dreamsUsed = [];
    this.beginNight();
  }
  get lastNight() { return this.night >= this.mods.nights; }
  get nm() { return this._nm || this.mods; }   // mods with tonight's dream applied
  beginNight() {
    this.night++;
    // tonight's dream
    let dream = 'none';
    if (this.mods.dreams && this.night > 1) {
      const pool = this.dreamPool.filter(d => !this.dreamsUsed.includes(d) && DREAMS[d]);
      const from = pool.length ? pool : this.dreamPool;
      dream = from[Math.floor(this.rnd() * from.length)] || 'none';
      this.dreamsUsed.push(dream);
    }
    this.dream = dream;
    const nm = { ...this.mods };
    if (dream === 'flying') nm.gravity = this.mods.gravity * 0.45;
    if (dream === 'butter') nm.slippery = true;
    if (dream === 'golf') nm.golf = Math.max(2, this.mods.golf * 2);
    if (dream === 'tiny') nm.size = Math.max(1.6, this.mods.size * 1.6);
    if (dream === 'speed') nm.speed = this.mods.speed * 1.35;
    if (dream === 'chains' && nm.chained === 'off') nm.chained = 'pairs';
    nm.lootValue = (dream === 'money' ? 2 : 1) * (this.lastNight ? 1.5 : 1);
    nm.noiseMul = (dream === 'money' ? 1.5 : 1) * (this.lastNight ? 1.2 : 1) * (dream === 'tiny' ? 1.25 : 1);
    nm.decayMul = dream === 'ex' ? 0.5 : 1;
    nm.stealMul = dream === 'thieves' ? 3 : 1;
    this._nm = nm;
    // world
    const pose = this.night === 1 ? 'back' : POSE_IDS[Math.floor(this.rnd() * POSE_IDS.length)];
    this.world.setPose(pose);
    this.g = this._newGerald();
    this.cat = null;
    // Mr. Biscuits visits once a night from night 2 (twice on the last night)
    this.catVisits = this.mods.cat && this.night >= 2 ? (this.lastNight ? 2 : 1) : 0;
    this.catT = 40 + this.rnd() * Math.max(20, this.mods.nightLen - 110);
    this.g.restless = dream === 'ex' ? 2 : 1;
    this.water = dream === 'flood' ? 0.2 : -5;
    this.props = [];
    this.clearLoot();
    for (const s of this.stashes) s.items = [];
    this.noiseLog = [];
    for (const p of this.list) {
      p.tonight = 0; p.stats = newStats(); p.fx = { ...(p.fxNext || {}) }; p.fxNext = {};
      p.scale = nm.size * (nm.bigHeads ? 1 : 1);
      if (nm.freeItems) this.giveItem(p, ITEM_IDS[Math.floor(this.rnd() * ITEM_IDS.length)]);
      if (p.st === ST.SPEC) p.st = ST.OK;
      this.dropEverything(p);
      this.spawnAtStash(p);
    }
    this.spawnNightLoot();
    this.setupChains();
    this.phase = PH.INTRO; this.phaseT = PHASE_LEN.intro;
    this.ev({ e: 'night', n: this.night, of: this.mods.nights, dream, pose, last: this.lastNight });
  }
  setupChains() {
    this.chains = [];
    const mode = this.nm.chained;
    if (mode === 'off') return;
    const ps = this.list.slice().sort((a, b) => b.cash - a.cash);
    if (mode === 'conga') { for (let i = 0; i + 1 < ps.length; i++) this.chains.push([ps[i].seat, ps[i + 1].seat]); return; }
    // pairs: leader with last place, second with second-last... (never two teammates if it can be helped)
    const left = ps.slice();
    while (left.length >= 2) {
      const a = left.shift();
      let k = left.length - 1;
      while (k > 0 && this.sameTeam(a, left[k]) && this.mods.teams !== 'ffa') k--;
      const b = left.splice(k, 1)[0];
      this.chains.push([a.seat, b.seat]);
    }
  }
  endNight() {
    this.phase = PH.DAWN; this.phaseT = PHASE_LEN.dawn;
    this.announce('DAWN!', "Anything not in a stash is gone", 'dawn');
    this.sfx('alarm_clock', SPOTS.clockFace.x, SPOTS.clockFace.y, SPOTS.clockFace.z, { global: 1 });
    for (const p of this.list) this.dropEverything(p, true);
    for (const l of this.loot.values()) if (l.st === LS.FREE || l.st === LS.CARRIED) this.removeLoot(l);
  }
  computeResults() {
    const ps = this.list;
    const awards = [];
    const best = (key, cmp = (a, b) => a > b, min = 0.0001) => {
      let w = null;
      for (const p of ps) if (p.stats[key] >= min && (!w || cmp(p.stats[key], w.stats[key]))) w = p;
      return w;
    };
    const give = (id, p, extra = '') => {
      if (!p) return;
      const a = AWARDS[id];
      if (a.bonus) p.cash += a.bonus;
      awards.push({ id, seat: p.seat, bonus: a.bonus, extra });
    };
    give('trick', best('trick', undefined, 12), (best('trick', undefined, 12)?.stats.trick | 0) + 'm');
    give('ringout', best('ringouts', undefined, 1));
    give('thief', best('stolen', undefined, 1));
    give('mule', best('heaviest', undefined, 2.5));
    give('loud', best('noise', undefined, 5));
    give('pancake', best('pancakes', undefined, 1));
    give('butter', best('broken', undefined, 1));
    if (this.g.waker >= 0 && this.players[this.g.waker]) give('waker', this.players[this.g.waker]);
    for (const p of ps) for (const k of Object.keys(p.stats)) p.totals[k] = k === 'trick' || k === 'heaviest' ? Math.max(p.totals[k], p.stats[k]) : p.totals[k] + p.stats[k];
    this.awardsTonight = awards;
    this.ev({ e: 'results', night: this.night, awards, rows: ps.map(p => ({ seat: p.seat, tonight: p.tonight, cash: p.cash })) });
  }
  enterShop() {
    this.phase = PH.SHOP; this.phaseT = PHASE_LEN.shop;
    for (const p of this.list) { p.shopReady = !!p.bot; this.spawnAtStash(p); }
    this.ev({ e: 'shop' });
    // bots shop right away
    for (const p of this.list) if (p.bot) this.botShop(p);
  }
  enterFinal() {
    this.phase = PH.FINAL; this.phaseT = PHASE_LEN.final;
    const ranks = this.standings();
    this.final = ranks.map((r, i) => ({ ...r, place: i + 1 }));
    // the winners stand on Gerald's face: first place on the tip of his nose
    const podium = [[0, -52.6], [-7.2, -51], [7.2, -51], [-4, -63], [4, -63], [-8, -64], [8, -64], [0, -66]];
    ranks.forEach((r, i) => {
      const p = this.players[r.seat]; if (!p) return;
      this.dropEverything(p, true);
      const [x, z] = podium[i] || podium[7];
      p.x = x; p.z = z; p.y = this.world.heightAt(x, z) + 0.05; p.vx = p.vy = p.vz = 0; p.st = ST.OK; p.yaw = 0; p.grounded = true;
      p.emote = i === 0 ? 'dance' : i < 3 ? 'wave' : 'cry'; p.emoteT = 99;
    });
    this.ev({ e: 'final', ranks: this.final });
  }
  standings() {
    const ps = this.list;
    if (this.mods.teams !== 'ffa') {
      const teams = new Map();
      for (const p of ps) { const t = teams.get(p.team) || { team: p.team, cash: 0, seats: [] }; t.cash += p.cash; t.seats.push(p.seat); teams.set(p.team, t); }
      const order = [...teams.values()].sort((a, b) => b.cash - a.cash);
      return ps.map(p => ({ seat: p.seat, cash: p.cash, team: p.team, teamCash: teams.get(p.team).cash, teamPlace: order.findIndex(t => t.team === p.team) + 1 }))
        .sort((a, b) => a.teamPlace - b.teamPlace || b.cash - a.cash);
    }
    return ps.map(p => ({ seat: p.seat, cash: p.cash, team: p.team })).sort((a, b) => b.cash - a.cash);
  }
  shopReady(seat, v = true) { const p = this.players[seat]; if (p) p.shopReady = v; }

  // ---------------------------------------------------------------- loot
  clearLoot() { this.loot.clear(); for (const p of this.list) { p.carry = 0; } }
  makeLoot(type, x, y, z, valueMul = 1) {
    const def = LOOT[type];
    const v = Math.round((def.value[0] + this.rnd() * (def.value[1] - def.value[0])) * valueMul);
    const l = { id: this.nextLoot++, type, ti: LOOT_INDEX[type], x, y, z, vx: 0, vy: 0, vz: 0, value: v, base: v, st: LS.FREE, holder: -1, owner: -1, credit: -1, rest: 0, dirty: true, thrower: -1, from: null, bornT: this.t, fragile: !!(def.fragile || this.nm.glass) };
    this.loot.set(l.id, l);
    this.ev({ e: 'loot+', id: l.id });
    return l;
  }
  removeLoot(l) { l.st = LS.GONE; l.dirty = true; this.loot.delete(l.id); this.ev({ e: 'loot-', id: l.id }); if (l.holder >= 0) { const p = this.players[l.holder]; if (p && p.carry === l.id) p.carry = 0; } }
  spawnRandomLoot(type, regionIdx) {
    const at = this.world.randomIn(regionIdx, this.rnd);
    if (!at) return null;
    const [x, z] = at;
    if (this.nearStash(x, z, 4)) return null;
    const def = LOOT[type];
    return this.makeLoot(type, x, this.world.heightAt(x, z) + def.r + 0.02, z, this.nm.lootValue || 1);
  }
  nearStash(x, z, r) { return this.stashes.some(s => hyp(s.x - x, s.z - z) < r + STASH_R); }
  spawnNightLoot() {
    const n = Math.max(4, this.list.length);
    let budget = 360 * n * this.mods.loot * (this.lastNight ? 1.15 : 1);
    const counts = this.world.regionCounts();
    const table = [];
    for (const type of LOOT_IDS) {
      const def = LOOT[type];
      if (type === 'golfball' && this.dream !== 'golf') continue;
      for (const [rid, w] of Object.entries(def.regions)) {
        const ri = REGION[rid], c = counts.get(ri) || 0;
        if (!c) continue;
        table.push({ type, ri, w: w * Math.sqrt(c) * (type === 'golfball' ? 4 : 1) });
      }
    }
    const total = table.reduce((s, e) => s + e.w, 0);
    let guard = 0;
    while (budget > 0 && guard++ < 600) {
      let r = this.rnd() * total, e = table[0];
      for (const t of table) { r -= t.w; if (r <= 0) { e = t; break; } }
      const l = this.spawnRandomLoot(e.type, e.ri);
      if (l) budget -= l.value / (this.nm.lootValue || 1);
    }
    // jackpots
    const W = this.world, rest = W.A.rest;
    const spots = [
      ['ring', () => { const h = rest.L; const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), px = Math.cos(h.yaw), pz = -Math.sin(h.yaw); return [h.x + px * 0.8 + fx * 4.5, h.z + pz * 0.8 + fz * 4.5]; }],
      ['watch', () => [SPOTS.pocket.x, SPOTS.pocket.z]],
      ['glasses', () => [0, -55.6]],
      ['phone', () => [61, -74], true],
      ['globe', () => [-61, -62], true],
      ['remote', () => { const h = rest.R; return [clamp(h.x + 7, -46, 46), h.z - 2]; }],
    ];
    const want = Math.min(spots.length, 3 + Math.floor(n / 3) + (this.mods.loot >= 2 ? 2 : 0));
    const order = spots.slice().sort(() => this.rnd() - 0.5).slice(0, want);
    for (const [type, at, stand] of order) {
      const [x, z] = at();
      const y = stand ? NIGHTSTAND_TOP : W.heightAt(x, z);
      this.makeLoot(type, x, y + LOOT[type].r + 0.05, z, this.nm.lootValue || 1);
    }
    this.g.bubbleT = 6;
    this.g.peaT = 4;
  }

  // ---------------------------------------------------------------- items
  giveItem(p, id) { const k = p.inv.indexOf(null); if (k < 0) return false; p.inv[k] = id; return true; }
  priceFor(p, id) {
    const ranks = this.standings();
    const last = ranks.length > 1 && ranks[ranks.length - 1].seat === p.seat;
    return Math.round(ITEMS[id].price * (last ? 0.7 : 1));
  }
  buy(seat, id) {
    const p = this.players[seat], def = ITEMS[id];
    if (!p || !def || this.phase !== PH.SHOP) return { ok: false, msg: 'Not now' };
    const price = this.priceFor(p, id);
    if (p.cash < price) return { ok: false, msg: 'Not enough cash' };
    if (def.kind === 'passive') {
      p.fxNext = p.fxNext || {};
      if (id === 'driver') p.fxNext.driver = (p.fxNext.driver || 0) + 3;
      if (id === 'wrap') { p.fxNext.wrap = (p.fxNext.wrap || 0) + 2; p.fxNext.wrapNight = 1; }
    } else if (!this.giveItem(p, id)) return { ok: false, msg: 'Pockets full (3 items)' };
    else if (def.charges) p.fx[id + 'Charges'] = def.charges;
    p.cash -= price;
    this.ev({ e: 'buy', seat, id, price });
    return { ok: true };
  }
  botShop(p) {
    let budget = Math.floor(p.cash * (0.25 + this.rnd() * 0.25));
    const sk = BOT_SKILL[p.skill] || BOT_SKILL.normal;
    for (let k = 0; k < 3 && budget > 30; k++) {
      if (this.rnd() > sk.items + 0.2) break;
      const id = ITEM_IDS[Math.floor(this.rnd() * ITEM_IDS.length)];
      const price = this.priceFor(p, id);
      if (price > budget) continue;
      if (this.buy(p.seat, id).ok) budget -= price;
    }
  }
  useItem(p) {
    const k = clamp(p.input.sl | 0, 0, INV_SLOTS - 1);
    const id = p.inv[k];
    if (!id) return;
    const def = ITEMS[id];
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    let used = true;
    switch (id) {
      case 'banana': this.addProp({ kind: 'banana', x: p.x - f[0] * 1.2, z: p.z - f[1] * 1.2, owner: p.seat, t: 90 }); break;
      case 'trap': this.addProp({ kind: 'trap', x: p.x + f[0] * 1.0, z: p.z + f[1] * 1.0, owner: p.seat, t: 200 }); break;
      case 'decoy': this.addProp({ kind: 'decoy', x: p.x + f[0], z: p.z + f[1], owner: p.seat, t: 15, yaw: p.yaw, vx: f[0] * 2.2, vz: f[1] * 2.2 }); break;
      case 'kazoo': {
        let blame = p, bd = 14;
        for (const q of this.list) if (q !== p && !this.sameTeam(q, p) && q.st !== ST.OUT) { const d = hyp(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; blame = q; } }
        this.sfx('kazoo', p.x, p.y, p.z);
        this.addNoise(NOISE.kazoo, blame.x, blame.z, blame.seat);
        if (blame !== p) this.feed(`🎺 ${p.name} framed ${blame.name}!`);
        break;
      }
      case 'coffee': p.fx.coffee = 12; this.sfx('coffee', p.x, p.y, p.z); break;
      case 'lullaby': this.g.noise = Math.max(0, this.g.noise - 35); this.g.lullaby = 10; this.sfx('lullaby', p.x, p.y, p.z, { global: 1 }); this.feed(`🎶 ${p.name} played a lullaby`); break;
      case 'magnet': p.fx.magnet = 8; this.sfx('magnet', p.x, p.y, p.z); break;
      case 'rocket': p.fx.rocket = 2; p.st = ST.OK; this.sfx('spray', p.x, p.y, p.z); break;
      case 'feather': case 'pepper': case 'chain': {
        const d = aimDir(p.input.yaw ?? p.yaw, p.input.pitch || 0), sp = 21;
        this.addProp({ kind: 'proj', what: id, x: p.x + d[0], y: p.y + 1.6, z: p.z + d[2], vx: d[0] * sp + p.vx * 0.5, vy: d[1] * sp + 3, vz: d[2] * sp + p.vz * 0.5, owner: p.seat, t: 4 });
        this.sfx('throw', p.x, p.y, p.z);
        break;
      }
      case 'floss': {
        const hit = this.raycast(p.x, p.y + 1.2, p.z, aimDir(p.input.yaw ?? p.yaw, (p.input.pitch || 0) + 0.15), 42);
        if (!hit) { used = false; this.ev({ e: 'deny', seat: p.seat, msg: 'Nothing to hook onto' }); break; }
        p.st = ST.ZIP; p.stT = 1.4; p.zip = hit; p.carryKeep = true;
        this.sfx('flick', p.x, p.y, p.z);
        this.ev({ e: 'floss', seat: p.seat, x: r2(hit[0]), y: r2(hit[1]), z: r2(hit[2]) });
        const c = (p.fx.flossCharges ?? 3) - 1;
        if (c > 0) { p.fx.flossCharges = c; used = 'keep'; } else delete p.fx.flossCharges;
        break;
      }
      default: used = false;
    }
    if (used === true) p.inv[k] = null;
    if (used) this.ev({ e: 'use', seat: p.seat, id });
  }
  addProp(o) { o.id = this.nextProp++; if (o.y === undefined) o.y = this.world.groundAt(o.x, o.z, 60) + 0.05; this.props.push(o); return o; }
  raycast(x, y, z, d, max) {
    for (let s = 1; s < max; s += 0.5) {
      const px = x + d[0] * s, py = y + d[1] * s, pz = z + d[2] * s;
      const g = this.world.groundAt(px, pz, py + 0.3, 0.3);
      if (py <= g) return [px, g + 0.2, pz];
    }
    return null;
  }

  // ---------------------------------------------------------------- noise
  addNoise(amount, x, z, seat = -1) {
    if (this.phase !== PH.NIGHT) return;
    const g = this.g;
    if (g.mode !== 'sleep') return;
    const reg = this.world.regionAt(x, z);
    const sens = reg >= 0 ? REGIONS[reg].sens : 0.35;
    // he gets lighter-sleeping as the match goes on
    let a = amount * sens * this.mods.sleep * (this.nm.noiseMul || 1) * (1 + 0.08 * Math.max(0, this.night - 1));
    if (g.lullaby > 0) a *= 0.3;
    if (this.water > 0) { const gy = this.world.heightAt(x, z); if (gy < this.water) a *= 0.5; }
    if (a <= 0) return;
    g.noise = Math.min(100, g.noise + a);
    this.noiseLog.push({ t: this.t, seat, a, x, z });
    const p = this.players[seat];
    if (p) p.stats.noise += a;
    if (a > 0.6) this.ev({ e: 'noise', x: r2(x), z: r2(z), a: r2(a), s: seat });
  }
  /** who made the most noise recently (seat or -1), plus where */
  loudest(window = 6, playersOnly = false) {
    const tot = new Map();
    let lastSpot = null;
    for (const n of this.noiseLog) {
      if (this.t - n.t > window) continue;
      if (playersOnly && !(n.seat >= 0 && this.players[n.seat])) continue;
      const key = n.seat;
      const o = tot.get(key) || { a: 0, x: n.x, z: n.z };
      o.a += n.a; o.x = n.x; o.z = n.z; tot.set(key, o);
      lastSpot = n;
    }
    let best = null, bk = -1;
    for (const [k, o] of tot) if (!best || o.a > best.a) { best = o; bk = k; }
    return best ? { seat: bk, x: best.x, z: best.z, a: best.a, last: lastSpot } : null;
  }

  // ---------------------------------------------------------------- Gerald
  _newGerald() {
    return {
      noise: 0, breathT: 0, mode: 'sleep', modeT: 0, lullaby: 0, restless: 1,
      cd: { twitch: 3, scratch: 6, swat: 6, big: 12 }, nextBig: 'sneeze',
      hands: { L: newHand('L'), R: newHand('R') }, bumpList: [], talkT: 18 + Math.random() * 12, ambientT: 20,
      waker: -1, flickQueue: [], flickT: 0, sneeze: 0, eyes: 0, look: -1, bubbleT: 8, peaT: 5, morphT: 0, morphLen: 0, nextPose: null,
    };
  }
  stepGerald(dt) {
    const g = this.g, W = this.world, night = this.phase === PH.NIGHT;
    // breathing and snoring
    const period = this.dream === 'ex' ? 3.6 : 4.8;
    g.breathT += dt;
    const ph = (g.breathT / period) % 1;
    g.phase = ph;
    W.breath = Math.sin(ph * Math.PI * 2) * 1.1 + (g.mode === 'sneezeIn' ? Math.min(1, g.modeT * 0.6) * 2 : 0);
    const mouthOpen = ph > 0.55 && ph < 0.98 ? Math.sin((ph - 0.55) / 0.43 * Math.PI) : 0;
    W.mouth = g.mode === 'sleep' ? mouthOpen * 0.9 : g.mode === 'awake' || g.mode === 'waking' ? 1 : 0.2;
    // twitch bumps
    for (const b of g.bumpList) b.t += dt;
    g.bumpList = g.bumpList.filter(b => b.t < b.dur);
    W.bumps = g.bumpList.map(b => ({ x: b.x, z: b.z, r: b.r, a: b.amp * Math.sin(Math.PI * b.t / b.dur) }));
    // pose morph (roll-over)
    if (g.morphLen > 0) {
      g.morphT += dt;
      const k = clamp(g.morphT / g.morphLen, 0, 1);
      W.morph = k * k * (3 - 2 * k);
      if (k >= 1) { W.endMorph(); g.morphLen = 0; for (const h of Object.values(g.hands)) h.state = 'rest'; }
    }
    this.stepHands(dt);
    if (g.lullaby > 0) g.lullaby -= dt;
    if (!night) { g.noise = 0; return; }
    // dream bubbles drift out of his head; golden peas fall in the pea dream
    g.bubbleT -= dt;
    if (g.bubbleT <= 0) {
      g.bubbleT = (this.dream === 'flying' ? 6 : 11) + this.rnd() * 6;
      const l = this.makeLoot('bubble', (this.rnd() - 0.5) * 10, 34, -58 + (this.rnd() - 0.5) * 6, this.nm.lootValue);
      l.vx = (this.rnd() - 0.5) * 4; l.vz = (this.rnd() - 0.2) * 5; l.vy = 2;
      this.ev({ e: 'bubble', id: l.id });
    }
    if (this.dream === 'peas') {
      g.peaT -= dt;
      if (g.peaT <= 0) { g.peaT = 5 + this.rnd() * 4; const x = (this.rnd() - 0.5) * 90, z = -70 + this.rnd() * 140; this.makeLoot('pea', x, 55, z, this.nm.lootValue); this.sfx('boing', x, 30, z); }
    }
    if (this.dream === 'flood') this.water = Math.min(9.5, this.water + dt * 9 / this.mods.nightLen);
    // noise fades
    // and restless late in the night: noise fades slower
    const late = 1 - 0.35 * clamp(1 - this.phaseT / this.mods.nightLen, 0, 1);
    if (g.mode === 'sleep') g.noise = Math.max(0, g.noise - NOISE.decay * (this.nm.decayMul || 1) * late * dt);
    for (const k of Object.keys(g.cd)) g.cd[k] -= dt;
    this.noiseLog = this.noiseLog.filter(n => this.t - n.t < 14);
    // sleep talk
    g.talkT -= dt;
    if (g.talkT <= 0 && g.mode === 'sleep') { g.talkT = 28 + this.rnd() * 26; this.ev({ e: 'say', text: SLEEP_TALK[Math.floor(this.rnd() * SLEEP_TALK.length)], kind: 'talk' }); }
    // a little twitch now and then, even when it's quiet
    g.ambientT -= dt;
    if (g.ambientT <= 0 && g.mode === 'sleep') {
      g.ambientT = (24 + this.rnd() * 26) / g.restless;
      if (this.mods.twitches) { const at = this.randomBodySpot(); this.twitch(at[0], at[1], 2.2); }
    }
    if (g.mode === 'sleep') this.reactToNoise();
    else this.stepGeraldMode(dt);
  }
  randomBodySpot() {
    const regs = [REGION.sock, REGION.hand, REGION.belly, REGION.chest, REGION.cheek, REGION.arm, REGION.blanket];
    for (let k = 0; k < 10; k++) { const at = this.world.randomIn(regs[Math.floor(this.rnd() * regs.length)], this.rnd); if (at) return at; }
    return [0, -10];
  }
  reactToNoise() {
    const g = this.g, N = g.noise, m = this.mods;
    if (N >= NOISE.wake - 1 && m.wakeups) { this.wakeUp(); return; }
    if (N >= NOISE.wake - 1 && !m.wakeups) g.noise = 96;
    const loud = this.loudest();
    if (N >= NOISE.big[0] && g.cd.big <= 0) {
      g.cd.big = NOISE.big[1];
      const opts = [];
      if (m.sneezes) opts.push('sneeze');
      if (m.rollovers) opts.push('roll');
      if (opts.length) {
        const pick = opts.includes(g.nextBig) ? g.nextBig : opts[0];
        g.nextBig = pick === 'sneeze' ? 'roll' : 'sneeze';
        if (pick === 'sneeze') this.startSneeze(); else this.rollOver();
        return;
      }
    }
    if (N >= NOISE.swat[0] && g.cd.swat <= 0 && m.swats && loud) {
      g.cd.swat = NOISE.swat[1];
      const who = this.loudest(6, true) || loud;
      const tp = this.players[who.seat];
      this.handTask('swat', tp ? tp.x : who.x, tp ? tp.z : who.z, who.seat);
      return;
    }
    if (N >= NOISE.scratch[0] && g.cd.scratch <= 0 && m.scratches && loud) {
      g.cd.scratch = NOISE.scratch[1];
      this.handTask('scratch', loud.last.x, loud.last.z, -1);
      return;
    }
    if (N >= NOISE.twitch[0] && g.cd.twitch <= 0 && m.twitches && loud) {
      g.cd.twitch = NOISE.twitch[1] / g.restless;
      this.twitch(loud.last.x, loud.last.z, 3.4);
      if (this.rnd() < 0.5) this.ev({ e: 'say', text: SLEEP_TALK[Math.floor(this.rnd() * SLEEP_TALK.length)], kind: 'talk' });
    }
  }
  twitch(x, z, amp) {
    this.g.bumpList.push({ x, z, r: 4.5, amp: amp * (this.dream === 'jelly' ? 1.5 : 1), t: 0, dur: 0.55 });
    this.sfx('twitch', x, this.world.heightAt(x, z), z);
  }
  /** a hand goes to do something at (x, z): 'swat' | 'scratch' | 'flick' */
  handTask(kind, x, z, target = -1) {
    const g = this.g;
    if (this.world.morph > 0 || g.morphLen > 0) return false;
    let h = x < 0 ? g.hands.L : g.hands.R;
    if (h.state !== 'rest') h = h === g.hands.L ? g.hands.R : g.hands.L;
    if (h.state !== 'rest') return false;
    const rest = this.world.A.rest[h.side];
    Object.assign(h, { state: 'lift', t: 0, kind, tx: x, tz: z, target, x: rest.x, y: rest.y, z: rest.z, yaw: rest.yaw, sx: rest.x, sz: rest.z, dir: this.rnd() * Math.PI });
    if (kind === 'swat') { this.ev({ e: 'warn', kind: 'swat', hand: h.side, target }); this.sfx('swat_warn', x, 20, z); }
    if (kind === 'scratch') this.sfx('scratch', x, 20, z);
    return true;
  }
  stepHands(dt) {
    const W = this.world;
    for (const h of Object.values(this.g.hands)) {
      if (h.state === 'rest') { if (h.side === 'L') W.liftL = 0; else W.liftR = 0; continue; }
      h.t += dt;
      const rest = W.A.rest[h.side];
      const setLift = v => { if (h.side === 'L') W.liftL = v; else W.liftR = v; };
      const ground = (x, z) => Math.max(W.heightAt(x, z), 0);
      if (h.state === 'lift') {
        setLift(Math.min(1, h.t / 0.12));
        const k = Math.min(1, h.t / 0.55);
        h.x = rest.x + (h.tx - rest.x) * k * 0.4; h.z = rest.z + (h.tz - rest.z) * k * 0.4; h.y = rest.y + 26 * Math.sin(k * Math.PI / 2);
        if (k >= 1) { h.state = 'aim'; h.t = 0; }
      } else if (h.state === 'aim') {
        // follow the target (slowly enough to dodge)
        const tp = h.target >= 0 ? this.players[h.target] : null;
        if (tp && tp.st !== ST.OUT && h.kind === 'swat') { h.tx += clamp(tp.x - h.tx, -7 * dt, 7 * dt); h.tz += clamp(tp.z - h.tz, -7 * dt, 7 * dt); }
        if (h.kind === 'swat') {
          const decoy = this.props.find(o => o.kind === 'decoy' && hyp(o.x - h.tx, o.z - h.tz) < 30);
          if (decoy) { h.tx += clamp(decoy.x - h.tx, -14 * dt, 14 * dt); h.tz += clamp(decoy.z - h.tz, -14 * dt, 14 * dt); }
        }
        const sp = h.kind === 'flick' ? 60 : 30;
        h.x += clamp(h.tx - h.x, -sp * dt, sp * dt); h.z += clamp(h.tz - h.z, -sp * dt, sp * dt);
        h.y += ((ground(h.x, h.z) + (h.kind === 'scratch' ? 6 : 22)) - h.y) * Math.min(1, dt * 4);
        const wait = h.kind === 'swat' ? 1.35 : h.kind === 'flick' ? 0.25 : 0.7;
        if (h.t > wait && hyp(h.tx - h.x, h.tz - h.z) < 1.5) { h.state = h.kind === 'scratch' ? 'scratch' : h.kind === 'flick' ? 'flick' : 'slam'; h.t = 0; h.y0 = h.y; }
      } else if (h.state === 'slam') {
        const gy = ground(h.x, h.z);
        h.y = h.y0 + (gy + 1.2 - h.y0) * Math.min(1, (h.t / 0.16) ** 2);
        if (h.t >= 0.16) { h.state = 'down'; h.t = 0; this.swatImpact(h); }
      } else if (h.state === 'down') {
        if (h.t > 1.0) { h.state = 'return'; h.t = 0; h.fx = h.x; h.fy = h.y; h.fz = h.z; }
      } else if (h.state === 'scratch') {
        const gy = ground(h.x, h.z);
        const sw = Math.sin(h.t * Math.PI * 3.2) * 6;
        const px = h.tx + Math.cos(h.dir) * sw, pz = h.tz + Math.sin(h.dir) * sw;
        const vx = (px - h.x) / dt, vz = (pz - h.z) / dt;
        h.x = px; h.z = pz; h.y = gy + 1.6;
        this.scratchHit(h, vx, vz);
        if (h.t > 2.3) { h.state = 'return'; h.t = 0; h.fx = h.x; h.fy = h.y; h.fz = h.z; }
      } else if (h.state === 'flick') {
        const tp = this.players[h.target];
        if (h.t > 0.12 && !h.flicked) { h.flicked = true; if (tp) this.flickPlayer(tp); }
        if (h.t > 0.45) { h.state = 'return'; h.t = 0; h.fx = h.x; h.fy = h.y; h.fz = h.z; h.flicked = false; }
      } else if (h.state === 'return') {
        const k = Math.min(1, h.t / 0.9), e = k * k * (3 - 2 * k);
        h.x = h.fx + (rest.x - h.fx) * e; h.z = h.fz + (rest.z - h.fz) * e;
        h.y = h.fy + (rest.y - h.fy) * e + Math.sin(k * Math.PI) * 10;
        if (k >= 1) { h.state = 'rest'; setLift(0); }
        else if (k > 0.88) setLift(1 - (k - 0.88) / 0.12);
      }
    }
    // a hand lying on the bed after a swat can be stood on
    W.extraSolids = [];
    for (const h of Object.values(this.g.hands)) if (h.state === 'down') W.extraSolids.push({ kind: 'box', tag: 'hand', x: h.x, z: h.z, hx: 4.2, hz: 4.2, y0: h.y - 3, y1: h.y + 1.6 });
  }
  swatImpact(h) {
    this.sfx('swat_impact', h.x, h.y, h.z, { global: 1 });
    this.ev({ e: 'shake', x: r2(h.x), z: r2(h.z), a: 1 });
    for (const p of this.list) {
      if (p.st === ST.OUT || p.st === ST.SPEC) continue;
      const d = hyp(p.x - h.x, p.z - h.z);
      if (d < 5.2 && Math.abs(p.y - h.y) < 7) {
        this.dropEverything(p);
        p.st = ST.FLAT; p.stT = 3.2; p.vx = p.vy = p.vz = 0;
        p.stats.pancakes++;
        this.sfx('pancake', p.x, p.y, p.z);
        this.feed(`🥞 ${p.name} got pancaked`);
      } else if (d < 9 && p.grounded) this.knock(p, (p.x - h.x) / d * 6, 7, (p.z - h.z) / d * 6, 0.6, -1);
    }
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const d = hyp(l.x - h.x, l.z - h.z);
      if (d < 8) { this.wake(l); l.vx += (l.x - h.x) / (d + 0.1) * 9; l.vz += (l.z - h.z) / (d + 0.1) * 9; l.vy += 9; }
    }
    this.props = this.props.filter(o => !(o.kind === 'decoy' && hyp(o.x - h.x, o.z - h.z) < 5.5));
  }
  scratchHit(h, vx, vz) {
    for (const p of this.list) {
      if (p.st === ST.OUT || p.st === ST.SPEC || p.st === ST.FLAT) continue;
      const d = hyp(p.x - h.x, p.z - h.z);
      if (d < 4.2 && Math.abs(p.y - h.y) < 4 && p.st !== ST.RAG) {
        const sp = hyp(vx, vz) || 1;
        this.dropEverything(p);
        this.knock(p, vx / sp * 15, 9, vz / sp * 15, 1.3, -1);
        this.sfx('yelp', p.x, p.y, p.z);
      }
    }
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      if (hyp(l.x - h.x, l.z - h.z) < 4.5) { this.wake(l); const sp = hyp(vx, vz) || 1; l.vx = vx / sp * 12; l.vz = vz / sp * 12; l.vy = 6; }
    }
  }
  flickPlayer(p) {
    // flick them toward the nearest bed edge, hard
    const ex = p.x < 0 ? -1 : 1;
    const dx = ex * 1, dz = (this.rnd() - 0.5) * 0.6;
    this.dropEverything(p);
    this.knock(p, dx * 30, 17, dz * 30, 2.6, -1);
    this.sfx('flick', p.x, p.y, p.z, { global: 1 });
    this.feed(`👉 Gerald flicked ${p.name}`);
    this.ev({ e: 'flicked', seat: p.seat });
  }
  startSneeze() {
    const g = this.g;
    g.mode = 'sneezeIn'; g.modeT = 0;
    this.announce('AAAH... AAAAH...', 'He is going to sneeze!', 'warn');
    this.sfx('sneeze_in', SPOTS.noseTip.x, SPOTS.noseTip.y, SPOTS.noseTip.z, { global: 1 });
  }
  rollOver(to) {
    const g = this.g, W = this.world;
    const choices = POSE_IDS.filter(p => p !== W.A.name);
    const pose = to || choices[Math.floor(this.rnd() * choices.length)];
    for (const h of Object.values(g.hands)) { h.state = 'rest'; }
    W.liftL = W.liftR = 0;
    W.startMorph(pose);
    g.morphT = 0; g.morphLen = 2.8;
    this.announce('HE\'S ROLLING OVER!', 'Hold on to something', 'warn');
    this.sfx('rollover', 0, 15, -10, { global: 1 });
    this.ev({ e: 'roll', pose });
    // everyone on his body tumbles
    for (const p of this.list) {
      if (p.st !== ST.OK) continue;
      const reg = W.regionAt(p.x, p.z);
      if (reg >= 0 && reg !== REGION.bed && reg !== REGION.pillow && reg !== REGION.stand) {
        this.knock(p, (this.rnd() - 0.5) * 10, 9 + this.rnd() * 5, (this.rnd() - 0.5) * 10, 1.4, -1);
      }
    }
    for (const l of this.loot.values()) if (l.st === LS.FREE) this.wake(l);
  }
  wakeUp() {
    const g = this.g;
    g.mode = 'waking'; g.modeT = 0;
    const loud = this.loudest(12, true);
    g.waker = loud ? loud.seat : -1;
    this.ev({ e: 'say', text: WAKE_LINES[Math.floor(this.rnd() * WAKE_LINES.length)], kind: 'wake' });
    this.announce("HE'S WAKING UP!", 'FREEZE! Don\'t move a muscle!', 'freeze');
    this.sfx('wake_roar', SPOTS.head.x, 30, SPOTS.head.z, { global: 1 });
    for (const h of Object.values(g.hands)) if (h.state !== 'rest') { h.state = 'return'; h.t = 0; h.fx = h.x; h.fy = h.y; h.fz = h.z; }
    const wk = this.players[g.waker];
    if (wk) {
      const fine = Math.min(wk.cash, Math.max(25, Math.round(wk.tonight * 0.15)));
      const others = this.list.filter(p => p !== wk && !this.sameTeam(p, wk));
      if (fine > 0) {
        wk.cash -= fine;
        if (others.length) { const each = Math.floor(fine / others.length); for (const o of others) o.cash += each; }
      }
      this.feed(`⏰ ${wk.name} woke Gerald and paid $${fine}`);
      this.ev({ e: 'waker', seat: wk.seat, fine });
      g.flickQueue = [wk.seat];
    } else g.flickQueue = [];
  }
  stepGeraldMode(dt) {
    const g = this.g;
    g.modeT += dt;
    if (g.mode === 'sneezeIn') {
      // he breathes in: everything near his nose gets pulled toward it
      this.windAt = { x: SPOTS.noseTip.x, z: SPOTS.noseTip.z, r: 30, f: -9 };
      if (g.modeT > 2.3) {
        g.mode = 'sleep'; this.windAt = null;
        this.sneezeBlast();
        g.noise = Math.max(0, g.noise - 30);
      }
    } else if (g.mode === 'waking') {
      g.eyes = Math.min(1, g.modeT / 1.2);
      if (g.modeT > 1.7) { g.mode = 'awake'; g.modeT = 0; }
    } else if (g.mode === 'awake') {
      g.eyes = 1;
      // anyone moving gets flicked (one at a time, so it's a show)
      if (g.modeT > 0.5) {
        for (const p of this.list) {
          if (p.st !== ST.OK || g.flickQueue.includes(p.seat) || p.flickedThisWake) continue;
          const sp = hyp(p.vx, p.vz);
          if (sp > 1.7 || p.vy > 3.5) { g.flickQueue.push(p.seat); p.flickedThisWake = true; this.ev({ e: 'caught', seat: p.seat }); }
        }
      }
      g.flickT -= dt;
      if (g.flickT <= 0 && g.flickQueue.length) {
        const seat = g.flickQueue.shift(), p = this.players[seat];
        if (p && p.st !== ST.OUT) { g.flickT = 0.75; if (!this.handTask('flick', p.x, p.z, seat)) this.flickPlayer(p); g.look = seat; }
      }
      if (g.modeT > 6.5 && !g.flickQueue.length) {
        g.mode = 'settle'; g.modeT = 0;
        this.ev({ e: 'say', text: SETTLE_LINES[Math.floor(this.rnd() * SETTLE_LINES.length)], kind: 'talk' });
        this.sfx('grumble', SPOTS.head.x, 30, SPOTS.head.z, { global: 1 });
        for (const p of this.list) p.flickedThisWake = false;
      }
    } else if (g.mode === 'settle') {
      g.eyes = Math.max(0, 1 - g.modeT / 1.2);
      if (g.modeT > 1.3 && !g.rolledThisWake) { g.rolledThisWake = true; if (this.mods.rollovers) this.rollOver(); }
      if (g.modeT > 3.5) { g.mode = 'sleep'; g.noise = 20; g.rolledThisWake = false; g.cd.big = 14; g.cd.swat = 6; g.waker = g.waker; this.announce('...zzz...', 'He fell back asleep', 'calm'); }
    }
  }
  sneezeBlast() {
    const n = SPOTS.noseTip;
    this.sfx('sneeze', n.x, n.y, n.z, { global: 1 });
    this.ev({ e: 'sneeze' });
    this.ev({ e: 'shake', x: n.x, z: n.z, a: 1.4 });
    for (const p of this.list) {
      if (p.st === ST.OUT || p.st === ST.SPEC) continue;
      const dx = p.x - n.x, dz = p.z - n.z, d = hyp(dx, dz) || 1;
      if (d > 36) continue;
      const f = 1 - d / 36;
      this.dropEverything(p);
      this.knock(p, dx / d * (10 + 24 * f), 8 + 14 * f, dz / d * (10 + 24 * f), 1.2 + f, -1);
    }
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const dx = l.x - n.x, dz = l.z - n.z, d = hyp(dx, dz) || 1;
      if (d > 36) continue;
      const f = 1 - d / 36;
      this.wake(l); l.vx += dx / d * 22 * f; l.vz += dz / d * 22 * f; l.vy += 10 * f;
    }
  }

  // ---------------------------------------------------------------- the main step
  step(dt) {
    const rdt = dt;                       // real time (timers)
    const gdt = dt * (this.nm.speed || 1); // game time (movement)
    this.t += rdt;
    // phase timers
    if (this.phase !== PH.LOBBY) {
      this.phaseT -= rdt;
      if (this.phase === PH.SHOP && this.list.every(p => p.bot || p.shopReady || p.away)) this.phaseT = Math.min(this.phaseT, 0);
      if (this.phaseT <= 0) this.nextPhase();
    }
    this.stepGerald(rdt);
    // wind from snoring (and the sneeze inhale)
    if (this.g.mode === 'sleep' && this.mods.snoreWind && this.phase !== PH.LOBBY) {
      const ph = this.g.phase;
      const n = SPOTS.noseTip;
      this.windAt = ph < 0.5 ? { x: n.x, z: n.z + 2, r: 15, f: -4.5 * Math.sin(ph * Math.PI * 2) } : { x: n.x, z: n.z + 3, r: 17, f: 6 * Math.sin((ph - 0.5) * Math.PI * 2) };
    } else if (this.g.mode !== 'sneezeIn') this.windAt = null;
    const frozen = this.phase === PH.INTRO || this.phase === PH.DAWN || this.phase === PH.RESULTS || this.phase === PH.SHOP || this.phase === PH.FINAL;
    for (const p of this.list) {
      if (p.bot && !frozen) this.botInput?.(this, p, rdt);
      else if (p.inq) {
        if (p.inq.length) { const inp = p.inq.shift(); p.input = { ...inp, p: (p.input.p || 0) | (inp.p || 0) }; p.seq = inp.seq; }
      }
      this.stepPlayer(p, gdt, frozen);
    }
    this.stepChains(gdt);
    this.collidePlayers();
    this.stepLoot(gdt);
    this.stepProps(gdt);
    this.stepCat(gdt);
  }
  nextPhase() {
    switch (this.phase) {
      case PH.INTRO: this.phase = PH.NIGHT; this.phaseT = this.mods.nightLen; this.announce('GO!', 'Steal everything. Quietly.', 'go'); this.sfx('go', 0, 0, 0, { global: 1 }); break;
      case PH.NIGHT: this.endNight(); break;
      case PH.DAWN: this.computeResults(); this.phase = PH.RESULTS; this.phaseT = PHASE_LEN.results; break;
      case PH.RESULTS:
        if (this.lastNight) this.enterFinal();
        else if (this.mods.shop) this.enterShop();
        else this.beginNight();
        break;
      case PH.SHOP: this.beginNight(); break;
      case PH.FINAL: this.enterLobby(); this.ev({ e: 'lobby' }); break;
    }
  }

  // ---------------------------------------------------------------- players: movement and actions
  stepPlayer(p, dt, frozen) {
    const inp = p.input;
    const press = inp.p || 0; inp.p = 0;
    const held = inp.b || 0;
    p.prevB = held;
    // timers
    for (const k of ['coffee', 'magnet', 'rocket', 'pepper', 'ball']) if (p.fx[k] > 0) { p.fx[k] -= dt; if (p.fx[k] <= 0) delete p.fx[k]; }
    if (p.slapCd > 0) p.slapCd -= dt;
    if (p.actCd > 0) p.actCd -= dt;
    if (p.spawnGrace > 0) p.spawnGrace -= dt;
    if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = 0; }
    p.talk = clamp(inp.v || 0, 0, 1);
    if (p.st === ST.SPEC) return;
    if (p.st === ST.OUT) {
      p.stT -= dt;
      if (p.stT <= 0) this.spawnAtStash(p);
      return;
    }
    // voice makes noise
    if (this.mods.micNoise && p.talk > 0.12) this.addNoise(NOISE.voice * p.talk * p.talk * dt, p.x, p.z, p.seat);
    if (frozen) {
      if (this.phase !== PH.INTRO) { p.vx *= 0.8; p.vz *= 0.8; }
      if (this.phase === PH.INTRO || this.phase === PH.SHOP || this.phase === PH.FINAL) { p.vx = p.vz = 0; }
      this.integrate(p, dt, 0, 0, false);
      return;
    }
    if (press & B.EMOTE && inp.em) { p.emote = inp.em; p.emoteT = 2.6; }
    switch (p.st) {
      case ST.HELD: return this.stepHeld(p, dt, press);
      case ST.FLAT:
        p.stT -= dt; p.vx = p.vz = 0;
        this.integrate(p, dt, 0, 0, false);
        if (p.stT <= 0) { p.st = ST.OK; p.vy = 6; this.sfx('boing', p.x, p.y, p.z); }
        return;
      case ST.RAG: return this.stepRagdoll(p, dt, press);
      case ST.ZIP: return this.stepZip(p, dt);
    }
    // ---- normal control
    const nm = this.nm;
    const carried = p.carry ? this.loot.get(p.carry) : null;
    const mass = carried ? LOOT[carried.type].mass : p.holding >= 0 ? 3 : 0;
    let sp = PHYS.walk;
    const moving = inp.mx * inp.mx + inp.mz * inp.mz > 0.04;
    const infinite = nm.stamina || p.fx.coffee > 0;
    let sprint = (held & B.SPRINT) && moving && (p.stamina > 1 || infinite) && p.swingT < 0;
    if (sprint) { sp = PHYS.sprint; if (!infinite) p.stamina = Math.max(0, p.stamina - PHYS.staminaSprint * dt); }
    sp *= carryMul(mass) * (p.fx.coffee > 0 ? 1.4 : 1) * (p.fx.ball > 0 ? 0.55 : 1) * (p.fx.pepper > 0 ? 0.6 : 1) * (p.swingT >= 0 ? 0.55 : 1);
    const reg = this.world.regionAt(p.x, p.z);
    if (reg === REGION.beard || reg === REGION.hair) sp *= 0.82;
    const inWater = this.water > 0 && p.y < this.water - 0.4;
    if (inWater) { sp *= 0.62; sprint = false; }
    sp *= Math.sqrt(p.scale);
    const tx = inp.mx * sp, tz = inp.mz * sp;
    const slippery = nm.slippery;
    const acc = (p.grounded ? PHYS.accelGround : PHYS.accelAir) * (slippery ? 0.13 : 1) * (inWater ? 0.5 : 1);
    p.vx += clamp(tx - p.vx, -acc * dt, acc * dt);
    p.vz += clamp(tz - p.vz, -acc * dt, acc * dt);
    // facing
    const wantYaw = p.swingT >= 0 || (held & B.SWING) ? (inp.yaw ?? p.yaw) : moving ? Math.atan2(inp.mx, inp.mz) : p.yaw;
    let dy = wantYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, dt * 14);
    // jump
    if ((press & B.JUMP) && (p.grounded || p.airT < 0.12 || inWater)) {
      const g = PHYS.gravity * nm.gravity;
      p.vy = PHYS.jump * Math.sqrt(g / PHYS.gravity) * (1 / (1 + mass * 0.09)) * (inWater ? 0.7 : 1) * Math.pow(p.scale, 0.25);
      p.grounded = false; p.airT = 1;
      this.sfx('jump', p.x, p.y, p.z);
    }
    // rocket
    if (p.fx.rocket > 0) { p.vy += 44 * dt; p.vx += Math.sin(p.yaw) * 14 * dt; p.vz += Math.cos(p.yaw) * 14 * dt; if (((p.fx.rocket * 8) | 0) !== (((p.fx.rocket + dt) * 8) | 0)) this.addNoise(1.4, p.x, p.z, p.seat); }
    // actions
    this.actions(p, press, held, carried, dt);
    // butterfingers
    if (nm.butter && carried && this.rnd() < dt * 0.06) { this.dropCarry(p, 3); this.sfx('drop', p.x, p.y, p.z); this.feed(`🧈 ${p.name} fumbled the ${LOOT[carried.type].name}`); }
    this.integrate(p, dt, tx, tz, moving, sprint);
    // carrying a player
    if (p.holding >= 0) {
      const q = this.players[p.holding];
      if (!q || q.st !== ST.HELD || q.heldBy !== p.seat) p.holding = -1;
    }
  }
  /** movement: gravity, ground, climbing, walls, falling off. Used for the local player's prediction too. */
  integrate(p, dt, tx, tz, moving, sprint) {
    const W = this.world, nm = this.nm;
    const g = PHYS.gravity * (nm.gravity || 1);
    const inWater = this.water > 0 && p.y < this.water - 0.3;
    p.vy -= g * dt * (inWater ? 0.35 : 1);
    if (inWater) { p.vy += (this.water - 0.5 - p.y) * 9 * dt; p.vy *= 1 - dt * 2.5; }
    if (!p.grounded) p.airT += dt;
    // wind
    const w = this.windAt;
    if (w) {
      const dx = p.x - w.x, dz = p.z - w.z, d = hyp(dx, dz);
      if (d < w.r && d > 0.5) { const f = w.f * (1 - d / w.r) / d * dt * 4; p.vx += dx * f; p.vz += dz * f; }
    }
    // friction when not steering
    if (p.grounded && !moving && !nm.slippery) { const k = Math.max(0, 1 - PHYS.friction * dt); p.vx *= k; p.vz *= k; }
    else if (p.grounded && nm.slippery) { p.vx *= 1 - 0.4 * dt; p.vz *= 1 - 0.4 * dt; }
    // ground slope: steep ground is a climb (stamina) or a slide
    const stepUp = PHYS.stepUp * p.scale;
    p.climbing = false;
    if (p.grounded) {
      const e = 0.4;
      const gx = (W.heightAt(p.x + e, p.z) - W.heightAt(p.x - e, p.z)) / (2 * e);
      const gz = (W.heightAt(p.x, p.z + e) - W.heightAt(p.x, p.z - e)) / (2 * e);
      const slope = hyp(gx, gz);
      if (slope > PHYS.walkSlope && slope < 50) {
        const ux = gx / slope, uz = gz / slope;   // uphill
        const up = p.vx * ux + p.vz * uz;
        const infinite = nm.stamina || p.fx.coffee > 0;
        if (up > 0.3 && (p.stamina > 0 || infinite) && moving) {
          p.climbing = true;
          if (!infinite) p.stamina = Math.max(0, p.stamina - PHYS.staminaClimb * dt);
          const cap = PHYS.climbSpeed * 1.25 / Math.max(1, slope);
          const along = up > cap ? cap : up;
          p.vx += (along - up) * ux; p.vz += (along - up) * uz;
        } else {
          // slide down, faster the steeper it is
          const s = Math.min(1, (slope - PHYS.walkSlope) / 2.5);
          const down = -(g * 0.75 * s) * dt;
          p.vx += ux * down; p.vz += uz * down;
          if (up > 0) { p.vx -= ux * up * Math.min(1, dt * 8); p.vz -= uz * up * Math.min(1, dt * 8); }
        }
      }
    }
    // horizontal move with walls
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const gNew = W.groundAt(nx, nz, p.y, stepUp);
    if (gNew > p.y + stepUp && W.heightAt(nx, nz) > p.y + stepUp) {
      // a wall of Gerald: climb straight up it if we have stamina and are pushing into it
      const infinite = nm.stamina || p.fx.coffee > 0;
      if (moving && (p.stamina > 0 || infinite) && p.st === ST.OK) {
        p.climbing = true;
        if (!infinite) p.stamina = Math.max(0, p.stamina - PHYS.staminaClimb * 1.3 * dt);
        p.vy = Math.max(p.vy, PHYS.climbSpeed);
        p.grounded = false; p.airT = 0;
      }
      // slide along whichever axis is free
      if (W.groundAt(nx, p.z, p.y, stepUp) <= p.y + stepUp) p.x = nx; else p.vx *= 0.2;
      if (W.groundAt(p.x, nz, p.y, stepUp) <= p.y + stepUp) p.z = nz; else p.vz *= 0.2;
    } else { p.x = nx; p.z = nz; }
    const pos = [p.x, p.y, p.z];
    if (W.pushOut(pos, PHYS.radius * p.scale, PHYS.height * p.scale, stepUp)) { p.x = pos[0]; p.z = pos[2]; }
    // vertical
    const ground0 = W.groundAt(p.x, p.z, p.y, stepUp);
    p.y += p.vy * dt;
    const ground = W.groundAt(p.x, p.z, p.y, stepUp);
    const wasGrounded = p.grounded;
    if (p.y <= ground) {
      const impact = -p.vy;
      const onGerald = this.isGerald(p.x, p.z);
      if (this.dream === 'jelly' && onGerald && impact > 6 && p.st === ST.OK) {
        p.y = ground; p.vy = Math.min(26, impact * 1.05 + 3); p.grounded = false;
        this.sfx('boing', p.x, p.y, p.z);
      } else {
        // the ground is rising under us (breathing, a twitch, a roll-over): ride it, or get launched
        const rise = (ground - ground0) / dt;
        p.y = ground;
        if (!wasGrounded && impact > 3) {
          this.sfx(impact > 15 ? 'land_big' : 'land', p.x, p.y, p.z);
          if (p.st === ST.OK || p.st === ST.RAG) this.addNoise(impact > 15 ? NOISE.bigLand : NOISE.land * Math.min(2, impact / 8), p.x, p.z, p.seat);
        }
        p.vy = rise > 5 ? rise * 1.1 : 0;
        p.grounded = rise <= 5;
        if (rise > 12 && p.st === ST.OK) this.knock(p, (this.rnd() - 0.5) * 4, rise * 0.9, (this.rnd() - 0.5) * 4, 1, -1);
        p.airT = 0;
      }
    } else p.grounded = p.y - ground < 0.06;
    // footsteps
    if (p.grounded && moving && p.st === ST.OK) {
      p.stepAcc = (p.stepAcc || 0) + hyp(p.vx, p.vz) * dt;
      const stride = sprint ? 1.6 : 1.15;
      if (p.stepAcc > stride) {
        p.stepAcc = 0;
        if (sprint && !(p.fx.coffee > 0)) this.addNoise(NOISE.sprintStep * (p.scale > 1.2 ? 1.6 : 1), p.x, p.z, p.seat);
        this.ev({ e: 'step', s: p.seat, sp: sprint ? 1 : 0 });
      }
    }
    if (p.grounded && !p.climbing && !sprint) p.stamina = Math.min(PHYS.staminaMax, p.stamina + PHYS.staminaRegen * dt * (p.st === ST.OK ? 1 : 0.5));
    // fell off the bed
    if (p.y < PHYS.fallY) this.fellOff(p);
  }
  isGerald(x, z) {
    const r = this.world.regionAt(x, z);
    return r >= 0 && r !== REGION.bed && r !== REGION.pillow && r !== REGION.blanket;
  }
  fellOff(p) {
    this.dropEverything(p, true);
    p.st = ST.OUT; p.stT = 3;
    this.sfx('yelp', p.x, p.y + 10, p.z);
    const hitter = this.players[p.lastHitBy];
    if (hitter && hitter !== p && this.t - p.lastHitT < 6) {
      hitter.stats.ringouts++;
      this.feed(`🥾 ${hitter.name} knocked ${p.name} off the bed`);
    } else this.feed(`💫 ${p.name} fell off the bed`);
    this.ev({ e: 'out', seat: p.seat });
  }
  actions(p, press, held, carried, dt) {
    // swing: hold to charge (golf meter), release to hit/throw
    if (held & B.SWING) {
      if (p.swingT < 0) { p.swingT = 0; }
      else p.swingT += dt;
    } else if (p.swingT >= 0) {
      const power = swingPower(p.swingT);
      p.swingT = -1;
      this.release(p, Math.max(0.12, power), carried);
    }
    if ((press & B.GRAB) && p.actCd <= 0) {
      p.actCd = 0.2;
      if (carried) this.dropCarry(p, 2.5);
      else if (p.holding >= 0) this.dropHeld(p, 3);
      else this.tryGrab(p);
    }
    if ((press & B.SLAP) && p.slapCd <= 0) { p.slapCd = 0.45; this.slap(p); }
    if ((press & B.DIVE) && p.grounded && p.st === ST.OK) {
      if (carried) this.dropCarry(p, 6);
      if (p.holding >= 0) this.dropHeld(p, 4);
      const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
      p.vx = f[0] * 13; p.vz = f[1] * 13; p.vy = 5.5;
      p.st = ST.RAG; p.stT = 0.85; p.diving = true; p.grounded = false;
      this.sfx('swing_whoosh', p.x, p.y, p.z);
    }
    if (press & B.USE) this.useItem(p);
    // steal from a rival stash: hold interact inside it
    if ((held & B.INTERACT) && !carried && p.holding < 0 && this.mods.raids && this.phase === PH.NIGHT) {
      const s = this.stashes.find(s => hyp(s.x - p.x, s.z - p.z) < STASH_R + 0.6 && s.items.length);
      const mine = this.stashOf(p);
      if (s && s !== mine && !this.stashTeamIs(s, p.team)) {
        p.stealT += dt;
        p.stealFrom = s.seat;
        if (((p.stealT * 4) | 0) !== (((p.stealT - dt) * 4) | 0)) { this.addNoise(NOISE.stealPerSec * 0.25, p.x, p.z, p.seat); this.ev({ e: 'stealing', seat: p.seat, from: s.seat }); s.alert = 1.5; }
        if (p.stealT >= 1.4 / (this.nm.stealMul || 1)) { p.stealT = 0; this.steal(p, s); }
      } else { p.stealT = 0; p.stealFrom = -1; }
    } else { p.stealT = 0; p.stealFrom = -1; }
  }
  stashTeamIs(s, team) {
    if (this.mods.teams === 'ffa') return s.seat === team;
    if (this.mods.teams === 'duos') return s.seat === team;
    return (s.seat === 0 ? 0 : 1) === team;
  }
  tryGrab(p) {
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    let best = null, bd = 9;
    const reach = 1.55 * p.scale;
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const dx = l.x - p.x, dz = l.z - p.z, dy = l.y - (p.y + 0.6);
      const d = hyp(dx, dz);
      if (d > reach + LOOT[l.type].r || Math.abs(dy) > 1.6 * p.scale) continue;
      const front = (dx * f[0] + dz * f[1]) / (d || 1);
      const score = d - front * 0.6;
      if (front > -0.3 && score < bd) { bd = score; best = { l }; }
    }
    for (const q of this.list) {
      if (q === p || q.st === ST.OUT || q.st === ST.SPEC || q.st === ST.HELD || q.st === ST.FLAT) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz);
      if (d > reach * 0.95 || Math.abs(q.y - p.y) > 1.4) continue;
      const front = (dx * f[0] + dz * f[1]) / (d || 1);
      const score = d - front * 0.6 + 0.3;
      if (front > 0 && score < bd) { bd = score; best = { q }; }
    }
    if (!best) return;
    if (best.l) {
      const l = best.l;
      l.st = LS.CARRIED; l.holder = p.seat; l.dirty = true; l.rest = 0;
      p.carry = l.id;
      this.sfx('grab', p.x, p.y, p.z);
      if (l.type === 'duck') this.sfx('boing', p.x, p.y, p.z, { pitch: 1.6 });
    } else {
      const q = best.q;
      if (q.carry) this.dropCarry(q, 2);
      if (q.holding >= 0) this.dropHeld(q, 2);
      q.st = ST.HELD; q.heldBy = p.seat; q.escape = 0;
      p.holding = q.seat;
      this.sfx('grab', p.x, p.y, p.z);
      this.ev({ e: 'grabbed', seat: q.seat, by: p.seat });
    }
  }
  /** let go of carried loot with a little toss forward */
  dropCarry(p, sp = 2.5) {
    const l = this.loot.get(p.carry);
    p.carry = 0;
    if (!l) return;
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    l.st = LS.FREE; l.holder = -1; l.dirty = true; l.rest = 0;
    l.x = p.x + f[0] * 0.6; l.z = p.z + f[1] * 0.6; l.y = p.y + PHYS.carryHeight * p.scale;
    l.vx = p.vx + f[0] * sp; l.vz = p.vz + f[1] * sp; l.vy = 2;
    l.thrower = p.seat; l.from = [p.x, p.z]; l.throwT = this.t;
  }
  dropHeld(p, sp = 3) {
    const q = this.players[p.holding];
    p.holding = -1;
    if (!q) return;
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    q.heldBy = -1;
    q.x = p.x + f[0] * 0.8; q.z = p.z + f[1] * 0.8; q.y = p.y + 1.4;
    this.knock(q, f[0] * sp + p.vx, 3, f[1] * sp + p.vz, 0.8, p.seat);
  }
  /** drop whatever this player has; gone = it vanishes (fell off the bed, dawn) */
  dropEverything(p, gone = false) {
    if (p.carry) {
      const l = this.loot.get(p.carry);
      if (l && gone) { p.carry = 0; this.removeLoot(l); }
      else this.dropCarry(p, 3 + Math.random() * 2);
    }
    if (p.holding >= 0) this.dropHeld(p, 2);
    if (p.st === ST.HELD) { const h = this.players[p.heldBy]; if (h) h.holding = -1; p.heldBy = -1; p.st = ST.OK; }
  }
  release(p, power, carried) {
    const golf = this.nm.golf * (p.fx.driver > 0 ? 2 : 1);
    if (p.fx.driver > 0) { p.fx.driver--; if (!p.fx.driver) delete p.fx.driver; }
    const d = aimDir(p.input.yaw ?? p.yaw, p.input.pitch || 0);
    const sp = throwSpeed(power, golf);
    if (carried) {
      p.carry = 0;
      carried.st = LS.FREE; carried.holder = -1; carried.dirty = true; carried.rest = 0;
      carried.x = p.x + d[0] * 0.5; carried.z = p.z + d[2] * 0.5; carried.y = p.y + PHYS.carryHeight * p.scale;
      const m = 1 / Math.sqrt(1 + LOOT[carried.type].mass * 0.25);
      carried.vx = d[0] * sp * m + p.vx * 0.5; carried.vy = d[1] * sp * m + 1; carried.vz = d[2] * sp * m + p.vz * 0.5;
      carried.thrower = p.seat; carried.from = [p.x, p.z]; carried.throwT = this.t;
      this.sfx('throw', p.x, p.y, p.z, { pitch: 0.8 + power * 0.5 });
      this.addNoise(NOISE.swingMiss * power, p.x, p.z, p.seat);
      return;
    }
    if (p.holding >= 0) {
      const q = this.players[p.holding];
      p.holding = -1;
      if (q) {
        q.heldBy = -1; q.x = p.x + d[0] * 0.6; q.z = p.z + d[2] * 0.6; q.y = p.y + 1.6;
        this.knock(q, d[0] * sp * 0.8, d[1] * sp * 0.8 + 3, d[2] * sp * 0.8, 1.2 + power, p.seat);
        this.sfx('launch', p.x, p.y, p.z);
        this.feed(`🏌️ ${p.name} launched ${q.name}`);
      }
      return;
    }
    // club swing: hit players and loot in front
    this.sfx('swing_whoosh', p.x, p.y, p.z, { pitch: 0.8 + power * 0.4 });
    this.ev({ e: 'swing', seat: p.seat, power: r2(power) });
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    const reach = 2.0 * p.scale;
    let hit = false;
    for (const q of this.list) {
      if (q === p || q.st === ST.OUT || q.st === ST.SPEC || q.st === ST.HELD) continue;
      const dx = q.x - p.x, dz = q.z - p.z, dist = hyp(dx, dz);
      if (dist > reach + 0.4 || Math.abs(q.y - p.y) > 1.6) continue;
      if ((dx * f[0] + dz * f[1]) / (dist || 1) < 0.35) continue;
      hit = true;
      this.dropEverything(q);
      if (q.st === ST.FLAT) { q.stT = 0; q.st = ST.OK; }
      this.knock(q, d[0] * sp * 0.75, Math.max(4, d[1] * sp * 0.75 + 4), d[2] * sp * 0.75, 1.0 + power * 1.4, p.seat);
      this.sfx('club_hit', q.x, q.y, q.z, { pitch: 1.2 - power * 0.4 });
      this.addNoise(NOISE.swingHit * (0.6 + power), q.x, q.z, p.seat);
    }
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const dx = l.x - p.x, dz = l.z - p.z, dist = hyp(dx, dz);
      if (dist > reach + LOOT[l.type].r || Math.abs(l.y - p.y - 0.4) > 1.8) continue;
      if ((dx * f[0] + dz * f[1]) / (dist || 1) < 0.2) continue;
      hit = true;
      this.wake(l);
      const m = 1 / Math.sqrt(1 + LOOT[l.type].mass * 0.25);
      l.vx = d[0] * sp * m; l.vy = d[1] * sp * m + 2; l.vz = d[2] * sp * m;
      l.thrower = p.seat; l.from = [p.x, p.z]; l.throwT = this.t;
      this.sfx('club_hit', l.x, l.y, l.z, { pitch: 1.4 });
      this.addNoise(NOISE.swingHit * 0.5 * (0.5 + power), l.x, l.z, p.seat);
    }
    if (!hit) this.addNoise(NOISE.swingMiss * 0.5, p.x, p.z, p.seat);
  }
  slap(p) {
    const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
    const reach = 1.75 * p.scale;
    this.ev({ e: 'slap', seat: p.seat });
    let hit = false;
    for (const q of this.list) {
      if (q === p || q.st === ST.OUT || q.st === ST.SPEC || q.st === ST.HELD || q.st === ST.FLAT) continue;
      const dx = q.x - p.x, dz = q.z - p.z, dist = hyp(dx, dz);
      if (dist > reach + 0.3 || Math.abs(q.y - p.y) > 1.3) continue;
      if ((dx * f[0] + dz * f[1]) / (dist || 1) < 0.3) continue;
      hit = true;
      const big = p.scale > 1.2 ? 1.6 : 1;
      if (q.fx.wrap > 0 && q.carry) { q.fx.wrap--; this.ev({ e: 'pop', x: r2(q.x), y: r2(q.y + 2), z: r2(q.z), text: 'BUBBLE WRAP!', c: 0x9fdcff }); }
      else { if (q.carry) this.dropCarry(q, 4); }
      if (q.holding >= 0) this.dropHeld(q, 3);
      const noodle = this.mods.noodle;
      if (noodle || q.climbing) this.knock(q, f[0] * 7 * big, 4, f[1] * 7 * big, 0.9, p.seat);
      else { q.vx += f[0] * 7 * big; q.vz += f[1] * 7 * big; q.vy = Math.max(q.vy, 3.5); q.grounded = false; q.lastHitBy = p.seat; q.lastHitT = this.t; }
      this.sfx('slap', q.x, q.y, q.z);
      this.addNoise(NOISE.slap, q.x, q.z, p.seat);
    }
    for (const l of this.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const dx = l.x - p.x, dz = l.z - p.z, dist = hyp(dx, dz);
      if (dist > reach + LOOT[l.type].r || Math.abs(l.y - p.y - 0.4) > 1.5) continue;
      if ((dx * f[0] + dz * f[1]) / (dist || 1) < 0.2) continue;
      this.wake(l); l.vx = f[0] * 7; l.vz = f[1] * 7; l.vy = 4; l.thrower = p.seat; l.from = [p.x, p.z]; l.throwT = this.t;
      hit = true;
    }
    if (!hit) this.sfx('swing_whoosh', p.x, p.y, p.z, { pitch: 1.6, vol: 0.5 });
  }
  /** knock a player into a ragdoll tumble */
  knock(p, vx, vy, vz, t, by) {
    if (p.st === ST.OUT || p.st === ST.SPEC) return;
    if (p.st === ST.HELD) { const h = this.players[p.heldBy]; if (h) h.holding = -1; p.heldBy = -1; }
    if (p.holding >= 0) this.dropHeld(p, 2);
    p.st = ST.RAG; p.stT = this.mods.noodle ? t * 1.6 : t; p.vx = vx; p.vy = vy; p.vz = vz; p.grounded = false; p.diving = false;
    if (by >= 0) { p.lastHitBy = by; p.lastHitT = this.t; }
  }
  stepRagdoll(p, dt, press) {
    const W = this.world;
    const g = PHYS.gravity * (this.nm.gravity || 1);
    p.stT -= dt;
    p.vy -= g * dt;
    const w = this.windAt;
    if (w) { const dx = p.x - w.x, dz = p.z - w.z, d = hyp(dx, dz); if (d < w.r && d > 0.5) { const f = w.f * (1 - d / w.r) / d * dt * 4; p.vx += dx * f; p.vz += dz * f; } }
    if (this.water > 0 && p.y < this.water) { p.vy += (this.water - p.y) * 10 * dt; p.vx *= 1 - dt; p.vz *= 1 - dt; p.vy *= 1 - dt * 2; }
    p.x += p.vx * dt; p.z += p.vz * dt;
    const pos = [p.x, p.y, p.z];
    if (W.pushOut(pos, PHYS.radius, PHYS.height * 0.6, 0.2)) { p.vx *= -0.4; p.vz *= -0.4; p.x = pos[0]; p.z = pos[2]; }
    p.y += p.vy * dt;
    const ground = W.groundAt(p.x, p.z, p.y + 0.5, 0.6);
    if (p.y <= ground) {
      p.y = ground;
      const n = W.normalAt(p.x, p.z);
      const vn = p.vx * n[0] + p.vy * n[1] + p.vz * n[2];
      if (vn < 0) {
        const imp = -vn;
        const e = PHYS.ragdollBounce;
        p.vx -= (1 + e) * vn * n[0]; p.vy -= (1 + e) * vn * n[1]; p.vz -= (1 + e) * vn * n[2];
        p.vx *= 0.82; p.vz *= 0.82;
        if (imp > 7) { this.addNoise(NOISE.ragdollHit * Math.min(2.5, imp / 10), p.x, p.z, p.lastHitBy >= 0 && this.t - p.lastHitT < 3 ? p.lastHitBy : p.seat); this.sfx('land', p.x, p.y, p.z, { pitch: 1.3 }); }
      }
      p.grounded = true;
      // roll downhill a little
      p.vx += n[0] * g * 0.35 * dt; p.vz += n[2] * g * 0.35 * dt;
      p.vx *= 1 - dt * 2.2; p.vz *= 1 - dt * 2.2;
    } else p.grounded = false;
    // a diving goblin tackles whoever it hits
    if (p.diving) {
      for (const q of this.list) {
        if (q === p || q.st !== ST.OK) continue;
        if (hyp(q.x - p.x, q.z - p.z) < 1.0 && Math.abs(q.y - p.y) < 1.2) {
          this.dropEverything(q);
          this.knock(q, p.vx * 0.8, 6, p.vz * 0.8, 1.3, p.seat);
          this.sfx('slap', q.x, q.y, q.z, { pitch: 0.7 });
          this.addNoise(NOISE.slap, q.x, q.z, p.seat);
          p.diving = false;
        }
      }
    }
    if (p.stT <= 0 && p.grounded && hyp(p.vx, p.vy, p.vz) < 4) { p.st = ST.OK; p.diving = false; }
    if (p.stT < -4) { p.st = ST.OK; p.diving = false; }
    if (p.y < PHYS.fallY) this.fellOff(p);
  }
  stepHeld(p, dt, press) {
    const h = this.players[p.heldBy];
    if (!h || h.holding !== p.seat || h.st !== ST.OK) { p.st = ST.OK; p.heldBy = -1; if (h && h.holding === p.seat) h.holding = -1; return; }
    p.x = h.x; p.z = h.z; p.y = h.y + 1.25 * h.scale; p.vx = h.vx; p.vy = h.vy; p.vz = h.vz; p.yaw = h.yaw + Math.PI / 2;
    // mash to escape
    const mash = press & (B.JUMP | B.SLAP | B.GRAB | B.SWING | B.DIVE);
    if (mash) { p.escape += 0.2; this.ev({ e: 'wiggle', seat: p.seat }); }
    p.escape -= dt * 0.12;
    if (p.escape >= 1) {
      h.holding = -1; p.heldBy = -1;
      this.knock(p, Math.sin(h.yaw) * -4, 6, Math.cos(h.yaw) * -4, 0.4, -1);
      this.sfx('boing', p.x, p.y, p.z);
    }
  }
  stepZip(p, dt) {
    p.stT -= dt;
    const [tx, ty, tz] = p.zip;
    const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, d = hyp(dx, dy, dz);
    if (d < 1.4 || p.stT <= 0) { p.st = ST.OK; p.vy = 5; p.vx *= 0.4; p.vz *= 0.4; return; }
    const sp = 26;
    p.vx = dx / d * sp; p.vy = dy / d * sp; p.vz = dz / d * sp;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const g = this.world.groundAt(p.x, p.z, p.y, 0.5);
    if (p.y < g) p.y = g;
  }
  stepChains(dt) {
    const L = 6.5;
    for (const [a, b] of this.chains) {
      const p = this.players[a], q = this.players[b];
      if (!p || !q || p.st === ST.OUT || q.st === ST.OUT || p.st === ST.SPEC || q.st === ST.SPEC) continue;
      if (p.heldBy === q.seat || q.heldBy === p.seat) continue;
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = hyp(dx, dy, dz);
      if (d <= L) continue;
      const ex = (d - L) / d;
      const pw = p.st === ST.HELD ? 0 : q.st === ST.HELD ? 1 : 0.5;
      p.x += dx * ex * pw; p.y += dy * ex * pw * 0.5; p.z += dz * ex * pw;
      q.x -= dx * ex * (1 - pw); q.y -= dy * ex * (1 - pw) * 0.5; q.z -= dz * ex * (1 - pw);
      // take out velocity along the chain
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const rel = (q.vx - p.vx) * ux + (q.vy - p.vy) * uy + (q.vz - p.vz) * uz;
      if (rel > 0) { p.vx += ux * rel * 0.5; p.vy += uy * rel * 0.5; p.vz += uz * rel * 0.5; q.vx -= ux * rel * 0.5; q.vy -= uy * rel * 0.5; q.vz -= uz * rel * 0.5; }
      if (d > L * 2.2) { const k = (d - L * 2.2) / d; q.x -= dx * k; q.z -= dz * k; }
    }
  }
  collidePlayers() {
    const ps = this.list;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.st === ST.OUT || a.st === ST.HELD || a.st === ST.SPEC) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.st === ST.OUT || b.st === ST.HELD || b.st === ST.SPEC) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), m = PHYS.radius * (a.scale + b.scale);
        if (d >= m || d < 1e-4 || Math.abs(a.y - b.y) > PHYS.height) continue;
        const push = (m - d) / d * 0.5;
        a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
      }
    }
  }

  // ---------------------------------------------------------------- loot physics
  wake(l) { l.rest = 0; l.dirty = true; }
  stepLoot(dt) {
    const W = this.world, g = PHYS.gravity * (this.nm.gravity || 1);
    for (const l of this.loot.values()) {
      const def = LOOT[l.type];
      if (l.st === LS.CARRIED) {
        const p = this.players[l.holder];
        if (!p || p.carry !== l.id) { l.st = LS.FREE; l.holder = -1; l.dirty = true; continue; }
        l.x = p.x; l.z = p.z; l.y = p.y + PHYS.carryHeight * p.scale + def.r * 0.6; l.vx = p.vx; l.vy = p.vy; l.vz = p.vz;
        if (l.fragile && !(p.fx.wrapNight) && (p.st === ST.RAG && p.grounded && hyp(p.vx, p.vy, p.vz) > 9)) this.damage(l, 4);
        l.dirty = true;
        continue;
      }
      if (l.st !== LS.FREE) continue;
      // magnets pull loose loot
      for (const p of this.list) {
        if (!(p.fx.magnet > 0)) continue;
        const dx = p.x - l.x, dz = p.z - l.z, d = hyp(dx, dz);
        if (d < 10 && d > 1.2) { this.wake(l); l.vx += dx / d * 16 * dt; l.vz += dz / d * 16 * dt; l.vy += 4 * dt; }
      }
      const gy = W.groundAt(l.x, l.z, l.y, 0.6);
      if (l.rest > 0.4) {
        // asleep: ride the ground (breathing), wake if it moves a lot
        const want = gy + def.r;
        const dy = want - l.y;
        if (Math.abs(dy) > 0.6 || gy < l.y - def.r - 1) this.wake(l);
        else { l.y = want; if (dy > 0.25 * dt * 60) { l.vy = dy / dt; this.wake(l); } continue; }
      }
      const floaty = def.floaty;
      l.vy -= g * dt * (floaty ? 0.08 : 1);
      if (floaty) { l.vx *= 1 - dt * 0.6; l.vz *= 1 - dt * 0.6; l.vy *= 1 - dt * 0.8; l.vy += Math.sin(this.t * 1.3 + l.id) * 0.4 * dt; }
      const w = this.windAt;
      if (w) { const dx = l.x - w.x, dz = l.z - w.z, d = hyp(dx, dz); if (d < w.r && d > 0.5) { const f = w.f * (1 - d / w.r) / d * dt * 4 / Math.max(0.3, def.mass); l.vx += dx * f; l.vz += dz * f; if (Math.abs(w.f) > 2 && floaty) l.vy += 2 * dt; this.wake(l); } }
      if (this.water > 0 && l.y < this.water) { if (def.mass < 2) l.vy += (this.water - l.y) * 12 * dt; l.vx *= 1 - dt; l.vz *= 1 - dt; l.vy *= 1 - dt * 3; }
      l.x += l.vx * dt; l.z += l.vz * dt;
      const pos = [l.x, l.y - def.r, l.z];
      if (W.pushOut(pos, def.r * 0.8, def.r * 2, 0.25)) { l.x = pos[0]; l.z = pos[2]; l.vx *= -0.3; l.vz *= -0.3; }
      l.y += l.vy * dt;
      const ground = W.groundAt(l.x, l.z, l.y - def.r + 0.3, 0.4) + def.r;
      if (l.y <= ground) {
        l.y = ground;
        const n = W.normalAt(l.x, l.z);
        const vn = l.vx * n[0] + l.vy * n[1] + l.vz * n[2];
        if (vn < 0) {
          const imp = -vn;
          const e = def.bouncy ? 0.68 : def.sticky ? 0.05 : PHYS.lootBounce;
          l.vx -= (1 + e) * vn * n[0]; l.vy -= (1 + e) * vn * n[1]; l.vz -= (1 + e) * vn * n[2];
          l.vx *= 0.8; l.vz *= 0.8;
          if (imp > 4) this.ev({ e: 'thud', id: l.id, i: r2(imp) });
          if (imp > 5 && def.mass > 0.6) this.addNoise(def.mass * imp * 0.07, l.x, l.z, l.thrower >= 0 && this.t - (l.throwT || 0) < 4 ? l.thrower : -1);
          if (def.rings && imp > 8) { this.addNoise(NOISE.phoneRing, l.x, l.z, l.thrower); this.sfx('alarm_clock', l.x, l.y, l.z, { pitch: 1.6 }); this.feed('📱 RING RING! The phone went off!'); }
          if (def.squeaky && imp > 3) this.sfx('boing', l.x, l.y, l.z, { pitch: 1.8 });
          if (l.fragile && imp > 9) {
            const holder = this.players[l.thrower];
            if (!(holder && holder.fx.wrapNight)) this.damage(l, imp);
            if (l.st === LS.GONE) continue;
          }
        }
        // rolling downhill (round things roll more)
        l.vx += n[0] * g * 0.5 * dt; l.vz += n[2] * g * 0.5 * dt;
        const fr = def.sticky ? 8 : 2.2;
        l.vx *= Math.max(0, 1 - fr * dt); l.vz *= Math.max(0, 1 - fr * dt);
        if (hyp(l.vx, l.vy, l.vz) < 0.45 && n[1] > 0.8) l.rest += dt; else l.rest = 0;
      } else l.rest = 0;
      // players kick light loot when they run over it
      for (const p of this.list) {
        if (p.st !== ST.OK && p.st !== ST.RAG) continue;
        const dx = l.x - p.x, dz = l.z - p.z, d = hyp(dx, dz);
        const m = PHYS.radius * p.scale + def.r;
        if (d < m && Math.abs(l.y - p.y - 0.5) < 1 && d > 1e-3) {
          const ps = hyp(p.vx, p.vz);
          l.x = p.x + dx / d * m; l.z = p.z + dz / d * m;
          if (ps > 2 && def.mass < 2.5) { l.vx = p.vx * 1.15 + dx / d * 1.5; l.vz = p.vz * 1.15 + dz / d * 1.5; l.vy = Math.max(l.vy, ps * 0.25); l.rest = 0; l.thrower = p.seat; l.from = [p.x, p.z]; l.throwT = this.t; }
        }
      }
      l.dirty = true;
      // into a stash?
      if (this.phase === PH.NIGHT || this.phase === PH.LOBBY) {
        for (const s of this.stashes) {
          if (!this.stashInUse(s)) continue;
          const d = hyp(l.x - s.x, l.z - s.z);
          if (d < STASH_R && l.y < W.heightAt(s.x, s.z) + 3.5) { this.deposit(l, s); break; }
        }
      }
      if (l.st === LS.FREE && l.y < PHYS.fallY) this.removeLoot(l);
    }
  }
  stashInUse(s) {
    if (this.mods.teams === 'ffa') return !!this.players[s.seat];
    if (this.mods.teams === 'duos') return s.seat % 2 === 0 && (this.players[s.seat] || this.players[s.seat + 1]);
    return s.seat <= 1;
  }
  stashOwner(s) {
    if (this.mods.teams === 'ffa') return this.players[s.seat];
    if (this.mods.teams === 'duos') return this.players[s.seat] || this.players[s.seat + 1];
    return this.list.find(p => p.team === s.seat);
  }
  damage(l, imp) {
    const def = LOOT[l.type];
    const before = l.value;
    l.value = Math.max(0, Math.round(l.value - (imp - 6) * l.base * 0.07));
    if (l.value < before) this.ev({ e: 'pop', x: r2(l.x), y: r2(l.y + 1), z: r2(l.z), text: `-$${before - l.value}`, c: 0xff6666 });
    if (l.value < l.base * 0.3) {
      const t = this.players[l.thrower];
      if (t) t.stats.broken++;
      this.addNoise(NOISE.breakFragile, l.x, l.z, l.thrower);
      this.sfx(l.type === 'bubble' || l.type === 'wish' ? 'pop' : 'break_glass', l.x, l.y, l.z);
      this.ev({ e: 'break', x: r2(l.x), y: r2(l.y), z: r2(l.z), ti: l.ti });
      if (l.st === LS.CARRIED) { const p = this.players[l.holder]; if (p) p.carry = 0; }
      this.removeLoot(l);
    }
  }
  deposit(l, s) {
    const lobby = this.phase === PH.LOBBY;
    const depositor = this.players[l.thrower];
    const owner = this.stashOwner(s);
    if (!owner) return;
    const credit = depositor && this.stashTeamIs(s, depositor.team) ? depositor : owner;
    let value = l.value;
    // trick shot: thrown in from far away
    let trick = 0;
    if (l.from && depositor && this.t - (l.throwT || 0) < 6) {
      const d = hyp(l.from[0] - s.x, l.from[1] - s.z);
      if (d > 12) {
        trick = d;
        const bonus = Math.round(value * 0.25 * (this.dream === 'golf' ? 2 : 1));
        value += bonus;
        if (!lobby) depositor.stats.trick = Math.max(depositor.stats.trick, d);
        this.ev({ e: 'trick', seat: depositor.seat, d: Math.round(d), bonus });
        this.sfx('trick_shot', s.x, 2, s.z, { global: 1 });
      }
    }
    l.st = LS.STASH; l.owner = s.seat; l.credit = credit.seat; l.dirty = true; l.vx = l.vy = l.vz = 0;
    l.value = value;
    // sit in the bottle cap pile
    const k = s.items.length;
    const a = k * 2.4, rr = Math.min(1.7, 0.5 + k * 0.12);
    l.x = s.x + Math.cos(a) * rr; l.z = s.z + Math.sin(a) * rr; l.y = this.world.heightAt(s.x, s.z) + 0.5 + Math.floor(k / 9) * 0.6 + LOOT[l.type].r * 0.6;
    s.items.push(l.id);
    if (!lobby) {
      credit.cash += value; credit.tonight += value;
      if (LOOT[l.type].mass > credit.stats.heaviest) credit.stats.heaviest = LOOT[l.type].mass;
    }
    this.ev({ e: 'deposit', seat: credit.seat, stash: s.seat, value, id: l.id, ti: l.ti, trick: trick ? 1 : 0, lobby: lobby ? 1 : 0 });
    if (credit !== depositor && depositor && !lobby) this.feed(`🎁 ${depositor.name} gifted $${value} to ${credit.name}'s stash`);
  }
  steal(p, s) {
    // take the most valuable thing
    let best = null;
    for (const id of s.items) { const l = this.loot.get(id); if (l && (!best || l.value > best.value)) best = l; }
    if (!best) return;
    s.items = s.items.filter(id => id !== best.id);
    const victim = this.players[best.credit];
    if (victim) { victim.cash -= best.value; victim.tonight -= best.value; }
    p.stats.stolen += best.value;
    best.st = LS.CARRIED; best.holder = p.seat; best.owner = -1; best.credit = -1; best.dirty = true;
    best.value = best.base;   // the trick-shot bonus doesn't travel
    p.carry = best.id;
    this.sfx('steal', p.x, p.y, p.z);
    this.ev({ e: 'stolen', seat: p.seat, from: victim ? victim.seat : -1, value: best.value, ti: best.ti });
    this.feed(`🦝 ${p.name} stole a ${LOOT[best.type].name} from ${victim ? victim.name : 'a stash'}`);
  }

  // ---------------------------------------------------------------- props: bananas, traps, clouds, decoys, thrown things
  stepProps(dt) {
    const W = this.world;
    const keep = [];
    for (const o of this.props) {
      o.t -= dt;
      if (o.t <= 0) continue;
      let alive = true;
      if (o.kind === 'banana' || o.kind === 'trap') {
        o.y = W.groundAt(o.x, o.z, o.y + 0.5, 0.6);
        for (const p of this.list) {
          if (p.st !== ST.OK) continue;
          if (o.kind === 'trap' && (p.seat === o.owner || this.sameTeam(p, this.players[o.owner]))) continue;
          if (o.kind === 'banana' && p.seat === o.owner && o.t > 88) continue;
          if (hyp(p.x - o.x, p.z - o.z) < 0.95 && Math.abs(p.y - o.y) < 1) {
            this.dropEverything(p);
            if (o.kind === 'banana') { this.knock(p, Math.sin(p.yaw) * 9, 7, Math.cos(p.yaw) * 9, 1.6, o.owner); this.sfx('banana', p.x, p.y, p.z); this.feed(`🍌 ${p.name} slipped on a banana`); }
            else { this.knock(p, (this.rnd() - 0.5) * 6, 15, (this.rnd() - 0.5) * 6, 2, o.owner); this.sfx('trap_snap', p.x, p.y, p.z); this.feed(`🪤 ${p.name} got snapped`); }
            this.addNoise(NOISE.slap, p.x, p.z, p.seat);
            alive = false; break;
          }
        }
      } else if (o.kind === 'decoy') {
        o.x += o.vx * dt; o.z += o.vz * dt;
        const gy = W.groundAt(o.x, o.z, o.y + 0.5, 0.6);
        if (gy > o.y + 0.6) { o.vx = -o.vx; o.vz = -o.vz; o.yaw += Math.PI; }
        o.y = gy;
        o.noiseT = (o.noiseT || 0) - dt;
        if (o.noiseT <= 0) { o.noiseT = 0.5; this.addNoise(1.1, o.x, o.z, -2); this.sfx('tick', o.x, o.y, o.z); }
        if (!W.onBed(o.x, o.z) && o.y < 0) alive = false;
      } else if (o.kind === 'cloud') {
        for (const p of this.list) {
          if (p.st === ST.OUT) continue;
          if (hyp(p.x - o.x, p.z - o.z) < o.r && Math.abs(p.y - o.y) < 4) {
            p.fx.pepper = 0.4;
            p.sneezeT = (p.sneezeT || 0) - dt;
            if (p.sneezeT <= 0) { p.sneezeT = 0.9 + this.rnd() * 0.5; this.addNoise(2.2, p.x, p.z, p.seat); this.sfx('tiny_sneeze', p.x, p.y, p.z, { pitch: 0.9 + this.rnd() * 0.4 }); if (p.grounded && p.st === ST.OK) p.vy = 3.5; }
          }
        }
      } else if (o.kind === 'proj') {
        o.vy -= PHYS.gravity * (this.nm.gravity || 1) * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        const gy = W.groundAt(o.x, o.z, o.y + 0.3, 0.3);
        let hitP = null;
        if (o.what === 'chain') for (const p of this.list) { if (p.seat !== o.owner && p.st !== ST.OUT && hyp(p.x - o.x, p.z - o.z) < 1.3 && Math.abs(p.y + 0.6 - o.y) < 1.4) hitP = p; }
        if (hitP || o.y <= gy) {
          alive = false;
          const x = o.x, z = o.z, y = Math.max(gy, o.y);
          if (o.what === 'feather') {
            this.sfx('feather', x, y, z);
            this.ev({ e: 'feather', x: r2(x), y: r2(y), z: r2(z) });
            this.pendingScratch = { x, z, t: 1.1 };
          } else if (o.what === 'pepper') {
            this.addProp({ kind: 'cloud', x, y, z, r: 5, t: 8, owner: o.owner });
            this.sfx('pepper', x, y, z);
          } else if (o.what === 'chain') {
            const target = hitP || this.list.filter(p => p.seat !== o.owner && p.st !== ST.OUT).sort((a, b) => hyp(a.x - x, a.z - z) - hyp(b.x - x, b.z - z))[0];
            if (target && hyp(target.x - x, target.z - z) < 4) {
              target.fx.ball = 10;
              this.sfx('chain', target.x, target.y, target.z);
              const by = this.players[o.owner];
              this.feed(`⛓️ ${by ? by.name : 'Someone'} chained ${target.name} to a ball`);
            } else this.sfx('chain', x, y, z);
          }
        }
        if (o.y < PHYS.fallY) alive = false;
      }
      if (alive) keep.push(o);
    }
    this.props = keep;
    if (this.pendingScratch) {
      this.pendingScratch.t -= dt;
      if (this.pendingScratch.t <= 0) {
        const s = this.pendingScratch; this.pendingScratch = null;
        if (this.mods.scratches && this.g.mode === 'sleep') this.handTask('scratch', s.x, s.z, -1);
        else this.twitch(s.x, s.z, 3.5);
      }
    }
  }

  // ---------------------------------------------------------------- Mr. Biscuits, Gerald's cat
  // He hops onto the bed, stalks whichever goblin is moving, wiggles his bum and pounces. Cats chase movement:
  // stand still and he loses interest.
  stepCat(dt) {
    if (this.phase !== PH.NIGHT) { this.cat = null; return; }
    if (!this.cat) {
      if (!this.catVisits) return;
      this.catT -= dt;
      if (this.catT > 0) return;
      this.catVisits--;
      this.catT = 70 + this.rnd() * 40;
      const x = (this.rnd() - 0.5) * 70;
      this.cat = { x, z: 90, y: -30, yaw: Math.PI, state: 'enter', t: 0, life: 38, target: -1, tx: x, tz: 50, sp: 0 };
      this.announce('MR. BISCUITS IS HERE!', 'Cats chase movement. Hold still...', 'warn');
      this.sfx('cat_meow', x, 10, 70, { global: 1 });
      this.feed('🐈 Mr. Biscuits jumped on the bed');
      return;
    }
    const c = this.cat, W = this.world;
    c.t += dt; c.life -= dt;
    const ground = (x, z) => Math.max(W.heightAt(x, z), 0);
    const moveTo = (tx, tz, speed) => {
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { c.sp = 0; return d; }
      const want = Math.atan2(dx, dz);
      let dy = want - c.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, dt * 4);
      const st = Math.min(d, speed * dt);
      c.x += Math.sin(c.yaw) * st; c.z += Math.cos(c.yaw) * st;
      c.sp = speed;
      return d;
    };
    // who is moving? (cats chase movement)
    const pickTarget = () => {
      let best = -1, bs = 0;
      for (const p of this.list) {
        if (p.st === ST.OUT || p.st === ST.SPEC) continue;
        const sp = Math.hypot(p.vx, p.vz);
        if (sp < 2.2) continue;
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d > 50) continue;
        const sc = sp / (d + 8);
        if (sc > bs) { bs = sc; best = p.seat; }
      }
      return best;
    };
    if (c.state === 'enter') {
      c.z -= dt * 22; c.y = Math.min(ground(c.x, c.z), c.y + dt * 60);
      if (c.z < 72) { c.state = 'prowl'; c.t = 0; }
    } else if (c.state === 'prowl') {
      if (c.t > 0.6 || c.target < 0) { c.target = pickTarget(); c.t = 0; }
      const tp = this.players[c.target];
      if (tp && tp.st !== ST.OUT) {
        const d = moveTo(tp.x, tp.z, 8.5);
        if (d < 10) { c.state = 'crouch'; c.t = 0; c.tx = tp.x; c.tz = tp.z; this.sfx('cat_hiss', c.x, c.y + 6, c.z); }
      } else {
        if (Math.hypot(c.tx - c.x, c.tz - c.z) < 2) { c.tx = (this.rnd() - 0.5) * 80; c.tz = -60 + this.rnd() * 125; }
        moveTo(c.tx, c.tz, 4.5);
      }
      if (c.life <= 0) { c.state = 'leave'; c.t = 0; c.tx = c.x < 0 ? -70 : 70; c.tz = c.z; }
    } else if (c.state === 'crouch') {
      // bum wiggle... still tracking the target while it keeps moving
      const tp = this.players[c.target];
      if (tp && Math.hypot(tp.vx, tp.vz) > 1.2) { c.tx = tp.x; c.tz = tp.z; }
      moveTo(c.tx, c.tz, 0);
      c.sp = 0;
      if (c.t > 0.95) { c.state = 'pounce'; c.t = 0; c.fx = c.x; c.fz = c.z; this.sfx('swing_whoosh', c.x, c.y, c.z, { pitch: 0.6 }); }
    } else if (c.state === 'pounce') {
      const k = Math.min(1, c.t / 0.45);
      c.x = c.fx + (c.tx - c.fx) * k; c.z = c.fz + (c.tz - c.fz) * k;
      c.y = ground(c.x, c.z) + Math.sin(k * Math.PI) * 9;
      if (k >= 1) {
        c.state = 'prowl'; c.t = -0.8; c.target = -1;
        this.ev({ e: 'shake', x: r2(c.x), z: r2(c.z), a: 0.7 });
        this.sfx('land_big', c.x, c.y, c.z);
        for (const p of this.list) {
          if (p.st === ST.OUT || p.st === ST.SPEC) continue;
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
          if (d < 4.8 && Math.abs(p.y - c.y) < 6) {
            this.dropEverything(p);
            const ang = Math.atan2(dx, dz) + (this.rnd() - 0.5);
            this.knock(p, Math.sin(ang) * 22, 13, Math.cos(ang) * 22, 2, -1);
            this.sfx('yelp', p.x, p.y, p.z);
            this.feed(`🐈 Mr. Biscuits batted ${p.name} across the bed`);
            this.ev({ e: 'batted', seat: p.seat });
          }
        }
        for (const l of this.loot.values()) if (l.st === LS.FREE && Math.hypot(l.x - c.x, l.z - c.z) < 6) { this.wake(l); l.vx += (l.x - c.x) * 2; l.vz += (l.z - c.z) * 2; l.vy += 6; }
      }
    } else if (c.state === 'leave') {
      moveTo(c.tx, c.tz, 9);
      if (Math.abs(c.x) > 52) { c.y -= dt * 40; if (c.y < -40) { this.cat = null; this.feed('🐈 Mr. Biscuits got bored and left'); return; } }
    }
    if (c.state !== 'pounce' && c.state !== 'enter' && !(c.state === 'leave' && Math.abs(c.x) > 52)) c.y += (ground(c.x, c.z) - c.y) * Math.min(1, dt * 10);
    // his big fluffy body pushes goblins and loot aside as he walks
    if (c.state === 'prowl' || c.state === 'leave') {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      for (const p of this.list) {
        if (p.st === ST.OUT || p.st === ST.HELD) continue;
        // the body is a long oval: check against a couple of points along it
        for (const off of [-5, 0, 5]) {
          const bx = c.x + fx * off, bz = c.z + fz * off;
          const dx = p.x - bx, dz = p.z - bz, d = Math.hypot(dx, dz);
          if (d < 3.6 && d > 0.01 && p.y < c.y + 9) { p.x = bx + dx / d * 3.6; p.z = bz + dz / d * 3.6; }
        }
      }
      for (const l of this.loot.values()) {
        if (l.st !== LS.FREE) continue;
        const d = Math.hypot(l.x - c.x, l.z - c.z);
        if (d < 4.5 && c.sp > 1) { this.wake(l); l.vx += (l.x - c.x) / (d + 0.1) * 6 * dt * 10; l.vz += (l.z - c.z) / (d + 0.1) * 6 * dt * 10; }
      }
    }
  }

  // ---------------------------------------------------------------- network snapshots
  /** full: include every loot item (new guests, and every couple of seconds) */
  snapshot(full = false, withInfo = false) {
    const W = this.world, g = this.g;
    const P = this.list.map(p => [p.seat, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz), r2(p.yaw), p.st, p.carry, (p.grounded ? 1 : 0) | (p.climbing ? 2 : 0) | (p.swingT >= 0 ? 4 : 0) | (p.holding >= 0 ? 8 : 0) | (p.diving ? 16 : 0) | (p.stealT > 0 ? 32 : 0), Math.round(p.stamina), p.emote, p.seq, p.swingT >= 0 ? r2(p.swingT) : -1, r2(p.talk), r2(p.stT), p.heldBy]);
    const L = [];
    for (const l of this.loot.values()) {
      if (!full && !l.dirty) continue;
      L.push([l.id, l.ti, r2(l.x), r2(l.y), r2(l.z), l.value, l.st, l.st === LS.CARRIED ? l.holder : l.owner]);
      l.dirty = false;
    }
    const H = Object.values(g.hands).map(h => [h.state === 'rest' ? 0 : 1, r2(h.x || 0), r2(h.y || 0), r2(h.z || 0), r2(h.yaw || 0), HAND_STATES.indexOf(h.state), r2(h.tx || 0), r2(h.tz || 0)]);
    const s = {
      t: r2(this.t), ph: this.phase, pt: r2(this.phaseT), n: this.night, d: this.dream, nz: r2(g.noise), gm: g.mode, eyes: r2(g.eyes || 0), look: g.look,
      w: [r2(W.breath), r2(W.mouth), r2(W.morph), r2(W.liftL), r2(W.liftR), W.A.name, W.B.name, r2(g.phase || 0)],
      bu: W.bumps.map(b => [r2(b.x), r2(b.z), r2(b.r), r2(b.a)]), H, P, L, full: full ? 1 : 0,
      X: this.props.map(o => [o.id, o.kind === 'proj' ? 'p_' + o.what : o.kind, r2(o.x), r2(o.y), r2(o.z), r2(o.yaw || 0), o.owner, r2(o.t)]),
      wa: r2(this.water), ch: this.chains, cat: this.cat ? [r2(this.cat.x), r2(this.cat.y), r2(this.cat.z), r2(this.cat.yaw), CAT_STATES.indexOf(this.cat.state), r2(this.cat.t), r2(this.cat.sp || 0)] : null, ls: g.lullaby > 0 ? 1 : 0,
      st: this.stashes.map(s => s.alert > 0 ? 1 : 0),
    };
    for (const st of this.stashes) if (st.alert > 0) st.alert -= 0.05;
    if (withInfo || full) s.I = this.info();
    return s;
  }
  /** slower-changing info: names, cash, items */
  info() {
    return {
      mods: this.mods, nights: this.mods.nights, dream: this.dream,
      nm: { gravity: this.nm.gravity, slippery: this.nm.slippery, speed: this.nm.speed, stamina: this.nm.stamina, golf: this.nm.golf, size: this.nm.size, chained: this.nm.chained, lootValue: this.nm.lootValue },
      players: this.list.map(p => ({ seat: p.seat, pid: p.pid, name: p.name, bot: p.bot, cos: p.cos, color: p.color, team: p.team, cash: p.cash, tonight: p.tonight, inv: p.inv, fx: compactFx(p.fx), fxNext: p.fxNext || {}, stats: p.stats, totals: p.totals, ready: !!p.shopReady, scale: p.scale, away: !!p.away })),
      awards: this.awardsTonight, final: this.final,
    };
  }
}
const HAND_STATES = ['rest', 'lift', 'aim', 'slam', 'down', 'scratch', 'flick', 'return'];
export const CAT_STATES = ['enter', 'prowl', 'crouch', 'pounce', 'leave'];
export { HAND_STATES };
function newHand(side) { return { side, state: 'rest', t: 0, x: 0, y: 0, z: 0, yaw: 0 }; }
function newStats() { return { noise: 0, stolen: 0, pancakes: 0, ringouts: 0, broken: 0, trick: 0, heaviest: 0 }; }
function compactFx(fx) { const o = {}; for (const [k, v] of Object.entries(fx)) o[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v; return o; }
