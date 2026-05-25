// ============================================================
// game-core.js — Deterministic shared game simulation
// Enhanced: Procedural Levels, Projectile Shooting, Lift Phases
// ============================================================

export const STEP_SECONDS = 1 / 60;
export const WORLD_WIDTH = 1100;
export const GROUND_Y = 960;
export const SUMMIT_Y = -2500;
export const SAFE_FALL_BUFFER = 850;

const MOVE_SPEED = 330;
const JUMP_SPEED = 850;
const GRAVITY = 2250;
const PLAYER_WIDTH = 42;
const PLAYER_HEIGHT = 58;
const PLATFORM_DROP_Y = 420;

const WEAPON_PROFILES = {
  blaster: {
    kind: "blaster",
    cooldown: 0.42,
    projectile: true,
    speed: 800,
    lifetime: 1.5,
    damage: 24,
    knockback: 480,
    color: "#fff4b2",
  },
  sword: {
    kind: "sword",
    cooldown: 0.22,
    projectile: false,
    damage: 10,
    knockback: 240,
    reach: 72,
    color: "#bde6ff",
  },
  sniper: {
    kind: "sniper",
    cooldown: 5,
    projectile: true,
    speed: 1480,
    lifetime: 2.2,
    damage: 78,
    knockback: 860,
    color: "#ffb6b6",
  },
};

// Lift constants
const LIFT_DESCENT_SPEED = 54;
const LIFT_ASCENT_SPEED = 120;
const LIFT_COUNTDOWN_SECONDS = 10;
const LIFT_APPROACH_DISTANCE = 160;

// ============================================================
// Seeded RNG utilities
// ============================================================
function nextRandom(state) {
  state.randomSeed = (state.randomSeed * 1664525 + 1013904223) % 4294967296;
  return state.randomSeed / 4294967296;
}

function randomRange(state, min, max) {
  return min + nextRandom(state) * (max - min);
}

