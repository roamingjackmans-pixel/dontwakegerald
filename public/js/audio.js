/**
 * audio.js — Don't Wake Gerald
 *
 * Pure Web Audio synthesis. Every sound effect, every note of music and Gerald's snoring is
 * built at runtime from oscillators, looping noise buffers, filters and envelopes.
 * No audio files, no libraries.
 *
 * Safety contract: nothing exported here may throw. If Web Audio is missing or blocked, every
 * export silently does nothing.
 *
 * Signal graph
 *   sfx voices ──► sfxBus ─────────────────────────────┐
 *            └──► sfxWet ──► reverb ──► revOut ─────────┤
 *   music players ──► musicBus ──► duck ───────────────┼──► master ──► compressor ──► soft clip ──► out
 *                                    └──► musicWet ──► reverb
 *   snore bed ──► snoreBus ────────────────────────────┘  (+ a small reverb send)
 *   map ambience beds ──► ambBus ──► sfxBus             (+ a small send into sfxWet)
 */

// ---------------------------------------------------------------------------
// State + tiny utils
// ---------------------------------------------------------------------------
let ctx = null;          // AudioContext, created lazily by initAudio()
let G = null;            // fixed graph nodes (buses, reverb, compressor)
let NB = null;           // shared looping noise buffers { white, pink, brown }
let DIST = null;         // waveshaper curve (kazoo buzz)
const vols = { master: 1, sfx: 1, music: 1 };
const MASTER_TRIM = 0.8; // headroom into the compressor
const NOISE_SEC = 2.5;
const MAX_VOICES = 24;
const DEDUPE_MS = 30;
let intensity = 0;       // Gerald's noise meter, 0..1
let pendingMood = null;  // mood requested before the context existed
const AMB_TRIM = 0.7;    // ambience bus level (it's background: keep it under the sfx)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const ss = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const wallMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);

// ---------------------------------------------------------------------------
// Graph construction (runs once, on the first initAudio())
// ---------------------------------------------------------------------------
function gainNode(v, dest) {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function biquad(type, f, q = 0.7, gainDb = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (gainDb) b.gain.value = gainDb;
  return b;
}

/** Looping noise buffer with a crossfaded seam so long loops (the snore bed) never click. */
function makeNoise(kind) {
  const rate = ctx.sampleRate, len = Math.floor(rate * NOISE_SEC), fade = 2048;
  const raw = new Float32Array(len + fade);
  let b0 = 0, b1 = 0, b2 = 0, br = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') { // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      raw[i] = b0 + b1 + b2 + w * 0.1848;
    } else if (kind === 'brown') {
      br = (br + 0.02 * w) / 1.02;
      raw[i] = br;
    } else raw[i] = w;
  }
  const buf = ctx.createBuffer(1, len, rate), d = buf.getChannelData(0);
  let peak = 1e-6;
  for (let i = 0; i < len; i++) {
    // the first `fade` samples blend in the overflow tail, so sample[len-1] -> sample[0] is continuous
    d[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] *= 0.95 / peak;
  return buf;
}

/** Stereo "cozy bedroom" impulse: decaying noise that darkens as it fades. */
function makeImpulse(sec = 2.6, decay = 2.8) {
  const rate = ctx.sampleRate, len = Math.floor(rate * sec), pre = Math.floor(rate * 0.015);
  const b = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += ((Math.random() * 2 - 1) - lp) * (0.85 - 0.72 * x);
      d[i] = lp * Math.pow(1 - x, decay);
    }
  }
  return b;
}

function makeSoftClip() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return c;
}

function makeCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

function buildGraph() {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  const clip = ctx.createWaveShaper(); // safety net: transparent below 0.7, rounds off anything hotter
  clip.curve = makeSoftClip();
  comp.connect(clip); clip.connect(ctx.destination);
  const master = gainNode(vols.master * MASTER_TRIM, comp);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse();
  reverb.connect(gainNode(0.9, master));

  const sfxBus = gainNode(vols.sfx, master);
  const sfxWet = gainNode(vols.sfx, reverb);      // per-voice sends land here, scaled by sfx volume
  const musicBus = gainNode(vols.music, null);
  const duck = gainNode(1, master);
  musicBus.connect(duck);
  duck.connect(gainNode(0.32, reverb));
  const snoreBus = gainNode(vols.sfx, master);
  snoreBus.connect(gainNode(0.15, reverb));
  const ambBus = gainNode(AMB_TRIM, sfxBus);      // map ambience rides the sfx volume
  ambBus.connect(gainNode(0.12, sfxWet));

  NB = { white: makeNoise('white'), pink: makeNoise('pink'), brown: makeNoise('brown') };
  DIST = makeCurve(5);
  G = { comp, master, reverb, sfxBus, sfxWet, musicBus, duck, snoreBus, ambBus };
}

// ---------------------------------------------------------------------------
// Synthesis toolkit
// ---------------------------------------------------------------------------

/** Automate `param` through [[dt, value], ...] starting at time t (linear, or exponential). */
function pts(param, t, arr, exp = false) {
  param.setValueAtTime(arr[0][1], t + arr[0][0]);
  for (let i = 1; i < arr.length; i++) {
    const [dt, v] = arr[i];
    if (exp) param.exponentialRampToValueAtTime(Math.max(1e-4, v), t + dt);
    else param.linearRampToValueAtTime(v, t + dt);
  }
}

/** Click-free attack + exponential decay. */
function adsr(param, t, a, d, v) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(v, t + a);
  param.exponentialRampToValueAtTime(1e-4, t + a + d);
}

/** Oscillator -> gain into `param` (vibrato, tremolo, filter wobble). */
function lfo(param, t, dur, rate, depth, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(depth, t);
  o.connect(g); g.connect(param);
  o.start(t); o.stop(t + dur + 0.05);
  return { o, g };
}

/** A gain whose level wobbles between (1 - depth) and 1. */
function amGain(t, dur, rate, depth, type = 'sine') {
  const g = gainNode(1 - depth / 2, null);
  lfo(g.gain, t, dur, rate, depth / 2, type);
  return g;
}

function noiseSrc(kind, t, stopAt) {
  const s = ctx.createBufferSource();
  s.buffer = NB[kind] || NB.white;
  s.loop = true;
  s.start(t, Math.random() * (NOISE_SEC - 0.2));
  s.stop(stopAt);
  return s;
}

/**
 * One oscillator voice.
 *  f / f1 / ft : start freq, end freq, glide time (default: whole note)   |  fpts: [[dt,f],...]
 *  a / d / v   : attack, decay, peak  |  gpts: [[dt,gain],...] (scaled by v if given)
 *  lp          : lowpass cutoff, or [[dt,f],...] sweep;  q: its resonance
 *  vib         : [rate, cents]        |  am: [rate, depth, lfoType]   |  det: detune cents
 */
function tone(out, t, o) {
  const { type = 'sine', f = 440, f1, ft, fpts, glide, a = 0.005, d = 0.2, gpts, det, lp, q = 0.7, vib, am } = o;
  const osc = ctx.createOscillator();
  osc.type = type;
  const g = ctx.createGain();
  const end = gpts ? gpts[gpts.length - 1][0] : a + d;
  if (gpts) pts(g.gain, t, o.v == null ? gpts : gpts.map(([dt, x]) => [dt, x * o.v]));
  else adsr(g.gain, t, a, d, o.v == null ? 0.5 : o.v);
  if (fpts) pts(osc.frequency, t, fpts, glide !== 'lin');
  else {
    osc.frequency.setValueAtTime(f, t);
    if (f1) {
      if (glide === 'lin') osc.frequency.linearRampToValueAtTime(f1, t + (ft || end));
      else osc.frequency.exponentialRampToValueAtTime(f1, t + (ft || end));
    }
  }
  if (det) osc.detune.setValueAtTime(det, t);
  if (vib) lfo(osc.detune, t, end, vib[0], vib[1]);
  let node = osc, flt = null;
  if (lp) {
    flt = biquad('lowpass', Array.isArray(lp) ? lp[0][1] : lp, q);
    if (Array.isArray(lp)) pts(flt.frequency, t, lp, true);
    node.connect(flt); node = flt;
  }
  node.connect(g); node = g;
  if (am) { const m = amGain(t, end, am[0], am[1], am[2]); g.connect(m); node = m; }
  node.connect(out);
  osc.start(t); osc.stop(t + end + 0.05);
  return { o: osc, g, flt, end };
}

/** Filtered noise burst. Same envelope options as tone(); type null = unfiltered. */
function noise(out, t, o) {
  const { buf = 'white', type = 'bandpass', f = 1000, f1, fpts, q = 1, a = 0.005, d = 0.2, gpts, am } = o;
  const end = gpts ? gpts[gpts.length - 1][0] : a + d;
  const s = noiseSrc(buf, t, t + end + 0.05);
  const g = ctx.createGain();
  if (gpts) pts(g.gain, t, o.v == null ? gpts : gpts.map(([dt, x]) => [dt, x * o.v]));
  else adsr(g.gain, t, a, d, o.v == null ? 0.5 : o.v);
  let node = s, flt = null;
  if (type) {
    flt = biquad(type, fpts ? fpts[0][1] : f, q);
    if (fpts) pts(flt.frequency, t, fpts, true);
    else if (f1) { flt.frequency.setValueAtTime(f, t); flt.frequency.exponentialRampToValueAtTime(f1, t + end); }
    node.connect(flt); node = flt;
  }
  node.connect(g); node = g;
  if (am) { const m = amGain(t, end, am[0], am[1], am[2]); g.connect(m); node = m; }
  node.connect(out);
  return { s, g, flt, end };
}

/** Stack of decaying sine partials: bells, chimes, music-box tines. Higher partials die sooner. */
function tines(out, t, f, v, dec, ratios, amps, det = 0) {
  for (let i = 0; i < ratios.length; i++) {
    tone(out, t, { f: f * ratios[i], a: 0.002, d: dec / (1 + i * 1.5), v: v * amps[i], det });
  }
}
const bell = (out, t, f, v, dec = 1) => tines(out, t, f, v, dec, [1, 2.76, 5.4], [1, 0.35, 0.12]);
const mbox = (out, t, f, v, dec = 1.6, det = 0) => tines(out, t, f, v, dec, [1, 2.005, 4.07], [1, 0.2, 0.07], det);

/** Plucked string (pizzicato bass, sneaky plinks): bright attack that quickly closes down. */
function pluck(out, t, f, v, dec = 0.25, type = 'sawtooth') {
  tone(out, t, { type, f, a: 0.003, d: dec, v, lp: [[0, Math.min(f * 9, 12000)], [dec, f * 1.3]] });
}

/** Mini brass note for fanfares. */
function brass(out, t, f, len, v) {
  for (const det of [-6, 6]) {
    tone(out, t, {
      type: 'sawtooth', f, det, gpts: [[0, 0], [0.02, v], [len, v * 0.8], [len + 0.08, 0]],
      lp: [[0, f * 1.5], [0.04, f * 6], [len, f * 3]], vib: len > 0.2 ? [6, 18] : null,
    });
  }
}

/** Bed-spring "eek". */
function creak(out, t, f) {
  tone(out, t, { type: 'triangle', fpts: [[0, f * 0.85], [0.08, f * 1.12], [0.2, f * 0.95]], gpts: [[0, 0], [0.02, 0.14], [0.16, 0.1], [0.22, 0]], vib: [30, 70] });
  tone(out, t, { type: 'square', f: f / 3, gpts: [[0, 0], [0.02, 0.05], [0.2, 0]], lp: 2500 });
}

/** Distortion + nasal peaks: everything sent in comes out sounding like a kazoo. */
function kazooChain(out) {
  const ws = ctx.createWaveShaper();
  ws.curve = DIST;
  const hp = biquad('highpass', 280), p1 = biquad('peaking', 1250, 3, 12), p2 = biquad('peaking', 2700, 4, 8), lp = biquad('lowpass', 5500);
  ws.connect(hp); hp.connect(p1); p1.connect(p2); p2.connect(lp); lp.connect(gainNode(0.22, out));
  return ws;
}

