// Don't Wake Gerald: every number and every piece of content in one place.
// Shared by the host simulation (shared/sim.js), the bots, the renderer and the menus.

export const GAME = {
  name: "Don't Wake Gerald",
  short: 'dwg',
  maxPlayers: 8,
  tick: 60,                 // simulation steps per second (host)
  snapRate: 20,             // snapshots per second sent to guests
};

// ---------------------------------------------------------------- physics
export const PHYS = {
  gravity: 30,
  walk: 6.2,
  sprint: 9.6,
  accelGround: 70,
  accelAir: 16,
  friction: 14,
  jump: 10.5,
  stepUp: 0.45,
  walkSlope: 0.78,          // tan(angle): ~38 degrees, steeper is a climb
  climbSpeed: 3.0,
  radius: 0.45,
  height: 1.3,
  staminaMax: 100,
  staminaSprint: 11,        // per second
  staminaClimb: 16,         // per second
  staminaRegen: 30,         // per second, grounded and not sprinting
  ragdollBounce: 0.38,
  lootBounce: 0.32,
  fallY: -18,               // below this you fell off the bed
  carryHeight: 1.55,
};

// ---------------------------------------------------------------- noise and Gerald
export const NOISE = {
  decay: 3.7,               // per second
  sprintStep: 0.95,
  land: 1.2,
  bigLand: 4.5,
  slap: 2.4,
  swingHit: 3.5,
  swingMiss: 0.8,
  ragdollHit: 2.5,
  breakFragile: 6,
  phoneRing: 26,
  stealPerSec: 1.6,
  kazoo: 22,
  voice: 9,                 // per second at full mic level (scaled by level^2)
  // reactions: threshold, cooldown seconds
  twitch: [30, 6],
  scratch: [50, 10],
  swat: [67, 8],
  big: [85, 22],
  wake: 100,
};

// Region sensitivity: how much noise counts where it's made (his face is touchy, the blanket muffles).
export const REGIONS = [
  { id: 'bed', name: 'The Sheets', sens: 0.45 },
  { id: 'pillow', name: 'Pillow Mountain', sens: 0.7 },
  { id: 'hair', name: 'The Comb-Over', sens: 1.5 },
  { id: 'brow', name: 'Brow Ridge', sens: 2.0 },
  { id: 'eyes', name: 'Eyelids (careful!)', sens: 4.0 },
  { id: 'nose', name: 'The Nose', sens: 2.4 },
  { id: 'cheek', name: 'Cheek Hills', sens: 1.9 },
  { id: 'mouth', name: 'The Mouth', sens: 2.6 },
  { id: 'ear', name: 'Earbud Cove', sens: 2.2 },
  { id: 'beard', name: 'Beard Forest', sens: 1.2 },
  { id: 'neck', name: 'The Neck', sens: 1.6 },
  { id: 'chest', name: 'Pajama Plains', sens: 1.15 },
  { id: 'pocket', name: 'The Pajama Pocket', sens: 1.8 },
  { id: 'belly', name: 'Belly Dome', sens: 1.4 },
  { id: 'navel', name: 'Belly Button Pit', sens: 2.0 },
  { id: 'arm', name: 'Arm Ridge', sens: 0.9 },
  { id: 'hand', name: 'The Hand', sens: 1.5 },
  { id: 'blanket', name: 'Quilt Hills', sens: 0.5 },
  { id: 'sock', name: 'Sock Towers', sens: 1.8 },
  { id: 'stand', name: 'Nightstand', sens: 0.8 },
];
export const REGION = Object.fromEntries(REGIONS.map((r, i) => [r.id, i]));