function randomInt(state, min, max) {
  return Math.floor(randomRange(state, min, max + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// Procedural Level Generation (Supreme Duelist style)
// ============================================================
function generateLevel(state, levelNumber) {
  const platforms = [];

  // Save seed, use level-specific offset for determinism
  const savedSeed = state.randomSeed;
  state.randomSeed = (19713 + levelNumber * 7919) % 4294967296;

  // Ground platform always present
  platforms.push({ x: 80, y: GROUND_Y, w: WORLD_WIDTH - 160, h: 24, isGround: true });

  if (levelNumber === 1) {
    // Flat opening floor. The first climb starts with the lift instead of nearby platforms.
  } else {
    // --- Level 2+: Tighter corridors, more breakables, moving platforms ---
    const segmentCount = 18 + Math.min(levelNumber, 6) * 2;
    for (let i = 0; i < segmentCount; i++) {
      const y = GROUND_Y - 130 - i * 145;
      const difficulty = Math.min(levelNumber - 1, 5);

      // Main platform — narrower at higher levels
      const maxWidth = Math.max(120, 280 - difficulty * 20);
      const width = randomInt(state, Math.max(90, maxWidth - 80), maxWidth);
      const x = randomInt(state, 50, WORLD_WIDTH - width - 50);
      const isBreakable = nextRandom(state) < 0.2 + difficulty * 0.05;

      platforms.push({
        x,
        y,
        w: width,
        h: 18,
        isBreakable,
        hp: isBreakable ? randomInt(state, 2, 3) : undefined,
        maxHp: isBreakable ? 3 : undefined,
      });

      // Breakable cluster
      if (nextRandom(state) < 0.3 + difficulty * 0.06) {
        const clusterCount = randomInt(state, 2, 3 + difficulty);
        for (let c = 0; c < clusterCount; c++) {
          const bx = randomInt(state, 40, WORLD_WIDTH - 90);
          const by = y - randomInt(state, 20, 80);
          platforms.push({
            x: bx,
            y: by,
            w: randomInt(state, 44, 70),
            h: 18,
            isBreakable: true,
            hp: randomInt(state, 1, 3),
            maxHp: 3,
          });
        }
      }

      // Moving platform
      if (nextRandom(state) < 0.15 + difficulty * 0.04) {
        const moveAxis = nextRandom(state) < 0.6 ? "x" : "y";
        const mw = randomInt(state, 100, 170);
        const mx = randomInt(state, 80, WORLD_WIDTH - mw - 80);
        const my = y - randomInt(state, 30, 90);
        const moveRange = moveAxis === "x"
          ? randomInt(state, 80, 200)
          : randomInt(state, 40, 120);
        const moveSpeed = randomInt(state, 30, 70 + difficulty * 8);
        platforms.push({
          x: mx,
          y: my,
          w: mw,
          h: 18,
          isMoving: true,
          moveAxis,
          moveOrigin: moveAxis === "x" ? mx : my,
          moveRange,
          moveSpeed,
          movePhase: nextRandom(state) * Math.PI * 2,
        });
      }
    }
  }

  // Summit platforms (always)
  platforms.push({ x: 260, y: SUMMIT_Y + 150, w: 240, h: 18 });
  platforms.push({ x: 610, y: SUMMIT_Y + 120, w: 220, h: 18 });
  platforms.push({ x: 360, y: SUMMIT_Y + 40, w: 380, h: 20 });

  // Restore original seed timeline
  state.randomSeed = savedSeed;

  return platforms;
}

function updateMovingPlatforms(state, dt) {
  for (const p of state.platforms) {
    if (!p.isMoving) continue;
    p.movePhase += dt * (p.moveSpeed / p.moveRange) * Math.PI;
    const offset = Math.sin(p.movePhase) * p.moveRange;
    if (p.moveAxis === "x") {
      p.x = clamp(p.moveOrigin + offset, 10, WORLD_WIDTH - p.w - 10);
    } else {
      p.y = p.moveOrigin + offset;
    }
  }
}

// ============================================================
// Game State Factory
// ============================================================
export function createGameState(mode, playerConfigs) {
  const players = playerConfigs.map((config, index) => createPlayer(config, index));
  const state = {
    mode,
    elapsed: 0,
    phase: "climb",
    winnerId: null,
    winnerName: null,
    platforms: [],
    weapons: [],
    players,
    items: [],
    projectiles: [],
    currentLevel: 1,
    levelTransition: { active: false, timer: 0, nextLevel: 1 },
    eventText: "Climb to the summit.",
    roomCode: mode === "online" ? "" : "Local",
    message: "Climb to the summit.",
    nextWeaponAt: 3.5,
    nextLiftAt: 8,
    safeLevelY: GROUND_Y,
    checkpointY: GROUND_Y,
    liftEvent: null,
    showdownStarted: false,
    showdownEndsAt: 0,
    lastPlatformSide: 0,
    randomSeed: 19713,
    roundWins: Object.fromEntries(playerConfigs.map((config) => [config.id, 0])),
    roundBreak: null,
  };
  state.platforms = generateLevel(state, 1);
  return state;
}

export function cloneGameState(state) {
  return structuredClone(state);
}

// ============================================================
// Player Factory
// ============================================================
function createPlayer(config, index) {
  const spawn = getSpawnPosition(index, GROUND_Y);
  return {
    id: config.id,
    name: config.name,
    color: config.color,
    characterId: config.characterId || config.id,
    look: structuredClone(config.look || {}),
    x: spawn.x,
    y: spawn.y,
    w: PLAYER_WIDTH,
    h: PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    facing: index % 2 === 0 ? 1 : -1,
    onGround: false,
    health: 100,
    lives: 3,
    weapon: false,
    attackCooldown: 0,
    respawnTimer: 0,
    invulnerability: 0,
    eliminated: false,
    weaponType: null,
    attackAnimation: 0,
    attackKind: "idle",
    hurtTimer: 0,
    recoilTimer: 0,
    muzzleFlashTimer: 0,

    // Aim angle (radians, 0 = right, PI = left)
    aimAngle: 0,

    // Kinetic & Voxel Extended Fields (Wall Kickers + Minecraft)
    jumpCount: 0,
    flipAngle: 0,
    isFlipping: false,
    wallClingDir: 0,
    blockStock: 10,
    level: 1,
    xp: 0,
    xpNeeded: 100,

    // Bot AI tracking
    isBot: config.isBot || false,
    aiTimer: 0,
    aiState: "climb",
    aiTarget: null,
  };
}

// ============================================================
// Main Step Function
// ============================================================
function buildScoreboardMessage(state) {
  return state.players
    .map((player) => `${player.name} ${state.roundWins[player.id] || 0}`)
    .join("  ·  ");
}

function beginNextRound(state) {
  if (!state.roundWins) {
    state.roundWins = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  }

  for (let index = 0; index < state.players.length; index += 1) {
    const existing = state.players[index];
    const fresh = createPlayer(
      {
        id: existing.id,
        name: existing.name,
        color: existing.color,
        characterId: existing.characterId,
        look: existing.look,
        isBot: existing.isBot,
      },
      index,
    );
    Object.assign(existing, fresh);
  }

  state.elapsed = 0;
  state.phase = "climb";
  state.winnerId = null;
  state.winnerName = null;
  state.currentLevel = 1;
  state.platforms = generateLevel(state, 1);
  state.weapons = [];
  state.items = [];
  state.projectiles = [];
  state.liftEvent = null;
  state.levelTransition = { active: false, timer: 0, nextLevel: 2 };
  state.safeLevelY = GROUND_Y;
  state.checkpointY = GROUND_Y;
  state.nextWeaponAt = 3.5;
  state.nextLiftAt = 8;
  state.showdownStarted = false;
  state.showdownEndsAt = 0;
  state.lastPlatformSide = 0;
  state.roundBreak = { timer: 2.6, showScoreboard: true };
  state.eventText = "New round!";
  state.message = buildScoreboardMessage(state);
}

export function stepGameState(prevState, inputsById = {}, deltaSeconds = STEP_SECONDS) {
  const state = cloneGameState(prevState);
  state.elapsed += deltaSeconds;

  if (state.phase === "finished") {
    if (!state.roundBreak) {
      state.roundBreak = { timer: 2.8, showScoreboard: false };
    }
    state.roundBreak.timer -= deltaSeconds;
    state.eventText = `${state.winnerName || "Nobody"} wins the round!`;
    state.message = `Next round in ${Math.max(1, Math.ceil(state.roundBreak.timer))}...`;
    if (state.roundBreak.timer <= 0) {
      beginNextRound(state);
    }
    return state;
  }

  if (state.roundBreak?.showScoreboard) {
    state.roundBreak.timer -= deltaSeconds;
    state.eventText = "New round";
    state.message = buildScoreboardMessage(state);
    if (state.roundBreak.timer <= 0) {
      state.roundBreak = null;
      state.eventText = "Climb to the summit.";
      state.message = "Lv.1 — Fight!";
    } else {
      return state;
    }
  }

  // --- Level Transition Freeze ---
  if (state.levelTransition.active) {
    state.levelTransition.timer -= deltaSeconds;
    if (state.levelTransition.timer <= 0) {
      // Transition complete — generate new level
      state.currentLevel = state.levelTransition.nextLevel;
      state.platforms = generateLevel(state, state.currentLevel);
      state.safeLevelY = GROUND_Y;
      state.checkpointY = GROUND_Y;
      state.liftEvent = null;
      state.projectiles = [];

      // Reset player positions
      for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        if (player.eliminated) continue;
        const spawn = getSpawnPosition(i, GROUND_Y);
        player.x = spawn.x;
        player.y = spawn.y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = false;
        player.invulnerability = 1.5;
      }

      state.levelTransition = { active: false, timer: 0, nextLevel: state.currentLevel + 1 };
      state.eventText = `Level ${state.currentLevel} — Climb!`;
      state.message = `Entered level ${state.currentLevel}. New platforms await.`;
    } else {
      // Frozen — show countdown
      const t = Math.ceil(state.levelTransition.timer);
      state.eventText = `Level ${state.levelTransition.nextLevel} loading... ${t}s`;
      state.message = "Prepare for the next level.";
    }
    return state;
  }

  updateMovingPlatforms(state, deltaSeconds);
  updateRoundFlow(state);
  updateLiftEvent(state, deltaSeconds);
  updateWeapons(state, deltaSeconds);
  updateItems(state, deltaSeconds);
  updateProjectiles(state, deltaSeconds);

  for (const player of state.players) {
    let input = normalizeInput(inputsById[player.id]);

    if (player.isBot || player.id.startsWith("bot-")) {
      player.isBot = true;
      input = runBotState(state, player, deltaSeconds);
    }

    updatePlayer(state, player, input, deltaSeconds);
  }

  resolvePlayerPushes(state.players);
  collectWeapons(state);
  collectItems(state);
  maybeSpawnWeapons(state);
  maybeStartShowdown(state);
  maybeEndRound(state);

  // HUD text
  if (state.phase === "showdown") {
    const timeLeft = Math.max(0, Math.ceil(state.showdownEndsAt - state.elapsed));
    state.eventText = `Showdown: ${timeLeft}s to knock everyone else off.`;
    state.message = "Weapons were reset. Grab one and finish the fight.";
  } else if (state.liftEvent) {
    if (state.liftEvent.phase === "descending") {
      state.eventText = "Lift platform is descending...";
      state.message = "A new lift platform is approaching. Get ready!";
    } else if (state.liftEvent.phase === "countdown") {
      const timeLeft = Math.max(0, Math.ceil(state.liftEvent.countdown));
      state.eventText = `Get on the lift! ${timeLeft}s remaining.`;
      state.message = "Stand on the glowing lift platform before it ascends!";
    } else if (state.liftEvent.phase === "ascending") {
      state.eventText = "Lift ascending! Hold on!";
      state.message = "The lift is rising. Players left behind stay below.";
    }
  } else {
    state.eventText = `Lv.${state.currentLevel} — Climb, collect weapons, survive.`;
    state.message = "The next lift platform is coming soon.";
  }

  return state;
}

// ============================================================
// Projectile System (Skillshot City style)
// ============================================================
function computeAimAngle(input, facing) {
  const mx = input.right ? 1 : input.left ? -1 : 0;
  const my = input.up ? -1 : input.down ? 1 : 0;

  if (mx === 0 && my === 0) {
    // Default: horizontal in facing direction
    return facing === 1 ? 0 : Math.PI;
  }

  return Math.atan2(my, mx === 0 ? facing : mx);
}

function fireProjectile(state, player) {
  const profile = getWeaponProfile(player.weaponType);
  const angle = player.aimAngle;
  const id = `proj-${player.id}-${Math.round(state.elapsed * 1000)}-${Math.round(nextRandom(state) * 9999)}`;
  const cx = player.x + player.w * 0.5;
  const cy = player.y + player.h * 0.35;
  state.projectiles.push({
    id,
    x: cx,
    y: cy,
    vx: Math.cos(angle) * profile.speed,
    vy: Math.sin(angle) * profile.speed,
    ownerId: player.id,
    damage: profile.damage,
    knockback: profile.knockback,
    lifetime: profile.lifetime,
    speed: profile.speed,
    kind: profile.kind,
    color: profile.color,
    w: 8,
    h: 6,
    dead: false,
  });
  player.muzzleFlashTimer = profile.kind === "sniper" ? 0.22 : 0.1;
  player.recoilTimer = profile.kind === "sniper" ? 0.28 : 0.12;
}

function updateProjectiles(state, dt) {
  const colliders = [...state.platforms];
  if (state.liftEvent && (state.liftEvent.phase === "countdown" || state.liftEvent.phase === "ascending")) {
    colliders.push({
      x: state.liftEvent.x,
      y: state.liftEvent.currentY || state.liftEvent.targetY,
      w: state.liftEvent.w,
      h: state.liftEvent.h,
    });
  }

  for (const proj of state.projectiles) {
    if (proj.dead) continue;

    proj.lifetime -= dt;
    if (proj.lifetime <= 0) {
      proj.dead = true;
      continue;
    }

    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    // Out of bounds
    if (proj.x < -50 || proj.x > WORLD_WIDTH + 50 || proj.y < SUMMIT_Y - 500 || proj.y > GROUND_Y + 400) {
      proj.dead = true;
      continue;
    }

    // Platform collision
    for (let i = colliders.length - 1; i >= 0; i--) {
      const plat = colliders[i];
      if (
        proj.x + proj.w > plat.x &&
        proj.x < plat.x + plat.w &&
        proj.y + proj.h > plat.y &&
        proj.y < plat.y + (plat.h || 18)
      ) {
        if (plat.isBreakable) {
          plat.hp -= 1;
          if (plat.hp <= 0) {
            spawnItemDrop(state, plat.x + plat.w / 2, plat.y + (plat.h || 18) / 2);
            state.platforms.splice(state.platforms.indexOf(plat), 1);
          }
        }
        proj.dead = true;
        break;
      }
    }

    if (proj.dead) continue;

    // Player collision
    for (const target of state.players) {
      if (target.id === proj.ownerId || target.eliminated || target.respawnTimer > 0 || target.invulnerability > 0) {
        continue;
      }

      if (
        proj.x + proj.w > target.x &&
        proj.x < target.x + target.w &&
        proj.y + proj.h > target.y &&
        proj.y < target.y + target.h
      ) {
        target.health = Math.max(0, target.health - proj.damage);
        const kbDir = proj.vx >= 0 ? 1 : -1;
        target.vx += kbDir * proj.knockback;
        target.vy = Math.min(target.vy, -200);
        target.invulnerability = 0.15;
        target.hurtTimer = 0.22;
        proj.dead = true;

        // Hit drops loot
        if (nextRandom(state) < 0.4) {
          spawnItemDrop(state, target.x + target.w / 2, target.y + target.h / 2);
        }
        break;
      }
    }
  }

  state.projectiles = state.projectiles.filter((p) => !p.dead);
}

// ============================================================
// Lift Platform — Phased Descent/Countdown/Ascent System
// ============================================================
function updateRoundFlow(state) {
  if (state.phase !== "climb") return;

  if (!state.liftEvent && state.elapsed >= state.nextLiftAt && state.safeLevelY > SUMMIT_Y + 180) {
    const spacing = state.currentLevel === 1 ? 175 + randomRange(state, 0, 35) : 250 + randomRange(state, 0, 80);
    const targetY = Math.max(SUMMIT_Y + 150, state.safeLevelY - spacing);
    const startY = targetY - LIFT_APPROACH_DISTANCE;
    const width = 320;
    const x = state.lastPlatformSide % 2 === 0 ? 130 : WORLD_WIDTH - width - 130;

    state.liftEvent = {
      x,
      w: width,
      h: 18,
      targetY,
      startY,
      currentY: startY,
      phase: "descending",
      countdown: LIFT_COUNTDOWN_SECONDS,
      speed: LIFT_DESCENT_SPEED,
    };

    state.lastPlatformSide += 1;
    state.nextLiftAt = state.elapsed + (state.currentLevel === 1 ? 22 : 24) + randomRange(state, 0, 6);
  }
}

function updateLiftEvent(state, dt) {
  if (!state.liftEvent) return;

  const lift = state.liftEvent;

  if (lift.phase === "descending") {
    lift.currentY += lift.speed * dt;
    if (lift.currentY >= lift.targetY) {
      lift.currentY = lift.targetY;
      lift.phase = "countdown";
    }
  } else if (lift.phase === "countdown") {
    lift.countdown -= dt;
    if (lift.countdown <= 0) {
      lift.countdown = 0;
      lift.phase = "ascending";

      // Determine who is ON the lift and penalize anyone left behind.
      lift.ridingPlayerIds = [];
      for (const player of state.players) {
        if (player.eliminated || player.respawnTimer > 0) continue;
        if (isStandingOnLift(player, lift)) {
          lift.ridingPlayerIds.push(player.id);
        } else {
          loseLife(state, player, "Left behind by the lift");
        }
      }
    }
  } else if (lift.phase === "ascending") {
    const prevY = lift.currentY;
    lift.currentY -= LIFT_ASCENT_SPEED * dt;

    // Move riding players up with the platform
    const deltaY = lift.currentY - prevY;
    for (const pid of lift.ridingPlayerIds || []) {
      const player = state.players.find((p) => p.id === pid);
      if (player && !player.eliminated && player.respawnTimer <= 0) {
        player.y += deltaY;
        player.vy = Math.min(player.vy, 0);
        player.onGround = true;
        player.jumpCount = 0;
      }
    }

    // Update safe level
    state.safeLevelY = lift.currentY;
    state.checkpointY = lift.currentY;

    // Check if ascent is complete — reached top of section
    if (lift.currentY <= lift.targetY - 210) {
      lift.phase = "done";

      // Start level transition
      state.levelTransition = {
        active: true,
        timer: 2.0,
        nextLevel: state.currentLevel + 1,
      };
      state.liftEvent = null;
    }
  }
}

function isStandingOnLift(player, lift) {
  const playerBottom = player.y + player.h;
  const onTop = Math.abs(playerBottom - lift.currentY) < 12;
  const overlapX = player.x + player.w > lift.x + 6 && player.x < lift.x + lift.w - 6;
  return onTop && overlapX;
}

// Collider helper — returns platforms + lift surface if applicable
function getColliders(state) {
  const colliders = [...state.platforms];
  if (state.liftEvent && state.liftEvent.phase !== "done") {
    colliders.push({
      x: state.liftEvent.x,
      y: state.liftEvent.currentY,
      w: state.liftEvent.w,
      h: state.liftEvent.h,
      _isLift: true,
    });
  }
  return colliders;
}

// ============================================================
// Weapon Physics
// ============================================================
function updateWeapons(state, deltaSeconds) {
  const colliders = getColliders(state);

  for (const weapon of state.weapons) {
    if (weapon.claimedBy) {
      const holder = state.players.find((p) => p.id === weapon.claimedBy);
      if (!holder || holder.eliminated) {
        weapon.claimedBy = null;
      } else {
        weapon.x = holder.x + holder.w * 0.5 + holder.facing * 24;
        weapon.y = holder.y + 22;
      }
      continue;
    }

    weapon.vy += GRAVITY * deltaSeconds;
    weapon.x += weapon.vx * deltaSeconds;
    weapon.y += weapon.vy * deltaSeconds;

    if (weapon.y > state.safeLevelY + SAFE_FALL_BUFFER) {
      weapon.dead = true;
      continue;
    }

    for (const platform of colliders) {
      if (weapon.vy >= 0 && weapon.y + weapon.h >= platform.y && weapon.y + weapon.h <= platform.y + 20) {
        const overlapX = weapon.x + weapon.w > platform.x && weapon.x < platform.x + platform.w;
        if (overlapX) {
          weapon.y = platform.y - weapon.h;
          weapon.vy = 0;
          weapon.vx *= 0.82;
        }
      }
    }
  }

  state.weapons = state.weapons.filter((w) => !w.dead);
}

// ============================================================
// Dynamic Item Drop Engine
// ============================================================
function updateItems(state, deltaSeconds) {
  const colliders = getColliders(state);

  for (const item of state.items) {
    item.vy += GRAVITY * deltaSeconds;
    item.x += item.vx * deltaSeconds;
    item.y += item.vy * deltaSeconds;

    if (item.y > state.safeLevelY + SAFE_FALL_BUFFER) {
      item.dead = true;
      continue;
    }

    for (const platform of colliders) {
      if (item.vy >= 0 && item.y + item.h >= platform.y && item.y + item.h <= platform.y + 18) {
        const overlapX = item.x + item.w > platform.x && item.x < platform.x + platform.w;
        if (overlapX) {
          item.y = platform.y - item.h;
          item.vy = -item.vy * 0.35;
          item.vx *= 0.8;
          if (Math.abs(item.vy) < 40) item.vy = 0;
        }
      }
    }

    // Magnetism pull toward nearest player
    for (const p of state.players) {
      if (p.eliminated || p.respawnTimer > 0) continue;
      const dx = (p.x + p.w / 2) - (item.x + item.w / 2);
      const dy = (p.y + p.h / 2) - (item.y + item.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 100) {
        const force = (100 - dist) * 1.5;
        item.vx += (dx / dist) * force * deltaSeconds;
        item.vy += (dy / dist) * force * deltaSeconds;
      }
    }
  }

  state.items = state.items.filter((i) => !i.dead);
}

export function spawnItemDrop(state, x, y, specType = null) {
  let type = specType;
  if (!type) {
    const rand = nextRandom(state);
    if (rand < 0.25) type = "heart";
    else if (rand < 0.45) type = "weapon";
    else type = "xp";
  }

  const id = `item-${Math.round(state.elapsed * 1000)}-${Math.round(nextRandom(state) * 1000)}`;
  state.items.push({
    id,
    x,
    y: y - 16,
    w: 16,
    h: 16,
    vx: (nextRandom(state) - 0.5) * 220,
    vy: -280 - nextRandom(state) * 100,
    type,
    value: type === "heart" ? 25 : 15,
    dead: false,
  });
}

function collectItems(state) {
  for (const item of state.items) {
    if (item.dead) continue;

    for (const player of state.players) {
      if (player.eliminated || player.respawnTimer > 0) continue;

      const overlap =
        player.x < item.x + item.w &&
        player.x + player.w > item.x &&
        player.y < item.y + item.h &&
        player.y + player.h > item.y;

      if (overlap) {
        item.dead = true;

        if (item.type === "xp") {
          player.xp += item.value;
          if (player.xp >= player.xpNeeded) {
            player.xp -= player.xpNeeded;
            player.level += 1;
            player.xpNeeded = Math.floor(player.xpNeeded * 1.35);
            player.health = Math.min(100, player.health + 20);
          }
        } else if (item.type === "heart") {
          player.health = Math.min(100, player.health + item.value);
        } else if (item.type === "weapon" && !player.weapon) {
          player.weapon = true;
          state.weapons.push({
            id: `claimed-${player.id}-${Math.round(state.elapsed * 1000)}`,
            x: player.x,
            y: player.y,
            w: 26,
            h: 16,
            vx: 0,
            vy: 0,
            claimedBy: player.id,
            dead: false,
          });
        }
        break;
      }
    }
  }
}

// ============================================================
// Bot AI — Deterministic with aiming + lift awareness
// ============================================================
function runBotState(state, player, deltaSeconds) {
  const input = createEmptyInput();
  player.aiTimer -= deltaSeconds;

  // 1. Locate closest opponent
  let target = null;
  let minDist = Infinity;
  for (const p of state.players) {
    if (p.id === player.id || p.eliminated || p.respawnTimer > 0) continue;
    const dist = Math.hypot(p.x - player.x, p.y - player.y);
    if (dist < minDist) {
      minDist = dist;
      target = p;
    }
  }

  if (player.aiTimer <= 0) {
    player.aiTimer = 0.2 + nextRandom(state) * 0.4;

    // Priority: reach lift during countdown phase
    if (state.liftEvent && state.liftEvent.phase === "countdown") {
      player.aiState = "reachLift";
    } else {
      player.aiState = (target && minDist < 360) ? "chase" : "climb";
    }
  }

  // 2. Action selection
  if (player.aiState === "reachLift" && state.liftEvent) {
    // Navigate to lift platform
    const lift = state.liftEvent;
    const liftCenterX = lift.x + lift.w / 2;
    const liftY = lift.currentY;

    if (player.x + player.w / 2 < liftCenterX - 30) input.right = true;
    else if (player.x + player.w / 2 > liftCenterX + 30) input.left = true;

    // Jump if below lift
    if (player.y + player.h > liftY) {
      if (player.onGround || player.wallClingDir !== 0 || player.jumpCount < 2) {
        input.up = true;
        input.upPressed = true;
      }
    }
  } else if (player.aiState === "chase" && target) {
    if (player.x < target.x - 20) input.right = true;
    else if (player.x > target.x + 20) input.left = true;

    if (player.y > target.y + 40) {
      if (player.onGround || player.wallClingDir !== 0) {
        input.up = true;
        input.upPressed = true;
      }
    }

    // Aim toward target
    if (target) {
      const dx = (target.x + target.w / 2) - (player.x + player.w / 2);
      const dy = (target.y + target.h / 2) - (player.y + player.h / 2);
      // Set directional inputs for aim computation
      if (dx > 20) input.right = true;
      else if (dx < -20) input.left = true;
      if (dy < -30) input.up = true;
      else if (dy > 30) input.down = true;
    }

    // Attack when in range
    if (player.attackCooldown <= 0) {
      if (player.weapon) {
        // Shoot projectile from farther range
        if (minDist < 400) {
          input.attack = true;
          input.attackPressed = true;
        }
      } else {
        // Melee close
        if (minDist < 75) {
          input.attack = true;
          input.attackPressed = true;
        }
      }
    }
  } else {
    // Climb mode: head to nearest platform above
    let bestPlatform = null;
    for (const plat of state.platforms) {
      if (plat.y < player.y && plat.y > player.y - 320) {
        bestPlatform = plat;
        break;
      }
    }

    if (bestPlatform) {
      const targetX = bestPlatform.x + bestPlatform.w / 2;
      if (player.x < targetX - 15) input.right = true;
      else if (player.x > targetX + 15) input.left = true;
    } else {
      if (Math.round(state.elapsed) % 2 === 0) input.right = true;
      else input.left = true;
    }

    // Wall kick or random jump
    if (player.wallClingDir !== 0) {
      input.up = true;
      input.upPressed = true;
    } else if (player.onGround && nextRandom(state) < 0.015) {
      input.up = true;
      input.upPressed = true;
    }
  }

  // Block placement (Minecraft ladders)
  if (player.blockStock > 0 && !player.onGround && player.vy > 100 && nextRandom(state) < 0.008) {
    input.placePressed = true;
  }

  return input;
}

// ============================================================
// Player Physics — Wall Kickers + Projectile Shooting
// ============================================================
function updatePlayer(state, player, input, deltaSeconds) {
  if (player.eliminated) return;

  if (player.respawnTimer > 0) {
    player.respawnTimer = Math.max(0, player.respawnTimer - deltaSeconds);
    if (player.respawnTimer === 0 && player.lives > 0) {
      respawnPlayer(state, player);
    }
    return;
  }

  player.attackCooldown = Math.max(0, player.attackCooldown - deltaSeconds);
  player.invulnerability = Math.max(0, player.invulnerability - deltaSeconds);
  player.attackAnimation = Math.max(0, player.attackAnimation - deltaSeconds);
  player.hurtTimer = Math.max(0, player.hurtTimer - deltaSeconds);
  player.recoilTimer = Math.max(0, player.recoilTimer - deltaSeconds);
  player.muzzleFlashTimer = Math.max(0, player.muzzleFlashTimer - deltaSeconds);

  // 1. Double Jump Flip Animation
  if (player.isFlipping) {
    const rotSpeed = player.facing === 1 ? 14 : -14;
    player.flipAngle += rotSpeed * deltaSeconds;
    if (Math.abs(player.flipAngle) >= Math.PI * 2) {
      player.flipAngle = 0;
      player.isFlipping = false;
    }
  }

  // 2. Horizontal Movement
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (move !== 0) {
    player.facing = move;
  }

  let finalSpeed = MOVE_SPEED + (player.level - 1) * 15;
  const targetVx = move * finalSpeed;
  const acceleration = player.onGround ? 0.24 : 0.13;
  player.vx += (targetVx - player.vx) * acceleration * 5.5;

  // 3. Update aim angle from input
  player.aimAngle = computeAimAngle(input, player.facing);

  // 4. Wall Cling / Slide (Wall Kickers)
  const colliders = getColliders(state);

  player.wallClingDir = 0;
  if (!player.onGround && player.vy > 50) {
    for (const platform of colliders) {
      const verticalOverlap = player.y + player.h > platform.y && player.y < platform.y + (platform.h || 18);
      if (verticalOverlap) {
        const touchingLeftEdge = Math.abs((player.x + player.w) - platform.x) < 8;
        const touchingRightEdge = Math.abs(player.x - (platform.x + platform.w)) < 8;
        if (touchingLeftEdge && input.right) {
          player.wallClingDir = 1;
        } else if (touchingRightEdge && input.left) {
          player.wallClingDir = -1;
        }
      }
    }
  }

  if (player.wallClingDir !== 0) {
    player.vy = Math.min(player.vy, 85);
    player.jumpCount = 1;
  }

  // 5. Jumps & Wall Kicking
  if (input.upPressed) {
    if (player.wallClingDir !== 0) {
      player.vy = -JUMP_SPEED * 0.9;
      player.vx = -player.wallClingDir * finalSpeed * 1.45;
      player.facing = -player.wallClingDir;
      player.jumpCount = 1;
      player.wallClingDir = 0;
      player.onGround = false;
    } else if (player.onGround) {
      player.vy = -JUMP_SPEED;
      player.onGround = false;
      player.jumpCount = 1;
    } else if (player.jumpCount < 2) {
      player.vy = -JUMP_SPEED * 0.85;
      player.jumpCount += 1;
      player.isFlipping = true;
      player.flipAngle = 0;
    }
  }

  // 6. Minecraft Block Placement
  if (input.placePressed && player.blockStock > 0 && player.attackCooldown <= 0) {
    player.blockStock--;
    player.attackCooldown = 0.35;

    const gridX = player.x + (player.facing === 1 ? player.w + 10 : -48 - 10);
    const gridY = player.y + 15;

    state.platforms.push({
      id: `placed-${player.id}-${Math.round(state.elapsed * 1000)}`,
      x: clamp(gridX, 10, WORLD_WIDTH - 60),
      y: gridY,
      w: 48,
      h: 18,
      isBreakable: true,
      hp: 2,
      maxHp: 2,
      ownerId: player.id,
    });
  }

  // 7. Attack: Projectile if armed, Melee if unarmed
  if (input.attackPressed && player.attackCooldown <= 0) {
    if (player.weapon && player.weaponType === "sword") {
      performSwordSwipe(state, player);
      player.attackCooldown = getWeaponProfile("sword").cooldown;
      player.attackAnimation = 0.24;
      player.attackKind = "sword";
    } else if (player.weapon) {
      fireProjectile(state, player);
      player.attackCooldown = getWeaponProfile(player.weaponType).cooldown;
      player.attackAnimation = player.weaponType === "sniper" ? 0.44 : 0.18;
      player.attackKind = player.weaponType;
    } else {
      performMeleeAttack(state, player);
      player.attackCooldown = 0.32;
      player.attackAnimation = 0.16;
      player.attackKind = "punch";
    }
  }

  // 8. Physics integration
  const previousY = player.y;
  player.vy += GRAVITY * deltaSeconds;
  player.x += player.vx * deltaSeconds;
  player.y += player.vy * deltaSeconds;
  player.x = clamp(player.x, 0, WORLD_WIDTH - player.w);
  player.onGround = false;

  // Platform collision resolution
  for (const platform of colliders) {
    const fallingThrough = input.down && player.y + player.h <= platform.y + 10 && !platform.isGround;
    if (fallingThrough) continue;

    const wasAbove = previousY + player.h <= platform.y;
    const nowBelowTop = player.y + player.h >= platform.y;
    const overlapX = player.x + player.w > platform.x + 6 && player.x < platform.x + platform.w - 6;

    if (player.vy >= 0 && wasAbove && nowBelowTop && overlapX) {
      player.y = platform.y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.jumpCount = 0;
    }
  }

  if (player.health <= 0) {
    loseLife(state, player, "Was knocked out");
    return;
  }

  if (player.y > state.safeLevelY + SAFE_FALL_BUFFER) {
    loseLife(state, player, "Fell off the tower");
  }
}

// Melee attack (used when player has NO weapon)
function performMeleeAttack(state, attacker) {
  const reach = 56;
  const attackX = attacker.x + attacker.w * 0.5 + attacker.facing * reach;
  const attackY = attacker.y + attacker.h * 0.45;

  // 1. Break platforms
  for (let i = state.platforms.length - 1; i >= 0; i--) {
    const platform = state.platforms[i];
    if (platform.isBreakable) {
      const platCenterX = platform.x + platform.w * 0.5;
      const platCenterY = platform.y + (platform.h || 18) * 0.5;
      if (Math.abs(platCenterX - attackX) < 60 && Math.abs(platCenterY - attackY) < 40) {
        platform.hp -= 1;
        if (platform.hp <= 0) {
          spawnItemDrop(state, platform.x + platform.w / 2, platform.y + (platform.h || 18) / 2);
          state.platforms.splice(i, 1);
        }
      }
    }
  }

  // 2. Damage opponents
  for (const target of state.players) {
    if (target.id === attacker.id || target.eliminated || target.respawnTimer > 0 || target.invulnerability > 0) {
      continue;
    }

    const targetX = target.x + target.w * 0.5;
    const targetY = target.y + target.h * 0.5;

    if (Math.abs(targetX - attackX) < 54 && Math.abs(targetY - attackY) < 48) {
      const damage = 14;
      const knockback = 360;
      target.health = Math.max(0, target.health - damage);
      target.vx += attacker.facing * knockback;
      target.vy = Math.min(target.vy, -240);
      target.invulnerability = 0.2;
      target.hurtTimer = 0.18;

      if (nextRandom(state) < 0.5) {
        spawnItemDrop(state, target.x + target.w / 2, target.y + target.h / 2);
      }
    }
  }
}

function performSwordSwipe(state, attacker) {
  const profile = getWeaponProfile("sword");
  const reach = profile.reach;
  const attackX = attacker.x + attacker.w * 0.5 + attacker.facing * reach;
  const attackY = attacker.y + attacker.h * 0.45;

  for (const target of state.players) {
    if (target.id === attacker.id || target.eliminated || target.respawnTimer > 0 || target.invulnerability > 0) {
      continue;
    }

    const targetX = target.x + target.w * 0.5;
    const targetY = target.y + target.h * 0.5;

    if (Math.abs(targetX - attackX) < 68 && Math.abs(targetY - attackY) < 52) {
      target.health = Math.max(0, target.health - profile.damage);
      target.vx += attacker.facing * profile.knockback;
      target.vy = Math.min(target.vy, -180);
      target.invulnerability = 0.14;
      target.hurtTimer = 0.18;
    }
  }
}

// ============================================================
// Player Push Resolution
// ============================================================
function resolvePlayerPushes(players) {
  for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
      const first = players[firstIndex];
      const second = players[secondIndex];
      if (first.eliminated || second.eliminated || first.respawnTimer > 0 || second.respawnTimer > 0) {
        continue;
      }

      if (
        first.x < second.x + second.w &&
        first.x + first.w > second.x &&
        first.y < second.y + second.h &&
        first.y + first.h > second.y
      ) {
        const middleFirst = first.x + first.w * 0.5;
        const middleSecond = second.x + second.w * 0.5;
        const push = middleFirst < middleSecond ? -10 : 10;
        first.x += push;
        second.x -= push;
        first.vx += push * 4;
        second.vx -= push * 4;
      }
    }
  }
}