// --- Formant voice (Gerald, the cat, the rooster, the goblin yelp) ---------
// [F1, F2, F3, amp1, amp2, amp3]. 'm' is a closed-mouth hum.
const VOW = {
  a: [730, 1090, 2440, 1, 0.5, 0.25],
  e: [530, 1840, 2480, 1, 0.45, 0.3],
  i: [270, 2290, 3010, 1, 0.35, 0.3],
  o: [570, 840, 2410, 1, 0.45, 0.15],
  u: [300, 870, 2240, 1, 0.3, 0.1],
  m: [250, 1000, 2200, 1, 0.12, 0.04],
};
const FQ = [6, 8, 10];
const FORM_GAIN = 4;

/**
 * Sawtooth (+ breath noise) through three gliding bandpass formants.
 *  keys : [[dt, f0, vowel, gain], ...]   (all glide linearly between keys)
 *  p    : pitch multiplier (also nudges vocal-tract size by sqrt(p))
 *  scale: vocal-tract size (0.7 = giant, 1.6 = tiny goblin)
 *  body : extra sine at f0 for chest/hugeness; growl: [rate, depth] rough AM
 */
function formant(out, t, { keys, p = 1, scale = 1, breath = 0.15, vib, growl, body = 0, gain = 1, lp = 3200 }) {
  const end = keys[keys.length - 1][0], sc = scale * Math.sqrt(p), stopAt = t + end + 0.05;
  const f0 = keys.map(k => [k[0], k[1] * p]);
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  pts(src.frequency, t, f0, true);
  const v = vib ? lfo(src.detune, t, end, vib[0], vib[1]) : null;
  const mix = ctx.createGain();
  src.connect(mix);
  src.start(t); src.stop(stopAt);
  if (breath > 0) noiseSrc('pink', t, stopAt).connect(gainNode(breath, mix));

  const env = ctx.createGain();
  pts(env.gain, t, keys.map(k => [k[0], k[3] * gain]));
  const lpf = biquad('lowpass', lp * Math.sqrt(sc));
  lpf.connect(env);
  for (let i = 0; i < 3; i++) {
    const bp = biquad('bandpass', 500, FQ[i]);
    pts(bp.frequency, t, keys.map(k => [k[0], VOW[k[2]][i] * sc]));
    const fg = ctx.createGain();
    pts(fg.gain, t, keys.map(k => [k[0], VOW[k[2]][3 + i] * FORM_GAIN]));
    mix.connect(bp); bp.connect(fg); fg.connect(lpf);
  }
  if (body) {
    const b = ctx.createOscillator();
    pts(b.frequency, t, f0, true);
    if (v) v.g.connect(b.detune);
    b.connect(gainNode(body, env));
    b.start(t); b.stop(stopAt);
  }
  let last = env;
  if (growl) { last = amGain(t, end, growl[0], growl[1], 'sawtooth'); env.connect(last); }
  last.connect(out);
  return { end, env };
}

// ---------------------------------------------------------------------------
// Voice management: dedupe, polyphony cap, per-voice volume/pan/reverb send
// ---------------------------------------------------------------------------
let voiceEnds = [];
const lastAt = Object.create(null);

function playVoice(build, vol, pan, rev) {
  const now = ctx.currentTime;
  voiceEnds = voiceEnds.filter(e => e > now);
  if (voiceEnds.length >= MAX_VOICES) return null;
  const g = gainNode(vol, null);
  let node = g, pn = null, send = null;
  if (pan && ctx.createStereoPanner) {
    pn = ctx.createStereoPanner();
    pn.pan.value = clamp(pan, -1, 1);
    g.connect(pn); node = pn;
  }
  node.connect(G.sfxBus);
  if (rev > 0) { send = gainNode(rev, G.sfxWet); node.connect(send); }
  const t = now + 0.012;
  const dur = num(build(t, g), 1);
  voiceEnds.push(t + dur);
  setTimeout(() => {
    try { g.disconnect(); if (pn) pn.disconnect(); if (send) send.disconnect(); } catch (e) { /* already gone */ }
  }, (dur + 3) * 1000);
  return { g, end: t + dur };
}

