// Menus and overlays (DOM): title, name, join, friends, wardrobe, settings, how-to-play, the lobby panel, the shop,
// night results, the final podium, pause, invites and toasts. Everything is reachable with a controller: the D-pad
// or left stick moves the focus, A presses, B goes back, LB/RB switch tabs.
import { profile, save, levelOf, xpFor, owns, buyCos, reward } from './profile.js';
import { HATS, COLORS, EYES, EMOTES, colorHex } from './cosmetics.js';
import { MODS, MOD_DEFAULTS, PRESETS, DREAMS, DREAM_IDS, ITEMS, ITEM_IDS, AWARDS, RAT_LINES, LOOT, GAME } from '../shared/data.js';
import { PH } from '../shared/sim.js';
import { input, glyph } from './input.js';
import * as audio from './audio.js';
import * as F from './friends.js';
import { cleanCode } from './net.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = c => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
const NAME_A = ['Sneaky', 'Tiny', 'Wobbly', 'Sir', 'Lady', 'Captain', 'Little', 'Grumbly', 'Sleepy', 'Fuzzy', 'Crumby', 'Snorty'];
const NAME_B = ['Nib', 'Pip', 'Button', 'Crumb', 'Thimble', 'Bean', 'Lint', 'Sprinkle', 'Mumble', 'Pocket', 'Biscuit', 'Wiggle'];
export const randomName = () => NAME_A[(Math.random() * NAME_A.length) | 0] + ' ' + NAME_B[(Math.random() * NAME_B.length) | 0];