// ---------------------------------------------------------------- maps: where Gerald fell asleep tonight
// Every night he's somewhere new. The shapes live in world.js; the scenery in js/scenery.js.
// regions: names that differ from the bedroom's. jackpots: which jackpot sits on the side table / by his right hand.
export const MAPS = {
  bedroom: { name: "Gerald's Bed", icon: '🛏️', line: 'Home, sweet home. Mind the nightstands.', critter: 'cat', out: 'You fell off the bed! Climbing back up...', fell: 'fell off the bed', knocked: 'knocked {v} off the bed',
    jackpots: { stand: 'globe', hand: 'remote' }, regions: {} },
  beach: { name: 'Beach Snooze', icon: '🏖️', line: "He dozed off on the beach and never went home. The tide is coming in...", critter: 'gull', out: 'Washed out to sea! Paddling back...', fell: 'got washed out to sea', knocked: 'knocked {v} into the sea',
    jackpots: { stand: 'conch', hand: 'pail' }, regions: { bed: 'The Beach', pillow: 'Towel Roll', blanket: 'Towel Dunes', stand: 'Rock' }, tide: true },
  camp: { name: 'Campout', icon: '🏕️', line: 'Sleeping under the stars on a camping cot. Bandit the raccoon lives here...', critter: 'raccoon', out: 'You fell off the cot! Climbing back up...', fell: 'fell off the cot', knocked: 'knocked {v} off the cot',
    jackpots: { stand: 'compass', hand: 'harmonica' }, regions: { bed: 'The Cot', pillow: 'Camp Pillow', blanket: 'Sleeping Bag Hills', stand: 'Cooler' } },
  hammock: { name: 'Garden Hammock', icon: '🌳', line: 'Napping in the garden hammock. It sways... hold on to your loot!', critter: 'cat', out: 'You fell out of the hammock! Climbing back up...', fell: 'fell out of the hammock', knocked: 'knocked {v} out of the hammock',
    jackpots: { stand: 'lemonade', hand: 'gnome' }, regions: { bed: 'The Hammock', blanket: 'Blanket Hills', stand: 'Garden Table' }, sway: true },
};
export const MAP_IDS = Object.keys(MAPS);
/** a region's name on a map */
export function regionName(ri, map) { const r = REGIONS[ri]; if (!r) return ''; return (MAPS[map] && MAPS[map].regions[r.id]) || r.name; }
// the animal that visits each map (they all chase movement)
export const CRITTERS = {
  cat: { name: 'Mr. Biscuits', emoji: '🐈', title: 'MR. BISCUITS IS HERE!', sub: 'Cats chase movement. Hold still...', call: 'cat_meow', warn: 'cat_hiss', arrive: 'jumped up next to Gerald', hit: 'batted {v} across the bed', leave: 'got bored and left' },
  gull: { name: 'Captain Squawk', emoji: '🐦', title: 'CAPTAIN SQUAWK IS HERE!', sub: 'Seagulls dive at anything that moves. Hold still...', call: 'gull_call', warn: 'gull_screech', arrive: 'swooped in from the sea', hit: 'dive-bombed {v}', leave: 'flew off to look for chips' },
  raccoon: { name: 'Bandit', emoji: '🦝', title: 'BANDIT THE RACCOON IS HERE!', sub: 'Raccoons pounce on anything that moves. Hold still...', call: 'raccoon_chitter', warn: 'raccoon_hiss', arrive: 'climbed onto the cot', hit: 'bowled {v} over', leave: 'wandered off to look for snacks' },
};