// ---------------------------------------------------------------------------
// Sound effects: name -> [reverbSend, build(t, out, pitch) => duration]
// ---------------------------------------------------------------------------
const SFX = {
  // ----- goblin bodies -----
  step: [0, (t, o, p) => {
    const r = p * rnd(0.9, 1.1);
    tone(o, t, { f: 170 * r, f1: 70 * r, d: 0.07, v: 0.5 });
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 1400 * r, d: 0.035, v: 0.35 });
    return 0.1;
  }],
  step_soft: [0, (t, o, p) => {
    const r = p * rnd(0.9, 1.1);
    tone(o, t, { f: 120 * r, f1: 60 * r, d: 0.06, v: 0.25 });
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 700 * r, a: 0.008, d: 0.05, v: 0.22 });
    return 0.1;
  }],
  jump: [0, (t, o, p) => {
    tone(o, t, { type: 'triangle', f: 320 * p, f1: 980 * p, d: 0.12, v: 0.3 });
    tone(o, t, { type: 'square', f: 260 * p, f1: 820 * p, d: 0.1, v: 0.06, lp: 2500 });
    noise(o, t, { f: 800, f1: 2400, q: 1.5, d: 0.08, v: 0.25 });
    return 0.18;
  }],
  land: [0, (t, o, p) => {
    tone(o, t, { f: 150 * p, f1: 45 * p, d: 0.14, v: 0.6 });
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 900 * p, d: 0.08, v: 0.4 });
    return 0.18;
  }],
  land_big: [0.2, (t, o, p) => {
    tone(o, t, { f: 110 * p, f1: 30 * p, d: 0.4, v: 0.9 });
    tone(o, t, { type: 'triangle', f: 220 * p, f1: 60 * p, d: 0.15, v: 0.35 });
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 600 * p, f1: 150, d: 0.35, v: 0.8 });
    noise(o, t + 0.02, { f: 1800, q: 0.8, d: 0.05, v: 0.3 });
    return 0.5;
  }],
  slap: [0.08, (t, o, p) => {
    noise(o, t, { f: 2200 * p, q: 0.7, a: 0.001, d: 0.07, v: 1 });
    noise(o, t, { type: 'highpass', f: 5000, a: 0.001, d: 0.02, v: 0.4 });
    tone(o, t, { f: 260 * p, f1: 120 * p, d: 0.06, v: 0.35 });
    return 0.12;
  }],
  swing_whoosh: [0, (t, o, p) => {
    noise(o, t, { fpts: [[0, 350 * p], [0.13, 1900 * p], [0.28, 500 * p]], q: 2.2, gpts: [[0, 0], [0.12, 1], [0.28, 0]] });
    return 0.32;
  }],
  club_hit: [0.12, (t, o, p) => { // cartoon wooden BONK
    tone(o, t, { type: 'triangle', f: 640 * p, f1: 360 * p, d: 0.16, v: 0.5 });
    tone(o, t, { f: 210 * p, f1: 90 * p, d: 0.12, v: 0.6 });
    tone(o, t, { type: 'square', f: 1280 * p, f1: 900 * p, d: 0.04, v: 0.08, lp: 3000 });
    noise(o, t, { f: 1400, q: 2, a: 0.001, d: 0.03, v: 0.6 });
    return 0.25;
  }],
  launch: [0.1, (t, o, p) => { // spring kick + slide-whistle yeet
    tone(o, t, { f: 90 * p, f1: 50 * p, d: 0.12, v: 0.5 });
    tone(o, t, { f: 380 * p, f1: 1600 * p, ft: 0.4, gpts: [[0, 0], [0.03, 0.3], [0.35, 0.25], [0.5, 0]], vib: [9, 35] });
    noise(o, t, { fpts: [[0, 400], [0.4, 3500]], q: 1.2, gpts: [[0, 0], [0.1, 0.5], [0.45, 0]] });
    return 0.55;
  }],
  grab: [0, (t, o, p) => {
    noise(o, t, { f: 3000 * p, q: 3, a: 0.001, d: 0.025, v: 0.5 });
    tone(o, t, { type: 'triangle', f: 520 * p, f1: 1050 * p, d: 0.07, v: 0.35 });
    return 0.1;
  }],
  drop: [0, (t, o, p) => {
    tone(o, t, { type: 'triangle', f: 900 * p, f1: 300 * p, d: 0.1, v: 0.3 });
    tone(o, t + 0.07, { f: 160 * p, f1: 60 * p, d: 0.08, v: 0.45 });
    return 0.18;
  }],
  throw: [0, (t, o, p) => {
    noise(o, t, { fpts: [[0, 600 * p], [0.15, 2600 * p]], q: 2, gpts: [[0, 0], [0.05, 0.8], [0.2, 0]] });
    tone(o, t, { type: 'triangle', f: 400 * p, f1: 1200 * p, d: 0.12, v: 0.18 });
    return 0.22;
  }],
  deposit: [0.15, (t, o, p) => { // coin chime (pitch it up for combos)
    tone(o, t, { type: 'triangle', f: 988 * p, d: 0.08, v: 0.22 });
    tone(o, t, { type: 'square', f: 988 * p, d: 0.06, v: 0.05, lp: 4000 });
    bell(o, t + 0.07, 1319 * p, 0.3, 0.5);
    return 0.65;
  }],
  cash: [0.18, (t, o, p) => { // cha- (drawer clank) -CHING!
    noise(o, t, { f: 2500 * p, q: 1, a: 0.001, d: 0.09, v: 0.7 });
    for (const r of [1, 1.41, 2.13]) tone(o, t, { type: 'square', f: 620 * r * p, d: 0.06, v: 0.05, lp: 5000 });
    noise(o, t + 0.05, { buf: 'pink', type: 'lowpass', f: 900, gpts: [[0, 0], [0.03, 0.3], [0.18, 0]] });
    bell(o, t + 0.12, 2093 * p, 0.3, 1.0);
    bell(o, t + 0.12, 2637 * p, 0.22, 0.9);
    bell(o, t + 0.12, 3136 * p, 0.16, 0.8);
    return 1.3;
  }],
  break_glass: [0.25, (t, o, p) => {
    noise(o, t, { type: 'highpass', f: 2500 * p, a: 0.001, d: 0.25, v: 1 });
    noise(o, t, { f: 1200, q: 1, a: 0.001, d: 0.05, v: 0.6 });
    for (let i = 0; i < 12; i++) {
      tone(o, t + Math.pow(Math.random(), 1.5) * 0.45, { f: rnd(2200, 6500) * p, a: 0.001, d: rnd(0.04, 0.14), v: rnd(0.05, 0.14) });
    }
    return 0.7;
  }],
  pop: [0.05, (t, o, p) => { // dream bubble pop
    const r = p * rnd(0.92, 1.08);
    tone(o, t, { f: 380 * r, f1: 1500 * r, ft: 0.03, a: 0.001, d: 0.06, v: 0.5 });
    noise(o, t, { type: 'highpass', f: 3000, a: 0.001, d: 0.012, v: 0.3 });
    return 0.1;
  }],
  squish: [0.05, (t, o, p) => {
    noise(o, t, { buf: 'pink', fpts: [[0, 300 * p], [0.1, 1300 * p], [0.25, 400 * p]], q: 5, gpts: [[0, 0], [0.02, 1.6], [0.15, 1.1], [0.28, 0]] });
    tone(o, t, { type: 'triangle', f: 160 * p, f1: 90 * p, d: 0.22, v: 0.3, vib: [30, 300] });
    return 0.32;
  }],
  pancake: [0.12, (t, o, p) => { // SPLAT, flappy flutter, sad deflating slide
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 2400 * p, f1: 350, a: 0.001, d: 0.18, v: 1 });
    tone(o, t, { f: 230 * p, f1: 55 * p, a: 0.002, d: 0.2, v: 0.6 });
    noise(o, t + 0.07, { buf: 'pink', f: 650 * p, q: 2, gpts: [[0, 0], [0.03, 0.9], [0.4, 0]], am: [30, 0.9, 'square'] });
    tone(o, t + 0.12, { type: 'triangle', f: 640 * p, f1: 170 * p, a: 0.02, d: 0.55, v: 0.14, vib: [6, 50] });
    return 0.75;
  }],
  boing: [0.08, (t, o, p) => {
    const w = tone(o, t, { type: 'triangle', f: 180 * p, f1: 330 * p, ft: 0.5, a: 0.003, d: 0.55, v: 0.45 });
    const l = lfo(w.o.detune, t, 0.6, 14, 450);
    l.g.gain.exponentialRampToValueAtTime(10, t + 0.55); // the spring settles
    tone(o, t, { f: 90 * p, f1: 160 * p, d: 0.3, v: 0.25 });
    return 0.6;
  }],
  yelp: [0.05, (t, o, p) => { // tiny goblin "yip!"
    const r = rnd(0.9, 1.15);
    formant(o, t, { keys: [[0, 600 * r, 'i', 0], [0.02, 900 * r, 'i', 0.7], [0.08, 1100 * r, 'a', 0.8], [0.2, 650 * r, 'a', 0]], p, scale: 1.6, breath: 0.1, gain: 0.32 });
    return 0.25;
  }],
  steal: [0.1, (t, o, p) => { // sneaky pizzicato plink-plunk
    noise(o, t, { f: 4000, q: 4, a: 0.001, d: 0.02, v: 0.5 });
    pluck(o, t, 784 * p, 0.3, 0.14, 'triangle');
    pluck(o, t + 0.09, 1175 * p, 0.26, 0.18, 'triangle');
    return 0.35;
  }],
  stash_alarm: [0.05, (t, o, p) => { // urgent tiny wee-woo
    const w = tone(o, t, { type: 'square', f: 1250 * p, gpts: [[0, 0], [0.01, 0.12], [0.6, 0.12], [0.65, 0]], lp: 3500 });
    for (let i = 0; i < 8; i++) w.o.frequency.setValueAtTime((i % 2 ? 930 : 1250) * p, t + i * 0.08);
    return 0.7;
  }],

  // ----- shop / UI -----
  buy: [0.15, (t, o, p) => {
    tone(o, t, { type: 'triangle', f: 1047 * p, d: 0.09, v: 0.3 });
    tone(o, t + 0.07, { type: 'triangle', f: 1319 * p, d: 0.09, v: 0.3 });
    bell(o, t + 0.14, 1568 * p, 0.3, 0.5);
    return 0.7;
  }],
  denied: [0.05, (t, o, p) => { // "nuh-uh"
    tone(o, t, { type: 'square', f: 233 * p, gpts: [[0, 0], [0.01, 0.16], [0.11, 0.16], [0.13, 0]], lp: 1400 });
    tone(o, t + 0.16, { type: 'square', f: 174 * p, gpts: [[0, 0], [0.01, 0.16], [0.2, 0.16], [0.24, 0]], lp: 1200 });
    return 0.45;
  }],
  ui_move: [0, (t, o, p) => { tone(o, t, { f: 1500 * p, a: 0.002, d: 0.035, v: 0.18 }); return 0.05; }],
  ui_click: [0, (t, o, p) => { tone(o, t, { type: 'triangle', f: 900 * p, f1: 1400 * p, a: 0.002, d: 0.06, v: 0.3 }); return 0.08; }],
  ui_back: [0, (t, o, p) => { tone(o, t, { type: 'triangle', f: 1100 * p, f1: 620 * p, a: 0.002, d: 0.08, v: 0.3 }); return 0.1; }],
  countdown: [0.05, (t, o, p) => {
    tone(o, t, { type: 'triangle', f: 880 * p, gpts: [[0, 0], [0.005, 0.4], [0.12, 0.3], [0.18, 0]] });
    tone(o, t, { f: 1760 * p, d: 0.1, v: 0.08 });
    return 0.2;
  }],
  go: [0.15, (t, o, p) => {
    for (const [f, v] of [[1760, 0.3], [880, 0.25], [1318, 0.15]]) {
      tone(o, t, { type: 'triangle', f: f * p, gpts: [[0, 0], [0.005, v], [0.3, v * 0.7], [0.55, 0]] });
    }
    return 0.6;
  }],
  join: [0.1, (t, o, p) => {
    tone(o, t, { f: 880 * p, a: 0.005, d: 0.12, v: 0.25 });
    tone(o, t + 0.09, { f: 1319 * p, a: 0.005, d: 0.22, v: 0.25 });
    return 0.35;
  }],
  leave: [0.1, (t, o, p) => {
    tone(o, t, { f: 1319 * p, a: 0.005, d: 0.12, v: 0.22 });
    tone(o, t + 0.09, { f: 880 * p, f1: 820 * p, a: 0.005, d: 0.25, v: 0.22 });
    return 0.38;
  }],
  ready: [0.1, (t, o, p) => {
    tone(o, t, { type: 'square', f: 784 * p, a: 0.003, d: 0.07, v: 0.1, lp: 3000 });
    tone(o, t + 0.08, { type: 'square', f: 1175 * p, a: 0.003, d: 0.16, v: 0.1, lp: 3500 });
    tone(o, t + 0.08, { f: 2350 * p, a: 0.003, d: 0.2, v: 0.08 });
    return 0.3;
  }],
  error: [0.03, (t, o, p) => {
    for (const dt of [0, 0.14]) tone(o, t + dt, { type: 'sawtooth', f: 140 * p, gpts: [[0, 0], [0.005, 0.25], [0.09, 0.22], [0.11, 0]], lp: 1100 });
    return 0.3;
  }],
  emote: [0.05, (t, o, p) => {
    tone(o, t, { f: 1320 * p, a: 0.003, d: 0.07, v: 0.25 });
    tone(o, t + 0.06, { f: 1760 * p, a: 0.003, d: 0.14, v: 0.25, vib: [18, 40] });
    return 0.25;
  }],
  trick_shot: [0.2, (t, o, p) => { // ta-da-da-DAAA
    for (const [m, dt, len] of [[67, 0, 0.08], [72, 0.09, 0.08], [76, 0.18, 0.08], [79, 0.27, 0.45]]) brass(o, t + dt, mtof(m) * p, len, 0.13);
    return 0.85;
  }],
  level_up: [0.25, (t, o, p) => {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => tone(o, t + i * 0.06, { type: 'triangle', f: mtof(m) * p, a: 0.004, d: 0.3, v: 0.2 }));
    bell(o, t + 0.36, mtof(96) * p, 0.15, 0.8);
    noise(o, t + 0.3, { type: 'highpass', f: 8000, gpts: [[0, 0], [0.05, 0.12], [0.6, 0]] });
    return 1.2;
  }],
  unlock: [0.2, (t, o, p) => { // key-turn clack + bright double chime
    noise(o, t, { f: 1800, q: 3, a: 0.001, d: 0.03, v: 0.8 });
    noise(o, t + 0.08, { f: 1200, q: 3, a: 0.001, d: 0.04, v: 0.9 });
    tone(o, t + 0.08, { type: 'square', f: 400, f1: 200, a: 0.001, d: 0.04, v: 0.12, lp: 2000 });
    bell(o, t + 0.16, mtof(91) * p, 0.22, 0.9);
    bell(o, t + 0.28, mtof(98) * p, 0.2, 1.1);
    return 1.4;
  }],

  // ----- night / round flow -----
  night_start: [0.5, (t, o, p) => { // descending music-box sting; the last note sags flat
    [88, 84, 81, 76, 75.6].forEach((m, i) => mbox(o, t + i * 0.16, mtof(m) * p, 0.3, i === 4 ? 2.2 : 1.2));
    tone(o, t + 0.64, { f: mtof(45) * p, gpts: [[0, 0], [0.15, 0.25], [1.4, 0]] });
    return 2.6;
  }],
  dawn: [0.3, (t, o, p) => { // bright chime + squeaky "cock-a-doodle-doooo"
    bell(o, t, 1568 * p, 0.14, 1.2);
    bell(o, t + 0.05, 2093 * p, 0.1, 1.2);
    formant(o, t + 0.05, {
      keys: [
        [0, 520, 'a', 0], [0.02, 640, 'a', 0.7], [0.09, 660, 'o', 0.6], [0.11, 600, 'o', 0],
        [0.15, 600, 'a', 0], [0.17, 700, 'a', 0.5], [0.23, 700, 'a', 0.4], [0.25, 680, 'a', 0],
        [0.29, 700, 'o', 0], [0.31, 820, 'u', 0.7], [0.42, 850, 'u', 0.6], [0.44, 800, 'u', 0],
        [0.47, 800, 'e', 0], [0.49, 860, 'e', 0.5], [0.55, 850, 'e', 0.4], [0.57, 820, 'e', 0],
        [0.61, 850, 'o', 0], [0.65, 1050, 'u', 0.85], [1.0, 1080, 'u', 0.8], [1.25, 820, 'u', 0.6], [1.4, 700, 'u', 0],
      ], p, scale: 1.7, breath: 0.25, vib: [8, 30], gain: 0.36,
    });
    return 1.6;
  }],
  alarm_clock: [0.15, (t, o, p) => { // twin bells hammered at ~19 Hz, two bursts
    const env = gainNode(0, o);
    pts(env.gain, t, [[0, 0], [0.01, 0.5], [0.62, 0.45], [0.66, 0], [0.8, 0], [0.82, 0.5], [1.45, 0.42], [1.52, 0]]);
    const ham = ctx.createOscillator();
    ham.type = 'square';
    ham.frequency.value = 19;
    const b1 = gainNode(0.5, env), b2 = gainNode(0.5, env);
    ham.connect(gainNode(0.5, b1.gain));
    ham.connect(gainNode(-0.5, b2.gain)); // the other bell rings on the opposite half-cycle
    for (const [f, a, bus] of [[2350, 0.3, b1], [5480, 0.1, b1], [2620, 0.28, b2], [6150, 0.08, b2]]) {
      const os = ctx.createOscillator();
      os.frequency.value = f * p;
      os.connect(gainNode(a, bus));
      os.start(t); os.stop(t + 1.6);
    }
    ham.start(t); ham.stop(t + 1.6);
    return 1.6;
  }],
  tick: [0, (t, o, p) => {
    noise(o, t, { f: 3800 * p, q: 6, a: 0.001, d: 0.025, v: 1.5 });
    tone(o, t, { type: 'square', f: 2000 * p, a: 0.001, d: 0.012, v: 0.06, lp: 6000 });
    return 0.05;
  }],
  freeze: [0.4, (t, o, p) => { // hit + dissonant tremolo cluster closing down
    tone(o, t, { f: 62 * p, f1: 34 * p, a: 0.002, d: 0.7, v: 0.9 });
    tone(o, t, { type: 'triangle', f: 150 * p, f1: 60 * p, a: 0.002, d: 0.2, v: 0.4 });
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 3000, f1: 300, a: 0.002, d: 0.35, v: 0.6 });
    for (const m of [59, 60, 66, 71, 72]) {
      tone(o, t, { type: 'sawtooth', f: mtof(m) * p, det: rnd(-8, 8), gpts: [[0, 0], [0.015, 0.09], [0.3, 0.06], [1.3, 0]], lp: [[0, 5000], [1.3, 600]], am: [11, 0.7] });
    }
    return 1.4;
  }],

  // ----- Gerald -----
  twitch: [0.35, (t, o, p) => { // fleshy rumble + a rubbery skin wobble
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 260 * p, gpts: [[0, 0], [0.05, 1], [0.35, 0.6], [0.6, 0]], am: [13, 0.7] });
    tone(o, t, { type: 'sawtooth', f: 55 * p, f1: 42 * p, gpts: [[0, 0], [0.05, 0.3], [0.4, 0.22], [0.6, 0]], lp: 260, vib: [9, 80] });
    noise(o, t + 0.1, { buf: 'pink', fpts: [[0, 400], [0.2, 900], [0.35, 300]], q: 4, gpts: [[0, 0], [0.05, 0.6], [0.35, 0]] });
    return 0.7;
  }],
  scratch: [0.25, (t, o, p) => { // fingernails raking across skin, three strokes
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.34, up = i % 2 === 0;
      noise(o, s, { fpts: [[0, (up ? 700 : 2400) * p], [0.3, (up ? 2400 : 800) * p]], q: 1.8, gpts: [[0, 0], [0.05, 1.1], [0.26, 0.9], [0.32, 0]], am: [rnd(38, 55), 0.75, 'sawtooth'] });
      noise(o, s, { buf: 'brown', type: 'lowpass', f: 300, gpts: [[0, 0], [0.05, 0.5], [0.32, 0]] });
    }
    return 1.1;
  }],
  swat_warn: [0.3, (t, o, p) => { // a giant hand rising out of the dark
    noise(o, t, { buf: 'pink', fpts: [[0, 160 * p], [1.15, 1700 * p]], q: 1.3, gpts: [[0, 0], [0.5, 0.3], [0.95, 0.9], [1.15, 1.5], [1.22, 0]] });
    tone(o, t, { type: 'sawtooth', f: 36 * p, f1: 92 * p, ft: 1.2, gpts: [[0, 0], [0.8, 0.12], [1.15, 0.3], [1.22, 0]], lp: 500 });
    tone(o, t + 0.3, { f: 420 * p, f1: 1300 * p, ft: 0.9, gpts: [[0, 0], [0.7, 0.05], [0.9, 0]], vib: [7, 25] });
    return 1.3;
  }],
  swat_impact: [0.55, (t, o, p) => { // HUGE thud with sub-bass
    tone(o, t, { f: 75 * p, f1: 26 * p, a: 0.003, d: 0.9, v: 1 });
    tone(o, t, { f: 42 * p, a: 0.01, d: 1.1, v: 0.6 });
    tone(o, t, { type: 'triangle', f: 180 * p, f1: 50 * p, a: 0.002, d: 0.25, v: 0.9 });
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 500 * p, f1: 120, a: 0.002, d: 0.7, v: 1.5 });
    noise(o, t, { f: 1500 * p, q: 0.8, a: 0.001, d: 0.06, v: 1.6 });
    return 1.4;
  }],
  sneeze_in: [0.4, (t, o, p) => { // "ahh... AHHH..."
    formant(o, t, {
      keys: [[0, 85, 'a', 0], [0.12, 90, 'a', 0.55], [0.55, 115, 'a', 0.65], [0.7, 120, 'e', 0], [0.85, 105, 'a', 0], [1.0, 110, 'a', 0.8], [1.65, 175, 'e', 1], [1.8, 185, 'i', 0]],
      p, scale: 0.78, breath: 0.45, vib: [5, 25], body: 0.15,
    });
    noise(o, t, { buf: 'pink', fpts: [[0, 600], [1.8, 2200]], q: 1, gpts: [[0, 0], [0.6, 0.25], [0.75, 0], [1.0, 0.2], [1.75, 0.5], [1.8, 0]] });
    return 1.9;
  }],
  sneeze: [0.6, (t, o, p) => { // cartoon AH-CHOO: a big dry gust of wind with a sparkly tail
    formant(o, t, { keys: [[0, 150, 'a', 0], [0.03, 165, 'a', 1], [0.14, 170, 'a', 0.8], [0.17, 170, 'a', 0]], p, scale: 0.8, breath: 0.4, gain: 1.1 });
    noise(o, t + 0.17, { type: 'highpass', f: 1800 * p, a: 0.005, d: 0.16, v: 0.9 });           // CH
    formant(o, t + 0.25, { keys: [[0, 210, 'u', 0], [0.03, 200, 'u', 1], [0.35, 120, 'u', 0.6], [0.7, 80, 'o', 0]], p, scale: 0.8, breath: 0.5, gain: 1.1 });
    tone(o, t + 0.17, { f: 70 * p, f1: 30 * p, a: 0.005, d: 0.5, v: 0.8 });                 // boom
    noise(o, t + 0.2, { buf: 'pink', fpts: [[0, 1400 * p], [0.25, 700 * p], [0.9, 300 * p]], q: 0.9, gpts: [[0, 0], [0.04, 1.6], [0.4, 0.9], [0.95, 0]] }); // WHOOSH
    noise(o, t + 0.2, { fpts: [[0, 1800 * p], [0.9, 900 * p]], q: 12, gpts: [[0, 0], [0.1, 1.2], [0.9, 0]] }); // wind whistle
    for (let i = 0; i < 9; i++) { // sparkly tail, drifting down
      const dt = 0.55 + i * 0.075 + rnd(0, 0.04);
      tone(o, t + dt, { f: rnd(2600, 4200) * p * (1 - i * 0.04), a: 0.002, d: rnd(0.12, 0.25), v: 0.07 });
    }
    return 1.5;
  }],
  rollover: [0.5, (t, o, p) => { // deep groan + mattress rumble + bed-spring creaks
    formant(o, t, { keys: [[0, 70, 'u', 0], [0.25, 74, 'u', 0.7], [0.9, 62, 'o', 0.8], [1.6, 52, 'o', 0.5], [1.9, 48, 'u', 0]], p, scale: 0.72, breath: 0.2, vib: [4, 35], body: 0.3 });
    noise(o, t + 0.2, { buf: 'brown', type: 'lowpass', f: 300, gpts: [[0, 0], [0.3, 0.7], [1.2, 0.5], [1.7, 0]] });
    for (const [dt, f] of [[0.35, 1700], [0.75, 2300], [1.05, 1500], [1.5, 2000]]) creak(o, t + dt, f * p);
    return 2.1;
  }],
  wake_roar: [0.6, (t, o, p) => { // "HRRRUUUAAAGH?!"
    formant(o, t, { keys: [[0, 55, 'u', 0], [0.2, 62, 'u', 0.8], [0.7, 85, 'a', 1], [1.3, 92, 'a', 1], [1.8, 70, 'o', 0.7], [2.1, 58, 'o', 0]], p, scale: 0.7, breath: 0.35, growl: [27, 0.6], body: 0.3, gain: 1.05 });
    tone(o, t, { f: 45 * p, gpts: [[0, 0], [0.4, 0.5], [1.6, 0.5], [2.1, 0]] });
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 350, gpts: [[0, 0], [0.5, 0.6], [1.6, 0.5], [2.1, 0]], am: [9, 0.4] });
    return 2.3;
  }],
  grumble: [0.4, (t, o, p) => { // "mmmhhnnn..." settling back to sleep
    formant(o, t, { keys: [[0, 105, 'm', 0], [0.15, 110, 'm', 0.6], [0.5, 95, 'o', 0.7], [0.8, 82, 'm', 0.5], [1.1, 70, 'u', 0.55], [1.5, 58, 'm', 0.3], [1.75, 52, 'm', 0]], p, scale: 0.75, breath: 0.25, vib: [3.5, 40], body: 0.25, gain: 0.9, lp: 1500 });
    return 1.9;
  }],

  // ----- items & tricks -----
  flick: [0, (t, o, p) => {
    noise(o, t, { f: 3500 * p, q: 2, a: 0.001, d: 0.04, v: 0.7 });
    tone(o, t, { type: 'triangle', f: 2200 * p, f1: 350 * p, a: 0.001, d: 0.06, v: 0.3 });
    return 0.08;
  }],
  chain: [0.15, (t, o, p) => {
    let dt = 0;
    for (let i = 0; i < 14; i++) {
      dt += rnd(0.015, 0.06);
      const f = rnd(2500, 5200) * p, v = rnd(0.06, 0.16);
      tone(o, t + dt, { f, a: 0.001, d: rnd(0.04, 0.1), v });
      tone(o, t + dt, { f: f * 1.47, a: 0.001, d: 0.03, v: v * 0.6 });
      if (i % 3 === 0) noise(o, t + dt, { type: 'highpass', f: 4000, a: 0.001, d: 0.015, v: 0.3 });
    }
    return dt + 0.15;
  }],
  banana: [0.08, (t, o, p) => { // rubbery squeak + slide-whistle wheee
    tone(o, t, { type: 'sawtooth', f: 500 * p, f1: 1600 * p, ft: 0.08, gpts: [[0, 0], [0.01, 0.15], [0.08, 0.12], [0.1, 0]], lp: 3000, q: 6 });
    tone(o, t + 0.09, { f: 1800 * p, f1: 260 * p, ft: 0.45, gpts: [[0, 0], [0.02, 0.3], [0.35, 0.25], [0.5, 0]], vib: [11, 60] });
    return 0.65;
  }],
  kazoo: [0.1, (t, o, p) => { // obnoxious "hwaaa-AAANK"
    const k = kazooChain(o);
    tone(k, t, {
      type: 'sawtooth', glide: 'lin', vib: [6.5, 30],
      fpts: [[0, 290 * p], [0.07, 350 * p], [0.32, 345 * p], [0.38, 415 * p], [0.8, 400 * p]],
      gpts: [[0, 0], [0.03, 0.5], [0.3, 0.45], [0.34, 0.25], [0.4, 0.6], [0.72, 0.5], [0.8, 0]],
    });
    noise(k, t, { f: 1500, q: 1, gpts: [[0, 0], [0.03, 0.15], [0.75, 0.12], [0.8, 0]] });
    return 0.9;
  }],
  tiny_sneeze: [0.08, (t, o, p) => { // cute goblin "a-a-tchoo!"
    const r = rnd(0.94, 1.08);
    formant(o, t, { keys: [[0, 520 * r, 'a', 0], [0.03, 560 * r, 'a', 0.5], [0.12, 620 * r, 'a', 0.55], [0.15, 640 * r, 'a', 0],
      [0.22, 640 * r, 'a', 0], [0.25, 700 * r, 'a', 0.6], [0.36, 780 * r, 'e', 0.65], [0.39, 800 * r, 'e', 0]], p, scale: 1.6, breath: 0.2, gain: 0.32 });
    noise(o, t + 0.42, { type: 'highpass', f: 3500 * p, a: 0.002, d: 0.06, v: 0.5 });          // tch
    formant(o, t + 0.45, { keys: [[0, 900 * r, 'u', 0], [0.02, 880 * r, 'u', 0.8], [0.12, 700 * r, 'u', 0.5], [0.2, 600 * r, 'u', 0]], p, scale: 1.6, breath: 0.5, gain: 0.32 });
    tone(o, t + 0.5, { f: 2800 * p, f1: 3600 * p, a: 0.003, d: 0.15, v: 0.05 });               // tiny twinkle
    return 0.75;
  }],
  pepper: [0.1, (t, o, p) => { // shaker shake-shake-shake + a dusty "pff"
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.14;
      noise(o, s, { f: 5000 * p, q: 2, gpts: [[0, 0], [0.01, 0.5], [0.06, 0.25], [0.09, 0]], am: [70, 0.9, 'square'] }); // grains rattling
      noise(o, s, { f: 1600 * p, q: 3, a: 0.001, d: 0.02, v: 0.3 });                                                 // shaker body tap
    }
    noise(o, t + 0.46, { buf: 'pink', type: 'lowpass', fpts: [[0, 2500 * p], [0.3, 600 * p]], gpts: [[0, 0], [0.015, 0.7], [0.08, 0.35], [0.35, 0]] }); // puff
    noise(o, t + 0.46, { type: 'highpass', f: 6000, gpts: [[0, 0], [0.02, 0.12], [0.3, 0]] });                                                      // fine dust
    return 0.85;
  }],
  feather: [0.15, (t, o, p) => { // soft tickly swish-swish-swish
    for (let i = 0; i < 3; i++) noise(o, t + i * 0.13, { fpts: [[0, 3500 * p], [0.12, 6500 * p]], q: 1.5, gpts: [[0, 0], [0.04, 0.4], [0.13, 0]] });
    tone(o, t + 0.35, { f: 2600 * p, f1: 3400 * p, a: 0.01, d: 0.25, v: 0.05, vib: [12, 50] });
    return 0.65;
  }],
  magnet: [0.1, (t, o, p) => { // wub-wub-wub
    const w = tone(o, t, { type: 'sawtooth', f: 82 * p, gpts: [[0, 0], [0.05, 0.24], [0.75, 0.2], [0.85, 0]], lp: 700, q: 6 });
    lfo(w.flt.frequency, t, 0.85, 7, 550);
    tone(o, t, { f: 164 * p, gpts: [[0, 0], [0.05, 0.15], [0.75, 0.12], [0.85, 0]], am: [7, 0.8] });
    return 0.9;
  }],
  spray: [0.05, (t, o, p) => { // can-shake rattle, then "pssssht"
    for (let i = 0; i < 3; i++) noise(o, t + i * 0.06, { f: 2500, q: 3, a: 0.001, d: 0.02, v: 0.5 });
    noise(o, t + 0.2, { type: 'highpass', f: 4200 * p, gpts: [[0, 0], [0.02, 0.28], [0.55, 0.23], [0.7, 0]] });
    noise(o, t + 0.2, { f: 7000 * p, q: 2, gpts: [[0, 0], [0.02, 0.18], [0.6, 0.15], [0.7, 0]] });
    return 0.95;
  }],
  trap_snap: [0.1, (t, o, p) => {
    noise(o, t, { type: 'highpass', f: 3000, a: 0.001, d: 0.012, v: 0.6 });
    noise(o, t + 0.04, { f: 2200 * p, q: 1, a: 0.001, d: 0.04, v: 1 });
    tone(o, t + 0.04, { type: 'square', f: 330 * p, f1: 110 * p, a: 0.001, d: 0.06, v: 0.25, lp: 2500 });
    tone(o, t + 0.04, { f: 1850 * p, a: 0.001, d: 0.2, v: 0.12, vib: [40, 20] });
    tone(o, t + 0.04, { f: 2780 * p, a: 0.001, d: 0.15, v: 0.08 });
    return 0.3;
  }],
  coffee: [0.15, (t, o, p) => { // sluuurp + ZING!
    noise(o, t, { buf: 'pink', fpts: [[0, 500 * p], [0.4, 1600 * p]], q: 4, gpts: [[0, 0], [0.05, 1.2], [0.35, 1], [0.42, 0]], am: [24, 0.9, 'sawtooth'] });
    tone(o, t + 0.45, { type: 'triangle', f: 700 * p, f1: 2600 * p, ft: 0.12, a: 0.005, d: 0.3, v: 0.3 });
    bell(o, t + 0.55, 2637 * p, 0.15, 0.4);
    return 0.95;
  }],
  lullaby: [0.5, (t, o, p) => { // Brahms' Wiegenlied (public domain) on a warped music box
    const ph = [[76, 0], [76, 0.2], [79, 0.4], [76, 0.95], [76, 1.15], [79, 1.35], [76, 1.9], [79, 2.1], [84, 2.3], [83, 2.75], [81, 3.0]];
    ph.forEach(([m, dt], i) => {
      const last = i === ph.length - 1;
      mbox(o, t + dt, mtof(m + 12 - (last ? 0.4 : 0)) * p, 0.22, last ? 2.5 : 1.4, 8 * Math.sin(dt * 3));
    });
    return 5.5;
  }],
  splash: [0.2, (t, o, p) => {
    noise(o, t, { fpts: [[0, 2500 * p], [0.4, 700 * p]], q: 0.8, a: 0.003, d: 0.4, v: 1.4 });
    noise(o, t, { buf: 'pink', type: 'lowpass', f: 900, a: 0.002, d: 0.15, v: 0.5 });
    for (let i = 0; i < 6; i++) {
      const f = rnd(350, 900) * p;
      tone(o, t + 0.08 + Math.random() * 0.45, { f, f1: f * 2.2, ft: 0.05, a: 0.002, d: 0.06, v: 0.12 });
    }
    return 0.75;
  }],
  cat_meow: [0.4, (t, o, p) => { // an enormous "mmrrREEE-oww"
    formant(o, t, { keys: [[0, 240, 'm', 0], [0.06, 250, 'm', 0.5], [0.2, 330, 'i', 0.9], [0.55, 400, 'e', 1], [0.8, 340, 'a', 0.9], [1.05, 260, 'u', 0.6], [1.2, 230, 'u', 0]], p, scale: 1.05, breath: 0.2, vib: [6, 30], gain: 0.6 });
    return 1.4;
  }],
  cat_hiss: [0.15, (t, o, p) => {
    noise(o, t, { type: 'highpass', f: 2800 * p, gpts: [[0, 0], [0.04, 0.34], [0.7, 0.28], [0.8, 0]], am: [17, 0.3] });
    noise(o, t, { f: 5500 * p, q: 2, gpts: [[0, 0], [0.04, 0.28], [0.7, 0.24], [0.8, 0]] });
    noise(o, t + 0.78, { f: 1800, q: 1, a: 0.002, d: 0.06, v: 0.8 });
    return 0.9;
  }],
  wind: [0.2, (t, o, p) => { // short gust with a whistle in it
    noise(o, t, { buf: 'pink', fpts: [[0, 300 * p], [0.5, 900 * p], [1.2, 400 * p]], q: 1, gpts: [[0, 0], [0.45, 1.2], [1.2, 0]] });
    noise(o, t, { fpts: [[0, 900 * p], [0.5, 1500 * p], [1.2, 1000 * p]], q: 14, gpts: [[0, 0], [0.5, 1.5], [1.2, 0]] });
    return 1.3;
  }],

  // ----- the beach, the campout, the hammock -----
  gull_call: [0.4, (t, o, p) => { // Captain Squawk arrives: an enormous raspy "SQUAWK-awk-awk!"
    const sq = (s, f, len, g) => formant(o, s, {
      keys: [[0, f * 0.8, 'e', 0], [0.03, f, 'e', g], [len * 0.35, f * 1.18, 'a', g], [len * 0.8, f * 0.92, 'a', g * 0.8], [len, f * 0.72, 'o', 0]],
      p, scale: 1.25, breath: 0.3, growl: [52, 0.4], vib: [9, 25], gain: 0.8,
    });
    sq(t, 560, 0.42, 1);
    sq(t + 0.5, 530, 0.17, 0.8);
    sq(t + 0.73, 490, 0.21, 0.7);
    return 1.05;
  }],
  gull_screech: [0.15, (t, o, p) => { // rising "keeeEEE!" right before the dive
    formant(o, t, { keys: [[0, 620, 'e', 0], [0.04, 680, 'e', 0.7], [0.3, 980, 'i', 0.9], [0.45, 1250, 'i', 0.85], [0.52, 1300, 'i', 0]], p, scale: 1.35, breath: 0.35, growl: [60, 0.3], vib: [12, 35], gain: 0.45 });
    noise(o, t + 0.05, { fpts: [[0, 600 * p], [0.5, 2600 * p]], q: 1.4, gpts: [[0, 0], [0.35, 0.3], [0.5, 0]] }); // air rushing past
    return 0.6;
  }],
  raccoon_chitter: [0.3, (t, o, p) => { // Bandit arrives: an excited, chubby "chi-chi-chi-chi... chrrrr!"
    const keys = [[0, 700, 'i', 0]];
    let s = 0.02;
    for (let i = 0; i < 8; i++) {
      const f = (820 + 160 * Math.sin(i * 1.7) + i * 25) * rnd(0.95, 1.05);
      keys.push([s, f, 'i', 0.05], [s + 0.018, f * 1.12, 'e', 0.85], [s + 0.045, f * 0.96, 'i', 0.5], [s + 0.062, f * 0.9, 'i', 0.03]);
      s += 0.075 + (i % 3 === 2 ? 0.03 : 0);
    }
    formant(o, t, { keys, p, scale: 1.5, breath: 0.25, gain: 0.6 });
    formant(o, t + s + 0.02, { keys: [[0, 760, 'e', 0], [0.04, 820, 'e', 0.75], [0.3, 900, 'i', 0.65], [0.42, 700, 'u', 0]], p, scale: 1.5, breath: 0.25, growl: [26, 0.9], gain: 0.6 }); // the trill
    return s + 0.5;
  }],
  raccoon_hiss: [0.12, (t, o, p) => { // huffy "hff... HFFF" chuff before the pounce
    noise(o, t, { buf: 'pink', f: 1400 * p, q: 0.9, gpts: [[0, 0], [0.012, 1.2], [0.1, 0.35], [0.16, 0]] });
    noise(o, t + 0.2, { buf: 'pink', fpts: [[0, 1800 * p], [0.3, 900 * p]], q: 0.8, gpts: [[0, 0], [0.012, 1.9], [0.12, 0.8], [0.3, 0]] });
    noise(o, t + 0.2, { type: 'highpass', f: 3500 * p, gpts: [[0, 0], [0.01, 0.3], [0.2, 0]] });
    tone(o, t + 0.2, { type: 'sawtooth', f: 150 * p, f1: 95 * p, gpts: [[0, 0], [0.02, 0.2], [0.22, 0]], lp: 700 }); // a little chest rumble
    return 0.55;
  }],
  washed_away: [0.3, (t, o, p) => { // a wave rushes in and drags off... then a little "blub-blub" out at sea
    noise(o, t, { buf: 'pink', type: 'lowpass', fpts: [[0, 300 * p], [0.55, 2200 * p], [0.9, 1200 * p], [1.3, 400 * p]], q: 0.8, gpts: [[0, 0], [0.5, 0.72], [0.65, 0.88], [1.3, 0]] });
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 350, gpts: [[0, 0], [0.55, 0.65], [1.2, 0]] });   // the weight of the water
    noise(o, t + 0.45, { type: 'highpass', f: 2500 * p, gpts: [[0, 0], [0.15, 0.25], [0.8, 0]] }); // foam fizz
    for (const [dt, f] of [[1.02, 300], [1.17, 380], [1.27, 460]]) tone(o, t + dt, { f: f * p, f1: f * 2.4 * p, ft: 0.06, a: 0.004, d: 0.09, v: 0.35 });
    return 1.45;
  }],
  creak: [0.25, (t, o, p) => { // one slow hammock-rope "creeeak": stick-slip friction rung through woody resonances
    const dur = 0.85;
    const env = gainNode(0, o);
    pts(env.gain, t, [[0, 0], [0.12, 1], [0.5, 0.85], [0.72, 0.6], [dur, 0]]);
    const slip = ctx.createOscillator();
    slip.type = 'sawtooth';
    pts(slip.frequency, t, [[0, 38 * p], [0.25, 62 * p], [0.55, 48 * p], [dur, 30 * p]], true);
    lfo(slip.detune, t, dur, 7, 120);
    for (const [f, q, a] of [[620, 7, 2.4], [1350, 9, 1.3], [2600, 6, 0.45]]) {
      const b = biquad('bandpass', f * p, q);
      slip.connect(b); b.connect(gainNode(a, env));
    }
    slip.start(t); slip.stop(t + dur + 0.05);
    noise(o, t, { buf: 'brown', type: 'lowpass', f: 500, gpts: [[0, 0], [0.15, 0.15], [dur, 0]] }); // fibres rubbing
    return dur + 0.1;
  }],
  harmonica: [0.2, (t, o, p) => { // "hwaah": a bright two-note chord, a touch out of tune, scooped in with a wobble
    const dur = 0.55;
    const nasal = biquad('peaking', 1500 * p, 1.4, 7), lp = biquad('lowpass', 4500 * p, 0.7), env = gainNode(1, o);
    nasal.connect(lp); lp.connect(env);
    lfo(env.gain, t, dur, 5.5, 0.15); // hand-cupping wah
    for (const [f, det] of [[523.25, 16], [659.25, -12]]) { // C5 + E5
      for (const [type, v] of [['sawtooth', 0.09], ['square', 0.05]]) {
        tone(nasal, t, { type, det, fpts: [[0, f * p * 0.95], [0.07, f * p], [dur, f * p * 1.004]], gpts: [[0, 0], [0.035, v], [dur * 0.7, v * 0.85], [dur, 0]] });
      }
    }
    noise(o, t, { buf: 'pink', f: 1800, q: 0.8, gpts: [[0, 0], [0.03, 0.18], [0.12, 0.05], [dur, 0]] }); // breath
    return dur + 0.05;
  }],
  fire_pop: [0.12, (t, o, p) => { // a single campfire crackle POP and a couple of spitting embers
    const r = p * rnd(0.85, 1.15);
    noise(o, t, { f: 2600 * r, q: 0.9, a: 0.0005, d: 0.02, v: 0.8 });
    noise(o, t, { type: 'highpass', f: 5000, a: 0.0005, d: 0.008, v: 0.5 });
    tone(o, t, { f: 240 * r, f1: 80 * r, a: 0.001, d: 0.05, v: 0.35 });
    for (let i = 0; i < 3; i++) noise(o, t + 0.03 + Math.random() * 0.12, { f: rnd(1800, 4500) * r, q: 2, a: 0.0005, d: rnd(0.006, 0.014), v: rnd(0.2, 0.45) });
    return 0.22;
  }],
};