// which way a click on a ◀ value ▶ control goes
function clickDir(e, c) {
  const a = e.target.closest && e.target.closest('[data-d]');
  if (a) return +a.dataset.d;
  if (!e.detail) return 1;   // keyboard Enter or controller A
  const r = c.getBoundingClientRect();
  return e.clientX < r.left + r.width / 2 ? -1 : 1;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.menu = $('#menu');
    this.overlay = $('#overlay');
    this.toastEl = $('#toast');
    this.screen = null;
    this.stack = [];
    this.lobbyOpen = true;
    this.over = null;     // current overlay: 'shop' | 'results' | 'final' | 'pause' | 'lobby' | null
    input.on('nav', d => this.nav(d));
    input.on('confirm', () => this.confirm());
    input.on('back', () => this.back());
    input.on('pause', () => this.pauseToggle());
    input.on('tab', d => this.tab(d));
    input.on('lock', locked => { if (!locked && this.app.game && !this.over && this.app.game.sim.phase !== PH.LOBBY && !document.hidden) this.openPause(); });
    F.onFriends('change', () => { if (this.screen === 'friends') this.renderFriends(); if (this.over === 'lobby') this.renderLobbyFriends(); this.badge(); });
    F.onFriends('invite', inv => this.invitePopup(inv));
    F.onFriends('invite-gone', inv => { if (this.inviteEl && this.inviteEl.inv === inv) { this.inviteEl.remove(); this.inviteEl = null; } });
    F.onFriends('request', r => { this.toast(`👋 ${r.name} (${r.code}) wants to be friends`); audio.sfx('join'); this.badge(); });
    F.onFriends('accepted', r => this.toast(`🤝 ${r.name} added you back!`));
    F.onFriends('codechange', c => this.toast(`Your friend code is now ${c.to} (someone else had ${c.from})`));
    document.addEventListener('click', e => { const b = e.target.closest('button, .cycler, .chip'); if (b && !b.disabled) audio.sfx('ui_click'); }, true);
    // keep keyboard focus visible for controller users
    document.addEventListener('focusin', e => { if (e.target.scrollIntoView && this.navving) e.target.scrollIntoView({ block: 'nearest' }); });
  }

  // ================================================================ focus navigation
  scope() {
    if (this.popupScope && document.body.contains(this.popupScope)) return this.popupScope;
    if (this.over && this.overlay.firstElementChild) return this.overlay;
    if (this.menu.style.display !== 'none') return this.menu;
    return null;
  }
  focusables(root = this.scope()) {
    if (!root) return [];
    return $$('button, input, select, [data-nav], .cycler, .chip', root).filter(e => !e.disabled && e.offsetParent !== null && !e.closest('[hidden]'));
  }
  nav(dir) {
    const root = this.scope();
    if (!root) return;
    const items = this.focusables(root);
    if (!items.length) return;
    let cur = document.activeElement;
    // left/right on a slider or a cycler changes it instead of moving
    if (cur && items.includes(cur) && (dir === 'left' || dir === 'right')) {
      if (cur.type === 'range') { const step = (+cur.max - +cur.min) / 20; cur.value = Math.max(+cur.min, Math.min(+cur.max, +cur.value + (dir === 'right' ? step : -step))); cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); return; }
      if (cur.classList.contains('cycler')) { cur.dispatchEvent(new CustomEvent('cycle', { detail: dir === 'right' ? 1 : -1 })); audio.sfx('ui_move'); return; }
    }
    this.navving = true;
    if (!cur || !items.includes(cur)) { items[0].focus(); audio.sfx('ui_move'); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) { best.focus(); audio.sfx('ui_move'); }
  }
  confirm() {
    const el = document.activeElement;
    if (!el || !this.scope() || !this.scope().contains(el)) { this.nav('down'); return; }
    if (el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox') { el.blur(); return; }
    el.click();
  }
  back() {
    if (this.popupScope) { const p = this.popupScope; this.popupScope = null; p.remove(); return; }
    if (this.over === 'pause') return this.closePause();
    if (this.over === 'lobby' && this.app.game) { this.lobbyOpen = false; this.renderOverlay(); this.app.lockIfPlaying(); return; }
    if (this.over) return;
    // a menu opened from the pause menu goes back to the game
    if (this.screen && this.app.game && (!this.stack.length || this.menu.classList.contains('ingame'))) { audio.sfx('ui_back'); this.hideMenu(); this.stack = []; this.openPause(); return; }
    if (this.stack.length) { audio.sfx('ui_back'); this.show(this.stack.pop(), true); }
  }
  tab(d) { const tabs = $$('.tabs button', this.scope() || document); if (!tabs.length) return; const i = tabs.findIndex(t => t.classList.contains('on')); const n = tabs[(i + d + tabs.length) % tabs.length]; n.click(); n.focus(); }
  focusFirst(root) { setTimeout(() => { const f = this.focusables(root)[0]; if (f && input.device === 'pad') f.focus(); }, 30); }
  blocking() {
    if (this.screen && this.menu.style.display !== 'none') return true;
    if (this.app.game) {
      if (this.over === 'pause' || this.over === 'shop' || this.popupScope) return true;
      if (this.over === 'lobby') return true;
      return false;
    }
    return true;
  }

  // ================================================================ toasts and popups
  toast(text, ms = 3200) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    this.toastEl.append(d);
    setTimeout(() => d.classList.add('gone'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }
  invitePopup(inv) {
    if (this.inviteEl) this.inviteEl.remove();
    const d = document.createElement('div');
    d.className = 'invite';
    d.innerHTML = `<div>📨 <b>${esc(inv.name)}</b> invited you to their game!</div><div class="row"><button class="yes">Join room ${esc(inv.room)}</button><button class="no">Not now</button></div>`;
    d.inv = inv;
    $('.yes', d).onclick = () => { inv.respond('yes'); d.remove(); this.inviteEl = null; this.app.join(inv.room); };
    $('.no', d).onclick = () => { inv.respond('no'); d.remove(); this.inviteEl = null; };
    document.body.append(d);
    this.inviteEl = d;
    audio.sfx('join');
    if (input.device === 'pad' && !this.app.game) setTimeout(() => $('.yes', d).focus(), 50);
  }
  modal(html, onReady) {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="box">${html}</div>`;
    document.body.append(m);
    this.popupScope = m;
    const close = () => { if (this.popupScope === m) this.popupScope = null; m.remove(); };
    m.addEventListener('click', e => { if (e.target === m) close(); });
    onReady && onReady(m, close);
    this.focusFirst(m);
    return close;
  }
  badge() {
    const n = F.friendRequests().length;
    for (const b of $$('.fr-badge')) { b.textContent = n || ''; b.hidden = !n; }
  }

  // ================================================================ menu screens
  show(name, isBack = false) {
    if (!isBack && this.screen && this.screen !== name) this.stack.push(this.screen);
    if (name === 'main') this.stack = [];
    this.screen = name;
    this.menu.style.display = '';
    this.menu.className = 'menu scr-' + name;
    this.app.menuScene(name);
    const fn = this['scr_' + name];
    this.menu.innerHTML = '';
    fn.call(this, this.menu);
    this.badge();
    this.focusFirst(this.menu);
  }
  hideMenu() { this.menu.style.display = 'none'; this.screen = null; }
  scr_name(el) {
    const p = profile();
    el.innerHTML = `<div class="card narrow center">
      <div class="logo small">DON'T WAKE<br><span>GERALD</span></div>
      <h2>Hello, little goblin.</h2><p>What do the other goblins call you?</p>
      <div class="namerow"><input id="nm" maxlength="16" placeholder="Your name" value="${esc(p.name || randomName())}"><button id="rnd" title="Random name">🎲</button></div>
      <button class="big go" id="ok">That's me!</button></div>`;
    $('#rnd', el).onclick = () => { $('#nm', el).value = randomName(); };
    $('#ok', el).onclick = () => {
      const v = $('#nm', el).value.replace(/[<>]/g, '').trim().slice(0, 16);
      if (!v) { this.toast('Pick a name first'); return; }
      p.name = v; save();
      this.show('main');
    };
  }
  scr_main(el) {
    const p = profile();
    const lvl = levelOf(p.xp), next = xpFor(lvl + 1), cur = xpFor(lvl);
    el.innerHTML = `
      <div class="title">
        <div class="logo">DON'T WAKE<br><span>GERALD</span></div>
        <div class="tag">Rob a sleeping giant with your friends. Quietly. (You won't.)</div>
      </div>
      <div class="mainbtns">
        <button class="big go" id="host">🛏️ Play with friends</button>
        <button class="big" id="join">🔢 Join with a code</button>
        <button class="big" id="friends">👥 Friends <span class="fr-badge" hidden></span></button>
        <button class="big" id="practice">🤖 Practice vs bots</button>
        <div class="row2"><button id="wardrobe">🎩 Wardrobe</button><button id="settings">⚙️ Settings</button><button id="howto">❓ How to play</button></div>
      </div>
      <div class="profile">
        <div class="pname" style="color:${hex(colorHex(p.cos.color))}">${esc(p.name)}</div>
        <div class="plvl">Level ${lvl} <div class="xpbar"><div style="width:${Math.min(100, ((p.xp - cur) / (next - cur)) * 100)}%"></div></div></div>
        <div class="pcoins">🪙 ${p.coins} coins</div>
        <div class="pcode">Friend code <b>${esc(F.myFriendCode())}</b></div>
        <button class="small" id="rename">Change name</button>
      </div>
      <div class="ver">${esc(this.app.versionLabel())}</div>`;
    $('#host', el).onclick = () => this.app.host();
    $('#join', el).onclick = () => this.show('join');
    $('#friends', el).onclick = () => this.show('friends');
    $('#practice', el).onclick = () => this.app.practice();
    $('#wardrobe', el).onclick = () => this.show('wardrobe');
    $('#settings', el).onclick = () => this.show('settings');
    $('#howto', el).onclick = () => this.show('howto');
    $('#rename', el).onclick = () => this.show('name');
  }
  scr_join(el) {
    el.innerHTML = `<div class="card narrow center">
      <h2>Join a friend's game</h2><p>Type the 4-number room code from their screen.</p>
      <div class="codebox">${[0, 1, 2, 3].map(i => `<span class="d" data-i="${i}"></span>`).join('')}</div>
      <input id="code" inputmode="numeric" maxlength="4" autocomplete="off" class="hiddeninput">
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'].map(k => `<button data-k="${k}" class="${k === '✓' ? 'go' : ''}">${k}</button>`).join('')}</div>
      <button class="back">Back</button></div>`;
    const inp = $('#code', el);
    const draw = () => { const v = cleanCode(inp.value); $$('.d', el).forEach((d, i) => { d.textContent = v[i] || ''; d.classList.toggle('on', i === v.length); }); };
    inp.addEventListener('input', () => { inp.value = cleanCode(inp.value); draw(); if (inp.value.length === 4) go(); });
    const go = () => { const v = cleanCode(inp.value); if (v.length !== 4) { this.toast('Room codes have 4 numbers'); return; } this.app.join(v); };
    $$('.keypad button', el).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === '⌫') inp.value = inp.value.slice(0, -1);
      else if (k === '✓') return go();
      else if (inp.value.length < 4) inp.value += k;
      draw();
      if (inp.value.length === 4 && input.device !== 'pad') go();
    });
    $('.codebox', el).onclick = () => inp.focus();
    $('.back', el).onclick = () => this.back();
    draw();
    if (input.device !== 'pad') setTimeout(() => inp.focus(), 50);
    // typing digits anywhere works too
    this._keyJoin = e => { if (this.screen !== 'join' || document.activeElement === inp) return; if (/^Digit\d$/.test(e.code) && inp.value.length < 4) { inp.value += e.code.slice(5); draw(); if (inp.value.length === 4) go(); } if (e.code === 'Backspace') { inp.value = inp.value.slice(0, -1); draw(); } };
    window.removeEventListener('keydown', this._keyJoinOld || (() => { }));
    window.addEventListener('keydown', this._keyJoin);
    this._keyJoinOld = this._keyJoin;
  }
  scr_friends(el) {
    F.beReachable();
    el.innerHTML = `<div class="card wide">
      <div class="fhead"><div><h2>Friends</h2><p>Share your code. Friends see when you're online and can jump straight into your lobby.</p></div>
        <div class="mycode">Your friend code<b>${esc(F.myFriendCode())}</b></div></div>
      <div class="addrow"><input id="fc" inputmode="numeric" maxlength="4" placeholder="Friend's 4-number code"><button id="add" class="go">Add friend</button></div>
      <div id="flist"></div>
      <button class="back">Back</button></div>`;
    const add = () => { const r = F.addFriend($('#fc', el).value); if (!r.ok) this.toast(r.msg); else { this.toast(r.accepted ? `You're now friends with ${r.friend.name}!` : r.already ? 'Already on your list' : 'Friend request sent!'); $('#fc', el).value = ''; } this.renderFriends(); };
    $('#add', el).onclick = add;
    $('#fc', el).addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    $('#fc', el).addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
    $('.back', el).onclick = () => this.back();
    this.stopWatch && this.stopWatch();
    this.stopWatch = F.presence.watch();
    this.renderFriends();
  }
  renderFriends() {
    const box = $('#flist', this.menu);
    if (!box) return;
    const st = c => F.presence.status.get(c) || { state: 'checking' };
    const label = s => ({ online: '🟢 Online', lobby: `🟢 In a lobby${s.room ? ' (' + s.room + ')' : ''}`, busy: '🟡 Playing', offline: '⚫ Offline', checking: '… checking' }[s.state] || '');
    const reqs = F.friendRequests(), fr = F.friends(), rec = F.recentPlayers();
    const inLobby = this.app.game && this.app.game.code && this.app.game.sim.phase === PH.LOBBY;
    box.innerHTML = (reqs.length ? `<h3>Friend requests</h3>` + reqs.map(r => `<div class="frow"><span class="fn">${esc(r.name)} <small>${esc(r.code)}</small></span><span class="fs">wants to be friends</span><button data-acc="${r.code}" class="go">Accept</button><button data-ign="${r.code}">Ignore</button></div>`).join('') : '') +
      `<h3>Your friends (${fr.length})</h3>` + (fr.length ? fr.map(f => { const s = st(f.code); return `<div class="frow"><span class="fn">${esc(f.name)} <small>${esc(f.code)}</small></span><span class="fs">${f.pending ? '⏳ Request sent' : label(s)}${s.what ? ' · ' + esc(s.what) : ''}</span>${s.state === 'lobby' && s.room ? `<button data-join="${s.room}" class="go">Join</button>` : ''}${inLobby && (s.state === 'online' || s.state === 'lobby') ? `<button data-inv="${f.code}">Invite</button>` : ''}<button data-rm="${f.code}" class="small">✕</button></div>`; }).join('') : '<p class="dim">No friends yet. Add one with their 4-number code!</p>') +
      (rec.length ? `<h3>Played with recently</h3>` + rec.map(r => `<div class="frow"><span class="fn">${esc(r.name)} <small>${esc(r.code)}</small></span><span class="fs">${label(st(r.code))}</span><button data-addr="${r.code}" data-name="${esc(r.name)}">Add friend</button></div>`).join('') : '');
    $$('[data-acc]', box).forEach(b => b.onclick = () => { F.acceptRequest(b.dataset.acc); this.renderFriends(); });
    $$('[data-ign]', box).forEach(b => b.onclick = () => { F.ignoreRequest(b.dataset.ign); this.renderFriends(); });
    $$('[data-rm]', box).forEach(b => b.onclick = () => { if (confirm('Remove this friend?')) { F.removeFriend(b.dataset.rm); this.renderFriends(); } });
    $$('[data-join]', box).forEach(b => b.onclick = () => this.app.join(b.dataset.join));
    $$('[data-inv]', box).forEach(b => b.onclick = () => this.inviteFriend(b.dataset.inv, b));
    $$('[data-addr]', box).forEach(b => b.onclick = () => { const r = F.addFriend(b.dataset.addr, b.dataset.name); this.toast(r.ok ? 'Friend request sent!' : r.msg); this.renderFriends(); });
  }
  inviteFriend(code, btn) {
    const g = this.app.game;
    if (!g || !g.code) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Inviting...'; }
    F.presence.invite(code, g.code).then(ans => {
      const name = (F.friends().find(f => f.code === code) || {}).name || code;
      this.toast(ans === 'yes' ? `${name} is on the way!` : ans === 'busy' ? `${name} is busy` : ans === 'offline' ? `${name} isn't online` : `${name} said not now`);
      if (btn) { btn.disabled = false; btn.textContent = 'Invite'; }
    });
  }
  scr_wardrobe(el) {
    const p = profile();
    this.wtab = this.wtab || 'hats';
    const lists = { hats: HATS, colors: COLORS, eyes: EYES, emotes: EMOTES };
    const kindKey = { hats: 'hat', colors: 'color', eyes: 'eyes' };
    const lvl = levelOf(p.xp);
    const items = lists[this.wtab];
    el.innerHTML = `<div class="card wardrobe">
      <div class="whead"><h2>Wardrobe</h2><div class="pcoins">🪙 ${p.coins} · Level ${lvl}</div></div>
      <div class="tabs">${Object.keys(lists).map(k => `<button data-t="${k}" class="${k === this.wtab ? 'on' : ''}">${{ hats: '🎩 Hats', colors: '🎨 Colours', eyes: '👀 Eyes', emotes: '💃 Emotes' }[k]}</button>`).join('')}</div>
      ${this.wtab === 'emotes' ? '<p class="dim">Pick up to 8 for your emote wheel (hold T or D-pad up in game).</p>' : ''}
      <div class="wgrid">${items.map(it => {
        const own = owns(this.wtab, it.id);
        const on = this.wtab === 'emotes' ? p.emotes.includes(it.id) : p.cos[kindKey[this.wtab]] === it.id;
        const locked = !own && (it.level || 1) > lvl;
        const sw = this.wtab === 'colors' ? `<span class="sw" style="background:${hex(it.hex)}${it.hex2 != null ? `;box-shadow: inset -12px 0 0 ${hex(it.hex2)}` : ''}"></span>` : this.wtab === 'emotes' ? `<span class="em">${it.emoji}</span>` : '';
        return `<button class="witem ${on ? 'on' : ''} ${own ? 'own' : ''} ${locked ? 'locked' : ''}" data-id="${it.id}">${sw}<span class="wn">${esc(it.name)}</span><span class="wp">${own ? (on ? 'Equipped' : 'Owned') : locked ? `🔒 Lv ${it.level}` : `🪙 ${it.price}`}</span></button>`;
      }).join('')}</div>
      <div class="wdesc"></div>
      <button class="back">Done</button></div>`;
    $$('.tabs button', el).forEach(b => b.onclick = () => { this.wtab = b.dataset.t; this.show('wardrobe', true); const t = $(`.tabs [data-t="${this.wtab}"]`, this.menu); if (t && input.device === 'pad') t.focus(); });
    $$('.witem', el).forEach(b => {
      const it = items.find(x => x.id === b.dataset.id);
      b.onfocus = b.onmouseenter = () => { $('.wdesc', el).textContent = it.desc || it.name; if (this.wtab !== 'emotes') this.app.previewCos({ ...p.cos, [kindKey[this.wtab]]: it.id }); else this.app.previewEmote(it.anim); };
      b.onclick = () => {
        if (!owns(this.wtab, it.id)) {
          const r = buyCos(this.wtab, it);
          if (!r.ok) { this.toast(r.msg); audio.sfx('denied'); return; }
          audio.sfx('unlock'); this.toast(`Unlocked ${it.name}!`);
        }
        if (this.wtab === 'emotes') {
          if (p.emotes.includes(it.id)) p.emotes = p.emotes.filter(x => x !== it.id);
          else if (p.emotes.length < 8) p.emotes.push(it.id);
          else this.toast('Your wheel has 8 emotes. Take one off first.');
        } else p.cos[kindKey[this.wtab]] = it.id;
        save();
        this.app.previewCos(p.cos);
        this.app.cosChanged();
        const f = document.activeElement && document.activeElement.dataset.id;
        this.show('wardrobe', true);
        if (f) { const n = $(`.witem[data-id="${f}"]`, this.menu); if (n) n.focus(); }
      };
    });
    el.querySelector('.back').onclick = () => { this.app.previewCos(p.cos); this.back(); };
    this.app.previewCos(p.cos);
  }
  scr_settings(el) {
    const s = profile().settings;
    const slider = (k, label, min, max, step) => `<label class="srow"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"><b data-v="${k}">${(+s[k]).toFixed(step < 1 ? 2 : 0)}</b></label>`;
    const cyc = (k, label, opts) => `<div class="srow"><span>${label}</span><div class="cycler" tabindex="0" data-k="${k}" data-opts='${JSON.stringify(opts)}'><i class="arr" data-d="-1">◀</i><b>${esc(opts.find(o => o[0] === s[k])?.[1] ?? s[k])}</b><i class="arr" data-d="1">▶</i></div></div>`;
    el.innerHTML = `<div class="card wide settings">
      <h2>Settings</h2>
      <div class="cols"><div>
      <h3>Sound</h3>${slider('master', 'Master volume', 0, 1, 0.05)}${slider('sfx', 'Effects', 0, 1, 0.05)}${slider('music', 'Music', 0, 1, 0.05)}
      <h3>Controls</h3>${slider('sens', 'Mouse sensitivity', 0.2, 3, 0.05)}${slider('padSens', 'Controller look speed', 0.3, 2.5, 0.05)}${cyc('invertY', 'Invert look up/down', [[false, 'Off'], [true, 'On']])}${slider('fov', 'Field of view', 55, 100, 1)}
      </div><div>
      <h3>Voice chat</h3>${cyc('voice', 'Proximity voice', [[true, 'On'], [false, 'Off']])}${cyc('micMode', 'Mic', [['open', 'Open mic'], ['ptt', 'Push to talk (V / D-pad down)']])}${slider('micGate', 'Mic noise gate', 0, 0.6, 0.02)}
      <div class="srow"><span>Mic test</span><div class="micmeter"><div></div></div><button id="mictest" class="small">Test</button></div>
      <h3>Graphics</h3>${cyc('quality', 'Quality', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low (faster)']])}
      <h3>Your save</h3><p class="dim">Your save lives in this browser. To play on another computer, make a move code here and type it there.</p>
      <div class="row2"><button id="mv">Make a move code</button><button id="rcv">Use a move code</button></div>
      </div></div>
      <button class="back">Done</button></div>`;
    $$('input[type=range]', el).forEach(r => r.addEventListener('input', () => { s[r.dataset.k] = +r.value; $(`[data-v="${r.dataset.k}"]`, el).textContent = (+r.value).toFixed(+r.step < 1 ? 2 : 0); save(); this.app.applySettings(); }));
    $$('.cycler', el).forEach(c => {
      const opts = JSON.parse(c.dataset.opts);
      const set = d => { const i = opts.findIndex(o => o[0] === s[c.dataset.k]); const n = opts[(i + d + opts.length) % opts.length]; s[c.dataset.k] = n[0]; $('b', c).textContent = n[1]; save(); this.app.applySettings(); };
      c.addEventListener('cycle', e => set(e.detail));
      c.onclick = e => set(clickDir(e, c));
    });
    $('#mictest', el).onclick = async () => {
      const ok = await this.app.voice.enableMic();
      if (!ok) { this.toast(this.app.voice.failed || 'No mic'); return; }
      clearInterval(this._micT);
      this._micT = setInterval(() => { const m = $('.micmeter div', this.menu); if (!m) { clearInterval(this._micT); return; } this.app.voice.update({ players: [], me: -1 }, null, { mods: {}, phase: 'lobby' }, true); m.style.width = Math.min(100, this.app.voice.level() * 100) + '%'; }, 50);
    };
    $('#mv', el).onclick = () => this.app.makeMoveCode();
    $('#rcv', el).onclick = () => this.app.useMoveCode();
    $('.back', el).onclick = () => this.back();
  }
  scr_howto(el) {
    const r = (a, t) => `<tr><td><b>${glyph(a)}</b></td><td>${t}</td></tr>`;
    el.innerHTML = `<div class="card wide howto">
      <h2>How to rob a sleeping giant</h2>
      <div class="cols"><div>
      <p>Gerald is asleep. You are a goblin about the size of his eyelash. Every night, sneak over his body, steal his stuff and get it into <b>your bottle cap</b> (your stash) before 6 AM. Most cash after the last night wins.</p>
      <ul>
        <li><b>Noise wakes him.</b> Running, landing, slapping, dropping heavy things and <b>talking into your mic</b> all count. His face is touchy; the blanket muffles.</li>
        <li>As he stirs he <b>twitches</b>, <b>scratches</b>, <b>swats</b> the loudest goblin (watch for the shadow!), <b>sneezes</b> and <b>rolls over</b>.</li>
        <li>If the meter fills he <b>WAKES UP</b>. FREEZE. Anyone who moves gets flicked off the bed, and whoever woke him pays a fine.</li>
        <li><b>Throw</b> loot into your stash from far away for a <b>trick shot</b> bonus. Heavy loot slows you; fragile loot loses value when it hits hard.</li>
        <li>Steal from other stashes, slap loot out of hands, grab goblins and launch them off the bed. Between nights, the Pawn Rat sells dirty tricks.</li>
        <li>Steep bits are a <b>climb</b>: it costs stamina. Run out and you slide.</li>
      </ul></div><div>
      <table class="ctl">${r('jump', 'Jump')}${r('sprint', 'Sprint (loud!)')}${r('grab', 'Grab / drop loot or a goblin')}${r('swing', 'Hold to swing or throw; let go at the top of the meter')}${r('slap', 'Slap (knocks loot out of hands)')}${r('dive', 'Dive tackle')}${r('use', 'Use item')}${r('items', 'Pick item')}${r('interact', 'Hold in a rival stash to rob it')}${r('emote', 'Hold for emotes')}${r('ptt', 'Push to talk')}${r('scores', 'Scores')}</table>
      <p class="dim">Controller and keyboard both work. Prompts follow whichever you touched last.</p></div></div>
      <button class="back">Got it</button></div>`;
    $('.back', el).onclick = () => this.back();
  }

  // ================================================================ in-game overlays
  closeOverlays() { if (this.over && this.over !== 'lobby') { this.over = null; this.overlay.innerHTML = ''; } if (this.over === 'lobby') this.over = null; this.overlay.innerHTML = ''; }
  renderOverlay() {
    const g = this.app.game;
    if (!g) { this.overlay.innerHTML = ''; this.over = null; return; }
    if (g.sim.phase === PH.LOBBY && this.lobbyOpen && this.over !== 'pause') this.showLobby();
    else if (this.over === 'lobby') { this.over = null; this.overlay.innerHTML = ''; }
  }
  showLobby() {
    this.lobbyOpen = true;
    this.over = 'lobby';
    this.app.unlock();
    this.overlay.innerHTML = `<div class="lobby"><div class="lb-col">
      <div class="lb-head"></div>
      <div class="lb-players"></div>
      <div class="lb-friends"></div>
      <div class="lb-actions"></div></div>
      <div class="lb-col mods"><div class="lb-mods"></div></div></div>`;
    this.refreshLobby();
    this.focusFirst(this.overlay);
  }
  refreshLobby() {
    if (this.over !== 'lobby') return;
    const g = this.app.game;
    if (!g) return;
    const host = g.isHost;
    const head = $('.lb-head', this.overlay);
    const link = g.code ? `${location.origin}${location.pathname}?room=${g.code}` : '';
    head.innerHTML = g.code ? `<div class="lbl">ROOM CODE</div><div class="code">${esc(g.code)}</div><div class="row2"><button id="copy">📋 Copy invite link</button><button id="warm">🏃 Warm up (${glyph('pause')} to come back)</button></div>`
      : `<div class="lbl">PRACTICE</div><div class="code small">vs bots</div><div class="row2"><button id="warm">🏃 Warm up</button></div>`;
    if ($('#copy', head)) $('#copy', head).onclick = () => { navigator.clipboard?.writeText(link).then(() => this.toast('Invite link copied! Send it to a friend.'), () => this.toast(link, 8000)); };
    $('#warm', head).onclick = () => { this.lobbyOpen = false; this.renderOverlay(); this.app.lockIfPlaying(); };
    // players
    const roster = g.isHost ? g.rosterInfo() : (g.lobby?.roster || []);
    const me = g.seat;
    const botsTo = g.sim.mods.bots;
    const humans = roster.length;
    $('.lb-players', this.overlay).innerHTML = `<h3>Goblins (${humans}/${GAME.maxPlayers})</h3>` + roster.map(r => `<div class="prow ${r.seat === me ? 'me' : ''}"><span class="dot" style="background:${hex(r.color)}"></span><span class="pn">${r.host ? '👑 ' : ''}${esc(r.name)}${r.seat === me ? ' (you)' : ''}</span><span class="pr">${r.host ? 'host' : r.ready ? '✅ ready' : '…'}</span>${r.seat !== me && r.code && !F.isFriend(r.code) ? `<button class="small" data-addf="${esc(r.code)}" data-n="${esc(r.name)}">+ Friend</button>` : ''}${r.seat !== me && r.vid && this.app.voice.on ? `<button class="small" data-mute="${r.seat}">${this.app.voice.muted.has(r.seat) ? '🔇' : '🔊'}</button>` : ''}${host && r.seat !== me ? `<button class="small" data-kick="${r.seat}">Kick</button>` : ''}</div>`).join('') +
      (botsTo > humans ? `<div class="prow bots">🤖 + ${botsTo - humans} bots will join when the game starts</div>` : '');
    $$('[data-addf]', this.overlay).forEach(b => b.onclick = () => { const r = F.addFriend(b.dataset.addf, b.dataset.n); this.toast(r.ok ? 'Friend request sent!' : r.msg); this.refreshLobby(); });
    $$('[data-kick]', this.overlay).forEach(b => b.onclick = () => { g.kick(+b.dataset.kick); this.refreshLobby(); });
    $$('[data-mute]', this.overlay).forEach(b => b.onclick = () => { this.app.voice.toggleMute(+b.dataset.mute); this.refreshLobby(); });
    this.renderLobbyFriends();
    // actions
    const act = $('.lb-actions', this.overlay);
    const myRow = roster.find(r => r.seat === me);
    act.innerHTML = host ? `<button class="big go" id="start">▶ Start the heist</button><button id="leave">Leave</button>` : `<button class="big ${myRow && myRow.ready ? '' : 'go'}" id="ready">${myRow && myRow.ready ? '✅ Ready! (click to unready)' : "I'm ready"}</button><button id="leave">Leave</button><p class="dim">The host starts the game.</p>`;
    if ($('#start', act)) $('#start', act).onclick = () => { this.app.startMatch(); };
    if ($('#ready', act)) $('#ready', act).onclick = () => { g.net.send({ t: 'ready', v: !(myRow && myRow.ready) }); };
    $('#leave', act).onclick = () => this.app.leave();
    this.renderMods();
  }
  renderLobbyFriends() {
    const box = $('.lb-friends', this.overlay);
    const g = this.app.game;
    if (!box || !g) return;
    if (!g.code) { box.innerHTML = ''; return; }
    const fr = F.friends().filter(f => !f.pending);
    const st = c => F.presence.status.get(c) || {};
    box.innerHTML = `<h3>Invite friends</h3>` + (fr.length ? fr.map(f => { const s = st(f.code); const on = s.state === 'online' || s.state === 'lobby'; return `<div class="frow"><span class="fn">${esc(f.name)}</span><span class="fs">${on ? '🟢' : s.state === 'busy' ? '🟡' : '⚫'}</span><button class="small" data-inv="${f.code}" ${on ? '' : 'disabled'}>Invite</button></div>`; }).join('') : `<p class="dim">Add friends with their 4-number code from the Friends screen. Your code: <b>${esc(F.myFriendCode())}</b></p>`);
    $$('[data-inv]', box).forEach(b => b.onclick = () => this.inviteFriend(b.dataset.inv, b));
    if (!this._lobbyWatch) { this._lobbyWatch = F.presence.watch(); }
  }
  renderMods() {
    const g = this.app.game;
    const box = $('.lb-mods', this.overlay);
    if (!box || !g) return;
    const host = g.isHost;
    const mods = g.sim.mods, pool = g.sim.dreamPool || [];
    const groups = [...new Set(MODS.map(m => m.group))];
    this.modTab = this.modTab || groups[0];
    const label = (m, v) => m.type === 'bool' ? (v ? 'On' : 'Off') : (m.labels ? m.labels[m.options.indexOf(v)] : String(v)) ?? String(v);
    box.innerHTML = `<h3>${host ? 'Game modifiers' : 'Game modifiers (the host picks)'}</h3>
      ${host ? `<div class="presets">${PRESETS.map(p => `<button class="small chipbtn" data-pre="${p.id}" title="${esc(p.desc)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      <div class="tabs">${[...groups, 'Dreams'].map(t => `<button data-g="${t}" class="${t === this.modTab ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="modlist">${this.modTab === 'Dreams'
        ? `<p class="dim">Each night after the first, Gerald has one of these dreams (a rule twist). Turn off the ones you don't like.</p><div class="chips">${DREAM_IDS.filter(d => d !== 'none').map(d => `<div class="chip ${pool.includes(d) ? 'on' : ''}" tabindex="0" data-dream="${d}" title="${esc(DREAMS[d].desc)}">${esc(DREAMS[d].name.replace('Gerald Dreams of ', '').replace('Gerald Dreams He Is ', ''))}</div>`).join('')}</div><div class="ddesc dim"></div>`
        : MODS.filter(m => m.group === this.modTab).map(m => `<div class="mrow ${mods[m.id] !== MOD_DEFAULTS[m.id] ? 'changed' : ''}"><span>${esc(m.name)}</span>${host ? `<div class="cycler" tabindex="0" data-mod="${m.id}"><i class="arr" data-d="-1">◀</i><b>${esc(label(m, mods[m.id]))}</b><i class="arr" data-d="1">▶</i></div>` : `<b>${esc(label(m, mods[m.id]))}</b>`}</div>`).join('')}</div>`;
    $$('.tabs button', box).forEach(b => b.onclick = () => { this.modTab = b.dataset.g; this.renderMods(); const t = $(`.lb-mods [data-g="${this.modTab}"]`, this.overlay); if (t && input.device === 'pad') t.focus(); });
    if (!host) return;
    const apply = (m, pl) => { g.setMods(m, pl); const p = profile(); p.lastMods = g.sim.mods; p.lastPool = g.sim.dreamPool; save(); this.refreshLobby(); };
    $$('[data-pre]', box).forEach(b => b.onclick = () => { const pre = PRESETS.find(p => p.id === b.dataset.pre); apply({ ...MOD_DEFAULTS, ...pre.mods }); this.toast(`${pre.name}: ${pre.desc}`); });
    $$('.cycler[data-mod]', box).forEach(c => {
      const m = MODS.find(x => x.id === c.dataset.mod);
      const set = d => {
        const cur = g.sim.mods[m.id];
        let v;
        if (m.type === 'bool') v = !cur;
        else { const i = m.options.indexOf(cur); v = m.options[(i + d + m.options.length) % m.options.length]; }
        apply({ ...g.sim.mods, [m.id]: v });
        const n = $(`.cycler[data-mod="${m.id}"]`, this.overlay); if (n) n.focus();
      };
      c.addEventListener('cycle', e => set(e.detail));
      c.onclick = e => set(clickDir(e, c));
    });
    $$('[data-dream]', box).forEach(c => {
      c.onfocus = c.onmouseenter = () => { $('.ddesc', box).textContent = DREAMS[c.dataset.dream].desc; };
      c.onclick = () => {
        let pl = (g.sim.dreamPool || []).slice();
        const d = c.dataset.dream;
        pl = pl.includes(d) ? pl.filter(x => x !== d) : [...pl, d];
        if (!pl.length) { this.toast('Keep at least one dream (or turn dreams off in Chaos)'); return; }
        apply(g.sim.mods, pl);
        const n = $(`[data-dream="${d}"]`, this.overlay); if (n) n.focus();
      };
    });
  }
  // ---- shop
  showShop() {
    const g = this.app.game;
    this.over = 'shop';
    this.app.unlock();
    this.ratLine = RAT_LINES[(Math.random() * RAT_LINES.length) | 0];
    this.shopReady = false;
    this.refreshShop();
    this.focusFirst(this.overlay);
  }
  refreshShop() {
    if (this.over !== 'shop') return;
    const g = this.app.game, sim = g.sim;
    const me = sim.players[g.seat];
    if (!me) return;
    const ranks = sim.standings();
    const last = ranks.length > 1 && ranks[ranks.length - 1].seat === g.seat;
    const focusId = document.activeElement && document.activeElement.dataset.buy;
    const inv = me.inv || [null, null, null];
    const nxt = me.fxNext || {};
    this.overlay.innerHTML = `<div class="shop">
      <div class="shead"><div class="rat"><span class="ratface">🐀</span><div class="bubble">${esc(this.ratLine)}${last ? '<br><b>Last place? Everything is 30% off for you, sweetie.</b>' : ''}</div></div>
      <div class="scash"><div>Your cash</div><b>$${me.cash}</b><div class="stimer"></div></div></div>
      <div class="sgrid">${ITEM_IDS.map(id => { const it = ITEMS[id]; const price = Math.round(it.price * (last ? 0.7 : 1)); return `<button class="sitem" data-buy="${id}" ${me.cash < price ? 'disabled' : ''}><span class="si">${it.icon}</span><span class="sn">${esc(it.name)}</span><span class="sd">${esc(it.desc)}</span><span class="sp">$${price}</span></button>`; }).join('')}</div>
      <div class="sfoot"><div class="pockets">Pockets: ${inv.map(i => `<span class="slot">${i ? ITEMS[i].icon : ''}</span>`).join('')} ${nxt.driver ? `<span class="pas">🏌️ x${nxt.driver}</span>` : ''}${nxt.wrap ? '<span class="pas">🫧 wrap</span>' : ''}</div>
      <button class="big go" id="sready">${this.shopReady ? '✅ Waiting for the others...' : `Ready for night ${sim.night + 1}`}</button></div>
      <div class="sstand">${ranks.map((r, i) => { const p = sim.players[r.seat]; return p ? `<span><b>${i + 1}.</b> <i style="background:${hex(sim.teamColor(p))}"></i>${esc(p.name)} $${p.cash}</span>` : ''; }).join('')}</div></div>`;
    $$('[data-buy]', this.overlay).forEach(b => b.onclick = () => this.app.buy(b.dataset.buy));
    $('#sready', this.overlay).onclick = () => { this.shopReady = !this.shopReady; this.app.shopReady(this.shopReady); this.refreshShop(); };
    if (focusId) { const n = $(`[data-buy="${focusId}"]`, this.overlay); if (n) n.focus(); }
    clearInterval(this._shopT);
    this._shopT = setInterval(() => { const t = $('.stimer', this.overlay); if (!t || this.over !== 'shop') { clearInterval(this._shopT); return; } t.textContent = `Night starts in ${Math.max(0, Math.ceil(this.app.game.sim.phaseT))}s`; }, 200);
  }
  // ---- results after each night
  showResults(e) {
    const g = this.app.game, sim = g.sim;
    this.over = 'results';
    const rows = e.rows.slice().sort((a, b) => b.cash - a.cash);
    const awards = e.awards || [];
    this.overlay.innerHTML = `<div class="results"><h2>☀️ Night ${e.night} is over</h2>
      <table><tr><th></th><th>Goblin</th><th>Banked tonight</th><th>Total</th></tr>${rows.map((r, i) => { const p = sim.players[r.seat]; return p ? `<tr class="${r.seat === g.seat ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${hex(sim.teamColor(p))}"></span>${esc(p.name)}</td><td>$${r.tonight}</td><td><b>$${r.cash}</b></td></tr>` : ''; }).join('')}</table>
      <div class="awards">${awards.map(a => { const p = sim.players[a.seat]; const d = AWARDS[a.id]; return p ? `<div class="award ${a.id === 'waker' ? 'bad' : ''}"><span class="ai">${d.icon}</span><b>${esc(d.name)}</b><span>${esc(p.name)}</span><small>${esc(d.desc)}${a.extra ? ' (' + esc(a.extra) + ')' : ''}${a.bonus ? ` · +$${a.bonus}` : ''}</small></div>` : ''; }).join('')}</div>
      <p class="dim">${sim.lastNight ? 'That was the last night...' : sim.mods.shop ? 'The Pawn Rat is opening his shop...' : 'Next night coming up...'}</p></div>`;
  }
  // ---- the end
  showFinal(e) {
    const g = this.app.game, sim = g.sim;
    this.over = 'final';
    this.app.unlock();
    const ranks = e.ranks;
    const mine = ranks.find(r => r.seat === g.seat);
    const myAwards = (sim.list.find(p => p.seat === g.seat)?.totals) || {};
    let rew = null;
    if (mine && !this._rewarded) {
      this._rewarded = true;
      const place = sim.mods.teams === 'ffa' ? mine.place : mine.teamPlace;
      rew = reward({ place, players: ranks.length, cash: mine.cash, awards: Object.values(myAwards).filter(v => v > 0).length, nights: sim.mods.nights });
      if (rew.levelUp) { audio.sfx('level_up'); this.toast(`⭐ Level ${rew.level}! New things to unlock in the Wardrobe.`); }
    }
    const win = sim.players[ranks[0].seat];
    const teamWin = sim.mods.teams !== 'ffa';
    this.overlay.innerHTML = `<div class="final"><div class="crown">👑</div>
      <h1>${teamWin ? `${esc(win.name)}'s team wins!` : `${esc(win ? win.name : '?')} wins!`}</h1>
      <p class="dim">Gerald slept through the whole thing. Mostly.</p>
      <table>${ranks.map(r => { const p = sim.players[r.seat]; return p ? `<tr class="${r.seat === g.seat ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][r.place - 1] || r.place}</td><td><span class="dot" style="background:${hex(sim.teamColor(p))}"></span>${esc(p.name)}</td><td><b>$${r.cash}</b></td><td class="dim">stole $${p.totals?.stolen || 0} · pancaked ${p.totals?.pancakes || 0}x · ${p.totals?.ringouts || 0} ring-outs</td></tr>` : ''; }).join('')}</table>
      ${rew ? `<div class="rew">You earned <b>🪙 ${rew.coins}</b> coins and <b>${rew.xp} XP</b>${rew.levelUp ? ` · <b>LEVEL UP! ${rew.level}</b>` : ''}</div>` : ''}
      <div class="row2">${g.isHost ? '<button class="big go" id="again">🔁 Back to the lobby</button>' : '<p>Waiting for the host...</p>'}<button id="leave">Leave</button></div></div>`;
    if ($('#again', this.overlay)) $('#again', this.overlay).onclick = () => { this._rewarded = false; this.app.backToLobby(); };
    $('#leave', this.overlay).onclick = () => this.app.leave();
    setTimeout(() => { this._rewarded = false; }, 30000);
    this.focusFirst(this.overlay);
  }
  // ---- pause
  pauseToggle() { if (!this.app.game) return; if (this.over === 'pause') this.closePause(); else if (this.over === 'lobby') { this.lobbyOpen = false; this.renderOverlay(); this.app.lockIfPlaying(); } else if (this.app.game.sim.phase === PH.LOBBY && !this.over) this.showLobby(); else if (!this.over) this.openPause(); }
  openPause() {
    const g = this.app.game;
    this.over = 'pause';
    this.app.unlock();
    this.overlay.innerHTML = `<div class="pause card narrow center"><h2>Paused</h2><p class="dim">${g.isHost && g.net ? "(The game keeps going for everyone else!)" : g.net ? '(The game keeps going!)' : ''}</p>
      <button class="big go" id="res">Resume</button>${g.code ? `<div class="pcode">Room code <b>${esc(g.code)}</b></div><button id="copy">📋 Copy invite link</button>` : ''}
      <button id="howto">❓ How to play</button><button id="sett">⚙️ Settings</button>${g.isHost && g.sim.phase !== PH.LOBBY ? '<button id="end">End game, back to lobby</button>' : ''}<button id="leave">Leave the room</button></div>`;
    $('#res', this.overlay).onclick = () => this.closePause();
    if ($('#copy', this.overlay)) $('#copy', this.overlay).onclick = () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${g.code}`).then(() => this.toast('Invite link copied!'));
    $('#howto', this.overlay).onclick = () => { this.closePause(); this.show('howto'); this.menu.classList.add('ingame'); };
    $('#sett', this.overlay).onclick = () => { this.closePause(); this.show('settings'); this.menu.classList.add('ingame'); };
    if ($('#end', this.overlay)) $('#end', this.overlay).onclick = () => { this.closePause(); this.app.backToLobby(); };
    $('#leave', this.overlay).onclick = () => this.app.leave();
    this.focusFirst(this.overlay);
  }
  closePause() {
    if (this.over !== 'pause') return;
    this.over = null; this.overlay.innerHTML = '';
    const g = this.app.game;
    if (g && g.sim.phase === PH.LOBBY && this.lobbyOpen) this.showLobby();
    else this.app.lockIfPlaying();
  }
  hostLeft() { this.toast('The host left, so the game ended.', 5000); this.app.leave(true); }
  leaveGame() { this.app.leave(true); }
  notePlayer(code, name) { if (code && code.length === 4) F.noteRecent(code, name); }
  equippedEmotes() { return profile().emotes.slice(0, 8); }
}