// ---------------------------------------------------------------- loot
// value [min,max], mass (heavier = slower carry), r radius, fragile (loses value on hard hits, can break),
// floaty (drifts, low gravity), sticky (doesn't bounce), regions: where it spawns (weight).
export const LOOT = {
  crumb:   { name: 'Toast Crumb',        value: [6, 12],    mass: 0.5, r: 0.34, color: 0xc98a3c, regions: { beard: 5, pillow: 2, chest: 2, bed: 1 } },
  cheerio: { name: 'Fossil Cheerio',     value: [24, 36],   mass: 0.6, r: 0.42, color: 0xe0b060, regions: { beard: 3, chest: 2, belly: 1 } },
  gumball: { name: 'Belly Gumball',      value: [24, 42],   mass: 0.5, r: 0.42, color: 0xff6fae, glow: 0x551133, bouncy: true, regions: { navel: 6, belly: 1 } },
  earbud:  { name: 'Golden Earbud',      value: [50, 74],   mass: 1.1, r: 0.48, color: 0xf2c440, glow: 0x553300, regions: { ear: 8 } },
  wish:    { name: 'Wishing Eyelash',    value: [52, 76],   mass: 0.2, r: 0.50, color: 0xffe6a0, glow: 0x886600, fragile: true, floaty: true, regions: { eyes: 5, brow: 2, cheek: 1 } },
  jelly:   { name: 'Jellybean',          value: [14, 24],   mass: 0.4, r: 0.38, color: 0x7fe05a, regions: { sock: 4, blanket: 2, pillow: 1 } },
  duck:    { name: 'Tiny Rubber Duck',   value: [58, 80],   mass: 1.0, r: 0.55, color: 0xffd23a, bouncy: true, squeaky: true, regions: { sock: 3, blanket: 1 } },
  coin:    { name: 'Lost Penny',         value: [30, 46],   mass: 1.4, r: 0.60, color: 0xc0703a, regions: { bed: 4, blanket: 3, pillow: 2 } },
  button:  { name: 'Pajama Button',      value: [18, 30],   mass: 0.8, r: 0.50, color: 0xf5f0e0, regions: { chest: 4, belly: 2 } },
  mint:    { name: 'Pocket Mint',        value: [26, 38],   mass: 0.4, r: 0.36, color: 0xd8fff0, fragile: true, regions: { pillow: 2, blanket: 2, chest: 1, pocket: 3 } },
  sprinkle:{ name: 'Rainbow Sprinkle',   value: [10, 18],   mass: 0.3, r: 0.32, color: 0xff7ad9, regions: { beard: 2, chest: 1, cheek: 2, hair: 3, brow: 1, nose: 2, mouth: 1, neck: 1 } },
  bubble:  { name: 'Dream Bubble',       value: [90, 160],  mass: 0.2, r: 0.62, color: 0xd9b3ff, glow: 0x7744cc, fragile: true, floaty: true, regions: {} },
  glasses: { name: 'Reading Glasses',    value: [150, 185], mass: 2.2, r: 0.85, color: 0x7a4a2a, fragile: true, regions: {}, jackpot: true },
  watch:   { name: 'Gold Pocket Watch',  value: [210, 260], mass: 3.0, r: 0.75, color: 0xffd34d, glow: 0x664400, regions: {}, jackpot: true },
  ring:    { name: 'Wedding Ring',       value: [240, 300], mass: 3.4, r: 0.85, color: 0xffd24a, glow: 0x553300, regions: {}, jackpot: true },
  globe:   { name: 'Snow Globe',         value: [160, 200], mass: 2.6, r: 0.85, color: 0xbfe6ff, glow: 0x224466, fragile: true, regions: {}, jackpot: true },
  phone:   { name: "Gerald's Phone",     value: [380, 460], mass: 5.0, r: 1.10, color: 0x222831, glow: 0x3355aa, regions: {}, jackpot: true, rings: true },
  remote:  { name: 'TV Remote',          value: [160, 200], mass: 3.4, r: 0.95, color: 0x2d2d33, regions: {}, jackpot: true },
  golfball:{ name: 'Golf Ball',          value: [28, 34],   mass: 0.7, r: 0.40, color: 0xffffff, bouncy: true, regions: { bed: 3, blanket: 3, chest: 2, belly: 2, pillow: 1 } },
  pea:     { name: 'Golden Pea',         value: [120, 140], mass: 0.6, r: 0.42, color: 0xfff25a, glow: 0x776600, regions: {} },
  // map loot: only spawns on the maps listed (jackpots are placed by the map, see MAPS)
  shell:   { name: 'Seashell',           value: [20, 34],   mass: 0.6, r: 0.50, color: 0xffd9c7, maps: ['beach'], regions: { bed: 5, blanket: 3, pillow: 1, sock: 1 } },
  seaglass:{ name: 'Sea Glass',          value: [36, 52],   mass: 0.5, r: 0.42, color: 0x7fe0c0, glow: 0x0f4a3a, maps: ['beach'], regions: { bed: 3, belly: 1, chest: 1, blanket: 1 } },
  conch:   { name: 'Golden Conch',       value: [200, 250], mass: 3.2, r: 0.95, color: 0xffcf6a, glow: 0x553300, maps: ['beach'], regions: {}, jackpot: true },
  pail:    { name: 'Toy Bucket & Spade', value: [160, 200], mass: 3.0, r: 1.00, color: 0x3fa9f5, maps: ['beach'], regions: {}, jackpot: true },
  marshmallow: { name: 'Marshmallow',    value: [14, 24],   mass: 0.4, r: 0.45, color: 0xfff7f0, bouncy: true, maps: ['camp'], regions: { bed: 3, blanket: 4, belly: 1, chest: 1, pillow: 1 } },
  acorn:   { name: 'Acorn',              value: [20, 32],   mass: 0.7, r: 0.42, color: 0xa86a32, maps: ['camp', 'hammock'], regions: { bed: 3, blanket: 2, hair: 1, beard: 1 } },
  compass: { name: 'Brass Compass',      value: [200, 240], mass: 2.8, r: 0.85, color: 0xd9a441, glow: 0x443300, maps: ['camp'], regions: {}, jackpot: true },
  harmonica: { name: 'Harmonica',        value: [160, 200], mass: 2.6, r: 0.95, color: 0xc8ccd6, maps: ['camp'], regions: {}, jackpot: true, squeaky: true },
  strawberry: { name: 'Strawberry',      value: [22, 34],   mass: 0.6, r: 0.45, color: 0xff4a5a, maps: ['hammock'], regions: { bed: 3, blanket: 3, belly: 2, chest: 1 } },
  petal:   { name: 'Rose Petal',         value: [16, 26],   mass: 0.15, r: 0.50, color: 0xff8fb8, floaty: true, maps: ['hammock'], regions: { bed: 2, blanket: 2, chest: 1, belly: 1, hair: 1, cheek: 1 } },
  lemonade:{ name: 'Glass of Lemonade',  value: [170, 210], mass: 3.0, r: 0.95, color: 0xfff27a, glow: 0x444400, fragile: true, maps: ['hammock'], regions: {}, jackpot: true },
  gnome:   { name: 'Tiny Garden Gnome',  value: [180, 220], mass: 3.4, r: 1.00, color: 0xe0413a, maps: ['hammock'], regions: {}, jackpot: true },
};
export const LOOT_IDS = Object.keys(LOOT);
export const LOOT_INDEX = Object.fromEntries(LOOT_IDS.map((k, i) => [k, i]));
/** carry speed multiplier for a mass */
export const carryMul = mass => 1 / (1 + mass * 0.17);