// ---------------------------------------------------------------------------
// Music: lookahead scheduler + procedural moods
// ---------------------------------------------------------------------------
const LOOKAHEAD = 0.15;      // seconds of notes scheduled ahead of the clock
const XFADE = 1.5;
let players = [];
let schedTimer = null;
let curMood = null;

/** Slow "warped tape" detune in cents: the music box is a little seasick. */
const warble = t => 10 * Math.sin(t * 0.83) + 5 * Math.sin(t * 2.71 + 1);

function sparse(len, map) {
  const a = new Array(len).fill(0);
  for (const k in map) a[k] = map[k];
  return a;
}

/** Soft detuned pad: one filter + one envelope shared by all oscillators. */
function pad(out, t, freqs, len, v, cutoff = 1100, type = 'triangle') {
  const g = ctx.createGain();
  pts(g.gain, t, [[0, 0], [Math.min(0.7, len * 0.3), v], [len, v * 0.75], [len + 0.9, 0]]);
  const f = biquad('lowpass', cutoff);
  f.connect(g); g.connect(out);
  for (const fr of freqs) {
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + len + 1);
    }
  }
}
function heart(out, t, v) { // lub-dub
  tone(out, t, { f: 64, f1: 38, a: 0.004, d: 0.14, v });
  tone(out, t, { type: 'triangle', f: 120, f1: 50, a: 0.003, d: 0.07, v: v * 0.4 });
  tone(out, t + 0.16, { f: 58, f1: 36, a: 0.004, d: 0.16, v: v * 0.7 });
  tone(out, t + 0.16, { type: 'triangle', f: 110, f1: 45, a: 0.003, d: 0.07, v: v * 0.28 });
}
const click = (out, t, f, v) => noise(out, t, { f, q: 5, a: 0.001, d: 0.018, v });
const hat = (out, t, v) => noise(out, t, { type: 'highpass', f: 7000, a: 0.001, d: 0.03, v });
const brush = (out, t, v) => noise(out, t, { f: 2800, q: 0.8, a: 0.003, d: 0.1, v });
function stab(out, t, freqs, v) {
  for (const f of freqs) tone(out, t, { type: 'triangle', f, a: 0.004, d: 0.18, v, lp: 2200 });
}

