// Start-up and the glue between menus, rooms and the game.
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Voice } from './voice.js';
import { input } from './input.js';
import * as audio from './audio.js';
import { profile, save, saveNow, exportProfile, importProfile } from './profile.js';
import * as F from './friends.js';
import { hostRoom, joinRoom, cleanCode } from './net.js';
import { World, SPOTS } from '../shared/world.js';
import { PH } from '../shared/sim.js';
import { MOD_DEFAULTS, DREAM_DEFAULT_POOL, SEAT_COLORS } from '../shared/data.js';
import { colorHex } from './cosmetics.js';
import { BUILD, versionLabel, fetchLatest, isNewer, alreadyTried, reloadTo, stripVersionParam } from './update.js';

/** keep ?room=CODE in the address (so a reload or a shared link comes back), leaving other parameters alone */
function setRoomParam(code) {
  const q = new URLSearchParams(location.search);
  if (code) q.set('room', code); else q.delete('room');
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
}

class App {
  constructor() {
    this.canvas = document.getElementById('c');
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(document.getElementById('hud'));
    this.voice = new Voice();
    this.ui = new UI(this);
    this.game = null;
    input.init(this.canvas);
    input.blocking = () => this.ui.blocking();
    this.menuWorld = new World('back');
    this.renderer.setWorld(this.menuWorld);
    this.menuT = 0;
    this.preview = null;
    this.menuLoop = this.menuLoop.bind(this);
    requestAnimationFrame(this.menuLoop);
    // the first click/key anywhere starts the sound
    const start = () => { audio.initAudio(); this.applySettings(); };
    window.addEventListener('pointerdown', start, { once: false });
    window.addEventListener('keydown', start, { once: false });
    window.addEventListener('beforeunload', () => saveNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.checkUpdate(); });
  }
  versionLabel() { return versionLabel(); }
  async boot() {
    stripVersionParam();
    const p = profile();
    this.applySettings();
    F.setBusyCheck(() => !!(this.game && this.game.sim.list.length >= 8 && !this.game.sim.list.some(q => q.bot)));
    F.setStatusFn(() => {
      const g = this.game;
      if (!g || !g.code) return { what: g ? 'practising' : 'in the menus' };
      const open = g.sim.list.length < 8 || g.sim.list.some(q => q.bot);
      return { room: open ? g.code : '', what: g.sim.phase === PH.LOBBY ? 'in the lobby' : `night ${g.sim.night} of ${g.sim.mods.nights}` };
    });
    // make sure our 4-number friend code is ours, then become reachable
    F.myFriendCode();
    F.claimCode().catch(() => { }).finally(() => F.initFriends());
    document.getElementById('loading').remove();
    const room = cleanCode(new URLSearchParams(location.search).get('room'));
    if (!p.name) { this.ui.show('name'); this.pendingRoom = room.length === 4 ? room : ''; return; }
    this.ui.show('main');
    if (room.length === 4) this.join(room);
    this.checkUpdate();
  }
  applySettings() {
    const s = profile().settings;
    audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music });
    input.sens = s.sens; input.padSens = s.padSens; input.invertY = !!s.invertY;
    this.renderer.setQuality(s.quality);
    if (this.game) this.game.cam.fov = s.fov;
    this.fov = s.fov;
    if (!s.voice) this.voice.disableMic();
  }
  // ---------------------------------------------------------------- the menu backdrop: Gerald asleep, camera drifting
  menuScene(screen) { this.menuScreen = screen; if (screen !== 'wardrobe' && this.preview) this.preview = null; if (screen === 'wardrobe') this.previewCos(profile().cos); }
  previewCos(cos) {
    const p = profile();
    this.preview = { seat: 99, x: 20, y: 0, z: -64, vx: 0, vy: 0, vz: 0, yaw: Math.PI * 0.15, st: 0, flags: 1, swingT: -1, emote: this.previewAnim || 0, talk: 0, carry: 0, scale: 1, name: p.name, color: colorHex(cos.color), cos: { ...cos } };
  }
  previewEmote(anim) { this.previewAnim = anim; if (this.preview) this.preview.emote = anim; clearTimeout(this._peT); this._peT = setTimeout(() => { this.previewAnim = 0; if (this.preview) this.preview.emote = 0; }, 2600); }
  menuLoop(ts) {
    requestAnimationFrame(this.menuLoop);
    if (this.game) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this._lastMenu || now)) / 1000);
    this._lastMenu = now;
    this.menuT += dt;
    input.poll(dt);
    const W = this.menuWorld;
    const ph = (this.menuT / 4.8) % 1;
    W.breath = Math.sin(ph * Math.PI * 2) * 1.1;
    W.mouth = ph > 0.55 && ph < 0.98 ? Math.sin((ph - 0.55) / 0.43 * Math.PI) * 0.9 : 0;
    let cam;
    const players = [];
    if (this.menuScreen === 'wardrobe' && this.preview) {
      const pv = this.preview;
      pv.y = W.heightAt(pv.x, pv.z);
      pv.yaw = 0.3 + Math.sin(this.menuT * 0.6) * 0.45;
      players.push(pv);
      cam = { yaw: Math.PI + 0.35, pitch: 0.18, dist: 4.4, fov: 50, tx: pv.x - 1.1, ty: pv.y + 0.9, tz: pv.z };
    } else {
      const a = this.menuT * 0.05;
      cam = this.camOverride || { yaw: Math.PI + Math.sin(a) * 0.4, pitch: 0.62 + Math.sin(a * 1.3) * 0.06, dist: 40, fov: 55, tx: 0, ty: 26, tz: -54 };
    }
    audio.setSnore(0.35, ph);
    this.renderer.render({ world: W, players, loot: new Map(), props: [], hands: [], stashes: [], chains: [], water: 0, eyes: 0, mode: 'sleep', dream: 'none', me: 99, cam, spots: [] }, dt);
  }
  // ---------------------------------------------------------------- rooms
  me() {
    const p = profile();
    return { pid: p.pid, name: p.name, cos: { ...p.cos }, color: colorHex(p.cos.color), code: F.myFriendCode() };
  }
  startGame(opts) {
    if (this.game) this.game.destroy();
    this.ui.hideMenu();
    this.hud.show(true);
    this.preview = null;
    const p = profile();
    this.game = new Game({ ...opts, renderer: this.renderer, hud: this.hud, ui: this.ui, me: this.me(), mods: p.lastMods ? { ...MOD_DEFAULTS, ...p.lastMods } : MOD_DEFAULTS, dreamPool: p.lastPool || DREAM_DEFAULT_POOL, voice: opts.net ? this.voice : null });
    this.game.cam.fov = this.fov;
    this.renderer.setWorld(this.game.sim.world);
    this.ui.lobbyOpen = true;
    this.ui.showLobby();
    return this.game;
  }
  practice() {
    audio.initAudio();
    this.startGame({ role: 'practice' });
  }
  async host() {
    audio.initAudio();
    const close = this.ui.modal('<h2>Making a room...</h2><p class="dim">Connecting to the matchmaking service.</p>');
    try {
      const { transport, code } = await hostRoom();
      close();
      const g = this.startGame({ role: 'host', net: transport, code });
      this.voice.setPeer(transport.peer);
      if (transport.peer) g.voiceIds[0] = transport.peer.id;
      this.setupVoice(g);
      setRoomParam(code);
      F.beReachable();
    } catch (e) {
      close();
      console.error(e);
      this.ui.modal(`<h2>Couldn't make a room</h2><p>${String(e && e.message || e).replace(/[<>]/g, '')}</p><p class="dim">You can still practise against bots.</p><button class="go" onclick="this.closest('.modal').remove()">OK</button>`);
    }
  }
  async join(code) {
    audio.initAudio();
    code = cleanCode(code);
    if (!profile().name) { this.pendingRoom = code; this.ui.show('name'); return; }
    if (this.game && this.game.code === code) return;
    if (this.game) this.leave(true);
    const close = this.ui.modal(`<h2>Joining room ${code}...</h2><p class="dim">Knocking on the bedroom door.</p>`);
    try {
      const t = await joinRoom(code, profile().pid);
      close();
      const g = this.startGame({ role: 'guest', net: t, code });
      this.voice.setPeer(t.peer || null);
      const me = this.me();
      t.send({ t: 'hello', pid: me.pid, name: me.name, cos: me.cos, color: me.color, code: me.code, vid: t.peer && t.peer.open ? t.peer.id : null });
      this.setupVoice(g);
      setRoomParam(code);
      F.beReachable();
    } catch (e) {
      close();
      this.ui.modal(`<h2>Couldn't join ${code}</h2><p>${String(e && e.message || e).replace(/[<>]/g, '')}</p><p class="dim">Check the code with your friend. Rooms close when the host leaves.</p><button class="go" onclick="this.closest('.modal').remove()">OK</button>`);
      if (!this.game) this.ui.show('main');
    }
  }
  async setupVoice(g) {
    if (!profile().settings.voice) return;
    const ok = await this.voice.enableMic();
    if (!ok) { this.ui.toast(`🎙️ ${this.voice.failed || 'No mic'}: voice chat is off (you can still hear others)`); }
    const roster = g.isHost ? g.rosterInfo() : (g.lobby?.roster || []);
    this.voice.sync(roster, g.seat);
    if (!g.isHost && this.voice.myId) g.net.send({ t: 'vid', vid: this.voice.myId });
  }
  leave(quiet) {
    const g = this.game;
    if (!g) return;
    try { if (g.net && !g.isHost) g.net.send({ t: 'bye' }); } catch { }
    g.destroy();
    this.game = null;
    this.voice.stop();
    this.hud.show(false);
    this.ui.closeOverlays();
    this.ui.over = null;
    this.renderer.setWorld(this.menuWorld);
    setRoomParam('');
    audio.startMusic('menu');
    this.ui.show('main');
  }
  startMatch() {
    const g = this.game;
    if (!g || !g.isHost) return;
    this.ui.closeOverlays();
    g.startMatch();
    this.lockIfPlaying();
  }
  backToLobby() { const g = this.game; if (g && g.isHost) { g.backToLobby(); this.ui.closeOverlays(); this.ui.showLobby(); g.onEvent({ e: 'lobby' }); } }
  buy(id) {
    const g = this.game;
    if (!g) return;
    if (g.isHost) { const r = g.sim.buy(g.seat, id); if (!r.ok) { this.ui.toast(r.msg); audio.sfx('denied'); } this.ui.refreshShop(); }
    else g.net.send({ t: 'buy', id });
  }
  shopReady(v) { const g = this.game; if (!g) return; if (g.isHost) g.sim.shopReady(g.seat, v); else g.net.send({ t: 'shopReady', v }); }
  cosChanged() {
    const g = this.game, me = this.me();
    if (!g) return;
    if (g.isHost) { const p = g.sim.players[g.seat]; if (p && g.sim.phase === PH.LOBBY) { p.cos = me.cos; p.color = me.color; g.sendLobby(); } }
    else g.net.send({ t: 'cos', cos: me.cos, name: me.name });
  }
  unlock() { input.unlock(); }
  lockIfPlaying() { if (this.game && !this.ui.blocking()) input.lock(); }
  // ---------------------------------------------------------------- moving your save to another computer
  async moveLink() {
    const { Link, BROKERS } = await import('./relay.js');
    for (const b of BROKERS) { const l = new Link(b, () => { }, () => { }); try { await l.connect(6000); return l; } catch { l.close(); } }
    throw new Error("Couldn't reach the message servers");
  }
  async makeMoveCode() {
    try {
      const l = await this.moveLink();
      const pin = String(1000 + Math.floor(Math.random() * 9000));
      const topic = `jjgames/dontwakegerald-v1/move/${F.myFriendCode()}/${pin}`;
      l.publish(topic, JSON.stringify({ at: Date.now(), save: exportProfile() }), true);
      setTimeout(() => { l.publish(topic, '', true); l.close(); }, 10 * 60 * 1000);
      this.ui.modal(`<h2>Move your save</h2><p>On the other computer, open Settings → <b>Use a move code</b> and type:</p><div class="movecodes"><div>Friend code<b>${F.myFriendCode()}</b></div><div>Move code<b>${pin}</b></div></div><p class="dim">Works for 10 minutes while this page stays open.</p><button class="go" onclick="this.closest('.modal').remove()">Done</button>`);
    } catch (e) { this.ui.toast(e.message); }
  }
  useMoveCode() {
    this.ui.modal(`<h2>Use a move code</h2><p>Type the two codes shown on your other computer.</p><div class="addrow"><input id="mf" inputmode="numeric" maxlength="4" placeholder="Friend code"><input id="mp" inputmode="numeric" maxlength="4" placeholder="Move code"></div><button class="go" id="mgo">Move my save here</button><p class="dim">This replaces the save in this browser.</p>`, (m, close) => {
      m.querySelector('#mgo').onclick = async () => {
        const fc = cleanCode(m.querySelector('#mf').value), pin = cleanCode(m.querySelector('#mp').value);
        if (fc.length !== 4 || pin.length !== 4) { this.ui.toast('Both codes have 4 numbers'); return; }
        try {
          const l = await this.moveLink();
          const topic = `jjgames/dontwakegerald-v1/move/${fc}/${pin}`;
          const text = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("No save found for those codes")), 5000); l.onMessage = (_, tp, txt) => { if (tp === topic && txt) { clearTimeout(t); res(txt); } }; l.subscribe(topic).catch(rej); });
          l.publish(topic, '', true); l.close();
          importProfile(JSON.parse(text).save);
          close();
          this.ui.toast('Save moved! Reloading...');
          setTimeout(() => location.reload(), 900);
        } catch (e) { this.ui.toast(e.message); }
      };
    });
  }
  // ---------------------------------------------------------------- updates
  async checkUpdate() {
    const l = await fetchLatest();
    if (!isNewer(l) || alreadyTried(l)) return;
    if (!this.game) reloadTo(l);
    else this.ui.toast('A new version is out: it loads next time you leave a room.');
  }
}

const app = new App();
window.dwg = app;
app.boot().catch(e => { console.error(e); const l = document.getElementById('loading'); if (l) l.textContent = 'Something went wrong starting the game: ' + e.message; });
// after naming yourself, go to the room you were invited to
const origShow = app.ui.show.bind(app.ui);
app.ui.show = (name, isBack) => { origShow(name, isBack); if (name === 'main' && app.pendingRoom) { const r = app.pendingRoom; app.pendingRoom = ''; app.join(r); } };
