// One room session: the host (or a practice game) runs the Sim; guests predict their own goblin and draw the rest
// from snapshots. Turns input into actions, events into sounds/effects/HUD, and builds the renderer's view.
import { Sim, B, ST, LS, PH, swingPower, aimDir } from '../shared/sim.js';
import { botThink } from '../shared/bots.js';
import { LOOT, LOOT_IDS, ITEMS, DREAMS, GAME, PHYS, clockLabel, BOT_NAMES, MOD_DEFAULTS, REGIONS, SEAT_COLORS } from '../shared/data.js';
import { SEATS, STASH_R, SPOTS } from '../shared/world.js';
import { input, glyph } from './input.js';
import * as audio from './audio.js';
import { EMOTES } from './cosmetics.js';

const DT = 1 / GAME.tick;
const SNAP_EVERY = Math.round(GAME.tick / GAME.snapRate);   // host steps between snapshots
const INTERP = 0.1;                                          // guests draw others this far in the past (s)

// a timer that keeps ticking when the tab is in the background (the host must keep the game running)
function makeTicker(fn) {
  try {
    const src = 'let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn; w.postMessage(8);
    return () => w.terminate();
  } catch { const id = setInterval(fn, 8); return () => clearInterval(id); }
}

export class Game {
  /**
   * role: 'practice' | 'host' | 'guest'
   * net: transport (host/guest) with send(data, to?) and on('message')
   * me: { pid, name, cos, color, code }
   */
  constructor({ role, net = null, renderer, hud, ui, me, mods, dreamPool, code = null, voice = null, roster = null }) {
    this.role = role; this.net = net; this.renderer = renderer; this.hud = hud; this.ui = ui; this.me = me; this.voice = voice;
    this.code = code;
    this.isHost = role !== 'guest';
    this.cam = { yaw: Math.PI / 2, pitch: 0.38, dist: 6.5, fov: 70 };
    this.seat = 0;
    this.seq = 0;
    this.sendBuf = [];
    this.pending = [];       // guest: inputs not yet acknowledged
    this.snaps = [];         // guest: snapshot buffer
    this.lootView = new Map();
    this.info = null;
    this.selSlot = 0;
    this.emoteWheel = null;
    this.alive = true;
    this.lastClock = '';
    this.voiceIds = {};
    this.sim = new Sim({ seed: (Math.random() * 1e9) | 0, mods: mods || {}, dreamPool, roster: [] });
    this.sim.botInput = botThink;
    if (this.isHost) {
      const p = this.sim.addPlayer({ seat: 0, pid: me.pid, name: me.name, cos: me.cos, color: me.color });
      p.code = me.code;
      this.seat = 0;
      this.peers = new Map();   // transport slot -> seat
    } else {
      this.guestPred = null;
      this.seat = -1;          // until the host welcomes us
      this.sim.clearLoot(); this.sim.loot.clear();
    }
    renderer.setWorld(this.sim.world);
    this.acc = 0;
    this.stepN = 0;
    this.last = performance.now();
    this.stopTicker = this.isHost ? makeTicker(() => this.hostTick()) : null;
    if (net) this.wireNet();
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
    input.inGame = true;
    audio.startMusic('menu');
  }
  destroy() {
    this.alive = false;
    if (this.stopTicker) this.stopTicker();
    input.inGame = false; input.unlock();
    try { this.net && this.net.close(); } catch { }
    this.renderer.setArc(false);
  }
  get my() { return this.isHost ? this.sim.players[this.seat] : this.guestPred; }