/** Oom-pah-pah lullaby waltz (menu, results): 3/4, eighth-note steps, 8 bars. */
function waltz(w) {
  return {
    bpm: w.bpm, spb: 2, len: 48, lp: w.lp, vol: w.vol,
    play(pl, s, t, d) {
      const o = pl.in, bar = (s / 6) | 0, sb = s % 6;
      let m = w.mel[s];
      if (m) {
        if (w.sour && s === 42 && pl.loop % 2 === 1) m -= 0.45; // every other loop the music box runs down
        mbox(o, t, mtof(m), 0.13, 1.8, warble(t));
      }
      if (sb === 0) {
        pluck(o, t, mtof(w.bass[bar]), 0.26, d * 3, 'triangle');
        pad(o, t, w.ch[bar].map(mtof), d * 5.5, 0.04, 900);
      }
      if (sb === 2 || sb === 4) for (const n of w.ch[bar]) pluck(o, t, mtof(n + 12), 0.035, 0.25, 'triangle');
    },
  };
}

const NIGHT_ROOTS = [38, 34, 43, 45, 38, 34, 40, 45];                                  // D Bb G A D Bb E A
const NIGHT_PADS = [[50, 57, 62, 65], [55, 58, 62], [50, 57, 62, 65], [52, 57, 61, 64]];   // 2-bar chords
const NIGHT_MEL = sparse(64, { 0: 86, 2: 81, 4: 89, 5: 88, 16: 84, 18: 81, 20: 88, 32: 86, 34: 81, 36: 89, 37: 88, 38: 86, 39: 85, 48: 82, 50: 81, 53: 80, 56: 81 });

