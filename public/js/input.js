// Keyboard + mouse and controllers, merged into one set of actions. Also drives menu navigation with a controller.
//
// In-game actions:   move (WASD / left stick), look (mouse / right stick)
//   jump    Space / A        sprint  Shift / LT        grab/drop  Left click / RB
//   swing   Right click (hold) / RT (hold)            slap  E / X        dive  C or Ctrl / B
//   use item Q / LB          rob stash (hold)  F / Y   items  1-3, mouse wheel / D-pad left-right
//   emotes  T (hold) / D-pad up (hold)                 push-to-talk  V / D-pad down
//   scores  Tab / View       menu  Esc / Start
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const KEYS = {
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], slap: ['KeyE'], dive: ['KeyC', 'ControlLeft'], use: ['KeyQ'], interact: ['KeyF'],
  emote: ['KeyT'], ptt: ['KeyV'], scores: ['Tab'], pause: ['Escape'], item1: ['Digit1'], item2: ['Digit2'], item3: ['Digit3'],
};

class InputSys {
  constructor() {
    this.down = new Set();         // keyboard codes held
    this.pressedK = new Set();     // keyboard codes pressed since last poll
    this.mouse = { dx: 0, dy: 0, l: false, r: false, lp: false, rp: false, wheel: 0, x: 0, y: 0 };
    this.padPrev = [];
    this.device = 'kb';            // 'kb' | 'pad': which to show prompts for
    this.sens = 1; this.padSens = 1; this.invertY = false;
    this.locked = false;
    this.handlers = {};
    this.navRepeat = { dir: null, t: 0 };
    this.inGame = false;
    this.typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };
  }
  on(ev, fn) { (this.handlers[ev] ||= new Set()).add(fn); return () => this.handlers[ev].delete(fn); }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (this.typing() && e.code !== 'Escape' && e.code !== 'Enter') return;
      this.device = 'kb';
      if (this.inGame && ['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedK.add(e.code);
      this.down.add(e.code);
      if (!this.inGame) {
        const nav = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.code];
        if (nav && !this.typing()) { e.preventDefault(); this.emit('nav', nav); }
        if (e.code === 'Escape') this.emit('back');
      } else if (e.code === 'Escape') this.emit('pause');
    });
    window.addEventListener('keyup', e => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousedown', e => {
      this.device = 'kb';
      // a menu is open: clicks belong to it, not the game
      if (this.inGame && this.blocking && this.blocking()) return;
      // first click captures the mouse for looking around (if the browser allows it; otherwise clicks still play)
      if (this.inGame && !this.locked && !this.noLock) {
        this.lock();
        setTimeout(() => { if (!this.locked) this.noLock = true; }, 400);
        return;
      }
      if (e.button === 0) { this.mouse.l = true; this.mouse.lp = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rp = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      // without pointer lock (some embedded browsers), drag with a button held to look around
      if (this.locked || (this.noLock && this.inGame && (e.buttons & 1 || e.buttons & 2) && !(this.blocking && this.blocking()))) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    window.addEventListener('wheel', e => { if (this.inGame) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.emit('lock', this.locked);
    });
    window.addEventListener('gamepadconnected', e => { this.device = 'pad'; this.emit('pad', true, e.gamepad.id); });
    window.addEventListener('gamepaddisconnected', () => this.emit('pad', false));
  }
  lock() {
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => { }); } catch { } };
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  key(name) { return KEYS[name].some(c => this.down.has(c)); }
  keyPressed(name) { return KEYS[name].some(c => this.pressedK.has(c)); }

  /** read everything once per frame. Returns the frame's actions. */
  poll(dt) {
    const out = {
      move: [0, 0], look: [0, 0], held: {}, pressed: {},
    };
    // keyboard / mouse
    if (!this.typing()) {
      let mx = 0, my = 0;
      if (this.down.has('KeyW') || this.down.has('ArrowUp')) my += 1;
      if (this.down.has('KeyS') || this.down.has('ArrowDown')) my -= 1;
      if (this.down.has('KeyD') || this.down.has('ArrowRight')) mx += 1;
      if (this.down.has('KeyA') || this.down.has('ArrowLeft')) mx -= 1;
      out.move = [mx, my];
      for (const a of ['jump', 'sprint', 'slap', 'dive', 'use', 'interact', 'emote', 'ptt', 'scores']) { out.held[a] = this.key(a); out.pressed[a] = this.keyPressed(a); }
      for (const a of ['item1', 'item2', 'item3']) out.pressed[a] = this.keyPressed(a);
    }
    out.held.grab = this.mouse.l; out.pressed.grab = this.mouse.lp;
    out.held.swing = this.mouse.r; out.pressed.swing = this.mouse.rp;
    const k = 0.0024 * this.sens;
    out.look = [this.mouse.dx * k, this.mouse.dy * k * (this.invertY ? -1 : 1)];
    out.wheel = this.mouse.wheel;
    this.mouse.dx = this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.lp = this.mouse.rp = false;
    this.pressedK.clear();
    // controller
    const gp = this.pad();
    if (gp) {
      const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const prev = this.padPrev;
      const pr = i => b(i) && !prev[i];
      const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0, 0.12), ry = dz(gp.axes[3] || 0, 0.12);
      const any = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.1 || gp.buttons.some(x => x.pressed);
      if (any) this.device = 'pad';
      if (Math.abs(lx) + Math.abs(ly) > 0.05) out.move = [lx, -ly];
      const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
      if (rx || ry) { const r = 3.2 * dt * this.padSens; out.look = [out.look[0] + curve(rx) * r, out.look[1] + curve(ry) * r * 0.75 * (this.invertY ? -1 : 1)]; }
      const map = { jump: PAD.A, dive: PAD.B, slap: PAD.X, interact: PAD.Y, use: PAD.LB, grab: PAD.RB, swing: PAD.RT, sprint: PAD.LT, scores: PAD.VIEW, emote: PAD.UP, ptt: PAD.DOWN };
      for (const [a, i] of Object.entries(map)) { if (b(i)) out.held[a] = true; if (pr(i)) out.pressed[a] = true; }
      if (b(PAD.L3)) out.held.sprint = true;
      if (pr(PAD.LEFT)) out.wheel -= 1;
      if (pr(PAD.RIGHT)) out.wheel += 1;
      if (pr(PAD.START)) this.emit(this.inGame ? 'pause' : 'back');
      // menus
      if (!this.inGame || this.menuOpen) {
        if (pr(PAD.A)) this.emit('confirm');
        if (pr(PAD.B)) this.emit('back');
        let dir = null;
        if (b(PAD.UP) || ly < -0.6) dir = 'up'; else if (b(PAD.DOWN) || ly > 0.6) dir = 'down'; else if (b(PAD.LEFT) || lx < -0.6) dir = 'left'; else if (b(PAD.RIGHT) || lx > 0.6) dir = 'right';
        if (dir) {
          if (this.navRepeat.dir !== dir) { this.navRepeat = { dir, t: 0.38 }; this.emit('nav', dir); }
          else { this.navRepeat.t -= dt; if (this.navRepeat.t <= 0) { this.navRepeat.t = 0.11; this.emit('nav', dir); } }
        } else this.navRepeat.dir = null;
        if (pr(PAD.LB)) this.emit('tab', -1);
        if (pr(PAD.RB)) this.emit('tab', 1);
      }
      out.stick = [rx, ry];
      this.padPrev = gp.buttons.map(x => x.pressed || x.value > 0.5);
    }
    out.device = this.device;
    return out;
  }
  /** a short rumble on controllers that support it */
  rumble(strength = 0.5, ms = 120) {
    const gp = this.pad();
    try { gp && gp.vibrationActuator && gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch { }
  }
}
export const input = new InputSys();

// on-screen button names for prompts, for whichever device was used last
export function glyph(action) {
  const pad = input.device === 'pad';
  const G = pad
    ? { jump: 'Ⓐ', dive: 'Ⓑ', slap: 'Ⓧ', interact: 'Ⓨ', use: 'LB', grab: 'RB', swing: 'RT', sprint: 'LT', scores: 'View', emote: '⬆', ptt: '⬇', items: '⬅➡', pause: 'Start' }
    : { jump: 'Space', dive: 'C', slap: 'E', interact: 'F', use: 'Q', grab: 'L-Click', swing: 'R-Click', sprint: 'Shift', scores: 'Tab', emote: 'T', ptt: 'V', items: '1-3', pause: 'Esc' };
  return G[action] || action;
}