// ============================================================
// Weapon Collection
// ============================================================
function collectWeapons(state) {
  for (const weapon of state.weapons) {
    if (weapon.claimedBy || weapon.dead) continue;

    for (const player of state.players) {
      if (player.eliminated || player.respawnTimer > 0 || player.weapon) continue;

      const overlap =
        player.x < weapon.x + weapon.w &&
        player.x + player.w > weapon.x &&
        player.y < weapon.y + weapon.h &&
        player.y + player.h > weapon.y;

      if (overlap) {
        player.weapon = true;
        player.weaponType = weapon.kind || "blaster";
        weapon.claimedBy = player.id;
        weapon.vx = 0;
        weapon.vy = 0;
        break;
      }
    }
  }
}

function maybeSpawnWeapons(state) {
  if (state.phase === "finished" || state.elapsed < state.nextWeaponAt) return;

  const x = randomRange(state, 90, WORLD_WIDTH - 140);
  const y = Math.min(...state.players.map((p) => p.y)) - PLATFORM_DROP_Y;
  const kindRoll = nextRandom(state);
  const kind = kindRoll < 0.45 ? "blaster" : kindRoll < 0.78 ? "sword" : "sniper";
  state.weapons.push({
    id: `weapon-${Math.round(state.elapsed * 1000)}`,
    x,
    y,
    w: 26,
    h: 16,
    kind,
    vx: randomRange(state, -40, 40),
    vy: 0,
    claimedBy: null,
    dead: false,
  });
  state.nextWeaponAt = state.elapsed + 5 + randomRange(state, 0, 3);
}