const SHOP_CH = [[65, 69, 72], [65, 71, 74], [64, 67, 71], [61, 64, 67], [65, 69, 72], [62, 65, 68], [61, 64, 67], [62, 65, 69]];
const SHOP_BASS = [[38, 41, 45, 44], [43, 47, 50, 49], [48, 52, 55, 46], [45, 49, 52, 39], [38, 41, 45, 47], [46, 50, 53, 44], [45, 49, 52, 37], [38, 45, 38, 37]];
const SHOP_MEL = [
  69, 0, 72, 0, 74, 73, 74, 0, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 76, 0, 79, 0, 0, 78, 79, 0, 76, 0, 73, 0, 0, 0,
  69, 0, 72, 0, 74, 73, 74, 0, 77, 0, 74, 0, 70, 0, 68, 0, 69, 0, 73, 0, 76, 0, 79, 0, 74, 0, 0, 0, 0, 0, 0, 0,
];

/**
 * Each mood: bpm, spb (steps per beat), len (steps per loop), lp (player lowpass),
 * iLp (lowpass opens with intensity), vol (mix trim), play(player, step, time, stepDur).
 */
const MOODS = {
  // A-minor music-box waltz: cozy, slightly wrong.
  menu: waltz({
    bpm: 76, lp: 4500, vol: 0.85, sour: true,
    mel: [88, 0, 84, 0, 81, 0, 84, 0, 81, 0, 77, 0, 79, 0, 84, 0, 88, 86, 83, 0, 0, 0, 80, 0,
      88, 0, 84, 0, 81, 0, 86, 0, 89, 0, 86, 84, 83, 0, 80, 0, 76, 0, 81, 0, 0, 0, 0, 0],
    ch: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [56, 59, 64], [57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]],
    bass: [45, 41, 48, 40, 45, 50, 40, 45],
  }),

  // Warm C-major waltz for the scoreboard.
  results: waltz({
    bpm: 92, lp: 7000, vol: 0.85,
    mel: [76, 0, 79, 0, 84, 0, 83, 0, 81, 0, 76, 0, 77, 0, 81, 0, 84, 0, 83, 0, 0, 0, 79, 0,
      76, 0, 79, 0, 84, 0, 86, 0, 83, 0, 79, 0, 81, 0, 84, 0, 83, 79, 84, 0, 0, 0, 0, 0],
    ch: [[55, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62], [55, 60, 64], [55, 59, 64], [53, 57, 60], [55, 60, 64]],
    bass: [48, 45, 41, 43, 48, 40, 41, 48],
  }),

  // Tiptoe pizzicato in D minor. Intensity adds ticking, a heartbeat, a sour tremolo and opens the filter.
  night: {
    bpm: 92, spb: 2, len: 64, lp: 1500, iLp: true, vol: 0.8,
    play(pl, s, t, d) {
      const o = pl.in, bar = s >> 3, sb = s & 7, I = intensity, r = NIGHT_ROOTS[bar];
      const pat = bar & 1 ? [0, null, 7, 8, 7, null, 3, null] : [0, null, 7, null, 12, null, 7, 6];
      if (pat[sb] != null) pluck(o, t, mtof(r + pat[sb]), (sb === 0 ? 0.3 : 0.22) + 0.08 * I, 0.22);
      if (sb === 0 && !(bar & 1)) pad(o, t, NIGHT_PADS[bar >> 1].map(mtof), d * 15, 0.035, 900);
      if (NIGHT_MEL[s]) mbox(o, t, mtof(NIGHT_MEL[s]), 0.11, 2.2, warble(t) * (1 + 2 * I));
      // --- anxiety layer: everything scales smoothly with intensity, so nothing pops in ---
      if (I > 0.2 && !(sb & 1)) click(o, t, sb & 2 ? 2600 : 3200, 1.2 * ss(0.2, 0.6, I));
      if (I > 0.7 && (sb & 1)) click(o, t, 2400, 0.8 * ss(0.7, 0.95, I));
      if (I > 0.35 && (sb === 0 || (I > 0.7 && sb === 4))) heart(o, t, 0.55 * ss(0.35, 0.85, I));
      if (I > 0.55 && sb === 0) {
        const v = 0.035 * ss(0.55, 1, I);
        for (const m of [86, 87]) tone(o, t, { f: mtof(m), gpts: [[0, 0], [d * 2, v], [d * 7, v], [d * 8, 0]], am: [9, 0.9] });
      }
    },
  },

  // Gerald is stirring: chromatic pulsing ostinato, heartbeat, minor-second music-box jabs.
  tense: {
    bpm: 128, spb: 2, len: 32, lp: 2200, iLp: true, vol: 0.8,
    play(pl, s, t, d) {
      const o = pl.in, bar = s >> 3, sb = s & 7, r = [38, 39, 38, 37][bar];
      tone(o, t, { type: 'sawtooth', f: mtof(r + (sb === 6 ? 12 : 0)), a: 0.004, d: d * 0.9, v: sb & 1 ? 0.1 : 0.17, lp: [[0, 1000], [d, 180]] });
      if (sb === 0) pad(o, t, [r + 24, r + 27, r + 30].map(mtof), d * 7.5, 0.03, 1500, 'sawtooth');
      if (sb === 0 || sb === 4) heart(o, t, 0.4);
      if (sb === 3 || sb === 7) mbox(o, t, mtof(86 + (bar & 1)), 0.07, 0.9, warble(t) * 3);
      click(o, t, 3000, sb & 1 ? 0.5 : 0.8);
    },
  },

  // He's awake. FREEZE. Low tritone drone, a racing heart, a clock that won't stop ticking.
  awake: {
    bpm: 58, spb: 2, len: 32, lp: 2600, vol: 0.8,
    play(pl, s, t, d) {
      const o = pl.in, sb = s & 7;
      if (sb === 0) pad(o, t, [38, 44, 50, 56].map(mtof), d * 8, 0.06, 420, 'sawtooth');
      if (!(sb & 1)) heart(o, t, 0.5);
      click(o, t, sb & 1 ? 2500 : 3200, sb & 1 ? 0.7 : 1.1);
      if (s === 12) mbox(o, t, mtof(81), 0.08, 3, -35);
      if (s === 28) mbox(o, t, mtof(80), 0.08, 3, -50);
      if (s === 6 || s === 22) tone(o, t, { f: mtof(98), gpts: [[0, 0], [d * 2, 0.025], [d * 4, 0]], vib: [5, 30] });
    },
  },

  // The pawn-shop rat's sleazy swing: walking pizz bass, backbeat stabs + brush, music-box melody.
  shop: {
    bpm: 112, spb: 2, len: 64, lp: 6500, vol: 1,
    play(pl, s, t, d) {
      const o = pl.in, bar = s >> 3, sb = s & 7;
      if (sb & 1) t += d * 0.32; // swing the off-beats
      if (!(sb & 1)) pluck(o, t, mtof(SHOP_BASS[bar][sb >> 1]), 0.3, 0.32);
      if (sb === 2 || sb === 6) { stab(o, t, SHOP_CH[bar].map(mtof), 0.05); brush(o, t, 0.35); }
      if (sb === 7 && (bar & 1)) stab(o, t, SHOP_CH[(bar + 1) & 7].map(mtof), 0.03);
      hat(o, t, sb & 1 ? 0.12 : 0.2);
      if (SHOP_MEL[s]) mbox(o, t, mtof(SHOP_MEL[s] + 12), 0.1, 1.1, warble(t) * 0.6);
    },
  },
};

function moodCutoff(def) {
  return def.iLp ? def.lp * (1 + 5 * Math.pow(intensity, 1.5)) : def.lp;
}

function makePlayer(mood) {
  const def = MOODS[mood], now = ctx.currentTime;
  const out = gainNode(0, G.musicBus);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(def.vol || 1, now + XFADE);
  const flt = biquad('lowpass', moodCutoff(def), 0.5);
  flt.connect(out);
  return { mood, def, out, flt, in: flt, step: 0, loop: 0, next: now + 0.06, stopAt: 0 };
}

/**
 * Cancel future automation but keep the parameter where it is right now.
 * (Not cancelAndHoldAtTime: Chrome holds the wrong value once the last ramp has finished, e.g. ~0.6
 * instead of 1, so every fade-out started with a jump. `.value` is the live computed value.)
 */
function holdAt(param, now) {
  const v = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(v, now);
}

