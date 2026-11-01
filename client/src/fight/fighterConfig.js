export const FIGHTER_ROSTER = [
  {
    id: "kai",
    number: "01",
    name: "KAI",
    title: "THE LEXICON",
    color: "#f0b429",
    glow: "#ffe6a3",
    image: "/images/fighters/kai.png",
    model: "/models/fighters/kai.glb",
    ability: "VOWEL SURGE",
    description:
      "Each vowel in your word adds +2 damage. Super meter charges 10% faster.",
    special:
      "HADOU-SPELL: 28 true damage that ignores guard and armor, then 2 of your tiles surge into vowels.",
  },
  {
    id: "maya",
    number: "02",
    name: "MAYA",
    title: "THE CIPHER",
    color: "#24cce9",
    glow: "#b8f7ff",
    image: "/images/fighters/maya.png",
    model: "/models/fighters/maya.glb",
    ability: "COMBO FLURRY",
    description:
      "Words of 5+ letters land a double hit spark for +6 bonus damage.",
    special:
      "SPINNING LETTER KICK: 24 damage, steals 15 super meter, and scrambles the opponent's rack.",
  },
  {
    id: "syntax",
    number: "03",
    name: "COL. SYNTAX",
    title: "IRON WALL",
    color: "#36d88c",
    glow: "#b9ffdc",
    image: "/images/fighters/syntax.png",
    model: "/models/fighters/syntax.glb",
    ability: "IRON CONSONANT",
    description:
      "Takes 15% less damage. Rare tiles (J, Q, X, Z, K) add +3 damage each.",
    special:
      "SONIC BOOM VOCAB: 30 heavy damage and a shield that fully blocks the next incoming hit.",
  },
  {
    id: "void",
    number: "04",
    name: "VOID SHADOW",
    title: "THE FORBIDDEN",
    color: "#c45bfa",
    glow: "#ecc4ff",
    image: "/images/fighters/void.png",
    model: "/models/fighters/void.glb",
    ability: "CRITICAL STRIKE",
    description:
      "Words of 6+ letters have a 40% chance to critically strike for 1.75x damage.",
    special:
      "RAGING DEMON DICTIONARY: 35 devastating damage with a screen-darkening K.O. flash.",
  },
];

export const FIGHTER_BY_ID = Object.fromEntries(
  FIGHTER_ROSTER.map((fighter) => [fighter.id, fighter])
);

export function getFighter(id) {
  return FIGHTER_BY_ID[id] || FIGHTER_ROSTER[0];
}

const CLIP_PATTERNS = {
  idle: /idle/i,
  punch: /punch|attack|slash/i,
  hit: /hit|receive|damage|stagger|impact/i,
  death: /death|die|ko|fall/i,
  victory: /victory|win|clap|taunt/i,
  guard: /guard|block|shield/i,
  ready: /stand|ready|battle/i,
  run: /run|walk/i,
  jump: /jump/i,
};

export function findClip(clips, role, fallbacks = []) {
  const pattern = CLIP_PATTERNS[role];
  if (pattern) {
    const direct = clips.find((clip) => pattern.test(clip.name));
    if (direct) return direct;
  }

  for (const fallback of fallbacks) {
    const clipPattern = CLIP_PATTERNS[fallback];
    if (!clipPattern) continue;
    const clip = clips.find((entry) => clipPattern.test(entry.name));
    if (clip) return clip;
  }

  return null;
}
