// ============================================================
// CHARACTER ROSTER — With Skin Variants (Wall Kicker Style)
// ============================================================

const SKIN_VARIANTS = ["default", "shadow", "neon", "camo"];

export const CHARACTER_ROSTER = [
  {
    id: "kestrel",
    name: "Kestrel",
    title: "Jet Stepper",
    description: "Fast and balanced with a bright scarf and compact visor.",
    skins: {
      default: {
        body: "#ff946d", accent: "#ffe087", trim: "#3d201b",
        outline: "#542d24", visor: "#fff4cf", scarf: "#ff5f67",
      },
      shadow: {
        body: "#3a3a4a", accent: "#6a6a7a", trim: "#1a1a22",
        outline: "#28283a", visor: "#8888aa", scarf: "#ff2244",
      },
      neon: {
        body: "#ff00ff", accent: "#00ffff", trim: "#220033",
        outline: "#330044", visor: "#ffffff", scarf: "#ffff00",
      },
      camo: {
        body: "#5a7a4a", accent: "#8aaa6a", trim: "#2a3a1a",
        outline: "#3a4a2a", visor: "#ccddbb", scarf: "#4a6a3a",
      },
    },
  },
  {
    id: "mako",
    name: "Mako",
    title: "Wave Crasher",
    description: "Cool-toned climber with a streamlined mask and deep sea trim.",
    skins: {
      default: {
        body: "#67c9ff", accent: "#b8f0ff", trim: "#16324c",
        outline: "#1b4060", visor: "#effcff", scarf: "#49a0ff",
      },
      shadow: {
        body: "#2a2a3e", accent: "#4a4a6e", trim: "#111128",
        outline: "#1a1a3a", visor: "#6688bb", scarf: "#3355aa",
      },
      neon: {
        body: "#00ff88", accent: "#88ffcc", trim: "#003322",
        outline: "#004433", visor: "#ffffff", scarf: "#00ffff",
      },
      camo: {
        body: "#7a6a5a", accent: "#aa9a8a", trim: "#3a2a1a",
        outline: "#4a3a2a", visor: "#ddccbb", scarf: "#6a5a4a",
      },
    },
  },
  {
    id: "piper",
    name: "Piper",
    title: "Vine Hopper",
    description: "Leaf-green armor plates and a springy silhouette.",
    skins: {
      default: {
        body: "#86f0a8", accent: "#d2ffc8", trim: "#1c3b27",
        outline: "#2f5b3a", visor: "#f5ffe9", scarf: "#5bc97e",
      },
      shadow: {
        body: "#2e2e44", accent: "#4e4e6e", trim: "#161628",
        outline: "#222240", visor: "#7788aa", scarf: "#228844",
      },
      neon: {
        body: "#ffff00", accent: "#ffffff", trim: "#333300",
        outline: "#444400", visor: "#ffffff", scarf: "#ff8800",
      },
      camo: {
        body: "#4a6a3a", accent: "#6a8a5a", trim: "#1a2a0a",
        outline: "#2a3a1a", visor: "#bbccaa", scarf: "#3a5a2a",
      },
    },
  },
  {
    id: "rook",
    name: "Rook",
    title: "Sun Vault",
    description: "Gold-and-charcoal acrobat who stands out in crowded matches.",
    skins: {
      default: {
        body: "#ffd56d", accent: "#fff0b8", trim: "#45351a",
        outline: "#5b4522", visor: "#fff8de", scarf: "#ff9a5b",
      },
      shadow: {
        body: "#3a3a2e", accent: "#5a5a4e", trim: "#1a1a14",
        outline: "#2a2a1e", visor: "#8888aa", scarf: "#aa6622",
      },
      neon: {
        body: "#ff4444", accent: "#ff8888", trim: "#330000",
        outline: "#440000", visor: "#ffffff", scarf: "#ff00ff",
      },
      camo: {
        body: "#8a7a5a", accent: "#bbaa88", trim: "#3a3020",
        outline: "#4a4030", visor: "#ddddcc", scarf: "#7a6a4a",
      },
    },
  },
  {
    id: "ember",
    name: "Ember",
    title: "Afterglow",
    description: "Dusk-colored variant with bold highlights and a hotter scarf trail.",
    skins: {
      default: {
        body: "#ff8eb3", accent: "#ffd8e8", trim: "#4a2135",
        outline: "#602b45", visor: "#fff1f7", scarf: "#ff6f7e",
      },
      shadow: {
        body: "#3e2a3a", accent: "#5e4a5a", trim: "#1e1020",
        outline: "#2e1a30", visor: "#8877aa", scarf: "#aa2255",
      },
      neon: {
        body: "#00ddff", accent: "#88eeff", trim: "#002233",
        outline: "#003344", visor: "#ffffff", scarf: "#ff00aa",
      },
      camo: {
        body: "#6a5a4a", accent: "#9a8a7a", trim: "#2a1a0a",
        outline: "#3a2a1a", visor: "#ccbbaa", scarf: "#5a4a3a",
      },
    },
  },
  {
    id: "glint",
    name: "Glint",
    title: "Peak Signal",
    description: "Sleek violet-blue alternate for online lobbies.",
    skins: {
      default: {
        body: "#9ba7ff", accent: "#dee3ff", trim: "#25295f",
        outline: "#363b82", visor: "#f6f7ff", scarf: "#7587ff",
      },
      shadow: {
        body: "#2a2a44", accent: "#4a4a6e", trim: "#12122a",
        outline: "#1e1e3e", visor: "#6677aa", scarf: "#4455aa",
      },
      neon: {
        body: "#ff6600", accent: "#ffaa44", trim: "#331100",
        outline: "#442200", visor: "#ffffff", scarf: "#ffff00",
      },
      camo: {
        body: "#5a6a5a", accent: "#8a9a8a", trim: "#1a2a1a",
        outline: "#2a3a2a", visor: "#bbccbb", scarf: "#4a5a4a",
      },
    },
  },
];

