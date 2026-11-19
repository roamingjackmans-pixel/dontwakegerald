// Proximity voice chat over WebRTC (PeerJS media calls between every pair of players in the room).
// Voices get quieter with distance and pan left/right; in the lobby, shop and results everyone hears everyone.
// Your mic level is also sent to the host: loud talking makes noise in the game (if the room allows it).
import { audioCtx, initAudio } from './audio.js';
import { profile } from './profile.js';
import { PH, ST } from '../shared/sim.js';

export class Voice {
  constructor() {
    this.stream = null; this.peer = null; this.analyser = null; this.buf = null;
    this.calls = new Map();     // seat -> { call, src, gain, pan, el, level, an }
    this.ids = new Map();       // seat -> voice peer id
    this.muted = new Set();
    this.lvl = 0; this.raw = 0;
    this.ptt = false;
    this.mySeat = -1;
    this.failed = '';
  }
  get on() { return !!this.stream; }
  /** ask for the mic (once). Returns true if we have it. */
  async enableMic() {
    if (this.stream) return true;
    const s = profile().settings;
    if (!s.voice) return false;
    try {
      initAudio();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = audioCtx();
      if (ctx) {
        const src = ctx.createMediaStreamSource(this.stream);
        this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
        this.buf = new Float32Array(this.analyser.fftSize);
        src.connect(this.analyser);
      }
      this.applyPtt();
      // calls we already answered without a mic: call them again with it
      for (const [seat, c] of this.calls) if (c.outgoing) { this.drop(seat); }
      return true;
    } catch (e) {
      this.failed = e && e.name === 'NotAllowedError' ? 'Mic blocked' : 'No mic';
      return false;
    }
  }
  disableMic() { if (this.stream) for (const t of this.stream.getTracks()) t.stop(); this.stream = null; this.analyser = null; }
  /** the PeerJS peer we can be called on (the host's room peer, a guest's own peer) */
  setPeer(peer) {
    if (this.peer === peer) return;
    this.peer = peer;
    if (!peer) return;
    peer.on('call', call => {
      const seat = this.seatOfId(call.peer);
      if (seat < 0 || this.muted.has(seat)) { try { call.close(); } catch { } return; }
      call.answer(this.stream || undefined);
      this.attach(seat, call, false);
    });
  }
  get myId() { return this.peer && this.peer.open ? this.peer.id : null; }
  seatOfId(id) { for (const [s, v] of this.ids) if (v === id) return s; return -1; }
  /** who is in the room and how to reach their voice */
  sync(roster, mySeat) {
    this.mySeat = mySeat;
    this.ids.clear();
    for (const r of roster) if (r.vid && !r.bot) this.ids.set(r.seat, r.vid);
    // hang up on people who left
    for (const seat of [...this.calls.keys()]) if (!this.ids.has(seat)) this.drop(seat);
    // the lower seat calls the higher seat
    if (!this.peer || !this.peer.open) return;
    for (const [seat, id] of this.ids) {
      if (seat === mySeat || this.calls.has(seat) || this.muted.has(seat)) continue;
      if (mySeat < seat) {
        try {
          const call = this.stream ? this.peer.call(id, this.stream) : this.peer.call(id, silentStream());
          if (call) this.attach(seat, call, true);
        } catch (e) { console.warn('voice call failed', e); }
      }
    }
  }
  attach(seat, call, outgoing) {
    const c = { call, outgoing, level: 0 };
    this.calls.set(seat, c);
    call.on('stream', remote => {
      const ctx = audioCtx();
      if (!ctx) return;
      // Chrome only plays WebRTC audio through Web Audio if a media element is also holding the stream
      const el = new Audio(); el.muted = true; el.srcObject = remote; el.play().catch(() => { });
      const src = ctx.createMediaStreamSource(remote);
      const gain = ctx.createGain(); gain.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const an = ctx.createAnalyser(); an.fftSize = 256;
      src.connect(an); src.connect(gain);
      if (pan) { gain.connect(pan); pan.connect(ctx.destination); } else gain.connect(ctx.destination);
      Object.assign(c, { el, src, gain, pan, an, buf: new Float32Array(an.fftSize) });
    });
    call.on('close', () => { if (this.calls.get(seat) === c) this.calls.delete(seat); });
    call.on('error', () => { if (this.calls.get(seat) === c) this.calls.delete(seat); });
  }
  drop(seat) {
    const c = this.calls.get(seat);
    if (!c) return;
    this.calls.delete(seat);
    try { c.call.close(); } catch { }
    try { c.gain && c.gain.disconnect(); c.src && c.src.disconnect(); } catch { }
    if (c.el) { c.el.srcObject = null; }
  }
  toggleMute(seat) {
    if (this.muted.has(seat)) this.muted.delete(seat); else { this.muted.add(seat); this.drop(seat); }
    return this.muted.has(seat);
  }
  applyPtt() {
    if (!this.stream) return;
    const mode = profile().settings.micMode;
    const on = mode === 'open' || this.ptt;
    for (const t of this.stream.getAudioTracks()) t.enabled = on;
  }
  /** my mic loudness 0..1 (0 when muted / push-to-talk not held) */
  level() { return this.lvl; }
  update(view, cam, sim, ptt) {
    if (ptt !== undefined && ptt !== this.ptt) { this.ptt = ptt; this.applyPtt(); }
    // my level
    if (this.analyser && this.stream && this.stream.getAudioTracks().some(t => t.enabled)) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0; for (const v of this.buf) s += v * v;
      const rms = Math.sqrt(s / this.buf.length);
      const gate = profile().settings.micGate;
      const v = Math.max(0, Math.min(1, (rms - gate * 0.1) * 9));
      this.raw = rms;
      this.lvl += (v - this.lvl) * (v > this.lvl ? 0.5 : 0.12);
    } else this.lvl *= 0.8;
    // everyone else
    const ctx = audioCtx();
    if (!ctx) return;
    const range = sim.mods.voiceRange || 28;
    const proximity = (sim.phase === PH.NIGHT || sim.phase === PH.INTRO || sim.phase === PH.DAWN) && range < 9000;
    const me = view.players.find(p => p.seat === view.me);
    const lx = me && me.st !== ST.OUT ? me.x : cam ? cam.tx : 0, lz = me && me.st !== ST.OUT ? me.z : cam ? cam.tz : 0, ly = me ? me.y : 0;
    const yaw = cam ? cam.yaw : 0;
    const master = profile().settings.master;
    for (const [seat, c] of this.calls) {
      if (!c.gain) continue;
      let g = 1, pan = 0;
      const p = view.players.find(q => q.seat === seat);
      if (proximity && p) {
        const dx = p.x - lx, dz = p.z - lz, dy = p.y - ly;
        const d = Math.hypot(dx, dz, dy * 0.6);
        const near = range * 0.25;
        g = d <= near ? 1 : Math.max(0, 1 - (d - near) / (range - near));
        g = g * g;
        const right = [-Math.cos(yaw), Math.sin(yaw)];
        pan = Math.max(-0.85, Math.min(0.85, (dx * right[0] + dz * right[1]) / (Math.hypot(dx, dz) || 1)));
      }
      if (this.muted.has(seat)) g = 0;
      c.gain.gain.setTargetAtTime(g * 1.4 * master, ctx.currentTime, 0.08);
      if (c.pan) c.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.08);
      if (c.an) { c.an.getFloatTimeDomainData(c.buf); let s = 0; for (const v of c.buf) s += v * v; c.level = Math.sqrt(s / c.buf.length); }
    }
  }
  /** little "who's talking" badges for the HUD */
  badges(game) {
    const out = [];
    const sim = game.sim;
    if (this.stream) {
      const mode = profile().settings.micMode;
      const live = mode === 'open' || this.ptt;
      out.push(`<div class="vb me ${this.lvl > 0.05 ? 'talk' : ''} ${live ? '' : 'off'}">🎙️ ${live ? 'You' : 'Hold ' + (game.hudPtt || 'V') + ' to talk'}</div>`);
    } else if (this.failed) out.push(`<div class="vb off">🎙️ ${this.failed}</div>`);
    for (const [seat, c] of this.calls) {
      const p = sim.players[seat];
      if (!p || !(c.level > 0.015)) continue;
      out.push(`<div class="vb talk">🔊 ${p.name.replace(/[<>&]/g, '')}</div>`);
    }
    return out.join('');
  }
  stop() { for (const s of [...this.calls.keys()]) this.drop(s); this.peer = null; this.ids.clear(); }
}

let silent = null;
function silentStream() {
  if (silent) return silent;
  const ctx = audioCtx();
  if (!ctx) return undefined;
  const d = ctx.createMediaStreamDestination();
  const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(d); o.start();
  silent = d.stream;
  return silent;
}
