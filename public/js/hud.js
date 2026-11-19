// The in-game overlay (plain DOM on top of the canvas).
import { ST, LS, PH, swingPower } from '../shared/sim.js';
import { LOOT, ITEMS, DREAMS, REGIONS, clockLabel, PHYS, MAPS, regionName } from '../shared/data.js';
import { BED, SEATS, MAT, GRID } from '../shared/world.js';
import { glyph, input } from './input.js';
import { EMOTES } from './cosmetics.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-noise"><div class="gface">😴</div><div class="gbar"><div class="gfill"></div><i style="left:30%"></i><i style="left:50%"></i><i style="left:67%"></i><i style="left:85%"></i></div><div class="glabel">Sound asleep</div></div>
      <div class="hud-clock"><div class="night"></div><div class="time">11:00 PM</div><div class="dream"></div></div>
      <div class="hud-board"></div>
      <div class="hud-feed"></div>
      <div class="hud-ann"><div class="big"></div><div class="sub"></div></div>
      <div class="hud-flash"></div>
      <div class="hud-sub"></div>
      <div class="hud-region"></div>
      <div class="hud-cross"></div>
      <div class="hud-bottom">
        <div class="hud-prompt"></div>
        <div class="hud-carry"></div>
        <div class="hud-meter"><div class="mfill"></div><div class="mlabel">POWER</div></div>
        <div class="hud-row">
          <div class="hud-stam"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="bg"/><circle cx="18" cy="18" r="15" class="fg"/></svg><span>⚡</span></div>
          <div class="hud-items"></div>
          <div class="hud-cash"><div class="c1">$0</div><div class="c2">tonight $0</div></div>
        </div>
        <div class="hud-fx"></div>
      </div>
      <canvas class="hud-map" width="150" height="234"></canvas>
      <div class="hud-escape"><div>MASH <b class="g-jump"></b>!</div><div class="ebar"><div></div></div></div>
      <div class="hud-out"></div>
      <div class="hud-intro"><div class="n"></div><div class="mp"></div><div class="mpl"></div><div class="d"></div><div class="dl"></div><div class="dd"></div><div class="cd"></div></div>
      <div class="hud-wheel"></div>
      <div class="hud-scores"></div>
      <div class="hud-voice"></div>
      <div class="hud-help"></div>
      <div class="hud-banked"></div>`;
    this.el = {};
    for (const k of ['noise', 'clock', 'board', 'feed', 'ann', 'flash', 'sub', 'region', 'prompt', 'carry', 'meter', 'stam', 'items', 'cash', 'fx', 'map', 'escape', 'out', 'intro', 'wheel', 'scores', 'voice', 'help', 'banked', 'bottom', 'cross'])
      this.el[k] = $('.hud-' + k, root);
    this.mapCtx = this.el.map.getContext('2d');
    this.feedItems = [];
    this.lastRegion = -1;
    this.mapKey = '';
    this.visible = false;
  }
  show(v) { this.visible = v; this.root.style.display = v ? '' : 'none'; }

  // ---------------------------------------------------------------- one-off messages
  announce(text, sub = '', kind = '') {
    const a = this.el.ann;
    a.className = 'hud-ann show ' + kind;
    $('.big', a).textContent = text; $('.sub', a).textContent = sub;
    clearTimeout(this._annT);
    this._annT = setTimeout(() => a.classList.remove('show'), kind === 'freeze' ? 4200 : 2600);
  }
  flash(text, kind = '') {
    const f = this.el.flash;
    f.textContent = text; f.className = 'hud-flash show ' + kind;
    clearTimeout(this._flT);
    this._flT = setTimeout(() => f.classList.remove('show'), 2400);
  }
  subtitle(text, kind) {
    const s = this.el.sub;
    s.innerHTML = `<b>Gerald:</b> <i>"${esc(text)}"</i>`;
    s.className = 'hud-sub show ' + (kind || '');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => s.classList.remove('show'), 4200);
  }
  feed(text) {
    const d = document.createElement('div');
    d.className = 'fi'; d.textContent = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('gone'), 6000);
    setTimeout(() => d.remove(), 6600);
  }
  banked(v) {
    const b = this.el.banked;
    b.textContent = `+$${v}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  itemUsed(id) { this.flash(`${ITEMS[id]?.icon || ''} ${ITEMS[id]?.name || id}!`, 'good'); }
  nightIntro(e) {
    const el = this.el.intro;
    const d = DREAMS[e.dream] || DREAMS.none;
    $('.n', el).textContent = e.last ? `FINAL NIGHT (${e.n} of ${e.of})` : `NIGHT ${e.n} of ${e.of}`;
    const M = MAPS[e.map] || MAPS.bedroom;
    $('.mp', el).textContent = `${M.icon} ${M.name}`;
    $('.mpl', el).textContent = M.line;
    $('.d', el).textContent = d.name;
    $('.dl', el).textContent = `"${d.line}"`;
    $('.dd', el).textContent = (e.last ? 'Everything is worth 50% more tonight. ' : '') + d.desc;
    el.classList.add('show');
    clearTimeout(this._introT);
    this._introT = setTimeout(() => el.classList.remove('show'), 5200);
  }

  // ---------------------------------------------------------------- every frame
  update(game, view, me, fi, dt) {
    if (!this.visible) return;
    const sim = game.sim, phase = sim.phase;
    const inNight = phase === PH.NIGHT || phase === PH.INTRO || phase === PH.DAWN;
    this.root.classList.toggle('lobby', phase === PH.LOBBY);
    this.root.classList.toggle('night', inNight);
    // Gerald's meter
    const g = sim.g, n = g.noise;
    const meter = this.el.noise;
    $('.gfill', meter).style.width = Math.min(100, n) + '%';
    let face = '😴', lbl = 'Sound asleep';
    if (g.mode === 'awake' || g.mode === 'waking') { face = '😳'; lbl = 'AWAKE! FREEZE!'; }
    else if (g.mode === 'sneezeIn') { face = '🤧'; lbl = 'Going to sneeze!'; }
    else if (n > 85) { face = '😠'; lbl = 'ABOUT TO WAKE!'; }
    else if (n > 67) { face = '😣'; lbl = 'Restless...'; }
    else if (n > 50) { face = '😪'; lbl = 'Stirring...'; }
    else if (n > 30) { face = '😌'; lbl = 'Light sleep'; }
    if (g.lullaby > 0) { face = '🎶'; lbl = 'Lullaby...'; }
    $('.gface', meter).textContent = face;
    $('.glabel', meter).textContent = phase === PH.LOBBY ? 'Lobby: noise is off' : lbl;
    meter.classList.toggle('danger', n > 80 || g.mode === 'awake');
    // clock
    const ck = this.el.clock;
    if (phase === PH.NIGHT || phase === PH.DAWN || phase === PH.INTRO) {
      const frac = phase === PH.INTRO ? 0 : phase === PH.DAWN ? 1 : 1 - sim.phaseT / sim.mods.nightLen;
      $('.night', ck).textContent = `NIGHT ${sim.night}/${sim.mods.nights}`;
      $('.time', ck).textContent = clockLabel(Math.max(0, Math.min(1, frac)));
      $('.dream', ck).textContent = sim.dream && sim.dream !== 'none' ? '💭 ' + DREAMS[sim.dream].name.replace('Gerald ', '') : '';
      ck.classList.toggle('late', phase === PH.NIGHT && sim.phaseT < 30);
      ck.style.display = '';
    } else ck.style.display = 'none';
    // intro countdown
    if (phase === PH.INTRO) $('.cd', this.el.intro).textContent = Math.ceil(sim.phaseT) > 3 ? '' : String(Math.ceil(sim.phaseT));
    else { $('.cd', this.el.intro).textContent = ''; if (this.el.intro.classList.contains('show') && (phase !== PH.NIGHT || sim.mods.nightLen - sim.phaseT > 1)) this.el.intro.classList.remove('show'); }
    // leaderboard
    this.board(game, sim);
    // my status
    const my = game.my;
    if (my) {
      const stam = Math.max(0, Math.min(1, (my.stamina ?? 100) / PHYS.staminaMax));
      const fg = $('.fg', this.el.stam);
      fg.style.strokeDashoffset = String(94.2 * (1 - stam));
      this.el.stam.classList.toggle('low', stam < 0.25);
      this.el.stam.style.opacity = stam > 0.99 ? 0.35 : 1;
      const cashP = sim.players[game.seat];
      if (cashP) { $('.c1', this.el.cash).textContent = '$' + cashP.cash; $('.c2', this.el.cash).textContent = phase === PH.LOBBY ? 'lobby' : `tonight $${cashP.tonight}`; }
      // carried thing
      const l = my.carry ? (game.isHost ? sim.loot.get(my.carry) : game.lootView.get(my.carry)) : null;
      this.el.carry.innerHTML = l ? `Carrying <b>${esc(LOOT[l.type].name)}</b> <span class="v">$${l.value}</span>${LOOT[l.type].fragile ? ' <span class="frag">FRAGILE</span>' : ''}` : '';
      // power meter
      const charging = me && (me.flags & 4) && my.swingT >= 0;
      this.el.meter.classList.toggle('show', !!charging);
      if (charging) {
        const pw = swingPower(my.swingT);
        $('.mfill', this.el.meter).style.width = (pw * 100).toFixed(1) + '%';
        $('.mlabel', this.el.meter).textContent = l ? 'THROW' : my.holding >= 0 ? 'LAUNCH' : 'SWING';
        this.el.meter.classList.toggle('perfect', pw > 0.92);
      }
      // items
      const inv = (cashP && cashP.inv) || my.inv || [null, null, null];
      const key = inv.join(',') + game.selSlot + input.device;
      if (key !== this._invKey) {
        this._invKey = key;
        this.el.items.innerHTML = inv.map((id, k) => `<div class="slot ${k === game.selSlot ? 'sel' : ''} ${id ? '' : 'empty'}"><span class="i">${id ? ITEMS[id].icon : ''}</span><span class="k">${input.device === 'pad' ? '' : k + 1}</span></div>`).join('') + `<div class="ukey">${glyph('use')}</div>`;
      }
      const fx = (cashP && (cashP.fxInfo || cashP.fx)) || {};
      const badges = [];
      if (fx.coffee > 0) badges.push(`☕ ${Math.ceil(fx.coffee)}s`);
      if (fx.magnet > 0) badges.push(`🧲 ${Math.ceil(fx.magnet)}s`);
      if (fx.driver > 0) badges.push(`🏌️ x${fx.driver}`);
      if (fx.wrap > 0) badges.push(`🫧 x${fx.wrap}`);
      if (fx.ball > 0) badges.push(`⛓️ ${Math.ceil(fx.ball)}s`);
      if (fx.pepper > 0) badges.push('🤧');
      this.el.fx.textContent = badges.join('   ');
      // escaping a grab
      this.el.escape.classList.toggle('show', me && me.st === ST.HELD);
      if (me && me.st === ST.HELD) { $('.g-jump', this.el.escape).textContent = glyph('jump'); $('.ebar div', this.el.escape).style.width = Math.min(100, (my.escape || 0) * 100) + '%'; }
      // fell off
      this.el.out.classList.toggle('show', me && me.st === ST.OUT);
      if (me && me.st === ST.OUT) this.el.out.textContent = (MAPS[sim.map] || MAPS.bedroom).out;
      // region
      const reg = sim.world.regionAt(me ? me.x : 0, me ? me.z : 0);
      if (reg !== this.lastRegion && reg >= 0 && phase !== PH.LOBBY) {
        this.lastRegion = reg;
        const r = REGIONS[reg];
        this.el.region.innerHTML = `📍 ${esc(regionName(reg, sim.map))}${r.sens >= 1.8 ? ' <span class="sens">TOUCHY</span>' : r.sens <= 0.6 ? ' <span class="soft">muffled</span>' : ''}`;
        this.el.region.classList.remove('show'); void this.el.region.offsetWidth; this.el.region.classList.add('show');
      }
      this.prompts(game, view, me, my, l);
    }
    // emote wheel
    this.wheel(game);
    // scoreboard
    this.el.scores.classList.toggle('show', !!fi.held.scores);
    if (fi.held.scores) this.scores(game, sim);
    this.minimap(game, view);
    // voice
    if (game.voice) this.el.voice.innerHTML = game.voice.badges(game);
    this.el.cross.style.display = phase === PH.NIGHT || phase === PH.LOBBY ? '' : 'none';
    this.el.help.style.display = phase === PH.LOBBY && !game.ui.blocking() ? '' : 'none';
    if (phase === PH.LOBBY && this._helpKey !== input.device) {
      this._helpKey = input.device;
      this.el.help.innerHTML = `<b>Warm up while you wait!</b><br>${glyph('grab')} grab · hold ${glyph('swing')} swing/throw · ${glyph('slap')} slap · ${glyph('dive')} dive · ${glyph('sprint')} sprint · ${glyph('jump')} jump<br>Throw stuff into your bottle cap from far away for a <b>trick shot</b>.`;
    }
  }
  prompts(game, view, me, my, carried) {
    const sim = game.sim;
    let p = '';
    if (!me || me.st !== ST.OK) { this.el.prompt.textContent = ''; return; }
    if (carried) {
      const s = sim.stashOf(sim.players[game.seat] || { seat: game.seat, team: game.seat });
      const d = Math.hypot(s.x - me.x, s.z - me.z);
      p = d < STASH_RADIUS + 1 ? `<b>${glyph('grab')}</b> drop it in your stash` : `Hold <b>${glyph('swing')}</b> to throw · <b>${glyph('grab')}</b> drop · bring it to your <span style="color:${hex(sim.teamColor(sim.players[game.seat] || { color: 0xffffff }))}">bottle cap</span>`;
    } else if (view.target) {
      const l = view.loot.get(view.target);
      if (l) p = `<b>${glyph('grab')}</b> grab ${esc(LOOT[l.type].name)} <span class="v">$${l.value}</span>`;
    } else if (sim.phase === PH.NIGHT && Math.hypot(me.x, me.z + 52.6) < 4 && me.y > 24) {
      p = `Hold <b>${glyph('interact')}</b> to boop his nose 👃✨ (he'll sneeze everyone off his face)`;
    } else if (sim.mods.raids && sim.phase === PH.NIGHT) {
      for (const s of sim.stashes) {
        if (Math.hypot(s.x - me.x, s.z - me.z) > STASH_RADIUS + 0.6) continue;
        const owner = sim.stashOwner(s);
        const mine = sim.players[game.seat];
        if (owner && mine && !sim.stashTeamIs(s, mine.team)) p = `Hold <b>${glyph('interact')}</b> to rob ${esc(owner.name)}'s stash 🦝`;
      }
    }
    if (!p && me && (me.flags & 8)) p = `Hold <b>${glyph('swing')}</b> to launch them · <b>${glyph('grab')}</b> drop`;
    this.el.prompt.innerHTML = p;
  }
  board(game, sim) {
    const ps = sim.list.slice().sort((a, b) => b.cash - a.cash);
    const key = ps.map(p => p.seat + ':' + p.cash + ':' + p.name).join('|') + game.seat;
    if (key === this._boardKey) return;
    this._boardKey = key;
    this.el.board.innerHTML = ps.map((p, i) => `<div class="row ${p.seat === game.seat ? 'me' : ''}"><span class="r">${i + 1}</span><span class="dot" style="background:${hex(sim.teamColor(p))}"></span><span class="n">${esc(p.name)}</span><span class="c">$${p.cash}</span></div>`).join('');
  }
  scores(game, sim) {
    const ps = sim.list.slice().sort((a, b) => b.cash - a.cash);
    this.el.scores.innerHTML = `<h3>Night ${sim.night || '-'} of ${sim.mods.nights}</h3><table><tr><th></th><th>Goblin</th><th>Cash</th><th>Tonight</th><th>Stolen</th><th>Pancaked</th><th>Ring-outs</th><th>Noise</th></tr>` +
      ps.map((p, i) => `<tr class="${p.seat === game.seat ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${hex(sim.teamColor(p))}"></span>${esc(p.name)}${p.bot ? ' <small>bot</small>' : ''}</td><td>$${p.cash}</td><td>$${p.tonight}</td><td>$${p.stats?.stolen || 0}</td><td>${p.stats?.pancakes || 0}</td><td>${p.stats?.ringouts || 0}</td><td>${Math.round(p.stats?.noise || 0)}</td></tr>`).join('') + '</table>';
  }
  wheel(game) {
    const w = game.emoteWheel, el = this.el.wheel;
    el.classList.toggle('show', !!w);
    if (!w) return;
    const list = game.ui.equippedEmotes();
    const key = list.join() + w.sel;
    if (key === this._wheelKey) return;
    this._wheelKey = key;
    el.innerHTML = list.map((id, k) => {
      const e = EMOTES.find(x => x.id === id) || { emoji: '·', name: '' };
      const a = k * Math.PI / 4;
      return `<div class="we ${k === w.sel ? 'sel' : ''}" style="left:${50 + Math.sin(a) * 38}%;top:${50 - Math.cos(a) * 38}%"><span>${e.emoji}</span><small>${esc(e.name)}</small></div>`;
    }).join('') + '<div class="wc">Emote</div>';
  }
  minimap(game, view) {
    const ctx = this.mapCtx, W = view.world;
    const cw = 150, ch = 234;
    const sx = cw / (BED.x1 - BED.x0 + 30), sz = ch / (BED.z1 - BED.z0 + 6);
    const X = x => (x - BED.x0 + 15) * sx, Z = z => (z - BED.z0 + 3) * sz;
    const key = W.map + ':' + W.A.name + (W.morph > 0.5 ? W.B.name : '');
    if (key !== this.mapKey) {
      this.mapKey = key;
      const P = W.morph > 0.5 ? W.B : W.A;
      const img = ctx.createImageData(cw, ch);
      // the bed's colours, or tonight's towel / cot / hammock
      const M = { bedroom: [[60, 70, 110], [120, 80, 110], [120, 160, 215]], beach: [[205, 120, 110], [210, 175, 90], [40, 150, 140]], camp: [[95, 105, 70], [50, 85, 150], [180, 60, 55]], hammock: [[200, 150, 90], [210, 200, 180], [180, 155, 215]] }[P.map] || [[60, 70, 110], [120, 80, 110], [120, 160, 215]];
      const cols = { [MAT.sheet]: M[0], [MAT.sand]: [190, 160, 110], [MAT.pillow]: [150, 150, 170], [MAT.blanket]: M[1], [MAT.sock]: [200, 70, 70], [MAT.hair]: [90, 60, 40], [MAT.beard]: [110, 75, 45] };
      const off = P.map === 'beach' ? [30, 70, 120] : [20, 22, 40];
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
        const x = px / sx + BED.x0 - 15, z = py / sz + BED.z0 - 3;
        const o = (py * cw + px) * 4;
        const c = Math.round((x - GRID.x0) / GRID.cell), r = Math.round((z - GRID.z0) / GRID.cell);
        let col = off, a = 160;
        if (c >= 0 && r >= 0 && c < GRID.nx && r < GRID.nz) {
          const i = r * GRID.nx + c;
          col = cols[P.mat[i]] || (P.mat[i] === MAT.shirt || P.mat[i] === MAT.pocket ? M[2] : [235, 175, 140]);
          const h = P.full[i];
          const shade = 0.75 + Math.min(0.35, h / 60);
          col = col.map(v => Math.min(255, v * shade)); a = 230;
        } else if (Math.abs(x) > 51.3 && Math.abs(x) < 73.5 && z > -80 && z < -56) { col = [110, 75, 50]; a = 230; }
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = a;
      }
      this.mapBg = img;
    }
    ctx.putImageData(this.mapBg, 0, 0);
    // stashes
    for (const s of view.stashes) if (s) { const [x, z] = SEATS[s.seat]; ctx.fillStyle = hex(s.color); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(X(x) - 4, Z(z) - 4, 8, 8); ctx.fill(); ctx.stroke(); if (s.alert) { ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.strokeRect(X(x) - 7, Z(z) - 7, 14, 14); } }
    // jackpots
    for (const l of view.loot.values()) if (l.st === LS.FREE && LOOT[l.type].jackpot) { ctx.fillStyle = '#ffd84a'; ctx.font = '11px sans-serif'; ctx.fillText('★', X(l.x) - 4, Z(l.z) + 4); }
    // hands
    for (const h of view.hands) if (h.active) { ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(h.x), Z(h.z), 6, 0, 7); ctx.stroke(); }
    // players
    for (const p of view.players) {
      if (p.st === ST.OUT) continue;
      const me = p.seat === game.seat;
      ctx.fillStyle = hex(p.color);
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), me ? 4.5 : 3, 0, 7); ctx.fill();
      if (me) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        const cy = game.cam.yaw;
        ctx.beginPath(); ctx.moveTo(X(p.x), Z(p.z)); ctx.lineTo(X(p.x + Math.sin(cy) * 9), Z(p.z + Math.cos(cy) * 9)); ctx.stroke();
      }
    }
  }
}
const STASH_RADIUS = 2.6;