const OFFLINE_PLAYER_IDS = ["p1", "p2", "p3", "p4"];

export function getSkinVariants() {
  return SKIN_VARIANTS;
}

export function getCharacterById(characterId) {
  return CHARACTER_ROSTER.find((c) => c.id === characterId) || CHARACTER_ROSTER[0];
}

/**
 * Get a character's look for a specific skin variant.
 */
export function getCharacterLook(characterId, skinId = "default") {
  const character = getCharacterById(characterId);
  return character.skins[skinId] || character.skins.default;
}

/**
 * Build a full character + skin look object.
 */
export function getCharacterWithSkin(characterId, skinId = "default") {
  const character = getCharacterById(characterId);
  const look = character.skins[skinId] || character.skins.default;
  return { ...character, look };
}

export function getFallbackCharacter(usedCharacterIds = []) {
  const char = CHARACTER_ROSTER.find((c) => !usedCharacterIds.includes(c.id)) || CHARACTER_ROSTER[0];
  return { ...char, look: char.skins.default };
}

export function buildPlayerConfig(characterId, overrides = {}) {
  const character = getCharacterById(characterId);
  const skinId = overrides.skinId || "default";
  const look = character.skins[skinId] || character.skins.default;
  return {
    id: overrides.id || character.id,
    name: overrides.name || character.name,
    color: look.body,
    characterId: character.id,
    skinId,
    look: structuredClone(look),
    spawnIndex: overrides.spawnIndex || 0,
  };
}

export function getOfflinePlayerConfigs() {
  return OFFLINE_PLAYER_IDS.map((playerId, index) =>
    buildPlayerConfig(CHARACTER_ROSTER[index].id, {
      id: playerId,
      name: CHARACTER_ROSTER[index].name,
      spawnIndex: index,
    }),
  );
}