  // ================================================================ host
  hostTick() {
    if (!this.alive) return;
    const now = performance.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.acc -= DT; n++;
      if (this.localInput) this.sim.setInput(this.seat, this.localInput), this.localInput.p = 0;
      this.sim.step(DT);
      this.stepN++;
      const evs = this.sim.takeEvents();
      this.hostEvents = (this.hostEvents || []).concat(evs);
      if (this.net && this.stepN % SNAP_EVERY === 0) this.broadcast();
      if (!this.net) { for (const e of this.hostEvents) this.onEvent(e); this.hostEvents = []; }
    }
  }
  broadcast() {
    const full = this.stepN % (SNAP_EVERY * 40) === 0;
    const s = this.sim.snapshot(full, this.stepN % (SNAP_EVERY * 5) === 0);
    s.E = this.hostEvents;
    for (const e of this.hostEvents) this.onEvent(e);
    this.hostEvents = [];
    this.net.send({ t: 's', s });
  }
  sendFull(slot) { const s = this.sim.snapshot(true, true); s.E = []; this.net.send({ t: 's', s }, slot); }
  rosterInfo() {
    return this.sim.list.map(p => ({ seat: p.seat, pid: p.pid, name: p.name, bot: p.bot, color: p.color, cos: p.cos, code: p.code || '', vid: this.voiceIds[p.seat] || null, host: p.seat === this.seat, ready: !!p.lobbyReady }));
  }
  sendLobby() {
    if (!this.net) return;
    const roster = this.rosterInfo();
    this.net.send({ t: 'lobby', roster, mods: this.sim.mods, pool: this.sim.dreamPool, code: this.code });
    if (this.voice) this.voice.sync(roster, this.seat);
  }
  wireNet() {
    const net = this.net;
    net.on('message', (m, from) => this.isHost ? this.hostMsg(m, from) : this.guestMsg(m));
    net.on('peer-join', slot => { if (this.isHost) this.ui.toast('Someone is joining...'); });
    net.on('peer-leave', slot => {
      if (!this.isHost) { if (this.alive) this.ui.hostLeft(); return; }
      const seat = this.peers.get(slot);
      this.peers.delete(slot);
      if (seat === undefined) return;
      const p = this.sim.players[seat];
      if (!p) return;
      this.ui.toast(`${p.name} left`);
      audio.sfx('leave');
      if (this.sim.phase === PH.LOBBY) this.sim.removePlayer(seat);
      else { p.origPid = p.pid; this.sim.botify(seat, p.name + ' 🤖'); }
      delete this.voiceIds[seat];
      this.sendLobby();
      this.ui.refreshLobby();
    });
  }
  hostMsg(m, slot) {
    if (!m || typeof m !== 'object') return;
    const seat = this.peers.get(slot);
    const p = seat !== undefined ? this.sim.players[seat] : null;
    switch (m.t) {
      case 'hello': {
        const name = String(m.name || 'Goblin').replace(/[<>]/g, '').slice(0, 16);
        // the same player coming back takes their old seat
        let target = this.sim.list.find(q => q.pid === m.pid || q.origPid === m.pid);
        if (target && !target.bot && [...this.peers.values()].includes(target.seat)) target = null;
        if (target) this.sim.humanize(target.seat, { pid: m.pid, name, cos: m.cos, color: m.color });
        else if (this.sim.phase !== PH.LOBBY) {
          // mid-game: take over a bot's seat (cash and all), or a free seat
          const bot = this.sim.list.find(q => q.bot);
          if (bot) { this.sim.humanize(bot.seat, { pid: m.pid, name, cos: m.cos, color: m.color }); target = bot; }
        }
        if (!target) {
          if (this.sim.list.length >= GAME.maxPlayers) { this.net.send({ t: 'full' }, slot); return; }
          const free = SEATS.findIndex((_, i) => !this.sim.players[i]);
          target = this.sim.addPlayer({ seat: free, pid: m.pid, name, cos: m.cos, color: this.pickColor(m.color) });
          if (this.sim.phase !== PH.LOBBY) target.cash = Math.min(...this.sim.list.map(q => q.cash));
        }
        target.code = String(m.code || '').replace(/\D/g, '').slice(0, 4);
        this.peers.set(slot, target.seat);
        if (m.vid) this.voiceIds[target.seat] = m.vid;
        this.net.send({ t: 'welcome', seat: target.seat, code: this.code }, slot);
        this.sendFull(slot);
        this.sendLobby();
        this.ui.toast(`${name} joined!`);
        audio.sfx('join');
        this.ui.refreshLobby();
        this.ui.notePlayer(target.code, name);
        break;
      }
      case 'in': if (p && Array.isArray(m.l)) this.sim.queueInput(p.seat, m.l.map(unpackInput)); break;
      case 'cos': if (p && this.sim.phase === PH.LOBBY) { p.cos = m.cos || {}; if (m.name) p.name = String(m.name).slice(0, 16); this.sendLobby(); this.ui.refreshLobby(); } break;
      case 'ready': if (p) { p.lobbyReady = !!m.v; this.sendLobby(); this.ui.refreshLobby(); } break;
      case 'buy': if (p) { const r = this.sim.buy(p.seat, m.id); this.net.send({ t: 'buyR', ...r, id: m.id }, slot); } break;
      case 'shopReady': if (p) this.sim.shopReady(p.seat, !!m.v); break;
      case 'vid': if (p) { this.voiceIds[p.seat] = m.vid; this.sendLobby(); } break;
      case 'bye': break;
    }
  }
  pickColor(want) {
    const used = new Set(this.sim.list.map(p => p.color));
    if (want != null && !used.has(want)) return want;
    return SEAT_COLORS.find(c => !used.has(c)) ?? SEAT_COLORS[0];
  }
  // host controls
  setMods(mods, pool) { this.sim.setMods(mods); if (pool) this.sim.dreamPool = pool; this.sendLobby(); }
  addBotsForMatch() {
    const want = Math.max(this.sim.list.length, this.sim.mods.bots);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let s = 0; s < SEATS.length && this.sim.list.length < want; s++) {
      if (this.sim.players[s]) continue;
      this.sim.addPlayer({ seat: s, name: names.pop(), bot: true, skill: this.sim.mods.botSkill, cos: botCos(), color: this.pickColor() });
    }
  }
  startMatch() {
    if (!this.isHost) return;
    for (const p of this.sim.list) if (p.bot) this.sim.removePlayer(p.seat);
    this.addBotsForMatch();
    this.sim.startMatch();
    this.sendLobby();
  }
  backToLobby() {
    if (!this.isHost) return;
    this.sim.enterLobby();
    for (const p of this.sim.list) if (p.bot) this.sim.removePlayer(p.seat);
    this.sendLobby();
  }
  kick(seat) {
    for (const [slot, s] of this.peers) if (s === seat) { this.net.send({ t: 'kick' }, slot); this.peers.delete(slot); }
    this.sim.removePlayer(seat);
    this.sendLobby();
  }

  // ================================================================ guest
  guestMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': this.seat = m.seat; this.code = m.code; this.guestPred = null; this.pending = []; this.snapCam = true; break;
      case 'lobby': this.lobby = m; this.sim.mods = { ...MOD_DEFAULTS, ...m.mods }; this.sim.dreamPool = m.pool; this.ui.refreshLobby(); if (this.voice) this.voice.sync(m.roster, this.seat); for (const r of m.roster) if (r.seat !== this.seat) this.ui.notePlayer(r.code, r.name); break;
      case 's': if (this.seat >= 0) this.onSnap(m.s); break;
      case 'buyR': if (!m.ok) { this.ui.toast(m.msg); audio.sfx('denied'); } else audio.sfx('buy'); this.ui.refreshShop(); break;
      case 'full': this.ui.toast('That room is full (8 players)'); this.ui.leaveGame(); break;
      case 'kick': this.ui.toast('The host removed you from the room'); this.ui.leaveGame(); break;
    }
  }
  onSnap(s) {
    const now = performance.now() / 1000;
    s.recv = now;
    if (!this.snaps.length || s.t >= this.snaps[this.snaps.length - 1].t) this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
    if (s.I) this.applyInfo(s.I);
    // loot
    if (s.full) { const ids = new Set(s.L.map(l => l[0])); for (const id of this.lootView.keys()) if (!ids.has(id)) this.lootView.delete(id); }
    for (const a of s.L) {
      const [id, ti, x, y, z, value, st, holder] = a;
      if (st === LS.GONE) { this.lootView.delete(id); continue; }
      let l = this.lootView.get(id);
      if (!l) { l = { id, type: LOOT_IDS[ti], x, y, z, vx: 0, vz: 0, tx: x, ty: y, tz: z }; this.lootView.set(id, l); }
      l.vx = (x - l.tx) * 20; l.vz = (z - l.tz) * 20;
      l.tx = x; l.ty = y; l.tz = z; l.value = value; l.st = st; l.holder = holder;
    }
    // the world
    const sim = this.sim, W = sim.world;
    sim.phase = s.ph; sim.phaseT = s.pt; sim.night = s.n; sim.dream = s.d; sim.water = s.wa; sim.chains = s.ch;
    const [br, mo, mor, lL, lR, pa, pb, gph] = s.w;
    if (W.A.name !== pa) W.A = W.pose(pa);
    if (W.B.name !== pb) W.B = W.pose(pb);
    this.wt = { br, mo, mor, lL, lR };
    W.bumps = s.bu.map(([x, z, r, a]) => ({ x, z, r, a }));
    sim.g.noise = s.nz; sim.g.mode = s.gm; sim.g.eyes = s.eyes; sim.g.look = s.look; sim.g.lullaby = s.ls ? 1 : 0; sim.g.phase = gph;
    this.handsView = s.H;
    this.catView = s.cat;
    this.propsView = s.X;
    this.stashAlert = s.st;
    // events
    for (const e of s.E || []) { this.onEvent(e); if (e.e === 'loot-') this.lootView.delete(e.id); }
    // my goblin: rewind to the host's state and replay my unacknowledged inputs
    const mine = s.P.find(a => a[0] === this.seat);
    if (mine) this.reconcile(mine);
  }
  applyInfo(I) {
    this.info = I;
    const sim = this.sim;
    sim.mods = { ...MOD_DEFAULTS, ...I.mods };
    if (I.nm) sim._nm = { ...sim.mods, ...I.nm };
    sim.dream = I.dream || sim.dream;
    // keep the roster in the shadow sim (names, colours, cash, items)
    for (const r of I.players) {
      let p = sim.players[r.seat];
      if (!p) p = sim.addPlayer({ seat: r.seat, pid: r.pid, name: r.name, bot: r.bot, cos: r.cos, color: r.color });
      Object.assign(p, { name: r.name, bot: r.bot, cos: r.cos, color: r.color, team: r.team, cash: r.cash, tonight: r.tonight, inv: r.inv, stats: r.stats, totals: r.totals, shopReady: r.ready, scale: r.scale, pid: r.pid, fxInfo: r.fx, fxNext: r.fxNext });
      if (r.seat === this.seat && this.guestPred) { this.guestPred.inv = r.inv; this.guestPred.fx = { ...r.fx }; this.guestPred.scale = r.scale; this.guestPred.cash = r.cash; }
    }
    for (const p of sim.list) if (!I.players.some(r => r.seat === p.seat)) sim.players[p.seat] = null;
    if (I.final) sim.final = I.final;
    if (I.awards) sim.awardsTonight = I.awards;
    // the shop shows cash and pockets: redraw it when they change
    const mine = I.players.find(r => r.seat === this.seat);
    const key = mine ? mine.cash + '|' + mine.inv.join() + '|' + JSON.stringify(mine.fxNext || {}) + '|' + I.players.map(r => r.cash).join() : '';
    if (key !== this._shopKey) { this._shopKey = key; this.ui.refreshShop(); }
  }
  reconcile(a) {
    const sim = this.sim;
    const [seat, x, y, z, vx, vy, vz, yaw, st, carry, flags, stam, emote, ack, swingT, talk, stT, heldBy] = a;
    let p = this.guestPred;
    if (p && p.seat !== seat) p = null;
    if (!p) {
      p = sim.players[seat] || sim.addPlayer({ seat, pid: this.me.pid, name: this.me.name, cos: this.me.cos });
      this.guestPred = p;
    }
    const before = [p.x, p.y, p.z];
    Object.assign(p, { x, y, z, vx, vy, vz, st, carry, stamina: stam, grounded: !!(flags & 1), climbing: !!(flags & 2), stT, heldBy, swingT: swingT >= 0 ? swingT : -1, holding: flags & 8 ? (p.holding >= 0 ? p.holding : 99) : -1 });
    if (st !== ST.OK) p.yaw = yaw;
    // replay what the host hasn't seen yet
    this.pending = this.pending.filter(i => i.seq > ack);
    const saved = sim.events.length;
    for (const inp of this.pending) this.predictStep(p, inp);
    sim.events.length = saved;
    // smooth out the correction instead of popping
    const ex = before[0] - p.x, ey = before[1] - p.y, ez = before[2] - p.z;
    const err = Math.hypot(ex, ey, ez);
    if (err < 4) { this.smooth = this.smooth || [0, 0, 0]; this.smooth[0] += ex; this.smooth[1] += ey; this.smooth[2] += ez; }
    else this.smooth = [0, 0, 0];
  }
  /** run my goblin's movement locally (same code as the host) */
  predictStep(p, inp) {
    const sim = this.sim;
    p.input = { ...inp };
    // only movement is predicted; the host decides grabs, hits and items
    const saveCarry = p.carry, saveInv = p.inv;
    p.input.p = inp.p & (B.JUMP | B.DIVE);
    p.input.b = inp.b & (B.JUMP | B.SPRINT | B.SWING);
    const frozen = sim.phase === PH.INTRO || sim.phase === PH.DAWN || sim.phase === PH.RESULTS || sim.phase === PH.SHOP || sim.phase === PH.FINAL;
    sim.stepPlayer(p, DT * (sim.nm.speed || 1), frozen);
    p.carry = saveCarry; p.inv = saveInv;
    if (p.st === ST.OUT) p.stT = 9;   // the host decides when we respawn
  }

  // ================================================================ every frame
  renderLoop(ts) {
    if (!this.alive) return;
    requestAnimationFrame(this.renderLoop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.frame(dt);
  }
  frame(dt) {
    const sim = this.sim;
    const frameIn = input.poll(dt);
    const menuOpen = this.ui.blocking();
    input.menuOpen = menuOpen;
    // camera
    if (!menuOpen) {
      this.cam.yaw -= frameIn.look[0];
      this.cam.pitch = Math.max(-0.45, Math.min(1.2, this.cam.pitch + frameIn.look[1]));
    }
    const my = this.my;
    // build my input
    const inp = this.buildInput(frameIn, dt, menuOpen, my);
    if (this.isHost) this.localInput = mergeInput(this.localInput, inp);
    else this.guestTick(inp, dt);
    // voice: how loud am I right now
    if (this.voice) { inp.v = this.voice.level(); if (this.isHost && this.localInput) this.localInput.v = inp.v; }
    // view
    const view = this.isHost ? this.hostView() : this.guestView(dt);
    view.me = this.seat;
    const me = view.players.find(p => p.seat === this.seat);
    this.updateCam(view, me, dt);
    view.cam = this.camView;
    // the aiming arc while charging a throw
    const charging = me && (me.flags & 4) && my && (my.carry || (my.inv && ITEMS[my.inv[this.selSlot]]?.kind === 'throw' && false));
    if (charging) {
      const l = this.isHost ? sim.loot.get(my.carry) : this.lootView.get(my.carry);
      const mass = l ? LOOT[l.type].mass : 1;
      this.renderer.gravity = sim.nm.gravity || 1;
      this.renderer.setArc(true, me, inp.yaw, inp.pitch, Math.max(0.12, swingPower(Math.max(0, my.swingT))), (sim.nm.golf || 1) * (my.fx && my.fx.driver ? 2 : 1), mass);
    } else this.renderer.setArc(false);
    view.target = this.aimTarget(me, view);
    this.renderer.render(view, dt);
    // audio beds
    const g = sim.g;
    audio.setSnore(sim.phase === PH.NIGHT || sim.phase === PH.LOBBY || sim.phase === PH.INTRO ? (g.mode === 'sleep' ? 0.42 : 0.15) * this.snoreVol(me) : 0, g.phase || 0);
    audio.setIntensity(sim.phase === PH.NIGHT ? g.noise / 100 : 0);
    // clock on the nightstand
    if (sim.phase === PH.NIGHT || sim.phase === PH.DAWN) {
      const frac = sim.phase === PH.DAWN ? 1 : 1 - sim.phaseT / sim.mods.nightLen;
      const label = clockLabel(Math.max(0, Math.min(1, frac)));
      if (label !== this.lastClock || sim.phase === PH.DAWN) { this.lastClock = label; const [tm, ap] = label.split(' '); this.renderer.drawClock(tm, ap, sim.phase === PH.DAWN); }
    }
    // voice proximity
    if (this.voice) this.voice.update(view, this.camView, sim, !!frameIn.held.ptt);
    this.hud.update(this, view, me, frameIn, dt);
  }
  snoreVol(me) { if (!me) return 0.6; const d = Math.hypot(me.x - SPOTS.mouth.x, me.y - SPOTS.mouth.y, me.z - SPOTS.mouth.z); return Math.max(0.25, Math.min(1, 1.6 - d / 60)); }
  buildInput(fi, dt, menuOpen, my) {
    const camYaw = this.cam.yaw;
    const f = [Math.sin(camYaw), Math.cos(camYaw)], r = [-Math.cos(camYaw), Math.sin(camYaw)];
    let [sx, sy] = menuOpen ? [0, 0] : fi.move;
    const mag = Math.min(1, Math.hypot(sx, sy));
    const n = Math.hypot(sx, sy) || 1;
    sx = sx / n * mag; sy = sy / n * mag;
    const mx = f[0] * sy + r[0] * sx, mz = f[1] * sy + r[1] * sx;
    let b = 0, p = 0;
    if (!menuOpen && !this.emoteWheel) {
      const H = fi.held, P = fi.pressed;
      if (H.jump) b |= B.JUMP; if (P.jump) p |= B.JUMP;
      if (H.sprint) b |= B.SPRINT;
      if (H.grab) b |= B.GRAB; if (P.grab) p |= B.GRAB;
      if (H.swing) b |= B.SWING;
      if (H.slap) b |= B.SLAP; if (P.slap) p |= B.SLAP;
      if (P.dive) p |= B.DIVE;
      if (P.use) p |= B.USE;
      if (H.interact) b |= B.INTERACT;
      // items
      if (P.item1) this.selSlot = 0; if (P.item2) this.selSlot = 1; if (P.item3) this.selSlot = 2;
      if (fi.wheel) this.selSlot = (this.selSlot + Math.sign(fi.wheel) + 3) % 3;
    }
    // emote wheel: hold to open, aim, release to play
    let em = 0;
    if (!menuOpen) {
      if (fi.held.emote && !this.emoteWheel) this.emoteWheel = { sel: -1, ax: 0, ay: 0 };
      if (this.emoteWheel) {
        const w = this.emoteWheel;
        if (fi.device === 'pad' && fi.stick) { if (Math.hypot(...fi.stick) > 0.5) { w.ax = fi.stick[0]; w.ay = fi.stick[1]; } }
        else { w.ax += fi.look[0] * 40; w.ay += fi.look[1] * 40; const m = Math.hypot(w.ax, w.ay); if (m > 1) { w.ax /= m; w.ay /= m; } }
        if (Math.hypot(w.ax, w.ay) > 0.4) w.sel = ((Math.round(Math.atan2(w.ax, -w.ay) / (Math.PI / 4)) % 8) + 8) % 8;
        if (!fi.held.emote) {
          const list = this.ui.equippedEmotes();
          if (w.sel >= 0 && list[w.sel]) { em = EMOTES.findIndex(e => e.id === list[w.sel]) + 1; p |= B.EMOTE; audio.sfx('emote'); }
          this.emoteWheel = null;
        }
        // keep the camera still while choosing
        this.cam.yaw += fi.look[0];
      }
    }
    const pitch = Math.max(-0.6, Math.min(1.0, -this.cam.pitch + 0.42));
    return { mx, mz, yaw: camYaw, pitch, b, p, sl: this.selSlot, v: 0, em };
  }
  guestTick(inp, dt) {
    // fixed 60 Hz steps, each with its own sequence number (the host plays them back one per step)
    this.gacc = (this.gacc || 0) + dt;
    let presses = inp.p;
    while (this.gacc >= DT) {
      this.gacc -= DT;
      const i = { ...inp, p: presses, seq: ++this.seq };
      presses = 0;
      this.pending.push(i);
      this.sendBuf.push(i);
      if (this.guestPred) {
        const saved = this.sim.events.length;
        this.predictStep(this.guestPred, i);
        // my own predicted footsteps and jumps play right away
        for (const e of this.sim.events.slice(saved)) if (e.e === 'sfx' && (e.n === 'jump' || e.n === 'land' || e.n === 'land_big')) this.onEvent(e);
        this.sim.events.length = saved;
      }
      if (this.sendBuf.length >= 2) this.flushInputs();
    }
    if (presses) this.carryPress = (this.carryPress || 0) | presses;
    if (this.carryPress && this.sendBuf.length) { this.sendBuf[this.sendBuf.length - 1].p |= this.carryPress; this.carryPress = 0; }
    if (this.pending.length > 240) this.pending.splice(0, this.pending.length - 240);
  }
  flushInputs() {
    if (!this.net || !this.sendBuf.length) return;
    this.net.send({ t: 'in', l: this.sendBuf.map(packInput) });
    this.sendBuf = [];
  }

  // ================================================================ views for the renderer
  baseView() {
    const sim = this.sim;
    return {
      world: sim.world, dream: sim.dream, water: sim.water, chains: sim.chains, phase: sim.phase,
      mode: sim.g.mode, eyes: sim.g.eyes || 0, look: sim.g.look, wind: sim.windAt ? Math.min(1, Math.abs(sim.windAt.f) / 6) : 0,
    };
  }
  playerView(p) {
    const em = typeof p.emote === 'string' ? p.emote : p.emote ? (EMOTES[p.emote - 1] || {}).anim : 0;
    return {
      seat: p.seat, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, yaw: p.yaw, st: p.st,
      flags: (p.grounded ? 1 : 0) | (p.climbing ? 2 : 0) | (p.swingT >= 0 ? 4 : 0) | (p.holding >= 0 ? 8 : 0),
      swingT: p.swingT, emote: em, talk: p.talk || 0, carry: p.carry, scale: p.scale || 1, name: p.name, color: this.sim.teamColor(p), cos: p.cos,
      fx: p.fxInfo || p.fx, scared: this.sim.g.mode === 'awake' || this.sim.g.mode === 'waking',
    };
  }
  stashView() {
    const sim = this.sim;
    return sim.stashes.map((s, i) => {
      if (!sim.stashInUse(s)) return null;
      const owner = sim.stashOwner(s);
      if (!owner) return null;
      let value = 0;
      if (this.isHost) for (const id of s.items) value += sim.loot.get(id)?.value || 0;
      else for (const l of this.lootView.values()) if (l.st === LS.STASH && l.holder === i) value += l.value;
      const name = sim.mods.teams === 'two' ? (owner.team === 0 ? 'Team Left' : 'Team Right') : owner.name;
      return { seat: i, name, color: sim.teamColor(owner), value, alert: this.isHost ? s.alert > 0 : this.stashAlert && this.stashAlert[i] };
    });
  }
  hostView() {
    const sim = this.sim;
    const v = this.baseView();
    v.players = sim.list.map(p => this.playerView(p));
    v.loot = sim.loot;
    v.props = sim.props;
    v.hands = Object.values(sim.g.hands).map(h => ({ active: h.state !== 'rest', x: h.x, y: h.y, z: h.z, yaw: h.yaw, state: ['rest', 'lift', 'aim', 'slam', 'down', 'scratch', 'flick', 'return'].indexOf(h.state), tx: h.tx, tz: h.tz }));
    v.stashes = this.stashView();
    v.spots = this.spots(v.hands);
    v.cat = sim.cat ? { x: sim.cat.x, y: sim.cat.y, z: sim.cat.z, yaw: sim.cat.yaw, state: sim.cat.state, t: sim.cat.t, sp: sim.cat.sp } : null;
    return v;
  }
  spots(hands) {
    const out = [];
    for (const h of hands) if (h.active && (h.state === 1 || h.state === 2 || h.state === 3 || h.state === 5)) {
      const ground = this.sim.world.heightAt(h.x, h.z);
      const k = Math.max(0, Math.min(1, 1 - (h.y - ground) / 30));
      out.push({ x: h.x, z: h.z, r: 5.5, a: 0.25 + k * 0.7 });
    }
    if (this.sim.pendingScratch) out.push({ x: this.sim.pendingScratch.x, z: this.sim.pendingScratch.z, r: 4, a: -0.7 });
    return out;
  }
  guestView(dt) {
    const sim = this.sim, W = sim.world;
    const v = this.baseView();
    const now = performance.now() / 1000;
    const snaps = this.snaps;
    // world shape: ease toward the latest numbers
    if (this.wt) {
      const k = Math.min(1, dt * 12);
      W.breath += (this.wt.br - W.breath) * k; W.mouth += (this.wt.mo - W.mouth) * k;
      W.morph += (this.wt.mor - W.morph) * Math.min(1, dt * 20); W.liftL += (this.wt.lL - W.liftL) * k; W.liftR += (this.wt.lR - W.liftR) * k;
    }
    // others: interpolate between the two snapshots around (now - INTERP)
    let players = [];
    if (snaps.length) {
      const last = snaps[snaps.length - 1];
      const rt = last.t + (now - last.recv) - INTERP;
      let a = snaps[0], b = snaps[0];
      for (let i = 0; i < snaps.length - 1; i++) if (snaps[i].t <= rt && snaps[i + 1].t >= rt) { a = snaps[i]; b = snaps[i + 1]; break; }
      if (rt > last.t) a = b = last;
      const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
      for (const pb of b.P) {
        const seat = pb[0];
        const p = sim.players[seat];
        if (!p) continue;
        if (seat === this.seat) continue;
        const pa = a.P.find(x => x[0] === seat) || pb;
        const lerp = i => pa[i] + (pb[i] - pa[i]) * k;
        let dy = pb[7] - pa[7]; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        Object.assign(p, { x: lerp(1), y: lerp(2), z: lerp(3), vx: pb[4], vy: pb[5], vz: pb[6], yaw: pa[7] + dy * k, st: pb[8], carry: pb[9], grounded: !!(pb[10] & 1), climbing: !!(pb[10] & 2), swingT: pb[14], holding: pb[10] & 8 ? 1 : -1, stamina: pb[11], emote: pb[12], talk: pb[15] });
        players.push(this.playerView(p));
      }
      // hands
      v.hands = (this.handsView || []).map(h => ({ active: !!h[0], x: h[1], y: h[2], z: h[3], yaw: h[4], state: h[5], tx: h[6], tz: h[7] }));
    } else v.hands = [];
    // me (predicted, with the correction smoothed out)
    const me = this.guestPred;
    if (me) {
      const s = this.smooth || [0, 0, 0];
      const decay = Math.exp(-dt * 12);
      s[0] *= decay; s[1] *= decay; s[2] *= decay;
      const pv = this.playerView(me);
      pv.x += s[0]; pv.y += s[1]; pv.z += s[2];
      const last = snaps[snaps.length - 1];
      const mine = last && last.P.find(x => x[0] === this.seat);
      if (mine) { pv.emote = mine[12] ? (EMOTES[mine[12] - 1] || {}).anim : 0; pv.talk = this.voice ? this.voice.level() : 0; }
      players.push(pv);
    }
    v.players = players;
    // loot: smooth toward the latest positions; carried loot rides on its carrier
    for (const l of this.lootView.values()) {
      if (l.st === LS.CARRIED) {
        const c = players.find(p => p.seat === l.holder);
        if (c) { l.x = c.x; l.y = c.y + PHYS.carryHeight * (c.scale || 1) + LOOT[l.type].r * 0.6; l.z = c.z; continue; }
      }
      const k = Math.min(1, dt * 14);
      l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k; l.z += (l.tz - l.z) * k;
    }
    v.loot = this.lootView;
    v.props = (this.propsView || []).map(([id, kind, x, y, z, yaw]) => ({ id, kind, x, y, z, yaw }));
    v.stashes = this.stashView();
    v.spots = this.spots(v.hands);
    if (this.catView) {
      const [x, y, z, yaw, st, t, sp] = this.catView;
      const c = this.catSmooth || (this.catSmooth = { x, y, z, yaw });
      const k = Math.min(1, dt * 12);
      c.x += (x - c.x) * k; c.y += (y - c.y) * k; c.z += (z - c.z) * k;
      let dy = yaw - c.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; c.yaw += dy * k;
      v.cat = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, state: ['enter', 'prowl', 'crouch', 'pounce', 'leave'][st], t, sp };
    } else { v.cat = null; this.catSmooth = null; }
    return v;
  }
  aimTarget(me, view) {
    if (!me || me.carry || me.st !== ST.OK) return 0;
    const f = [Math.sin(me.yaw), Math.cos(me.yaw)];
    let best = 0, bd = 9;
    for (const l of view.loot.values()) {
      if (l.st !== LS.FREE) continue;
      const dx = l.x - me.x, dz = l.z - me.z, d = Math.hypot(dx, dz);
      if (d > 1.55 * (me.scale || 1) + LOOT[l.type].r || Math.abs(l.y - me.y - 0.6) > 1.6) continue;
      const front = (dx * f[0] + dz * f[1]) / (d || 1);
      if (front > -0.3 && d - front * 0.6 < bd) { bd = d - front * 0.6; best = l.id; }
    }
    return best;
  }
  updateCam(view, me, dt) {
    const sim = this.sim;
    const c = this.cam;
    let tx, ty, tz, dist = c.dist, fov = 70, yaw = c.yaw, pitch = c.pitch, snap = false;
    if (sim.phase === PH.FINAL) {
      this.finalSpin = (this.finalSpin || 0) + dt * 0.25;
      const n = SPOTS.noseTip;
      tx = n.x; ty = n.y; tz = n.z + 2; dist = 26; yaw = Math.PI + Math.sin(this.finalSpin) * 0.9; pitch = 0.5;
    } else if (me && me.st !== ST.OUT) {
      tx = me.x; ty = me.y + 1.5 * (me.scale || 1); tz = me.z;
      if (me.flags & 4) { dist = c.dist * 0.75; fov = 62; }
      this.lastMe = [tx, ty, tz];
    } else if (this.lastMe) { [tx, ty, tz] = this.lastMe; ty += 2; dist = c.dist + 6; }
    else { tx = 0; ty = 10; tz = 0; }
    if (this.snapCam) { snap = true; this.snapCam = false; }
    this.camView = { yaw, pitch, dist, fov, tx, ty, tz, snap };
  }

  // ================================================================ events -> sound, effects, HUD
  onEvent(e) {
    const R = this.renderer, sim = this.sim;
    const mine = s => s === this.seat;
    const pl = s => sim.players[s];
    const color = s => { const p = pl(s); return p ? sim.teamColor(p) : 0xffffff; };
    switch (e.e) {
      case 'sfx': this.sound(e.n, e.x, e.y, e.z, e); break;
      case 'noise': R.ripple(e.x, e.z, e.s >= 0 ? color(e.s) : 0xffffff, e.a); break;
      case 'say': this.hud.subtitle(e.text, e.kind); audio.mumble(e.text, { vol: e.kind === 'wake' ? 1 : 0.8 }); if (e.kind === 'wake') audio.duckMusic(0.6); break;
      case 'ann': this.hud.announce(e.text, e.sub, e.kind); audio.duckMusic(0.5); if (e.kind === 'freeze') { audio.sfx('freeze'); audio.startMusic('awake'); input.rumble(1, 400); } if (e.kind === 'calm') audio.startMusic('night'); if (e.kind === 'warn') input.rumble(0.4, 200); break;
      case 'feed': this.hud.feed(e.text); break;
      case 'pop': R.popup(e.x, e.y, e.z, e.text, '#' + (e.c || 0xffffff).toString(16).padStart(6, '0')); break;
      case 'shake': { const me = this.my; const d = me ? Math.hypot(me.x - e.x, me.z - e.z) : 30; R.shake(e.a * Math.max(0.15, 1 - d / 60)); if (d < 25) input.rumble(0.8 * e.a, 250); break; }
      case 'trick': {
        const p = pl(e.seat), s = sim.stashOf(p || { seat: e.seat, team: e.seat });
        R.popup(s.x, 6, s.z, `⛳ TRICK SHOT ${e.d}m +$${e.bonus}`, '#7dffb0', true);
        R.emit(s.x, 3, s.z, 60, { colors: [0xff4d6d, 0x3fb7ff, 0x7bd94c, 0xffc233, 0xb06bff], speed: 9, up: 8, grav: 12, life: 1.6, size: 0.4 });
        if (mine(e.seat)) this.hud.flash(`TRICK SHOT! +$${e.bonus}`, 'good');
        else if (p) this.hud.feed(`⛳ ${p.name} sank a ${e.d}m trick shot`);
        break;
      }
      case 'deposit': {
        const s = sim.stashes[e.stash];
        audio.sfx(e.value >= 150 ? 'cash' : 'deposit', { vol: mine(e.seat) ? 0.9 : 0.35 * this.distVol(s.x, 0, s.z), pitch: 0.8 + Math.min(0.6, e.value / 400) });
        R.popup(s.x, 4, s.z, `+$${e.value}`, e.value >= 150 ? '#ffd84a' : '#ffffff', e.value >= 150);
        R.emit(s.x, 2, s.z, 18, { color: LOOT[LOOT_IDS[e.ti]]?.color || 0xffd84a, speed: 5, up: 5, grav: 10, life: 0.9 });
        if (mine(e.seat) && !e.lobby) this.hud.banked(e.value);
        break;
      }
      case 'break': R.emit(e.x, e.y, e.z, 30, { color: LOOT[LOOT_IDS[e.ti]]?.color || 0xffffff, speed: 6, up: 3, grav: 14, life: 0.8, size: 0.25 }); break;
      case 'stolen': {
        const thief = pl(e.seat);
        if (mine(e.from)) { this.hud.flash(`🦝 ${thief ? thief.name : 'Someone'} robbed your stash! -$${e.value}`, 'bad'); input.rumble(0.6, 300); }
        if (mine(e.seat)) this.hud.flash(`🦝 Stole $${e.value}! Run!`, 'good');
        break;
      }
      case 'stealing': if (sim.stashes[e.from] && this.isMyStash(e.from) && (this.lastStealWarn || 0) < performance.now() - 2500) { this.lastStealWarn = performance.now(); this.hud.flash(`⚠️ ${pl(e.seat)?.name || 'Someone'} is robbing your stash!`, 'bad'); audio.sfx('stash_alarm'); } break;
      case 'night': {
        this.ui.closeOverlays();
        this.hud.nightIntro(e);
        audio.sfx('night_start');
        audio.startMusic('night');
        this.snapCam = true;
        if (this.isHost) {}
        break;
      }
      case 'results': this.ui.showResults(e); audio.startMusic('results'); break;
      case 'shop': this.ui.showShop(); audio.startMusic('shop'); break;
      case 'final': this.ui.showFinal(e); audio.startMusic('results'); break;
      case 'lobby': this.ui.closeOverlays(); this.ui.showLobby(); audio.startMusic('menu'); break;
      case 'warn': if (e.target === this.seat) { this.hud.flash('✋ THE HAND IS COMING FOR YOU! RUN!', 'bad'); input.rumble(0.7, 300); } break;
      case 'caught': if (mine(e.seat)) this.hud.flash('😱 HE SAW YOU MOVE!', 'bad'); break;
      case 'waker': if (mine(e.seat)) this.hud.flash(`⏰ You woke him up! Fined $${e.fine}`, 'bad'); break;
      case 'sneeze': { const n = SPOTS.noseTip, s = e.s || 1; R.emit(n.x, n.y, n.z + 3, Math.round(160 * s), { colors: [0xffffff, 0xcfe6ff, 0xfff4b0, 0xffc2e6], speed: 26 * Math.sqrt(s), up: 4, grav: 2, drag: 1.2, life: 1.6, size: 0.5 }); break; }
      case 'boop': { const n = SPOTS.noseTip; R.emit(n.x, n.y + 1, n.z, 24, { colors: [0xffc2e6, 0xffffff, 0xfff4b0], speed: 4, up: 3, grav: 2, life: 1, size: 0.4 }); R.popup(n.x, n.y + 3, n.z, 'boop!', '#ffc2e6', true); if (mine(e.seat)) input.rumble(0.3, 120); break; }
      case 'roll': R.shake(0.9); break;
      case 'out': if (mine(e.seat)) this.hud.flash('💫 You fell off the bed!', 'bad'); break;
      case 'swing': { const g = R.goblins.get(e.seat); if (g) g.play('swing'); break; }
      case 'slap': { const g = R.goblins.get(e.seat); if (g) g.play('slap'); break; }
      case 'grabbed': if (mine(e.seat)) { this.hud.flash(`🙌 Grabbed! Mash ${glyph('jump')} to wiggle free!`, 'bad'); input.rumble(0.5, 200); } break;
      case 'deny': if (mine(e.seat)) { this.hud.flash(e.msg, 'bad'); audio.sfx('denied'); } break;
      case 'buy': if (mine(e.seat)) { audio.sfx('buy'); this.ui.refreshShop(); } break;
      case 'bubble': break;
      case 'feather': R.emit(e.x, e.y + 1, e.z, 20, { color: 0xffffff, speed: 3, up: 2, grav: 1, life: 1.2 }); break;
      case 'floss': R.emit(e.x, e.y, e.z, 12, { color: 0xffffff, speed: 2, life: 0.5 }); break;
      case 'use': if (mine(e.seat)) this.hud.itemUsed(e.id); break;
      case 'step': { const p = pl(e.s); if (p && (mine(e.s) || this.distVol(p.x, p.y, p.z) > 0.2)) this.sound(e.sp ? 'step' : 'step_soft', p.x, p.y, p.z, { vol: e.sp ? 0.6 : 0.3 }); if (p && e.sp) R.emit(p.x, p.y + 0.1, p.z, 3, { color: 0xc8c8d8, speed: 1.2, up: 0.5, grav: 1, life: 0.5, size: 0.3, flat: true }); break; }
      case 'thud': break;
      case 'flicked': R.shake(0.4); break;
      case 'batted': if (mine(e.seat)) { this.hud.flash('🐈 BATTED BY MR. BISCUITS!', 'bad'); input.rumble(0.7, 300); } break;
      case 'loot+': case 'loot-': break;
    }
  }
  isMyStash(i) { const p = this.sim.players[this.seat]; return p && this.sim.stashOf(p).seat === i; }
  distVol(x, y, z) {
    const c = this.renderer.camera.position;
    const d = Math.hypot(c.x - x, c.y - y, c.z - z);
    return 1 / (1 + (d * d) / 260);
  }
  sound(name, x, y, z, e = {}) {
    if (e.global) { audio.sfx(name, { vol: e.vol ?? 1, pitch: e.pitch ?? 1 }); return; }
    const cam = this.renderer.camera;
    const dx = x - cam.position.x, dz = z - cam.position.z;
    const yaw = this.cam.yaw;
    const right = [-Math.cos(yaw), Math.sin(yaw)];
    const d = Math.hypot(dx, dz) || 1;
    const pan = Math.max(-0.8, Math.min(0.8, (dx * right[0] + dz * right[1]) / d)) * Math.min(1, d / 6);
    const vol = (e.vol ?? 1) * this.distVol(x, y, z);
    if (vol < 0.02) return;
    audio.sfx(name, { vol, pan, pitch: e.pitch ?? 1 });
  }
}

