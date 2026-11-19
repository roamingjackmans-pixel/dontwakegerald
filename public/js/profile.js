// Your save: name, looks, coins, XP, unlocks, settings and friends. Lives in this browser's localStorage.
import { HATS, COLORS, EYES, EMOTES } from './cosmetics.js';

// ?slot=2 in the address uses a separate save, so two tabs on one computer can be two players (for testing)
const SLOT = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('slot') || '').replace(/[^0-9a-z]/gi, '').slice(0, 8) : '';
const KEY = 'dontwakegerald.profile.v1' + (SLOT ? '.' + SLOT : '');
let P = null;

function rid(n = 16) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); }
const freeIds = list => list.filter(x => !x.price || x.price <= 0).map(x => x.id);

function defaults() {
  return {
    v: 1, pid: rid(), uid: rid(), name: '', coins: 150, xp: 0,
    cos: { hat: 'none', color: (COLORS[0] || {}).id || 'red', eyes: 'normal' },
    owned: { hats: freeIds(HATS), colors: freeIds(COLORS), eyes: freeIds(EYES), emotes: freeIds(EMOTES) },
    emotes: [],
    settings: { master: 0.85, sfx: 0.9, music: 0.55, sens: 1, padSens: 1, invertY: false, fov: 70, quality: 'high', voice: true, micMode: 'open', micGate: 0.1, showHelp: true },
    friendCode: '', friends: [], requests: [], recent: [], ignored: [], mailOut: [], mailGone: [],
    stats: { games: 0, wins: 0, nights: 0, cash: 0 },
    lastMods: null, lastPool: null, created: Date.now(),
  };
}
export function profile() {
  if (P) return P;
  try { P = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { P = null; }
  const d = defaults();
  if (!P || typeof P !== 'object') P = d;
  // fill in anything new
  for (const k of Object.keys(d)) if (P[k] === undefined) P[k] = d[k];
  P.settings = { ...d.settings, ...P.settings };
  P.owned = { ...d.owned, ...P.owned };
  for (const k of Object.keys(d.owned)) P.owned[k] = [...new Set([...(P.owned[k] || []), ...d.owned[k]])];
  if (!P.emotes || !P.emotes.length) P.emotes = P.owned.emotes.slice(0, 8);
  return P;
}
let saveT = 0;
export function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { } }, 50);
}
export function saveNow() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { } }
export function exportProfile() { return JSON.stringify(profile()); }
export function importProfile(json) {
  const o = JSON.parse(json);
  if (!o || typeof o !== 'object' || !o.pid) throw new Error('That save looks broken');
  P = o; profile(); saveNow();
}

export function levelOf(xp) { return Math.floor(Math.sqrt(Math.max(0, xp) / 120)) + 1; }
export function xpFor(level) { return 120 * (level - 1) * (level - 1); }
export function owns(kind, id) { return profile().owned[kind]?.includes(id); }
export function buyCos(kind, item) {
  const p = profile();
  if (owns(kind, item.id)) return { ok: true };
  if ((item.level || 1) > levelOf(p.xp)) return { ok: false, msg: `Unlocks at level ${item.level}` };
  if (p.coins < item.price) return { ok: false, msg: 'Not enough coins' };
  p.coins -= item.price;
  p.owned[kind].push(item.id);
  save();
  return { ok: true, bought: true };
}
/** after a match: coins and XP for how you did */
export function reward({ place, players, cash, awards, nights }) {
  const p = profile();
  const before = levelOf(p.xp);
  const coins = Math.round(40 + nights * 15 + Math.max(0, players - place) * 25 + (place === 1 ? 120 : 0) + cash / 25 + awards * 15);
  const xp = Math.round(60 + nights * 30 + (place === 1 ? 100 : place <= 3 ? 40 : 0) + awards * 20);
  p.coins += coins; p.xp += xp;
  p.stats.games++; if (place === 1) p.stats.wins++; p.stats.nights += nights; p.stats.cash += cash;
  save();
  return { coins, xp, levelUp: levelOf(p.xp) > before, level: levelOf(p.xp) };
}
