// ============================================================================
// CRITTER POP · 萌宠开心消消乐 — CRITTER TILES & 8 VINE TREE LEVELS
// Inspired by 《开心消消乐》 (Anipop):
//   - 6 Distinct Smiling Critter Head Tiles (High-contrast glossy candy cushions)
//   - Special Power Tiles:
//       'line_h' = Horizontal Line Blast (四连横线特效 ↔️)
//       'line_v' = Vertical Line Blast   (四连竖线特效 ↕️)
//       'bomb'   = 3x3 Boom Wrapper      (T/L型爆炸特效 💣)
//       'bird'   = CraftyCorn Magic Bird (五连魔力鸟 🌈🦄)
//   - Board Cell Overlays:
//       ice: 0 | 1 | 2  (1-layer Frost Ice 🧊, 2-layer Deep Glacier Ice ❄️)
//       honey: 0 | 1    (Golden Honey Jar 🍯)
// ============================================================================

export const CRITTER_TYPES = [
  {
    id: 'dogday',
    name: 'DogDay · 日犬',
    short: '日犬',
    icon: 'icons/dogday.jpg',
    badge: '☀️',
    bgGrad: ['#ffba08', '#e85d04'],
    border: '#fff3b0',
    glow: '#ff9f1c',
    earStyle: 'dog'
  },
  {
    id: 'catnap',
    name: 'CatNap · 瞌睡猫',
    short: '瞌睡猫',
    icon: 'icons/catnap.jpg',
    badge: '🌙',
    bgGrad: ['#b197fc', '#5f3dc4'],
    border: '#f3d9fa',
    glow: '#9775fa',
    earStyle: 'cat'
  },
  {
    id: 'bobby',
    name: 'Bobby · 抱抱熊',
    short: '抱抱熊',
    icon: 'icons/bobby.jpg',
    badge: '❤️',
    bgGrad: ['#ff758f', '#c9184a'],
    border: '#ffe5ec',
    glow: '#ff4d6d',
    earStyle: 'bear'
  },
  {
    id: 'bubba',
    name: 'Bubba · 聪聪象',
    short: '聪聪象',
    icon: 'icons/bubba.jpg',
    badge: '💧',
    bgGrad: ['#4cc9f0', '#0077b6'],
    border: '#caf0f8',
    glow: '#38bdf8',
    earStyle: 'elephant'
  },
  {
    id: 'hoppy',
    name: 'Hoppy · 跳跳兔',
    short: '跳跳兔',
    icon: 'icons/hoppy.jpg',
    badge: '🍀',
    bgGrad: ['#74c69d', '#2d6a4f'],
    border: '#d8f3dc',
    glow: '#52b788',
    earStyle: 'bunny'
  },
  {
    id: 'kickin',
    name: 'Kickin · 酷酷鸡',
    short: '酷酷鸡',
    icon: 'icons/kickin.jpg',
    badge: '⭐',
    bgGrad: ['#ffe066', '#d97706'],
    border: '#fef9c3',
    glow: '#ffd60a',
    earStyle: 'chicken'
  }
];

export const MAGIC_BIRD_CRITTER = {
  id: 'craftycorn',
  name: 'CraftyCorn Magic Bird · 彩虹魔力鸟',
  icon: 'icons/craftycorn.jpg',
  badge: '🌈'
};

export const COMBO_CALLOUTS = [
  { min: 2, en: 'GOOD!',         cn: '干得漂亮!', color: '#74c69d', pts: 100 },
  { min: 3, en: 'GREAT!',        cn: '太棒啦!',   color: '#4cc9f0', pts: 250 },
  { min: 4, en: 'EXCELLENT!',    cn: '精彩绝伦!', color: '#ffd166', pts: 500 },
  { min: 5, en: 'AMAZING!',      cn: '不可思议!', color: '#ff758f', pts: 800 },
  { min: 6, en: 'UNBELIEVABLE!', cn: '消消乐之神!', color: '#b197fc', pts: 1200 }
];