// ---------------------------------------------------------------- shop items
// kind: 'use' (instant), 'throw' (aimed lob, shows an arc), 'place' (dropped at your feet), 'passive' (lasts the night)
export const ITEMS = {
  banana:  { name: 'Banana Peel',     icon: '🍌', price: 45, kind: 'place', desc: 'Drop it. The next goblin to step on it goes flying and drops their loot.' },
  kazoo:   { name: 'Framing Kazoo',   icon: '🎺', price: 70, kind: 'use',   desc: 'A HUGE honk... blamed on the nearest rival. Gerald will know who to swat.' },
  feather: { name: 'Tickle Feather',  icon: '🪶', price: 70, kind: 'throw', desc: 'Lob it anywhere on Gerald. Moments later he scratches that exact spot.' },
  driver:  { name: 'Big Driver',      icon: '🏌️', price: 85, kind: 'passive', desc: 'Your next 3 swings hit twice as hard. Fore!' },
  coffee:  { name: 'Espresso Bean',   icon: '☕', price: 55, kind: 'use',   desc: '12 seconds of silent, tireless, much faster running.' },
  floss:   { name: 'Floss Grapple',   icon: '🧵', price: 85, kind: 'throw', desc: 'Shoot dental floss at a spot and zip to it. 3 shots.', charges: 3 },
  trap:    { name: 'Mousetrap',       icon: '🪤', price: 75, kind: 'place', desc: 'Snaps the next rival who steps on it. Great guarding a stash.' },
  lullaby: { name: 'Music Box',       icon: '🎶', price: 105, kind: 'use',   desc: 'Plays a lullaby: noise drops a lot and stays low for 10 seconds.' },
  magnet:  { name: 'Fridge Magnet',   icon: '🧲', price: 115, kind: 'use',   desc: 'For 8 seconds, loose loot nearby slides toward you.' },
  pepper:  { name: 'Pepper Shaker',   icon: '🧂', price: 60, kind: 'throw', desc: 'A pepper cloud. Anyone inside does tiny (loud) sneezes and slows down.' },
  wrap:    { name: 'Bubble Wrap',     icon: '🫧', price: 60, kind: 'passive', desc: "Tonight your fragile loot can't break, and the next 2 slaps don't make you drop." , charges: 2 },
  chain:   { name: 'Ball & Chain',    icon: '⛓️', price: 90, kind: 'throw', desc: 'Lob it at a rival: they drag a heavy ball for 10 seconds.' },
  rocket:  { name: 'Hairspray Rocket',icon: '🚀', price: 100, kind: 'use',   desc: 'A loud 2-second blast of hairspray thrust. Up, up and away.' },
  decoy:   { name: 'Wind-up Goblin',  icon: '🪆', price: 55, kind: 'place', desc: 'A noisy toy that waddles off. Gerald swats it instead of you.' },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const INV_SLOTS = 3;

// ---------------------------------------------------------------- dreams (one rule twist per night)
export const DREAMS = {
  none:     { name: 'A Dreamless Sleep',       line: 'zzz... mmh... zzz...', desc: 'Just a normal night. Enjoy it while it lasts.' },
  flying:   { name: 'Gerald Dreams of Flying', line: "wheee... I'm a pigeon... I'm a BEAUTIFUL pigeon...", desc: 'Low gravity: huge jumps, floaty throws.' },
  money:    { name: 'Gerald Dreams of Money',  line: "it's all mine... the coins... they're warm...", desc: 'All loot is worth double, but noise counts 50% more.' },
  golf:     { name: 'Gerald Dreams of Golf',   line: "fore... FORE... why won't they listen...", desc: 'Swings hit 2x harder, golf balls everywhere, trick shots pay double.' },
  ex:       { name: 'Gerald Dreams of His Ex', line: 'Brenda... BRENDA... you took the good blender...', desc: 'Restless: noise fades half as fast and he twitches a lot.' },
  butter:   { name: 'Gerald Dreams of Butter', line: 'more butter... no, MORE...', desc: 'Everything is slippery. Stopping is a suggestion.' },
  tiny:     { name: 'Gerald Dreams He Is Tiny', line: 'everyone is so big... so very big...', desc: 'Goblins are huge tonight: stronger slaps, louder footsteps.' },
  dark:     { name: 'Gerald Dreams of Nothing',line: '...the void... it is cozy...', desc: 'The lamp is off. Only loot glows. Bring a friend (to blame).' },
  jelly:    { name: 'Gerald Dreams of Jelly',  line: 'wobble wobble... I am the jelly now...', desc: 'His body is bouncy: land on him and you trampoline.' },
  thieves:  { name: 'Gerald Dreams of Thieves',line: 'someone is in my house... tiny... many...', desc: 'Stealing from stashes is 3x faster. Guard your bottle cap.' },
  flood:    { name: 'Gerald Dreams of the Sea',line: 'the tide... the tide is coming... grandpa no...', desc: 'The bed floods! Water rises all night. Gerald is an island.' },
  peas:     { name: 'Gerald Dreams of Peas',   line: 'peas... golden peas... the princess was RIGHT...', desc: 'Golden peas rain from the ceiling all night ($120+ each).' },
  speed:    { name: 'Gerald Dreams of Racing', line: 'vroom... VROOM... the go-karts...', desc: 'Everything moves 35% faster.' },
};
export const DREAM_IDS = Object.keys(DREAMS);

// ---------------------------------------------------------------- modifiers (lobby toggles)
// type: 'bool' | 'choice'. Every entry is shown in the lobby, grouped by `group`.
export const MODS = [
  // match
  { id: 'nights', group: 'Match', name: 'Nights', type: 'choice', options: [3, 4, 5, 7], def: 5 },
  { id: 'nightLen', group: 'Match', name: 'Night length', type: 'choice', options: [150, 210, 270, 330, 390], labels: ['2:30', '3:30', '4:30', '5:30', '6:30'], def: 270 },
  { id: 'shop', group: 'Match', name: 'Pawn Rat shop', type: 'bool', def: true },
  { id: 'startCash', group: 'Match', name: 'Starting cash', type: 'choice', options: [0, 100, 250, 500], labels: ['$0', '$100', '$250', '$500'], def: 100 },
  { id: 'teams', group: 'Match', name: 'Teams', type: 'choice', options: ['ffa', 'duos', 'two'], labels: ['Free for all', 'Duos', '2 teams'], def: 'ffa' },
  { id: 'bots', group: 'Match', name: 'Fill with bots up to', type: 'choice', options: [0, 2, 4, 6, 8], def: 6 },
  { id: 'botSkill', group: 'Match', name: 'Bot skill', type: 'choice', options: ['easy', 'normal', 'hard', 'chaos'], labels: ['Dozy', 'Normal', 'Sneaky', 'Gremlin'], def: 'normal' },
  // Gerald
  { id: 'sleep', group: 'Gerald', name: 'How deep he sleeps', type: 'choice', options: [0.6, 1, 1.4, 2], labels: ['Like a log', 'Normal', 'Light sleeper', 'Insomniac'], def: 1 },
  { id: 'micNoise', group: 'Gerald', name: 'Your real voice wakes him', type: 'bool', def: true },
  { id: 'twitches', group: 'Gerald', name: 'Twitches', type: 'bool', def: true },
  { id: 'scratches', group: 'Gerald', name: 'Scratches', type: 'bool', def: true },
  { id: 'swats', group: 'Gerald', name: 'Hand swats', type: 'bool', def: true },
  { id: 'sneezes', group: 'Gerald', name: 'Sneezes', type: 'bool', def: true },
  { id: 'rollovers', group: 'Gerald', name: 'Roll-overs', type: 'bool', def: true },
  { id: 'wakeups', group: 'Gerald', name: 'Wake-ups (FREEZE!)', type: 'bool', def: true },
  { id: 'snoreWind', group: 'Gerald', name: 'Snore wind', type: 'bool', def: true },
  { id: 'cat', group: 'Gerald', name: 'Critters (Mr. Biscuits & friends)', type: 'bool', def: true },
  // chaos
  { id: 'dreams', group: 'Chaos', name: 'Dream twist each night', type: 'bool', def: true },
  { id: 'gravity', group: 'Chaos', name: 'Gravity', type: 'choice', options: [0.45, 0.7, 1, 1.4], labels: ['Moon', 'Floaty', 'Normal', 'Heavy'], def: 1 },
  { id: 'speed', group: 'Chaos', name: 'Game speed', type: 'choice', options: [0.8, 1, 1.25, 1.5], labels: ['Sleepy', 'Normal', 'Fast', 'Zoomies'], def: 1 },
  { id: 'size', group: 'Chaos', name: 'Goblin size', type: 'choice', options: [0.7, 1, 1.6], labels: ['Teeny', 'Normal', 'Chonky'], def: 1 },
  { id: 'bigHeads', group: 'Chaos', name: 'Big heads', type: 'bool', def: false },
  { id: 'golf', group: 'Chaos', name: 'Swing power', type: 'choice', options: [1, 2, 3], labels: ['Normal', 'Golf pro', 'Cannon'], def: 1 },
  { id: 'noodle', group: 'Chaos', name: 'Noodle mode (every hit ragdolls)', type: 'bool', def: false },
  { id: 'butter', group: 'Chaos', name: 'Butterfingers (drop loot randomly)', type: 'bool', def: false },
  { id: 'slippery', group: 'Chaos', name: 'Slippery everything', type: 'bool', def: false },
  { id: 'glass', group: 'Chaos', name: 'All loot is fragile', type: 'bool', def: false },
  { id: 'loot', group: 'Chaos', name: 'Loot amount', type: 'choice', options: [0.5, 1, 2, 3], labels: ['Scarce', 'Normal', 'Loads', 'Avalanche'], def: 1 },
  { id: 'raids', group: 'Chaos', name: 'Stash raiding', type: 'bool', def: true },
  { id: 'stamina', group: 'Chaos', name: 'Infinite stamina', type: 'bool', def: false },
  { id: 'freeItems', group: 'Chaos', name: 'Free random item each night', type: 'bool', def: false },
  // voice
  { id: 'voiceRange', group: 'Voice', name: 'Proximity voice range', type: 'choice', options: [14, 28, 55, 9999], labels: ['Whisper', 'Normal', 'Loud', 'Everyone hears all'], def: 28 },
];
export const MOD_DEFAULTS = Object.fromEntries(MODS.map(m => [m.id, m.def]));
export const DREAM_DEFAULT_POOL = DREAM_IDS.filter(d => d !== 'none');

export const PRESETS = [
  { id: 'classic', name: 'Classic', desc: 'The way Gerald intended.', mods: {} },
  { id: 'chaos', name: 'Total Chaos', desc: 'Everything, all at once, louder.', mods: { sleep: 1.4, golf: 2, noodle: true, butter: true, loot: 2, gravity: 0.7, speed: 1.25 } },
  { id: 'golf', name: 'Golf Brawl', desc: 'Swing at everything. Fore.', mods: { golf: 3, noodle: true } },
  { id: 'silent', name: 'Silent Night', desc: 'He wakes if you breathe. Whisper.', mods: { sleep: 2, voiceRange: 14 } },
  { id: 'butter', name: 'Butter Dimension', desc: 'Slippery, floaty, fast.', mods: { slippery: true, gravity: 0.45, speed: 1.25 } },
  { id: 'quick', name: 'Quick Nap', desc: 'Three short nights, about 12 minutes.', mods: { nights: 3, nightLen: 210 } },
];

// ---------------------------------------------------------------- Gerald talks in his sleep
export const SLEEP_TALK = [
  'nnno mum... the geese aren\'t ready...',
  'five more minutes... five more years...',
  "who put a tiny man in my beard...",
  'the cheese... has opinions...',
  'I did NOT eat the drywall, Gary...',
  'mmhh... grandma\'s haunted lasagna...',
  "that's not a tax return, that's a raccoon...",
  'put the moon back... put it BACK...',
  'yes officer, the horse can drive...',
  'my pillow is made of marshmallows...',
  "don't tell the toaster...",
  'tiny feet... so many tiny feet...',
  'I am the captain of the couch...',
  "no... no... it's MY penny...",
  'the pickles are unionising...',
  'hhhhonk... (it was a goose)...',
  'Brenda... the blender was a GIFT...',
  'who is... stealing... my earbuds...',
  'big toe... why is my big toe whispering...',
  'eight thousand bees... in a trench coat...',
  'I love you too, Mr. Biscuits...',
  "it tickles... it TICKLES...",
  'the dentist is a wizard...',
  'my belly button... has a gift shop...',
  'zzzz... sssnrrk... zzzz...',
  'mmm... pancakes... a tower of pancakes...',
  "tell the pigeons I said sorry...",
  'is that... a contractor... on my nose...',
  "I didn't sign up for the tiny Olympics...",
  'sock... sock... where is the other sock...',
];
export const WAKE_LINES = [
  'WHO IS THERE?!',
  "WHAT'S THAT NOISE?!",
  'HELLO?! ...MR. BISCUITS?!',
  'I KNOW SOMEONE IS ON MY FACE!',
  'WHO TOOK MY PENNY?!',
];
export const SETTLE_LINES = [
  '...must have been a dream...',
  "...stupid pigeons...",
  '...I need a new mattress...',
  '...ok... ok... back to the geese...',
];

// Pawn Rat, who buys the loot and sells the gadgets between nights
export const RAT_LINES = [
  "Ahh, my favourite little thieves. Spend it, spend it.",
  "Everything's for sale. Except my dignity. That's sold out.",
  "That Gerald. Sleeps like a dead walrus. Bless him.",
  "No refunds. No receipts. No questions. No pants.",
  "The kazoo? Classic. Frame a friend, keep a friend.",
  "Psst. The phone on the nightstand. Heavy. Worth it.",
  "If he wakes up, you never met me.",
  "Bubble wrap: for the clumsy and the beautiful.",
];

// ---------------------------------------------------------------- bot names
export const BOT_NAMES = ['Nibbles', 'Crumb Lord', 'Sir Fluff', 'Button Tony', 'Sock Steve', 'Pip', 'Belly Pete', 'Mint Witch',
  'Biscuit Bob', 'Lady Thimble', 'Pocket Kevin', 'Dust Bunny', 'Mungo', 'Fuzzy Frank', 'The Count of Crumbs', 'Little Dorris'];
export const BOT_SKILL = {
  easy: { react: 1.1, aim: 0.55, greed: 0.6, aggro: 0.15, care: 0.2, items: 0.2 },
  normal: { react: 0.55, aim: 0.78, greed: 0.8, aggro: 0.35, care: 0.55, items: 0.5 },
  hard: { react: 0.28, aim: 0.92, greed: 1, aggro: 0.5, care: 0.85, items: 0.8 },
  chaos: { react: 0.35, aim: 0.85, greed: 0.7, aggro: 0.95, care: 0.25, items: 1 },
};

// colours handed out to players who haven't picked a distinct one (matches cosmetics' free colours where possible)
export const SEAT_COLORS = [0xff4d6d, 0x3fb7ff, 0x7bd94c, 0xffc233, 0xb06bff, 0xff8a3d, 0x33e0c4, 0xff6ad5];
export const TEAM_COLORS = [0xff4d6d, 0x3fb7ff, 0x7bd94c, 0xffc233];

// awards handed out at the end of each night: id -> label, bonus cash
export const AWARDS = {
  trick: { name: 'Trick Shot', icon: '⛳', bonus: 40, desc: 'longest throw into their stash' },
  ringout: { name: 'Bouncer', icon: '🥾', bonus: 40, desc: 'knocked the most goblins off the bed' },
  thief: { name: 'Pickpocket', icon: '🦝', bonus: 30, desc: 'stole the most from stashes' },
  mule: { name: 'Pack Mule', icon: '🐴', bonus: 25, desc: 'banked the heaviest thing' },
  loud: { name: 'Loudmouth', icon: '📢', bonus: 0, desc: 'made the most noise' },
  pancake: { name: 'Pancake', icon: '🥞', bonus: 0, desc: 'got flattened the most' },
  butter: { name: 'Butterfingers', icon: '🧈', bonus: 0, desc: 'broke the most loot' },
  waker: { name: 'THE WAKER', icon: '⏰', bonus: 0, desc: 'woke Gerald up (and paid for it)' },
};

// the clock: nights run from 11 PM to 6 AM
export function clockLabel(frac) {
  const mins = Math.floor(frac * 7 * 60);
  const h = (23 + Math.floor(mins / 60)) % 24, m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