// inputs travel as small arrays
function packInput(i) { return [i.seq, Math.round(i.mx * 100) / 100, Math.round(i.mz * 100) / 100, Math.round(i.yaw * 1000) / 1000, Math.round(i.pitch * 100) / 100, i.b, i.p, i.sl, Math.round((i.v || 0) * 100) / 100, i.em || 0]; }
function unpackInput(a) { return { seq: a[0], mx: +a[1] || 0, mz: +a[2] || 0, yaw: +a[3] || 0, pitch: +a[4] || 0, b: a[5] | 0, p: a[6] | 0, sl: a[7] | 0, v: Math.max(0, Math.min(1, +a[8] || 0)), em: a[9] | 0 }; }
function mergeInput(prev, cur) { if (!prev) return cur; return { ...cur, p: (prev.p || 0) | cur.p }; }
function botCos() {
  const hats = ['none', 'thimble', 'bottle_cap', 'acorn_cup', 'teabag', 'paperclip_antenna', 'coat_button', 'popcorn', 'sock_hood', 'jellybean', 'pom_pom', 'birthday_candle', 'teacup', 'rubber_duck', 'lampshade', 'snail_shell'];
  return { hat: hats[(Math.random() * hats.length) | 0], eyes: ['normal', 'sleepy', 'angry', 'googly', 'tiny', 'spiral'][(Math.random() * 6) | 0] };
}
