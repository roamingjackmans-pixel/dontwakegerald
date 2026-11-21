# 😴 Don't Wake Gerald

A chaotic, competitive 3D heist for 1-8 players in the browser. You are a goblin about the size of an eyelash.
Gerald is a giant, and he's asleep. Every night you sneak over his body, steal his stuff and get it into **your
bottle cap** before 6 AM, while everyone else does the same, and steals from you, and launches you off the bed.
Make too much noise (including **talking into your actual microphone**) and Gerald stirs, scratches, swats,
sneezes, rolls over... or wakes up.

**Play:** https://josephjackman.com/games/dontwakegerald/

Built from the best bits of the friend-slop games: Lethal Company (loot runs, a quota-ish economy, a shop between
nights, a monster), R.E.P.O. (fragile loot that loses value, grabbing and carrying), PEAK (climbing with
stamina), Super Battle Golf (charge-and-release golf swings, trick shots, sabotage), Content Warning / Among Us
(proximity voice chat).

## How a game goes (about 30 minutes)

- **Lobby.** One player makes a room and gets a 4-number room code (and an invite link). Friends join with the
  code, the link, one tap from the Friends list, or an invite pop-up. Everyone runs around warming up while the host
  picks modifiers. Bots fill the empty seats.
- **5 nights** of 4:30 each (both adjustable). Each night after the first, Gerald has a **dream** that twists the
  rules: low gravity, double money, golf mode, butter-slippery, a rising flood, golden peas raining from the
  ceiling, a bouncy jelly Gerald...
- **Between nights** the Pawn Rat sells dirty tricks (last place gets 30% off): banana peels, a kazoo that frames the
  nearest rival for the noise, a feather that makes Gerald scratch wherever it lands, dental-floss grapple, mousetraps,
  a lullaby music box, fridge magnet, pepper shaker, bubble wrap, ball & chain, hairspray rocket, wind-up decoy.
- **Awards** each night (Trick Shot, Bouncer, Pickpocket, Pack Mule, Loudmouth, Pancake, Butterfingers, THE WAKER).
- **The final night** is worth 50% more. The winner ends up dancing on the tip of Gerald's nose.

### Maps: he falls asleep somewhere new every night
Every map once before any repeats, never the same one twice in a row. Each has its own loot, jackpots and visitor.
- **Gerald's Bed**: the bedroom. Nightstands, a headboard, and Mr. Biscuits the cat.
- **Beach Snooze**: a beach towel on a sand island. The **tide rises all night**; wade into deep water and you're washed
  out to sea. Seashells, sea glass, a golden conch, and Captain Squawk the seagull, who dive-bombs anything that moves.
- **Campout**: a camping cot in the woods by a campfire, open at both ends. Marshmallows, acorns, a brass compass, a
  harmonica, and Bandit the raccoon.
- **Garden Hammock**: strung between two trees, and it **sways**: loot slides and anything in the air drifts, more after
  he rolls over, sneezes or wakes. Strawberries, rose petals, lemonade, a garden gnome.

For testing, `?map=beach` (or `camp`, `hammock`, `bedroom`) keeps a game you host on one map.

### Gerald
- A noise meter fills from running, landing, slapping, dropping heavy things, breaking fragile loot, kazoos... and
  your real voice (voice chat is proximity-based, and loud talking counts as noise). His face is touchy (eyelids x4),
  the quilt muffles.
- As it fills he **twitches** (launching anyone on that spot), **scratches** with a giant hand, **swats** the loudest
  goblin (watch for the growing shadow), **sneezes** (inhale, then a huge blast) and **rolls over** into a different
  pose (the whole map changes shape).
- Fill it and he **WAKES UP**: freeze! Anyone who moves gets flicked off the bed, and whoever woke him pays a fine
  that's shared out to everyone else. Then he rolls over and goes back to sleep.
- From night 2 a **critter** visits (Mr. Biscuits the cat, Captain Squawk the seagull or Bandit the raccoon, depending
  on the map) and pounces on whoever is moving.
- Climb to the tip of his nose and hold the interact button to **boop** it: he does a cute little sneeze that blows everyone (you included) off his face.