function schedule() {
  try {
    if (!ctx) return;
    const now = ctx.currentTime;
    // background tabs throttle timers to ~1 Hz: look much further ahead there
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.3 : LOOKAHEAD;
    players = players.filter(pl => {
      if (pl.stopAt && now > pl.stopAt) { try { pl.out.disconnect(); } catch (e) { /* gone */ } return false; }
      return true;
    });
    for (const pl of players) {
      const d = 60 / pl.def.bpm / pl.def.spb;
      if (pl.next < now - 0.3) pl.next = now + 0.05; // we were asleep: skip ahead instead of bursting notes
      while (pl.next < now + ahead) {
        if (!pl.stopAt || pl.next < pl.stopAt) {
          pl.loop = Math.floor(pl.step / pl.def.len);
          try { pl.def.play(pl, pl.step % pl.def.len, pl.next, d); } catch (e) { /* one bad note never kills the loop */ }
        }
        pl.next += d;
        pl.step++;
      }
    }
    if (!players.length && schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  } catch (e) { /* never throw from a timer */ }
}

// ---------------------------------------------------------------------------
// Snore bed: inhale = airy nasal hiss, exhale = rumbling buzz with a floppy flutter
// ---------------------------------------------------------------------------
let snore = null;
let snoreQuietSince = 0;

function buildSnore() {
  const now = ctx.currentTime;
  const out = gainNode(0, G.snoreBus);
  const pink = noiseSrc('pink', now, now + 1e6);
  const brown = noiseSrc('brown', now, now + 1e6);
  // inhale: a nasal band + a little high air
  const nasal = biquad('bandpass', 700, 2.5);
  const inG = gainNode(0, out);
  pink.connect(nasal); nasal.connect(inG);
  const air = biquad('highpass', 2200);
  const airG = gainNode(0, out);
  pink.connect(air); air.connect(airG);
  // exhale: buzzing sawtooth + low noise, both through a fluttering "soft palate" gain
  const exG = gainNode(0, out);
  const flap = gainNode(0.55, exG);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 58;
  const oscLp = biquad('lowpass', 520, 2);
  osc.connect(oscLp); oscLp.connect(gainNode(0.9, flap));
  const nLp = biquad('lowpass', 380);
  brown.connect(nLp); nLp.connect(gainNode(0.9, flap));
  const flapLfo = ctx.createOscillator();
  flapLfo.frequency.value = 30;
  flapLfo.connect(gainNode(0.45, flap.gain));
  const drift = ctx.createOscillator(); // slow unsteady pitch, like a real sleeper
  drift.frequency.value = 0.37;
  drift.connect(gainNode(28, osc.detune));
  osc.start(now); flapLfo.start(now); drift.start(now);
  return { out, inG, airG, exG, nasal, osc, oscLp, flapLfo, srcs: [pink, brown, osc, flapLfo, drift] };
}

function killSnore() {
  if (!snore) return;
  const s = snore;
  snore = null;
  for (const n of s.srcs) { try { n.stop(); } catch (e) { /* already stopped */ } }
  try { s.out.disconnect(); } catch (e) { /* gone */ }
}

// ---------------------------------------------------------------------------
// Map ambience: one quiet looping bed per map (beach waves, campfire, night garden).
// Each bed is built once from looping noise + a few oscillators. Everything that moves is
// AudioParam automation, scheduled a few seconds ahead by a 1 Hz timer (no per-frame JS).
// ---------------------------------------------------------------------------
const AMB_FADE = 1.5;
let amb = null;          // the bed that's playing (or fading in)
let ambGone = [];        // beds fading out, freed once silent
let ambTimer = null;
let ambWant = null;      // requested bed, remembered until the context exists

function bedSrc(bed, kind) {
  const now = ctx.currentTime, s = noiseSrc(kind, now, now + 86400);
  bed.srcs.push(s);
  return s;
}
function bedOsc(bed, f, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.start(ctx.currentTime);
  bed.srcs.push(o);
  return o;
}
/** Free-running LFO: wobbles `param` by +-depth around its value. */
function bedLfo(bed, param, rate, depth) { bedOsc(bed, rate).connect(gainNode(depth, param)); }
function panTo(node, pan, dest) {
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(dest); }
  else node.connect(dest);
}
/** A recurring event: run(t) schedules one at time t and returns when the next is due. */
function job(bed, first, run) { bed.jobs.push({ next: ctx.currentTime + first, run }); }
/** A short percussive spike on a gain param (crackles, pops). */
function spike(param, t, v, dec) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(v, t + 0.0008);
  param.setTargetAtTime(0, t + 0.0008, dec / 3);
}

/** A cricket: a high sine, pulsed by a fast LFO, gated into little 2-4 pulse chirps. */
function cricket(bed, f, rate, v, pan) {
  const pulse = gainNode(0.5, null);
  bedOsc(bed, f).connect(pulse);
  bedOsc(bed, rate).connect(gainNode(0.5, pulse.gain));
  const gate = gainNode(0, null);
  pulse.connect(gate);
  panTo(gate, pan, bed.out);
  const g = gate.gain;
  job(bed, rnd(0.1, 1.5), t => {
    const on = (2 + ((Math.random() * 3) | 0)) / rate, lv = v * rnd(0.6, 1);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(lv, t + 0.012);
    g.setValueAtTime(lv, t + on - 0.012); g.linearRampToValueAtTime(0, t + on);
    return t + on + (Math.random() < 0.12 ? rnd(1.5, 4) : rnd(0.22, 0.55));
  });
}

const BEDS = {
  beach(bed) {
    // a soft wind: two decorrelated pink noises, slowly breathing, spread wide
    for (const pan of [-0.6, 0.6]) {
      const bp = biquad('bandpass', 450, 0.6), g = gainNode(0.08, null);
      bedSrc(bed, 'pink').connect(bp); bp.connect(g); panTo(g, pan, bed.out);
      bedLfo(bed, g.gain, rnd(0.05, 0.09), 0.035);
      bedLfo(bed, bp.frequency, rnd(0.04, 0.07), 150);
    }
    // waves: a low wash that swells in, breaks, and drags back out with a fizz of foam
    const W0 = 0.03, wLp = biquad('lowpass', 240, 0.5), wG = gainNode(W0, bed.out);
    bedSrc(bed, 'brown').connect(gainNode(1, wLp));
    bedSrc(bed, 'pink').connect(gainNode(0.5, wLp));
    wLp.connect(wG);
    const fHp = biquad('highpass', 3000, 0.5), fG = gainNode(0, null);
    bedSrc(bed, 'white').connect(fHp); fHp.connect(fG); panTo(fG, 0.2, bed.out);
    job(bed, rnd(0.3, 1.5), t => {
      const period = rnd(6, 9.5), rise = rnd(2, 3), back = period - rise - rnd(0.4, 1.2), A = rnd(0.5, 1);
      const g = wG.gain, f = wLp.frequency, fz = fG.gain;
      g.setValueAtTime(W0, t); g.linearRampToValueAtTime(W0 + A * 0.27, t + rise * 0.8); g.linearRampToValueAtTime(W0 + A * 0.36, t + rise); g.linearRampToValueAtTime(W0, t + rise + back);
      f.setValueAtTime(240, t); f.exponentialRampToValueAtTime(500 + 1100 * A, t + rise); f.exponentialRampToValueAtTime(240, t + rise + back);
      fz.setValueAtTime(0, t + rise * 0.75); fz.linearRampToValueAtTime(0.04 * A, t + rise + 0.25);
      fz.linearRampToValueAtTime(0.016 * A, t + rise + back * 0.55); fz.linearRampToValueAtTime(0, t + rise + back);
      return t + period;
    });
  },
  camp(bed) {
    // the fire's low roar and soft hiss, flickering
    const roarLp = biquad('lowpass', 280, 0.6), roar = gainNode(0.15, bed.out);
    bedSrc(bed, 'brown').connect(roarLp); roarLp.connect(roar);
    bedLfo(bed, roar.gain, 0.31, 0.04); bedLfo(bed, roar.gain, 1.7, 0.025);
    const hissBp = biquad('bandpass', 2600, 0.5), hiss = gainNode(0.018, bed.out);
    bedSrc(bed, 'pink').connect(hissBp); hissBp.connect(hiss);
    bedLfo(bed, hiss.gain, 0.53, 0.007);
    // crackles: one noise, one filter, one gain, spiked at random (in little clusters now and then)
    const cBp = biquad('bandpass', 3000, 1.2), cG = gainNode(0, null);
    bedSrc(bed, 'white').connect(cBp); cBp.connect(cG); panTo(cG, -0.15, bed.out);
    job(bed, 0.2, t => {
      const n = Math.random() < 0.3 ? 2 + ((Math.random() * 4) | 0) : 1;
      for (let i = 0; i < n; i++) {
        const dec = rnd(0.004, 0.014);
        cBp.frequency.setValueAtTime(rnd(1800, 6500), t);
        spike(cG.gain, t, rnd(0.1, 0.36), dec);
        t += dec + rnd(0.015, 0.07);
      }
      return t + 0.03 - Math.log(1 - Math.random()) * 0.35;
    });
    // pops: louder, lower, with a little thump under them
    const pBp = biquad('bandpass', 1200, 0.9), pG = gainNode(0, null), thLp = biquad('lowpass', 300), thG = gainNode(0, bed.out);
    bedSrc(bed, 'white').connect(pBp); pBp.connect(pG); panTo(pG, 0.1, bed.out);
    bedSrc(bed, 'brown').connect(thLp); thLp.connect(thG);
    job(bed, rnd(1, 3), t => {
      const dec = rnd(0.02, 0.045);
      pBp.frequency.setValueAtTime(rnd(800, 1800), t);
      spike(pG.gain, t, rnd(0.2, 0.4), dec);
      spike(thG.gain, t, rnd(0.25, 0.5), dec * 1.5);
      return t + rnd(1.2, 6);
    });
    cricket(bed, 4400, 34, 0.03, -0.55);
    cricket(bed, 4950, 41, 0.024, 0.6);
  },
  hammock(bed) {
    cricket(bed, 4150, 32, 0.055, -0.7);
    cricket(bed, 4700, 39, 0.045, 0.15);
    cricket(bed, 5300, 36, 0.035, 0.65);
    // a breeze in the leaves: a soft rush plus a fluttery rustle, both swelling in gusts
    const G0 = 0.3, gust = gainNode(G0, bed.out);
    const rBp = biquad('bandpass', 1500, 0.5);
    bedSrc(bed, 'pink').connect(rBp); rBp.connect(gainNode(0.15, gust));
    const lHp = biquad('highpass', 3800, 0.6), flutter = gainNode(0.5, null);
    bedSrc(bed, 'white').connect(lHp); lHp.connect(flutter); flutter.connect(gainNode(0.09, gust));
    bedLfo(bed, flutter.gain, 6.3, 0.25); bedLfo(bed, flutter.gain, 9.7, 0.2);
    job(bed, rnd(0.5, 2), t => {
      const up = rnd(1.2, 2.5), hold = rnd(0.3, 1.5), down = rnd(1.5, 3), A = rnd(0.4, 0.9), g = gust.gain;
      g.setValueAtTime(G0, t); g.linearRampToValueAtTime(G0 + A, t + up); g.setValueAtTime(G0 + A, t + up + hold); g.linearRampToValueAtTime(G0, t + up + hold + down);
      return t + up + hold + down + rnd(0.5, 5);
    });
    // now and then the hammock rope creaks (one reused stick-slip voice, silent in between)
    const slip = bedOsc(bed, 40, 'sawtooth'), cG = gainNode(0, null);
    for (const [f, q, a] of [[600, 7, 2], [1300, 9, 1]]) { const b = biquad('bandpass', f, q); slip.connect(b); b.connect(gainNode(a, cG)); }
    panTo(cG, -0.25, bed.out);
    const creakAt = (t, A) => {
      const d = rnd(0.6, 0.9), f0 = rnd(32, 40), fr = slip.frequency;
      fr.setValueAtTime(f0, t); fr.exponentialRampToValueAtTime(f0 * 1.6, t + d * 0.35); fr.exponentialRampToValueAtTime(f0 * 0.8, t + d);
      cG.gain.setValueAtTime(0, t); cG.gain.linearRampToValueAtTime(A, t + 0.1); cG.gain.linearRampToValueAtTime(A * 0.7, t + d * 0.7); cG.gain.linearRampToValueAtTime(0, t + d);
    };
    job(bed, rnd(3, 8), t => {
      creakAt(t, 0.12 * rnd(0.6, 1));
      if (Math.random() < 0.5) creakAt(t + rnd(1.6, 2.2), 0.12 * rnd(0.4, 0.7)); // ...and it swings back
      return t + rnd(10, 22);
    });
  },
};