// ============================================================
// Showdown & Round Flow
// ============================================================
function maybeStartShowdown(state) {
  if (state.phase !== "climb") return;

  const activePlayers = state.players.filter((p) => !p.eliminated);
  const summitPlayers = activePlayers.filter((p) => p.y <= SUMMIT_Y + 90);
  if (summitPlayers.length === 0) return;

  if (summitPlayers.length === 1) {
    finishRound(state, summitPlayers[0]);
    return;
  }

  state.phase = "showdown";
  state.showdownEndsAt = state.elapsed + 60;
  state.safeLevelY = SUMMIT_Y + 220;
  state.checkpointY = SUMMIT_Y + 180;
  state.weapons = [];

  const alivePlayers = state.players.filter((p) => !p.eliminated);
  alivePlayers.forEach((player, index) => {
    const spawn = getShowdownSpawn(index);
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.weapon = false;
    player.weaponType = null;
    player.health = Math.max(70, player.health);
  });

  for (let index = 0; index < alivePlayers.length + 1; index += 1) {
    const spawn = getShowdownSpawn(index);
    const kind = index % 2 === 0 ? "sword" : "blaster";
    state.weapons.push({
      id: `showdown-${index}-${Math.round(state.elapsed * 1000)}`,
      x: spawn.x + 15,
      y: spawn.y - 30,
      w: 26,
      h: 16,
      kind,
      vx: 0,
      vy: 0,
      claimedBy: null,
      dead: false,
    });
  }
}