// 8 Giant Vine Tree Levels (藤蔓大树8大闯关章节)
export const LEVELS = [
  {
    level: 1,
    title: 'LV.1 阳光初芽 · Sunlit Sprout',
    subtitle: 'Match 3+ Critter Heads! Make 4/5 in a row for Special Bombs! · 三消闯关，四连直线，五连魔力鸟！',
    hostName: 'DogDay · 日犬',
    hostIcon: 'icons/dogday.jpg',
    moves: 30,
    starScores: [1200, 2600, 4200],
    goals: [
      { type: 'critter', id: 'dogday', label: 'DogDay · 日犬', icon: 'icons/dogday.jpg', emoji: '☀️', count: 12 },
      { type: 'critter', id: 'hoppy',  label: 'Hoppy · 跳跳兔', icon: 'icons/hoppy.jpg',  emoji: '🍀', count: 12 }
    ],
    iceMap: [],
    honeyMap: [],
    startingSpecials: [
      { r: 3, c: 3, special: 'line_h' }
    ]
  },
  {
    level: 2,
    title: 'LV.2 破冰行动 · Frosty Ice Breaker',
    subtitle: 'Match Critters on top of 🧊 Ice Tiles to shatter the frost! · 消除冰块上的萌宠即可击碎冰层！',
    hostName: 'Bubba · 聪聪象',
    hostIcon: 'icons/bubba.jpg',
    moves: 32,
    starScores: [1600, 3200, 5000],
    goals: [
      { type: 'ice', label: 'Break Ice · 击碎冰块', emoji: '🧊', count: 12 }
    ],
    iceMap: [
      [2, 2, 1], [2, 3, 1], [2, 4, 1], [2, 5, 1],
      [3, 2, 1],                       [3, 5, 1],
      [4, 2, 1],                       [4, 5, 1],
      [5, 2, 1], [5, 3, 1], [5, 4, 1], [5, 5, 1]
    ],
    honeyMap: [],
    startingSpecials: [
      { r: 3, c: 3, special: 'bomb' }
    ]
  },
  {
    level: 3,
    title: 'LV.3 甜蜜蜂罐 · Golden Honey Garden',
    subtitle: 'Collect 🍯 Honey Jars & ❤️ Bobby BearHug tiles! · 收集甜心蜂蜜罐与抱抱熊！',
    hostName: 'Bobby BearHug · 抱抱熊',
    hostIcon: 'icons/bobby.jpg',
    moves: 32,
    starScores: [1800, 3600, 5500],
    goals: [
      { type: 'honey', label: 'Honey Jars · 蜂蜜罐', emoji: '🍯', count: 10 },
      { type: 'critter', id: 'bobby', label: 'Bobby · 抱抱熊', icon: 'icons/bobby.jpg', emoji: '❤️', count: 14 }
    ],
    iceMap: [],
    honeyMap: [
      [1, 3], [1, 4],
      [3, 1], [3, 3], [3, 4], [3, 6],
      [4, 1], [4, 3], [4, 4], [4, 6]
    ],
    startingSpecials: [
      { r: 2, c: 3, special: 'line_v' }
    ]
  },
  {
    level: 4,
    title: 'LV.4 魔力鸟彩虹屋 · CraftyCorn Magic Bird',
    subtitle: 'Swap the 🌈 Magic Bird with any Critter to clear ALL of that color! · 交换魔力鸟全屏消除同色萌宠！',
    hostName: 'CraftyCorn · 独角兽',
    hostIcon: 'icons/craftycorn.jpg',
    moves: 32,
    starScores: [2200, 4200, 6500],
    goals: [
      { type: 'critter', id: 'catnap', label: 'CatNap · 瞌睡猫', icon: 'icons/catnap.jpg', emoji: '🌙', count: 15 },
      { type: 'critter', id: 'bubba',  label: 'Bubba · 聪聪象',  icon: 'icons/bubba.jpg',  emoji: '💧', count: 15 }
    ],
    iceMap: [
      [3, 2, 1], [3, 5, 1], [4, 2, 1], [4, 5, 1]
    ],
    honeyMap: [],
    startingSpecials: [
      { r: 3, c: 3, special: 'bird' },
      { r: 4, c: 4, special: 'line_h' }
    ]
  },
  {
    level: 5,
    title: 'LV.5 双层玄冰 · Deep Glacier Shrine',
    subtitle: 'Thick ❄️ 2-Layer Ice takes 2 blasts to clear — use 💣 Bombs & ⚡ Lasers! · 双层冰块需消除2次！',
    hostName: 'CatNap · 瞌睡猫',
    hostIcon: 'icons/catnap.jpg',
    moves: 34,
    starScores: [2400, 4600, 7000],
    goals: [
      { type: 'ice', label: 'Clear All Ice · 破除玄冰', emoji: '🧊', count: 14 }
    ],
    iceMap: [
      [1, 2, 1], [1, 5, 1],
      [2, 2, 2], [2, 3, 1], [2, 4, 1], [2, 5, 2],
      [5, 2, 2], [5, 3, 1], [5, 4, 1], [5, 5, 2],
      [6, 2, 1], [6, 3, 1], [6, 4, 1], [6, 5, 1]
    ],
    honeyMap: [],
    startingSpecials: [
      { r: 3, c: 3, special: 'bird' },
      { r: 4, c: 4, special: 'bomb' }
    ]
  },
  {
    level: 6,
    title: 'LV.6 黄金甜品工坊 · Picky Honey Bakery',
    subtitle: 'Harvest 🍯 Golden Honey & ⭐ KickinChicken Star Tiles! · 甜品屋大丰收！',
    hostName: 'PickyPiggy · 佩奇猪',
    hostIcon: 'icons/picky.jpg',
    moves: 34,
    starScores: [2600, 5000, 7600],
    goals: [
      { type: 'honey', label: 'Honey Jars · 蜂蜜罐', emoji: '🍯', count: 12 },
      { type: 'critter', id: 'kickin', label: 'Kickin · 酷酷鸡', icon: 'icons/kickin.jpg', emoji: '⭐', count: 16 }
    ],
    iceMap: [],
    honeyMap: [
      [1, 1], [1, 2], [1, 5], [1, 6],
      [3, 2], [3, 5],
      [4, 2], [4, 5],
      [6, 1], [6, 2], [6, 5], [6, 6]
    ],
    startingSpecials: [
      { r: 3, c: 3, special: 'line_h' },
      { r: 4, c: 4, special: 'line_v' }
    ]
  },
  {
    level: 7,
    title: 'LV.7 翡翠运动场 · Hoppy Combo Arena',
    subtitle: 'Chain massive cascades with ⚡ Line Blasts & 💣 Bombs! · 闪电连击竞技场！',
    hostName: 'Hoppy · 跳跳兔',
    hostIcon: 'icons/hoppy.jpg',
    moves: 35,
    starScores: [2800, 5400, 8200],
    goals: [
      { type: 'ice', label: 'Break Ice · 击碎冰块', emoji: '🧊', count: 10 },
      { type: 'critter', id: 'hoppy', label: 'Hoppy · 跳跳兔', icon: 'icons/hoppy.jpg', emoji: '🍀', count: 18 },
      { type: 'critter', id: 'dogday', label: 'DogDay · 日犬', icon: 'icons/dogday.jpg', emoji: '☀️', count: 18 }
    ],
    iceMap: [
      [2, 1, 1], [2, 2, 1], [2, 5, 1], [2, 6, 1],
      [3, 3, 2], [3, 4, 2],
      [5, 1, 1], [5, 2, 1], [5, 5, 1], [5, 6, 1]
    ],
    honeyMap: [],
    startingSpecials: [
      { r: 4, c: 3, special: 'bird' },
      { r: 4, c: 4, special: 'bomb' }
    ]
  },
  {
    level: 8,
    title: 'LV.8 藤蔓树顶终章 · Magic Vine Crown Finale',
    subtitle: 'Grand Finale atop the Giant Vine Tree! Clear Ice, Honey & Critters! · 攀登消消乐大树之巅！',
    hostName: 'KickinChicken · 酷酷鸡',
    hostIcon: 'icons/kickin.jpg',
    moves: 36,
    starScores: [3200, 6200, 9500],
    goals: [
      { type: 'ice',   label: 'Break Ice · 击碎冰块', emoji: '🧊', count: 12 },
      { type: 'honey', label: 'Honey Jars · 蜂蜜罐',  emoji: '🍯', count: 8 },
      { type: 'critter', id: 'dogday', label: 'DogDay · 日犬', icon: 'icons/dogday.jpg', emoji: '☀️', count: 18 },
      { type: 'critter', id: 'catnap', label: 'CatNap · 瞌睡猫', icon: 'icons/catnap.jpg', emoji: '🌙', count: 18 }
    ],
    iceMap: [
      [1, 2, 2], [1, 3, 1], [1, 4, 1], [1, 5, 2],
      [2, 1, 1],                       [2, 6, 1],
      [5, 1, 1],                       [5, 6, 1],
      [6, 2, 2], [6, 3, 1], [6, 4, 1], [6, 5, 2]
    ],
    honeyMap: [
      [2, 2], [2, 5],
      [3, 1], [3, 6],
      [4, 1], [4, 6],
      [5, 2], [5, 5]
    ],
    startingSpecials: [
      { r: 3, c: 3, special: 'bird' },
      { r: 3, c: 4, special: 'line_h' },
      { r: 4, c: 3, special: 'bomb' }
    ]
  }
];
