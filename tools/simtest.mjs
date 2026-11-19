// Headless match: bots play whole games so crashes, stuck states and economy problems show up without a browser.
//   node tools/simtest.mjs [games=1] [players=8] [nightLen=90]
import { Sim, PH } from '../public/shared/sim.js';
import { botThink } from '../public/shared/bots.js';
import { BOT_NAMES } from '../public/shared/data.js';

const games = +(process.argv[2] || 1), players = +(process.argv[3] || 8), nightLen = +(process.argv[4] || 90);
let worstStep = 0;
for (let gi = 0; gi < games; gi++) {
  const mods = { nights: 3, nightLen, bots: players, botSkill: ['easy', 'normal', 'hard', 'chaos'][gi % 4] };
  const roster = Array.from({ length: players }, (_, i) => ({ seat: i, name: BOT_NAMES[i], bot: true }));
  const sim = new Sim({ seed: 1234 + gi, mods, roster });
  sim.botInput = botThink;
  sim.startMatch();
  const counts = {};
  let steps = 0, peak = 0, lastPhase = '';
  const t0 = performance.now();
  while (sim.phase !== PH.LOBBY && steps < 60 * 60 * 30) {
    const a = performance.now();
    sim.step(1 / 60);
    const ms = performance.now() - a;
    if (ms > worstStep) worstStep = ms;
    steps++;
    peak = Math.max(peak, sim.g.noise);
    for (const e of sim.takeEvents()) {
      const k = e.e === 'sfx' ? 'sfx:' + e.n : e.e;
      counts[k] = (counts[k] || 0) + 1;
      if (e.e === 'final') console.log('  final:', e.ranks.map(r => `${sim.players[r.seat].name.split(' ')[0]} ${r.cash}`).join(', '));
      if (e.e === 'results') {
        console.log(`  night ${e.night} [${sim.dream}] peak noise ${peak.toFixed(0)}  banked: ${e.rows.map(r => `${sim.players[r.seat].name.split(' ')[0]} $${r.tonight}`).join(', ')}`);
        console.log(`    awards: ${e.awards.map(a => `${a.id}=${sim.players[a.seat].name.split(' ')[0]}`).join(' ')}`);
        peak = 0;
      }
    }
    if (sim.phase !== lastPhase) lastPhase = sim.phase;
    // sanity: nobody stuck in a weird state forever, no NaN
    if (steps % 600 === 0) for (const p of sim.list) {
      if (!Number.isFinite(p.x + p.y + p.z)) throw new Error(`${p.name} has NaN position at step ${steps}`);
    }
  }
  const sec = (performance.now() - t0) / 1000;
  console.log(`game ${gi + 1} (${mods.botSkill}): ${steps} steps in ${sec.toFixed(1)}s (${(steps / sec / 60).toFixed(1)}x realtime), worst step ${worstStep.toFixed(1)} ms`);
  const keys = ['deposit', 'trick', 'stolen', 'out', 'sfx:pancake', 'sfx:slap', 'sfx:club_hit', 'warn', 'sneeze', 'roll', 'waker', 'flicked', 'break', 'use', 'buy', 'grabbed'];
  console.log('  ' + keys.map(k => `${k}=${counts[k] || 0}`).join(' '));
}