function maybeEndRound(state) {
  const alivePlayers = state.players.filter((p) => !p.eliminated);
  if (alivePlayers.length === 1 && state.phase !== "finished") {
    finishRound(state, alivePlayers[0]);
    return;
  }

  if (state.phase === "showdown" && state.elapsed >= state.showdownEndsAt && alivePlayers.length > 0) {
    const winner = [...alivePlayers].sort((a, b) => {
      if (b.health !== a.health) return b.health - a.health;
      return a.y - b.y;
    })[0];
    finishRound(state, winner);
  }
}

function finishRound(state, winner) {
  state.phase = "finished";
  state.winnerId = winner?.id || null;
  state.winnerName = winner?.name || "Nobody";

  if (!state.roundWins) {
    state.roundWins = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  }

  if (winner?.id) {
    state.roundWins[winner.id] = (state.roundWins[winner.id] || 0) + 1;
  }

  state.roundBreak = { timer: 2.8, showScoreboard: false };
}

// ============================================================
// Life Loss & Respawning
// ============================================================
function loseLife(state, player, cause = "Lost a life") {
  if (player.invulnerability > 0) return;

  player.lives -= 1;

  // Drop weapon & XP on death
  if (player.weapon) {
    state.weapons.push({
      id: `drop-${player.id}-${Math.round(state.elapsed * 1000)}`,
      x: player.x + player.w * 0.5,
      y: player.y - 22,
      w: 26,
      h: 16,
      kind: player.weaponType || "blaster",
      vx: randomRange(state, -30, 30),
      vy: -120,
      claimedBy: null,
      dead: false,
    });
    player.weapon = false;
    player.weaponType = null;
  }
  spawnItemDrop(state, player.x + player.w / 2, player.y, "xp");

  state.weapons = state.weapons.filter((w) => w.claimedBy !== player.id);

  if (player.lives <= 0) {
    player.eliminated = true;
    player.health = 0;
    return;
  }

  player.health = 100;
  player.respawnTimer = 1.2;
  player.vx = 0;
  player.vy = 0;
  player.invulnerability = 1;
}