### Controls (keyboard + mouse or any controller)
| Action | Keyboard / mouse | Controller |
| --- | --- | --- |
| Move / look | WASD / mouse | Left stick / right stick |
| Jump | Space | A |
| Sprint (loud) | Shift | LT or L3 |
| Grab / drop (loot or a goblin) | Left click | RB |
| Swing / throw: hold, release at the top of the meter | Right click | RT |
| Slap (knocks loot out of hands) | E | X |
| Dive tackle | C or Ctrl | B |
| Use item / pick item | Q / 1-3, wheel | LB / D-pad left-right |
| Rob a rival's stash (hold inside it, about 2 s per random item) | F | Y |
| Emote wheel (hold) | T | D-pad up |
| Push-to-talk | V | D-pad down |
| Scores / menu | Tab / Esc | View / Start |

Every menu works with a controller too (D-pad or stick to move, A to press, B for back, LB/RB for tabs).

## Friends and codes
- Every player gets a permanent **4-number friend code** (no sign-up). Codes are claimed on public message servers so
  two players don't end up with the same one.
- Add a friend by code; if they're offline the request waits in their mailbox. Friends show as online / in a lobby /
  playing, with **Join** (straight into their lobby) and **Invite** buttons. People you played with are listed so you
  can add them.
- Rooms have **4-number codes** too, and an invite link (`?room=1234`). You can join a game already in progress: you
  take over a bot's seat (and its cash).
- Your save lives in your browser. Settings → "Make a move code" moves it to another computer with two 4-number codes.

## Modifiers (host)
Nights, night length, shop, starting cash, teams (free-for-all, duos, 2 teams), bots and bot skill (Dozy, Normal,
Sneaky, Gremlin); how deep Gerald sleeps, voice-wakes-Gerald, each of his reactions on/off, snore wind, the cat;
dreams on/off and which dreams, gravity, game speed, goblin size, big
heads, swing power, noodle mode, butterfingers, slippery, all-fragile loot, loot amount, stash raiding, infinite
stamina, free item each night, proximity voice range. Plus presets (Total Chaos, Golf Brawl, Silent
Night, Butter Dimension, Quick Nap).

## Progression
Coins and XP after every game. 40 hats (thimbles, bottle caps, teacups, a tiny sleeping Gerald...), 28 colours and
patterns, 11 eye styles and 12 emotes to unlock in the Wardrobe. Purely cosmetic.

## How online play works
Peer-to-peer, no game server. The host's browser runs the game (60 steps a second, on a worker timer so it keeps
going in a background tab) and streams snapshots to everyone 20 times a second. Guests predict their own goblin and
replay unacknowledged inputs, so your own movement feels instant; everyone else is drawn 100 ms in the past,
smoothly. Connections are WebRTC through the free PeerJS service; players whose network blocks that fall back to
public MQTT message servers (the same relay as Alt Whisker Wars). Voice chat is WebRTC audio between every pair of
players, mixed with Web Audio for distance and left/right panning.

## Play locally
```powershell
npm start      # http://localhost:8090/
npm test       # bots play whole matches headlessly (crash + economy check)
```
To test online play alone, open a second tab with `?slot=2` in the address (a separate save, so it's a different
player), make a room in one and join it from the other.

## Project layout
```
public/                 the game (static files; this folder is what gets published)
  index.html, config.js, version.js, css/style.css, icons/
  shared/  data.js (all numbers and content, maps), world.js (Gerald's body as a height map, poses, map surfaces,
           solids),
           sim.js (the whole game simulation), bots.js (computer goblins)
  js/      main (start-up), game (a room session, netcode, prediction), render (Three.js scene), scenery (beach, camp
           and hammock sets, the seagull and raccoon), goblin, lootmesh,
           hud, ui (menus, lobby, shop), input (keyboard/mouse/controller), audio (all synthesized), cosmetics,
           net + relay (peer-to-peer rooms), friends (codes, presence, invites), voice (proximity chat), profile
  vendor/  three.min.js (r187, bundled), peerjs.min.js
  dev/     audio-test.html, cosmetics-test.html, loot-test.html, scenery-test.html
tools/    serve.mjs, simtest.mjs, stamp-build.mjs
```

## Deploying
`.github/workflows/ready.yml` runs the bot match on every push to `main` and moves the `ready` branch. The
[games](https://github.com/roamingjackmans-pixel/games) repo (`deploy/library.json`) publishes it at
josephjackman.com/games/dontwakegerald/ within 10 minutes (right away if this repo has a `GAMES_DEPLOY_TOKEN` secret),
stamping the version with `tools/stamp-build.mjs`.