function killBed(bed) {
  for (const s of bed.srcs) { try { s.stop(); } catch (e) { /* already stopped */ } }
  try { bed.out.disconnect(); } catch (e) { /* gone */ }
}

function makeBed(id) {
  const now = ctx.currentTime;
  const out = gainNode(0, G.ambBus);
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + AMB_FADE);
  const bed = { id, out, srcs: [], jobs: [], stopAt: 0 };
  try { BEDS[id](bed); } catch (e) { killBed(bed); return null; } // never leave half a bed running
  return bed;
}

function fadeBed(bed, to, now) {
  holdAt(bed.out.gain, now);
  bed.out.gain.linearRampToValueAtTime(to, now + AMB_FADE);
}

function ambSchedule() {
  try {
    if (!ctx) return;
    const now = ctx.currentTime;
    // background tabs throttle timers: schedule much further ahead there
    const until = now + (typeof document !== 'undefined' && document.hidden ? 12 : 4);
    ambGone = ambGone.filter(b => { if (now > b.stopAt) { killBed(b); return false; } return true; });
    if (amb) {
      for (const j of amb.jobs) {
        if (j.next < now) j.next = now + rnd(0.05, 0.3); // we were asleep: carry on from here
        for (let n = 0; j.next < until && n < 400; n++) j.next = Math.max(j.next + 0.002, j.run(j.next));
      }
    }
    if (!amb && !ambGone.length && ambTimer) { clearInterval(ambTimer); ambTimer = null; }
  } catch (e) { /* never throw from a timer */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create (once) / resume the AudioContext. Call from a user gesture; safe to call repeatedly. */
export function initAudio() {
  try {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
      try { buildGraph(); } catch (e) {
        try { ctx.close(); } catch (e2) { /* ignore */ }
        ctx = null; G = null;
        return;
      }
      if (pendingMood) startMusic(pendingMood);
      if (ambWant) setAmbience(ambWant);
      setIntensity(intensity);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      const pr = ctx.resume();
      if (pr && pr.catch) pr.catch(() => {});
    }
  } catch (e) { /* audio unavailable: stay silent */ }
}

/** The shared AudioContext (voice chat uses it), or null. */
export function audioCtx() {
  return ctx;
}

/** Set any of { master, sfx, music } (0..1). Not persisted. */
export function setVolumes(v) {
  try {
    const o = v || {};
    if (typeof o.master === 'number' && isFinite(o.master)) vols.master = clamp(o.master, 0, 1);
    if (typeof o.sfx === 'number' && isFinite(o.sfx)) vols.sfx = clamp(o.sfx, 0, 1);
    if (typeof o.music === 'number' && isFinite(o.music)) vols.music = clamp(o.music, 0, 1);
    if (!ctx || !G) return;
    const now = ctx.currentTime;
    G.master.gain.setTargetAtTime(vols.master * MASTER_TRIM, now, 0.03);
    G.sfxBus.gain.setTargetAtTime(vols.sfx, now, 0.03);
    G.sfxWet.gain.setTargetAtTime(vols.sfx, now, 0.03);
    G.snoreBus.gain.setTargetAtTime(vols.sfx, now, 0.03);
    G.musicBus.gain.setTargetAtTime(vols.music, now, 0.03);
  } catch (e) { /* ignore */ }
}

/** One-shot sound effect. Unknown names are ignored; spam is deduped and polyphony-capped. */
export function sfx(name, opts) {
  try {
    if (!ctx || !G || !hasOwn(SFX, name)) return;
    const { vol = 1, pan = 0, pitch = 1 } = opts || {};
    const v = clamp(Number(vol), 0, 1);
    if (!(v > 0.001)) return;
    const ms = wallMs();
    if (ms - (lastAt[name] || -1e9) < DEDUPE_MS) return;
    lastAt[name] = ms;
    const p = clamp(Number(pitch) || 1, 0.25, 4);
    const [rev, build] = SFX[name];
    playVoice((t, out) => build(t, out, p), v, num(Number(pan), 0), rev);
  } catch (e) { /* ignore */ }
}

/** Crossfade (~1.5 s) to a procedural music mood, or null to fade out. */
export function startMusic(mood) {
  try {
    if (mood != null && !hasOwn(MOODS, mood)) return;
    const m = mood || null;
    pendingMood = m;
    if (!ctx || !G) return;
    if (m === curMood && (m === null || players.some(pl => pl.mood === m && !pl.stopAt))) return;
    const now = ctx.currentTime;
    for (const pl of players) {
      if (pl.stopAt) continue;
      holdAt(pl.out.gain, now);
      pl.out.gain.linearRampToValueAtTime(0, now + XFADE);
      pl.stopAt = now + XFADE + 0.1;
    }
    curMood = m;
    if (m) players.push(makePlayer(m));
    if (!schedTimer && players.length) schedTimer = setInterval(schedule, 25);
    schedule();
  } catch (e) { /* ignore */ }
}

/**
 * Looping background ambience for wherever Gerald fell asleep: 'beach' | 'camp' | 'hammock'.
 * 'bedroom', null (or anything unknown) = silence. Crossfades over ~1.5 s, rides the sfx volume,
 * and can be called before initAudio (it starts once audio does). Repeat calls are cheap no-ops.
 */
export function setAmbience(id) {
  try {
    const want = typeof id === 'string' && hasOwn(BEDS, id) ? id : null;
    ambWant = want;
    if (!ctx || !G) return;
    if ((amb ? amb.id : null) === want) return;
    const now = ctx.currentTime;
    if (amb) { fadeBed(amb, 0, now); amb.stopAt = now + AMB_FADE + 0.25; ambGone.push(amb); amb = null; }
    if (want) {
      const i = ambGone.findIndex(b => b.id === want);
      if (i >= 0) { amb = ambGone.splice(i, 1)[0]; amb.stopAt = 0; fadeBed(amb, 1, now); } // still fading out: bring it back
      else amb = makeBed(want);
    }
    if (!ambTimer) ambTimer = setInterval(ambSchedule, 1000);
    ambSchedule();
  } catch (e) { /* ignore */ }
}

let lastIntensityApplied = -1;
/** Gerald's noise meter, 0..1. Night/tense music gets more anxious without restarting. */
export function setIntensity(x) {
  try {
    intensity = clamp(num(Number(x), 0), 0, 1);
    if (!ctx || Math.abs(intensity - lastIntensityApplied) < 0.005) return;
    lastIntensityApplied = intensity;
    const now = ctx.currentTime;
    for (const pl of players) {
      if (pl.def.iLp && !pl.stopAt) pl.flt.frequency.setTargetAtTime(moodCutoff(pl.def), now, 0.35);
    }
  } catch (e) { /* ignore */ }
}

/**
 * Continuous giant snore, call every frame.
 * level 0..1 (0 = silent); phase 0..1 (0-0.5 inhale, 0.5-1 exhale).
 */
export function setSnore(level, phase) {
  try {
    if (!ctx || !G) return;
    const lv = clamp(num(Number(level), 0), 0, 1);
    const ph = ((num(Number(phase), 0) % 1) + 1) % 1;
    const now = ctx.currentTime;
    if (lv <= 0.001) {
      if (snore) {
        snore.out.gain.setTargetAtTime(0, now, 0.08);
        if (!snoreQuietSince) snoreQuietSince = now;
        else if (now - snoreQuietSince > 3) killSnore(); // free the CPU while Gerald is quiet
      }
      return;
    }
    snoreQuietSince = 0;
    if (!snore) snore = buildSnore();
    const s = snore, tc = 0.04;
    const set = (param, val) => param.setTargetAtTime(val, now, tc);
    const inh = ph < 0.5 ? ph / 0.5 : 0;           // progress through the inhale
    const exh = ph >= 0.5 ? (ph - 0.5) / 0.5 : 0;  // progress through the exhale
    // inhale swells and peaks late; exhale hits early then trails off. Both are 0 at the seams.
    const inEnv = ph < 0.5 ? Math.sin(Math.PI * Math.pow(inh, 1.6)) : 0;
    const exEnv = ph >= 0.5 ? Math.pow(Math.sin(Math.PI * Math.pow(exh, 0.6)), 1.2) : 0;
    set(s.inG.gain, inEnv * 2.2);
    set(s.airG.gain, inEnv * 0.25);
    set(s.nasal.frequency, 650 + 1200 * inh);
    set(s.exG.gain, exEnv * 0.9);
    set(s.osc.frequency, 60 - 16 * exh);      // pitch sinks as his lungs empty
    set(s.flapLfo.frequency, 31 - 9 * exh);   // the flutter slows down too
    set(s.oscLp.frequency, 520 - 240 * exh);
    set(s.out.gain, lv * 0.55);
  } catch (e) { /* ignore */ }
}

/** Seeded RNG so the same words always produce the same babble. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  let a = h | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let curMumble = null;
/** Gerald sleep-talking: deep, slow, wobbly babble, one syllable per ~3 chars (max ~4 s). */
export function mumble(text, opts) {
  try {
    if (!ctx || !G) return;
    const { vol = 1 } = opts || {};
    const v = clamp(Number(vol), 0, 1);
    if (!(v > 0.001)) return;
    const str = String(text == null ? '' : text).replace(/\s+/g, ' ').trim() || 'hmm';
    const rng = seeded(str);
    const n = clamp(Math.ceil(str.length / 3), 1, 11);
    const durs = [];
    for (let i = 0; i < n; i++) durs.push(0.34 * (0.75 + rng() * 0.5));
    const total = durs.reduce((x, y) => x + y, 0), fit = Math.min(1, 3.75 / total);
    const base = 72 * (0.92 + rng() * 0.16);
    const keys = [[0, base * 0.95, 'm', 0]];
    let time = 0.02;
    for (let i = 0; i < n; i++) {
      const dur = durs[i] * fit;
      const chunk = str.slice(i * 3, i * 3 + 3).toLowerCase();
      const vm = chunk.match(/[aeiouy]/);
      const vow = vm ? (vm[0] === 'y' ? 'i' : vm[0]) : (rng() < 0.5 ? 'u' : 'o'); // babble follows the text's vowels
      const decl = 1 - 0.18 * (i / Math.max(1, n - 1));                             // pitch sinks over the phrase
      const f = base * decl * (0.85 + rng() * 0.35) * (i === n - 1 ? 0.85 : 1);
      const closed = rng() < 0.6;                                                     // "mm-b" vs "wuh-uh" joins
      keys.push([time + Math.min(0.06, dur * 0.25), f, vow, 0.9 + rng() * 0.2]);
      keys.push([time + dur * 0.6, f * (0.94 + rng() * 0.12), vow, 0.8]);
      keys.push([time + dur * 0.92, f * 0.93, closed ? 'm' : 'u', closed ? 0.12 : 0.4]);
      time += dur;
    }
    keys.push([time + 0.15, base * 0.7, 'm', 0]);
    const now = ctx.currentTime;
    if (curMumble && now < curMumble.end) curMumble.g.gain.setTargetAtTime(0, now, 0.04); // one Gerald at a time
    const vo = playVoice((t, out) => formant(out, t, { keys, scale: 0.72, breath: 0.12, vib: [4.2, 45], body: 0.25, gain: 0.8, lp: 2000 }).end, v, 0, 0.45);
    if (vo) curMumble = vo;
  } catch (e) { /* ignore */ }
}

/** Temporarily duck the music by `amount` (0..1); recovers over ~1 s. */
export function duckMusic(amount) {
  try {
    if (!ctx || !G) return;
    const a = clamp(num(Number(amount), 0), 0, 1);
    const g = G.duck.gain, now = ctx.currentTime;
    holdAt(g, now);
    g.linearRampToValueAtTime(1 - a, now + 0.06);
    g.setTargetAtTime(1, now + 0.35, 0.22);
  } catch (e) { /* ignore */ }
}