function respawnPlayer(state, player) {
  const aliveIndex = state.players.findIndex((e) => e.id === player.id);
  const spawn = getSpawnPosition(aliveIndex, state.checkpointY);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.health = 100;
  player.onGround = false;
  player.invulnerability = 1.4;
  player.blockStock = 10;
  player.weaponType = null;
}

// ============================================================
// Spawn Positions
// ============================================================
function getSpawnPosition(index, checkpointY) {
  const spawns = [
    { x: 180, y: checkpointY - 200 },
    { x: 360, y: checkpointY - 200 },
    { x: 620, y: checkpointY - 200 },
    { x: 800, y: checkpointY - 200 },
  ];
  return spawns[index % spawns.length];
}

function getShowdownSpawn(index) {
  const spots = [
    { x: 330, y: SUMMIT_Y + 78 },
    { x: 680, y: SUMMIT_Y + 48 },
    { x: 480, y: SUMMIT_Y + 18 },
    { x: 560, y: SUMMIT_Y + 18 },
  ];
  return spots[index % spots.length];
}

// ============================================================
// Input Helpers
// ============================================================
function normalizeInput(input = {}) {
  return {
    left: Boolean(input.left),
    right: Boolean(input.right),
    up: Boolean(input.up),
    down: Boolean(input.down),
    attack: Boolean(input.attack),
    upPressed: Boolean(input.upPressed),
    attackPressed: Boolean(input.attackPressed),
    placePressed: Boolean(input.placePressed),
  };
}

function createEmptyInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    attack: false,
    upPressed: false,
    attackPressed: false,
    placePressed: false,
  };
}

function getWeaponProfile(weaponType) {
  return WEAPON_PROFILES[weaponType] || WEAPON_PROFILES.blaster;
}
