import { STEP_SECONDS, WORLD_WIDTH, SUMMIT_Y, GROUND_Y, SAFE_FALL_BUFFER, cloneGameState, createGameState, stepGameState } from "./game-core.js";
import {
  CHARACTER_ROSTER,
  buildPlayerConfig,
  getCharacterById,
  getCharacterWithSkin,
  getFallbackCharacter,
  getSkinVariants,
} from "./roster.js";

const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");

const titleScreen = document.getElementById("titleScreen");
const setupScreen = document.getElementById("setupScreen");
const gamePanel = document.getElementById("gamePanel");

const playButton = document.getElementById("playButton");
const backButton = document.getElementById("backButton");
const offlineButton = document.getElementById("offlineButton");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const installButton = document.getElementById("installButton");
const leaveMatchButton = document.getElementById("leaveMatchButton");
const pauseStrip = document.getElementById("pauseStrip");
const resumeButton = document.getElementById("resumeButton");
const controlsSelect = document.getElementById("controlsSelect");

const downloadNote = document.getElementById("downloadNote");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const networkBadge = document.getElementById("networkBadge");
const statusText = document.getElementById("statusText");
const phaseText = document.getElementById("phaseText");
const eventText = document.getElementById("eventText");
const roomText = document.getElementById("roomText");

const rosterGrid = document.getElementById("rosterGrid");
const selectedPortrait = document.getElementById("selectedPortrait");
const selectedName = document.getElementById("selectedName");
const selectedTitle = document.getElementById("selectedTitle");
const selectedDescription = document.getElementById("selectedDescription");
const selectedHint = document.getElementById("selectedHint");
const skinSelector = document.getElementById("skinSelector");
const playerSlotTabs = document.getElementById("playerSlotTabs");
const playerCountGrid = document.getElementById("playerCountGrid");
const deviceLaptop = document.getElementById("deviceLaptop");
const deviceMobile = document.getElementById("deviceMobile");
const offlinePreview = document.getElementById("offlinePreview");
const keyboardLegend = document.getElementById("keyboardLegend");
const mobileControls = document.getElementById("mobileControls");
const joystickTemplate = document.getElementById("joystickTemplate");
const menuPopover = document.getElementById("menuPopover");
const controlsPanel = document.getElementById("controlsPanel");

const offlineKeyboardBindings = [
  { id: "p1", title: "Player 1", color: "#ff946d", label: "A D W S F", keys: ["KeyA", "KeyD", "KeyW", "KeyS", "KeyF"] },
  { id: "p2", title: "Player 2", color: "#67c9ff", label: "J L I K H", keys: ["KeyJ", "KeyL", "KeyI", "KeyK", "KeyH"] },
  { id: "p3", title: "Player 3", color: "#86f0a8", label: "Left Right Up Down /", keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Slash"] },
  { id: "p4", title: "Player 4", color: "#ffd56d", label: "4 6 8 5 0", keys: ["Numpad4", "Numpad6", "Numpad8", "Numpad5", "Numpad0"] },
];

const onlineKeyboardBinding = {
  id: "local",
  title: "Online",
  color: "#ff946d",
  label: "A D W S F",
  keys: ["KeyA", "KeyD", "KeyW", "KeyS", "KeyF"],
};

const skinLabels = {
  default: "Default",
  shadow: "Shadow",
  neon: "Neon",
  camo: "Camo",
};

const APP_BUILD = "v6";

const CAMERA = {
  minViewWidth: 360,
  maxViewWidth: WORLD_WIDTH - 20,
  minViewHeight: 320,
  maxViewHeight: 920,
  paddingX: 110,
  paddingY: 150,
  closeViewWidth: 460,
  smooth: 0.11,
};

const app = {
  screen: "title",
  mode: null,
  paused: false,
  playerCount: 2,
  deviceMode: "laptop",
  activeLocalSlot: 0,
  selectedCharacterId: CHARACTER_ROSTER[0].id,
  selectedSkinId: "default",
  localSetup: createInitialLocalSetup(),
  state: null,
  cameraX: WORLD_WIDTH / 2,
  cameraY: GROUND_Y - 320,
  cameraScale: 1,
  roomCode: "Local",
  socket: null,
  socketReady: null,
  selfId: null,
  installPrompt: null,
  lastFrame: performance.now(),
  accumulator: 0,
  networkReady: navigator.onLine,
  localInputs: {},
  pendingPresses: {},
  lastOnlineSend: 0,
};

init();

function init() {
  const buildTag = document.getElementById("buildTag");
  if (buildTag) {
    buildTag.textContent = APP_BUILD;
  }

  if (prefersTouchControls() || window.matchMedia("(max-width: 900px)").matches) {
    app.deviceMode = "mobile";
  }

  syncSelectionFromActiveSlot();
  renderRoster();
  renderSlotTabs();
  renderSkinSelector();
  renderPlayerCountButtons();
  renderSelectedCharacter();
  renderOfflinePreview();
  updateDeviceButtons();
  buildControlDisplays();
  updateNetworkBadge();
  updateScreen();
  setupEvents();
  resizeGameCanvas();
  window.addEventListener("resize", resizeGameCanvas);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(resizeGameCanvas, 120);
  });
  drawMenuCanvas();
  requestAnimationFrame(frame);
  registerOfflineSupport();
}

function setupEvents() {
  playButton.addEventListener("click", () => {
    app.screen = "setup";
    updateScreen();
    statusText.textContent = "Choose the number of players, device style, and skin before starting.";
  });

  backButton.addEventListener("click", () => {
    app.screen = "title";
    updateScreen();
    statusText.textContent = "Press Play to choose players and controls.";
  });

  offlineButton.addEventListener("click", startOfflineMatch);
  createRoomButton.addEventListener("click", createOnlineRoom);
  joinRoomButton.addEventListener("click", joinOnlineRoom);
  installButton.addEventListener("click", installGame);
  leaveMatchButton.addEventListener("click", leaveMatch);
  pauseStrip.addEventListener("click", () => setPaused(!app.paused));
  resumeButton.addEventListener("click", () => setPaused(false));
  controlsSelect.addEventListener("change", renderControlsPanel);

  deviceLaptop.addEventListener("click", () => {
    app.deviceMode = "laptop";
    updateDeviceButtons();
    buildControlDisplays();
    renderOfflinePreview();
  });

  deviceMobile.addEventListener("click", () => {
    app.deviceMode = "mobile";
    updateDeviceButtons();
    buildControlDisplays();
    renderOfflinePreview();
  });

  window.addEventListener("keydown", handleKeyChange(true));
  window.addEventListener("keyup", handleKeyChange(false));
  window.addEventListener("online", () => {
    app.networkReady = true;
    updateNetworkBadge();
  });
  window.addEventListener("offline", () => {
    app.networkReady = false;
    updateNetworkBadge();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    app.installPrompt = event;
    installButton.classList.remove("hidden");
    downloadNote.textContent = "Install is ready. Add the game to your device.";
  });
  window.addEventListener("appinstalled", () => {
    app.installPrompt = null;
    installButton.classList.add("hidden");
    downloadNote.textContent = "The game is installed on this device.";
  });
}

function updateScreen() {
  const isGame = app.screen === "game";
  titleScreen.classList.toggle("hidden", app.screen !== "title");
  setupScreen.classList.toggle("hidden", app.screen !== "setup");
  gamePanel.classList.toggle("hidden", !isGame);
  document.body.classList.toggle("game-active", isGame);
  document.body.classList.toggle("offline-match", isGame && app.mode === "offline");
  if (isGame) {
    resizeGameCanvas();
  }
}

function resetCamera() {
  app.cameraX = WORLD_WIDTH / 2;
  app.cameraY = GROUND_Y - 320;
  app.cameraScale = 1;
  app._cameraReady = false;
  resizeGameCanvas();
}

function resizeGameCanvas() {
  const container = document.getElementById("gameStage");
  if (!container || !canvas) {
    return;
  }

  const rect = container.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.round(rect.width * dpr));
  const height = Math.max(240, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  context.imageSmoothingEnabled = false;

  if (!app._cameraReady) {
    app.cameraScale = width / CAMERA.closeViewWidth;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPlayerFallingToDoom(player, state, averageY) {
  if (player.eliminated || player.respawnTimer > 0) {
    return false;
  }

  if (player.y > state.safeLevelY + SAFE_FALL_BUFFER * 0.35) {
    return true;
  }

  if (player.y > state.safeLevelY + 140 && player.vy > 180) {
    return true;
  }

  if (player.y > averageY + 280 && player.vy > 90) {
    return true;
  }

  return false;
}

function updateCamera(state) {
  resizeGameCanvas();

  const active = state.players.filter((player) => !player.eliminated && player.respawnTimer <= 0);
  if (active.length === 0) {
    return;
  }

  const averageY = active.reduce((sum, player) => sum + player.y + player.h * 0.5, 0) / active.length;
  const cameraTargets = active.filter((player) => !isPlayerFallingToDoom(player, state, averageY));
  const targets = cameraTargets.length > 0 ? cameraTargets : active;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  targets.forEach((player) => {
    minX = Math.min(minX, player.x);
    maxX = Math.max(maxX, player.x + player.w);
    minY = Math.min(minY, player.y);
    maxY = Math.max(maxY, player.y + player.h);
  });

  const spreadX = Math.max(maxX - minX, 80);
  const spreadY = Math.max(maxY - minY, 160);
  const aspect = canvas.width / canvas.height;

  let viewWidth = clamp(
    spreadX + CAMERA.paddingX * 2,
    active.length === 1 ? CAMERA.closeViewWidth * 0.82 : CAMERA.minViewWidth,
    CAMERA.maxViewWidth,
  );
  let viewHeight = viewWidth / aspect;

  const neededHeight = spreadY + CAMERA.paddingY * 2;
  if (viewHeight < neededHeight) {
    viewHeight = clamp(neededHeight, CAMERA.minViewHeight, CAMERA.maxViewHeight);
    viewWidth = viewHeight * aspect;
  }

  if (active.length === 1 && spreadX < 180) {
    viewWidth = CAMERA.closeViewWidth;
    viewHeight = viewWidth / aspect;
  }

  const focusTop = Math.min(minY, ...targets.map((player) => player.y));
  let centerX = (minX + maxX) / 2;
  let centerY = (minY + maxY) / 2;
  const climbAnchor = Math.min(state.safeLevelY - viewHeight * 0.38, focusTop + viewHeight * 0.12);

  centerY = centerY * 0.45 + climbAnchor * 0.55;
  centerY = clamp(centerY, focusTop - viewHeight * 0.18, state.safeLevelY - viewHeight * 0.22);
  centerX = clamp(centerX, viewWidth * 0.5, WORLD_WIDTH - viewWidth * 0.5);

  const targetScale = canvas.width / viewWidth;

  if (!app._cameraReady) {
    app.cameraX = centerX;
    app.cameraY = centerY;
    app.cameraScale = targetScale;
    app._cameraReady = true;
    return;
  }

  app.cameraX += (centerX - app.cameraX) * CAMERA.smooth;
  app.cameraY += (centerY - app.cameraY) * CAMERA.smooth;
  app.cameraScale += (targetScale - app.cameraScale) * CAMERA.smooth;
}

function applyWorldTransform() {
  context.setTransform(
    app.cameraScale,
    0,
    0,
    app.cameraScale,
    canvas.width * 0.5 - app.cameraX * app.cameraScale,
    canvas.height * 0.5 - app.cameraY * app.cameraScale,
  );
}

function renderRoster() {
  rosterGrid.innerHTML = "";
  for (const character of CHARACTER_ROSTER) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `roster-card${character.id === app.selectedCharacterId ? " active" : ""}`;
    button.innerHTML = `
      <div class="roster-art">${characterPortraitSvg(getCharacterWithSkin(character.id, app.selectedSkinId), "small")}</div>
      <div class="roster-copy">
        <strong>${escapeHtml(character.name)}</strong>
        <span>${escapeHtml(character.title)}</span>
      </div>
    `;
    button.addEventListener("click", () => {
      app.selectedCharacterId = character.id;
      app.localSetup[app.activeLocalSlot].characterId = character.id;
      renderRoster();
      renderSkinSelector();
      renderSelectedCharacter();
      renderOfflinePreview();
    });
    rosterGrid.appendChild(button);
  }
}

function renderSkinSelector() {
  skinSelector.innerHTML = "";
  for (const skinId of getSkinVariants()) {
    const preview = getCharacterWithSkin(app.selectedCharacterId, skinId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `skin-btn${skinId === app.selectedSkinId ? " active" : ""}`;
    button.title = skinLabels[skinId] || skinId;
    button.style.background = preview.look.body;
    button.addEventListener("click", () => {
      app.selectedSkinId = skinId;
      app.localSetup[app.activeLocalSlot].skinId = skinId;
      renderSkinSelector();
      renderRoster();
      renderSelectedCharacter();
      renderOfflinePreview();
    });
    skinSelector.appendChild(button);
  }
}

function renderSlotTabs() {
  playerSlotTabs.innerHTML = "";
  for (let index = 0; index < 4; index += 1) {
    const slot = app.localSetup[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot-tab${index === app.activeLocalSlot ? " active" : ""}`;
    button.textContent = `P${index + 1}`;
    button.disabled = index >= app.playerCount;
    button.addEventListener("click", () => {
      app.activeLocalSlot = index;
      syncSelectionFromActiveSlot();
      renderSlotTabs();
      renderRoster();
      renderSkinSelector();
      renderSelectedCharacter();
    });
    playerSlotTabs.appendChild(button);
  }
}

function renderPlayerCountButtons() {
  playerCountGrid.innerHTML = "";
  for (let count = 2; count <= 4; count += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `count-btn${count === app.playerCount ? " active" : ""}`;
    button.textContent = String(count);
    button.addEventListener("click", () => {
      app.playerCount = count;
      if (app.activeLocalSlot >= count) {
        app.activeLocalSlot = count - 1;
      }
      syncSelectionFromActiveSlot();
      renderPlayerCountButtons();
      renderSlotTabs();
      renderRoster();
      renderSkinSelector();
      renderSelectedCharacter();
      renderOfflinePreview();
    });
    playerCountGrid.appendChild(button);
  }
}

function updateDeviceButtons() {
  deviceLaptop.classList.toggle("active", app.deviceMode === "laptop");
  deviceMobile.classList.toggle("active", app.deviceMode === "mobile");
}

function renderSelectedCharacter() {
  const character = getCharacterWithSkin(app.selectedCharacterId, app.selectedSkinId);
  selectedPortrait.innerHTML = characterPortraitSvg(character, "large");
  selectedName.textContent = character.name;
  selectedTitle.textContent = `${character.title} / ${skinLabels[app.selectedSkinId] || app.selectedSkinId}`;
  selectedDescription.textContent = character.description;
  selectedHint.textContent = `Player ${app.activeLocalSlot + 1} will use ${character.name} with ${app.deviceMode === "mobile" ? "joystick" : "button"} controls.`;
}

function renderOfflinePreview() {
  offlinePreview.innerHTML = "";
  const previewPlayers = createOfflinePlayers();
  previewPlayers.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    const controlsText =
      app.deviceMode === "mobile"
        ? "Joystick + Shoot"
        : offlineKeyboardBindings[index].label;
    card.innerHTML = `
      <div class="slot-number">P${index + 1}</div>
      <div class="slot-art">${characterPortraitSvg({ ...getCharacterById(player.characterId), look: player.look }, "slot")}</div>
      <div class="slot-copy">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml(controlsText)}</span>
      </div>
    `;
    offlinePreview.appendChild(card);
  });
}

function createOfflinePlayers() {
  const players = [];
  for (let index = 0; index < app.playerCount; index += 1) {
    const slot = app.localSetup[index];
    players.push(
      buildPlayerConfig(slot.characterId, {
        id: `p${index + 1}`,
        name: slot.name,
        skinId: slot.skinId,
        spawnIndex: index,
      }),
    );
  }

  return players;
}

function buildControlDisplays() {
  keyboardLegend.innerHTML = "";

  if (app.deviceMode === "laptop") {
    const bindings = app.mode === "online" ? [onlineKeyboardBinding] : offlineKeyboardBindings.slice(0, app.playerCount);
    bindings.forEach((binding) => {
      const card = document.createElement("article");
      card.className = "legend-card";
      card.innerHTML = `
        <h3 style="color:${binding.color}">${binding.title}</h3>
        <p>${binding.label}</p>
        <p>Left, Right, Jump, Drop, Shoot</p>
      `;
      keyboardLegend.appendChild(card);
    });
  }

  const playersForPads =
    app.mode === "offline"
      ? createOfflinePlayers()
      : app.mode === "online"
        ? [{ id: "local", name: "You" }]
        : [];
  buildMobileControls(shouldUseMobilePads() ? playersForPads : []);
  renderControlsPanel();
}

function renderControlsPanel() {
  controlsPanel.innerHTML = "";
  const showAll = controlsSelect.value === "all";

  if (app.deviceMode === "mobile") {
    addControlRow("Move", "Joystick");
    addControlRow("Jump", "Push joystick up");
    addControlRow("Shoot / Punch", "Red button");
    if (showAll && app.mode === "offline") {
      addControlRow("Offline pads", `${app.playerCount} local joystick pads`);
    }
    return;
  }

  if (app.mode === "online") {
    addControlRow("Move", "A / D");
    addControlRow("Jump", "W");
    addControlRow("Drop", "S");
    addControlRow("Shoot / Punch", "F");
    return;
  }

  offlineKeyboardBindings.slice(0, showAll ? app.playerCount : Math.min(1, app.playerCount)).forEach((binding) => {
    addControlRow(binding.title, binding.label);
  });
}

function addControlRow(label, value) {
  const row = document.createElement("div");
  row.className = "controls-row";
  row.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>`;
  controlsPanel.appendChild(row);
}

function prefersTouchControls() {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function shouldUseMobilePads() {
  if (app.screen !== "game") {
    return app.deviceMode === "mobile";
  }

  if (app.mode === "offline") {
    return app.deviceMode === "mobile" || prefersTouchControls();
  }

  return app.deviceMode === "mobile";
}

function startOfflineMatch() {
  if (prefersTouchControls()) {
    app.deviceMode = "mobile";
    updateDeviceButtons();
  }

  const players = createOfflinePlayers();
  app.mode = "offline";
  app.screen = "game";
  app.state = createGameState("offline", players);
  app.roomCode = "Offline";
  app.selfId = "p1";
  resetCamera();
  app.paused = false;
  app.accumulator = 0;
  app.localInputs = Object.fromEntries(players.map((player) => [player.id, emptyInput()]));
  app.pendingPresses = Object.fromEntries(players.map((player) => [player.id, { up: false, attack: false }]));
  phaseText.textContent = "Climb";
  eventText.textContent = "Match started";
  roomText.textContent = "Offline";
  updateScreen();
  setPaused(false);
  buildControlDisplays();
  statusText.textContent = `Offline match started with ${players.length} player${players.length === 1 ? "" : "s"}.`;
}

function createOnlineRoom() {
  if (!navigator.onLine) {
    statusText.textContent = "Online mode needs internet or Wi-Fi.";
    return;
  }

  connectSocket()
    .then(() => {
      const name = playerNameInput.value.trim() || "Player 1";
      app.socket.send(
        JSON.stringify({
          type: "create-room",
          name,
          characterId: app.localSetup[0].characterId,
          skinId: app.localSetup[0].skinId,
          capacity: Math.max(2, app.playerCount),
        }),
      );
      statusText.textContent = "Creating room...";
    })
    .catch(() => {
      statusText.textContent = "The online room could not be created.";
    });
}

function joinOnlineRoom() {
  if (!navigator.onLine) {
    statusText.textContent = "Online mode needs internet or Wi-Fi.";
    return;
  }

  connectSocket()
    .then(() => {
      const name = playerNameInput.value.trim() || "Player";
      const code = roomCodeInput.value.trim().toUpperCase();
      app.socket.send(
        JSON.stringify({
          type: "join-room",
          code,
          name,
          characterId: app.localSetup[0].characterId,
          skinId: app.localSetup[0].skinId,
        }),
      );
      statusText.textContent = `Joining room ${code || "...."}...`;
    })
    .catch(() => {
      statusText.textContent = "The online room could not be joined.";
    });
}

function connectSocket() {
  if (app.socket?.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  if (app.socket?.readyState === WebSocket.CONNECTING && app.socketReady) {
    return app.socketReady;
  }

  app.mode = "online";
  app.localInputs = { local: emptyInput() };
  app.pendingPresses = { local: { up: false, attack: false } };

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const host = location.host || "localhost";
  app.socket = new WebSocket(`${protocol}://${host}/ws`);
  app.socketReady = new Promise((resolve, reject) => {
    app.socket.addEventListener("open", resolve, { once: true });
    app.socket.addEventListener("error", reject, { once: true });
  });

  app.socket.addEventListener("message", (event) => {
    handleSocketMessage(JSON.parse(event.data));
  });

  app.socket.addEventListener("close", () => {
    app.socketReady = null;
    if (app.mode === "online" && app.screen === "game") {
      statusText.textContent = "The online connection closed.";
    }
  });

  return app.socketReady;
}

function handleSocketMessage(message) {
  switch (message.type) {
    case "room-created":
      app.roomCode = message.code;
      roomText.textContent = message.code;
      statusText.textContent = `Room ${message.code} created. Share the code with other players.`;
      break;
    case "room-joined":
      app.roomCode = message.code;
      roomText.textContent = message.code;
      statusText.textContent = `Joined room ${message.code}. Waiting for the rest of the players.`;
      break;
    case "room-status":
      roomText.textContent = message.code;
      statusText.textContent = `Room ${message.code}: ${message.players.length} joined, ${message.waitingFor} waiting.`;
      break;
    case "match-started":
      app.state = message.state;
      app.selfId = message.selfId;
      app.screen = "game";
      resetCamera();
      updateScreen();
      setPaused(false);
      buildControlDisplays();
      statusText.textContent = "Online match started.";
      break;
    case "state":
      app.state = cloneGameState(message.state);
      app.selfId = message.selfId;
      if (app.state.phase === "finished") {
        const countdown = Math.max(1, Math.ceil(app.state.roundBreak?.timer || 0));
        statusText.textContent = `${app.state.winnerName} wins! Next round in ${countdown}s...`;
      } else if (app.state.roundBreak?.showScoreboard) {
        statusText.textContent = `New round — ${app.state.players.map((p) => `${p.name}: ${app.state.roundWins[p.id] || 0}`).join(" | ")}`;
      }
      break;
    case "error":
      statusText.textContent = message.message;
      break;
    default:
      break;
  }
}

function leaveMatch() {
  if (app.socket) {
    try {
      app.socket.close();
    } catch (error) {}
  }

  app.mode = null;
  app.state = null;
  app.selfId = null;
  app.roomCode = "Local";
  app.socket = null;
  app.socketReady = null;
  app.localInputs = {};
  app.pendingPresses = {};
  app.screen = "setup";
  app.paused = false;
  updateScreen();
  setPaused(false);
  buildControlDisplays();
  statusText.textContent = "Back in setup. Change the player count, controls, or skin and start again.";
}

function setPaused(shouldPause) {
  app.paused = shouldPause;
  menuPopover.classList.toggle("hidden", !shouldPause);
  menuPopover.setAttribute("aria-hidden", shouldPause ? "false" : "true");
  if (!shouldPause) {
    controlsSelect.value = "current";
    renderControlsPanel();
  }
}

function handleKeyChange(isDown) {
  return (event) => {
    if (!app.mode || app.deviceMode !== "laptop") {
      return;
    }

    if (event.code === "Escape" && isDown && app.screen === "game") {
      setPaused(!app.paused);
      return;
    }

    if (app.paused) {
      return;
    }

    if (app.mode === "offline") {
      offlineKeyboardBindings.slice(0, app.playerCount).forEach((binding) => {
        applyBindingInput(binding.id, binding.keys, event.code, isDown);
      });
      return;
    }

    applyBindingInput("local", onlineKeyboardBinding.keys, event.code, isDown);
  };
}

function applyBindingInput(inputId, keys, code, isDown) {
  const mapping = {
    [keys[0]]: "left",
    [keys[1]]: "right",
    [keys[2]]: "up",
    [keys[3]]: "down",
    [keys[4]]: "attack",
  };
  const action = mapping[code];
  if (!action) {
    return;
  }

  const input = app.localInputs[inputId];
  const pending = app.pendingPresses[inputId];
  if (!input || !pending) {
    return;
  }

  if (isDown && !input[action]) {
    if (action === "up") {
      pending.up = true;
    }
    if (action === "attack") {
      pending.attack = true;
    }
  }

  input[action] = isDown;
}

function buildMobileControls(players) {
  mobileControls.innerHTML = "";
  if (players.length === 0) {
    mobileControls.classList.remove("is-active");
    return;
  }

  mobileControls.classList.add("is-active");
  mobileControls.style.position = "absolute";
  mobileControls.style.top = "0";
  mobileControls.style.left = "0";
  mobileControls.style.right = "0";
  mobileControls.style.bottom = "0";
  mobileControls.style.width = "100%";
  mobileControls.style.height = "100%";
  mobileControls.style.pointerEvents = "none";
  mobileControls.style.zIndex = "20";
  mobileControls.style.background = "transparent";

  const canvasContainer = mobileControls.parentElement;
  if (canvasContainer instanceof HTMLElement) {
    canvasContainer.style.position = "relative";
  }

  players.forEach((player, index) => {
    const fragment = joystickTemplate.content.cloneNode(true);
    const pad = fragment.querySelector(".pad-card");
    const title = fragment.querySelector(".pad-title");
    const zone = fragment.querySelector(".stick-zone");
    const thumb = fragment.querySelector(".stick-thumb");
    const attackButton = fragment.querySelector(".attack-button");
    const inputId = app.mode === "online" ? "local" : player.id;
    let dragging = false;

    if (pad instanceof HTMLElement) {
      pad.style.position = "absolute";
      pad.style.pointerEvents = "auto";
      pad.style.background = "transparent";
    }

    pad.classList.add(`corner-${index + 1}`);

    title.textContent = app.mode === "online" ? "Your joystick" : `${player.name}`;

    let dropTimer = 0;
    let holdFrame = null;
    let joystickDropped = false;
    let lastHoldTimestamp = 0;

    const resetMovement = () => {
      thumb.style.transform = "translate(0px, 0px)";
      const input = app.localInputs[inputId];
      if (!input) {
        return;
      }
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
    };

    const dropJoystick = () => {
      if (joystickDropped) return;
      joystickDropped = true;
      pad.classList.add("joystick-dropped");
      zone.style.pointerEvents = "none";
      thumb.style.transform = "translate(0px, 0px)";
      const input = app.localInputs[inputId];
      const pending = app.pendingPresses[inputId];
      if (input) {
        input.left = false;
        input.right = false;
        input.up = false;
        input.down = false;
      }
      if (pending) {
        pending.up = false;
        pending.attack = false;
      }
      dragging = false;
      resetJoystickHold();
    };

    const resetJoystickHold = () => {
      dropTimer = 0;
      lastHoldTimestamp = 0;
      if (holdFrame) {
        cancelAnimationFrame(holdFrame);
        holdFrame = null;
      }
    };

    const updateJoystickHold = (timestamp) => {
      if (!dragging || joystickDropped) {
        holdFrame = null;
        return;
      }
      if (!lastHoldTimestamp) {
        lastHoldTimestamp = timestamp;
      }
      const dt = (timestamp - lastHoldTimestamp) / 1000;
      lastHoldTimestamp = timestamp;
      const input = app.localInputs[inputId];
      if (!input || !input.down) {
        dropTimer = 0;
      } else {
        dropTimer += dt;
        if (dropTimer >= 4) {
          dropJoystick();
          return;
        }
      }
      holdFrame = requestAnimationFrame(updateJoystickHold);
    };

    const setInputFromPointer = (event) => {
      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const max = rect.width / 2 - 18;
      const distance = Math.min(max, Math.hypot(dx, dy) || 0);
      const angle = Math.atan2(dy, dx);
      const clampedX = Math.cos(angle) * distance;
      const clampedY = Math.sin(angle) * distance;
      thumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;

      const input = app.localInputs[inputId];
      const pending = app.pendingPresses[inputId];
      if (!input || !pending) {
        return;
      }

      const nextUp = clampedY < -18;
      if (nextUp && !input.up) {
        pending.up = true;
      }

      input.left = clampedX < -18;
      input.right = clampedX > 18;
      input.up = nextUp;
      input.down = clampedY > 18;
    };

    zone.addEventListener("pointerdown", (event) => {
      if (app.paused || joystickDropped) {
        return;
      }
      dragging = true;
      zone.setPointerCapture(event.pointerId);
      setInputFromPointer(event);
      resetJoystickHold();
      holdFrame = requestAnimationFrame(updateJoystickHold);
    });

    zone.addEventListener("pointermove", (event) => {
      if (dragging && !app.paused) {
        setInputFromPointer(event);
      }
    });

    zone.addEventListener("pointerup", () => {
      dragging = false;
      resetMovement();
      resetJoystickHold();
    });
    zone.addEventListener("pointercancel", () => {
      dragging = false;
      resetMovement();
      resetJoystickHold();
    });

    attackButton.addEventListener("pointerdown", () => {
      if (app.paused) {
        return;
      }
      const input = app.localInputs[inputId];
      const pending = app.pendingPresses[inputId];
      if (!input || !pending) {
        return;
      }
      input.attack = true;
      pending.attack = true;
    });
    attackButton.addEventListener("pointerup", () => {
      const input = app.localInputs[inputId];
      if (input) {
        input.attack = false;
      }
    });
    attackButton.addEventListener("pointercancel", () => {
      const input = app.localInputs[inputId];
      if (input) {
        input.attack = false;
      }
    });

    mobileControls.appendChild(fragment);
  });
}

function frame(now) {
  const deltaSeconds = Math.min(0.05, (now - app.lastFrame) / 1000);
  app.lastFrame = now;

  if (!app.paused) {
    if (app.mode === "offline" && app.state) {
      app.accumulator += deltaSeconds;
      while (app.accumulator >= STEP_SECONDS) {
        app.state = stepGameState(app.state, composeOfflineInputs(), STEP_SECONDS);
        app.accumulator -= STEP_SECONDS;
        resetPendingPresses();
      }
    } else if (app.mode === "online" && app.socket?.readyState === WebSocket.OPEN && app.screen === "game") {
      app.lastOnlineSend += deltaSeconds;
      if (app.lastOnlineSend >= STEP_SECONDS) {
        sendOnlineInput();
        app.lastOnlineSend = 0;
        resetPendingPresses();
      }
    }
  }

  if (app.screen === "game") {
    renderGame();
  } else {
    drawMenuCanvas();
  }

  requestAnimationFrame(frame);
}

function composeOfflineInputs() {
  const inputs = {};
  Object.keys(app.localInputs).forEach((id) => {
    inputs[id] = {
      ...app.localInputs[id],
      upPressed: app.pendingPresses[id].up,
      attackPressed: app.pendingPresses[id].attack,
    };
  });
  return inputs;
}

function sendOnlineInput() {
  const local = app.localInputs.local;
  if (!local || !app.socket) {
    return;
  }

  app.socket.send(
    JSON.stringify({
      type: "input",
      input: {
        ...local,
        upPressed: app.pendingPresses.local.up,
        attackPressed: app.pendingPresses.local.attack,
      },
    }),
  );
}

function resetPendingPresses() {
  Object.values(app.pendingPresses).forEach((entry) => {
    entry.up = false;
    entry.attack = false;
  });
}

function renderGame() {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!app.state) {
    drawWaitingScene();
    return;
  }

  const state = app.state;
  updateCamera(state);

  if (state.roundBreak?.showScoreboard && app._lastScoreboardRound !== state.elapsed) {
    app._lastScoreboardRound = state.elapsed;
    resetCamera();
  }

  drawGameBackgroundSky();

  context.save();
  applyWorldTransform();
  drawGameBackgroundWorld(state);
  drawPlatforms(state);
  drawItems(state);
  drawWeapons(state);
  drawProjectiles(state);
  drawPlayers(state);
  drawSummitGlow();
  context.restore();

  drawRoundWinnerSplash(state);
  drawMatchScoreBanner(state);
  drawPersistentRoundScores(state);
  drawLiftCountdown(state);
  drawLevelTransition(state);
  drawPauseCurtain();

  phaseText.textContent = formatPhase(state.phase);
  eventText.textContent = state.eventText;
  roomText.textContent = app.roomCode;
}

function drawMenuCanvas() {
  context.setTransform(1, 0, 0, 1, 0, 0);
  resizeGameCanvas();
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#2d3f57");
  gradient.addColorStop(1, "#111826");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 14; index += 1) {
    context.fillStyle = `rgba(255,255,255,${0.03 + (index % 2) * 0.02})`;
    context.fillRect(40 + index * 65, 60 + (index % 5) * 62, 30, 30);
  }

  context.fillStyle = "#f8f9ff";
  context.font = "700 42px Impact, sans-serif";
  context.fillText("Sky Scramble Showdown", 68, 150);
  context.font = "18px Trebuchet MS, sans-serif";
  context.fillStyle = "#c3d2e5";
  context.fillText("Choose your player count, mobile or laptop controls, and your skin.", 68, 190);

  CHARACTER_ROSTER.slice(0, 4).forEach((character, index) => {
    drawPosterCharacter(getCharacterWithSkin(character.id, getSkinVariants()[index % getSkinVariants().length]), 140 + index * 185, 470, 1.25);
  });
}

function drawWaitingScene() {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#121926";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8f9ff";
  context.font = "700 32px Impact, sans-serif";
  context.fillText("Waiting for players...", 82, 160);
  context.font = "18px Trebuchet MS, sans-serif";
  context.fillStyle = "#c3d2e5";
  context.fillText(statusText.textContent, 82, 198);
  drawPosterCharacter(getCharacterWithSkin(app.localSetup[0].characterId, app.localSetup[0].skinId), 420, 470, 1.55);
}

function drawGameBackgroundSky() {
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#465f83");
  gradient.addColorStop(1, "#111826");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGameBackgroundWorld(state) {
  for (let index = 0; index < 12; index += 1) {
    const worldY = app.cameraY - 280 + index * 130;
    context.fillStyle = "rgba(255,255,255,0.05)";
    context.fillRect(70 + index * 110, worldY, 50 + (index % 3) * 20, 22 + (index % 2) * 12);
  }

  const lineY = state.safeLevelY + 30;
  context.fillStyle = "rgba(255, 120, 120, 0.35)";
  for (let worldX = 0; worldX < WORLD_WIDTH; worldX += 28) {
    context.fillRect(worldX, lineY, 16, 4);
  }

  if (state.currentLevel === 1) {
    context.fillStyle = "rgba(22, 32, 47, 0.9)";
    context.fillRect(0, 830, 36, 180);
    context.fillRect(WORLD_WIDTH - 36, 830, 36, 180);
    context.fillStyle = "rgba(255,255,255,0.08)";
    context.fillRect(6, 840, 24, 160);
    context.fillRect(WORLD_WIDTH - 30, 840, 24, 160);
  }
}

function drawPlatforms(state) {
  const colliders = [...state.platforms];
  if (state.liftEvent) {
    colliders.push({
      x: state.liftEvent.x,
      y: state.liftEvent.currentY ?? state.liftEvent.targetY,
      w: state.liftEvent.w,
      h: state.liftEvent.h,
      isLift: true,
    });
  }

  colliders.forEach((platform) => {
    const x = platform.x;
    const y = platform.y;
    const width = platform.w;
    const height = platform.h || 18;
    const fill = platform.isLift
      ? ["#f9d471", "#d88e2a"]
      : platform.isBreakable
        ? ["#8a6b49", "#5f452c"]
        : platform.isMoving
          ? ["#8adfff", "#4d88c0"]
          : ["#bfd8ff", "#7497c7"];

    const pixels = Math.max(4, Math.floor(width / 12));
    const cell = width / pixels;
    for (let i = 0; i < pixels; i += 1) {
      context.fillStyle = fill[i % 2];
      context.fillRect(x + i * cell, y, cell + 1, height);
    }

    context.fillStyle = "rgba(255,255,255,0.18)";
    context.fillRect(x + 4, y + 3, Math.max(20, width - 8), 3);

    if (platform.isBreakable && platform.maxHp && platform.hp < platform.maxHp) {
      context.strokeStyle = "rgba(0,0,0,0.65)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 10, y + 4);
      context.lineTo(x + width - 12, y + height - 4);
      context.moveTo(x + width * 0.55, y + 2);
      context.lineTo(x + width * 0.4, y + height - 2);
      context.stroke();
    }

    if (platform.isMoving) {
      context.fillStyle = "rgba(255,255,255,0.3)";
      context.fillRect(x + width - 14, y - 8, 10, 5);
    }
  });
}

function drawItems(state) {
  if (!state.items) {
    return;
  }

  state.items.forEach((item) => {
    const x = item.x;
    const y = item.y;
    if (item.type === "xp") {
      context.fillStyle = "#f8c953";
      context.fillRect(x + 6, y, 8, 8);
      context.fillRect(x, y + 6, 8, 8);
      context.fillRect(x + 12, y + 6, 8, 8);
      context.fillRect(x + 6, y + 12, 8, 8);
    } else if (item.type === "heart") {
      context.fillStyle = "#ff8d8d";
      context.fillRect(x + 2, y + 4, 6, 6);
      context.fillRect(x + 10, y + 4, 6, 6);
      context.fillRect(x + 4, y + 10, 10, 8);
    } else {
      context.fillStyle = "#f5d06d";
      context.fillRect(x, y + 5, 18, 5);
      context.fillStyle = "#d86565";
      context.fillRect(x + 6, y, 6, 5);
    }
  });
}

function drawWeapons(state) {
  state.weapons.forEach((weapon) => {
    if (weapon.claimedBy) {
      return;
    }
    const x = weapon.x;
    const bob = Math.sin((state.elapsed + weapon.x) * 4) * 2;
    const y = weapon.y + bob;
    if (weapon.kind === "sword") {
      context.fillStyle = "#d5ecff";
      context.fillRect(x + 11, y - 6, 4, 18);
      context.fillStyle = "#6f7d92";
      context.fillRect(x + 7, y + 10, 12, 4);
      context.fillStyle = "#d86f6f";
      context.fillRect(x + 10, y + 13, 6, 5);
    } else if (weapon.kind === "sniper") {
      context.fillStyle = "#697d94";
      context.fillRect(x, y + 5, 28, 5);
      context.fillStyle = "#d5ecff";
      context.fillRect(x + 22, y + 6, 8, 2);
      context.fillStyle = "#c86767";
      context.fillRect(x + 4, y + 1, 10, 4);
    } else {
      context.fillStyle = "#5c6f82";
      context.fillRect(x, y + 5, 22, 6);
      context.fillStyle = "#f06a6a";
      context.fillRect(x + 7, y, 7, 5);
      context.fillStyle = "#d5ecff";
      context.fillRect(x + 18, y + 6, 5, 2);
    }
  });
}

function drawProjectiles(state) {
  if (!state.projectiles) {
    return;
  }

  state.projectiles.forEach((projectile) => {
    const x = projectile.x;
    const y = projectile.y;
    context.fillStyle = projectile.color || "#ffe89b";
    context.fillRect(x - 10, y + 1, 10, 2);
    context.fillStyle = "#fff7d0";
    context.fillRect(x, y - 1, projectile.kind === "sniper" ? 9 : 7, projectile.kind === "sniper" ? 6 : 5);
  });
}

function drawPlayers(state) {
  state.players.forEach((player) => {
    if (player.eliminated) {
      return;
    }

    if (player.respawnTimer > 0) {
      context.globalAlpha = 0.5;
    } else if (player.invulnerability > 0) {
      context.globalAlpha = 0.75;
    }

    const x = player.x;
    const walkPhase = Math.sin(state.elapsed * 11 + player.x * 0.03) * Math.min(1, Math.abs(player.vx) / 180);
    const bob = player.onGround ? Math.abs(walkPhase) * 2 : 0;
    const y = player.y - bob;
    const look = player.look || getFallbackCharacter().look;
    const centerX = x + player.w / 2;
    const lean = Math.max(-5, Math.min(5, player.vx * 0.012)) + (player.recoilTimer > 0 ? -player.facing * 2.4 : 0);
    const attackStretch = player.attackAnimation > 0 ? 1 + Math.min(0.18, player.attackAnimation * 0.6) : 1;
    const hurtFlash = player.hurtTimer > 0;

    context.fillStyle = "rgba(0,0,0,0.18)";
    context.fillRect(x + 8, y + player.h + 3, 26, 5);

    if (player.weapon) {
      const aimLength = 40;
      const endX = centerX + Math.cos(player.aimAngle || (player.facing === 1 ? 0 : Math.PI)) * aimLength;
      const endY = y + 24 + Math.sin(player.aimAngle || 0) * aimLength;
      context.strokeStyle = "rgba(255, 239, 155, 0.45)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(centerX, y + 24);
      context.lineTo(endX, endY);
      context.stroke();
    }

    context.save();
    if (player.flipAngle) {
      context.translate(centerX, y + player.h * 0.48);
      context.rotate(player.flipAngle * 0.18);
      context.translate(-centerX, -(y + player.h * 0.48));
    }

    const headY = y;
    const torsoY = y + 16;
    const legY = y + 48;
    const armOffset = walkPhase * 2;

    // Head and helmet
    context.fillStyle = hurtFlash ? "#ffffff" : look.body;
    context.fillRect(centerX - 14, headY, 28, 18);
    context.fillStyle = hurtFlash ? "#ffffff" : look.trim;
    context.fillRect(centerX - 18, headY + 4, 6, 10);
    context.fillRect(centerX + 12, headY + 4, 6, 10);
    context.fillStyle = hurtFlash ? "#ffffff" : look.visor;
    context.fillRect(centerX - 10, headY + 4, 20, 6);
    context.fillStyle = hurtFlash ? "#ffffff" : look.accent;
    context.fillRect(centerX - 8, headY + 12, 16, 4);

    // Collar / scarf
    context.fillStyle = hurtFlash ? "#ffffff" : look.scarf;
    context.fillRect(centerX - 12, headY + 14, 24, 8);

    // Arms
    context.fillStyle = hurtFlash ? "#ffffff" : look.body;
    context.fillRect(centerX - 28, torsoY + 4 + armOffset, 10, 26);
    context.fillRect(centerX + 18, torsoY + 4 - armOffset, 10, 26);
    context.fillStyle = hurtFlash ? "#ffffff" : look.accent;
    context.fillRect(centerX - 26, torsoY + 18 + armOffset, 6, 10);
    context.fillRect(centerX + 24, torsoY + 18 - armOffset, 6, 10);

    // Torso and chest plates
    context.fillStyle = hurtFlash ? "#ffffff" : look.body;
    context.fillRect(centerX - 16, torsoY + 6, 32 * attackStretch, 28);
    context.fillStyle = hurtFlash ? "#ffffff" : look.accent;
    context.fillRect(centerX - 12, torsoY + 12, 24, 8);
    context.fillStyle = hurtFlash ? "#ffffff" : look.trim;
    context.fillRect(centerX - 20, torsoY + 8, 8, 24);
    context.fillRect(centerX + 12, torsoY + 8, 8, 24);
    context.fillStyle = "rgba(255,255,255,0.12)";
    context.fillRect(centerX - 6, torsoY + 10, 4, 18);
    context.fillRect(centerX + 2, torsoY + 10, 4, 18);

    // Boots and legs
    context.fillStyle = hurtFlash ? "#ffffff" : look.trim;
    context.fillRect(centerX - 14, legY, 10, 12);
    context.fillRect(centerX + 4, legY, 10, 12);
    context.fillStyle = hurtFlash ? "#ffffff" : look.outline;
    context.fillRect(centerX - 14, legY + 8, 10, 4);
    context.fillRect(centerX + 4, legY + 8, 10, 4);

    drawCharacterFlair(player.characterId, look, centerX, headY, torsoY, hurtFlash);

    if (player.weaponType === "sword") {
      const swordX = centerX + (player.facing === 1 ? 11 : -18);
      context.fillStyle = "#d7ecff";
      context.fillRect(swordX, y + 16, 4, 20);
      context.fillStyle = "#6f7d92";
      context.fillRect(swordX - 4, y + 33, 12, 4);
      if (player.attackKind === "sword" && player.attackAnimation > 0) {
        context.strokeStyle = "rgba(215,236,255,0.85)";
        context.lineWidth = 4;
        context.beginPath();
        context.arc(centerX + player.facing * 18, y + 24, 22, player.facing === 1 ? -0.9 : 2.1, player.facing === 1 ? 0.8 : 4.0);
        context.stroke();
      }
    } else if (player.weapon) {
      const gunX = centerX + (player.facing === 1 ? 12 : -32);
      const gunWidth = player.weaponType === "sniper" ? 28 : 20;
      context.fillStyle = player.weaponType === "sniper" ? "#697d94" : "#5c6f82";
      context.fillRect(gunX, y + 25, gunWidth, 5);
      context.fillStyle = "#f06a6a";
      context.fillRect(gunX + 6, y + 19, 7, 6);
      if (player.muzzleFlashTimer > 0) {
        context.fillStyle = "rgba(255,240,176,0.9)";
        const flashX = gunX + (player.facing === 1 ? gunWidth : -8);
        context.fillRect(flashX, y + 23, 8, 8);
      }
    }

    context.restore();

    if (app.mode !== "offline") {
      context.fillStyle = "#ffffff";
      context.font = "11px Trebuchet MS, sans-serif";
      context.fillText(player.name, x - 2, y - 8);
    }

    context.fillStyle = "rgba(0,0,0,0.45)";
    context.fillRect(x, y - 18, 44, 5);
    context.fillStyle = "#8ff0b6";
    context.fillRect(x, y - 18, 44 * (player.health / 100), 5);

    for (let heartIndex = 0; heartIndex < 3; heartIndex += 1) {
      drawPixelHeart(x + 6 + heartIndex * 14, y - 22, player.lives > heartIndex);
    }

    context.globalAlpha = 1;
  });
}

function drawSummitGlow() {
  const summitY = SUMMIT_Y + 40;
  const gradient = context.createLinearGradient(0, summitY - 60, 0, summitY + 60);
  gradient.addColorStop(0, "rgba(248, 201, 83, 0)");
  gradient.addColorStop(0.5, "rgba(248, 201, 83, 0.2)");
  gradient.addColorStop(1, "rgba(248, 201, 83, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, summitY - 60, WORLD_WIDTH, 120);
}

function drawRoundWinnerSplash(state) {
  if (state.phase !== "finished") {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const panelWidth = Math.min(520, canvas.width - 40);
  const panelHeight = Math.min(200, canvas.height * 0.28);
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - panelHeight) / 2;

  context.fillStyle = "rgba(10, 14, 23, 0.9)";
  context.fillRect(panelX, panelY, panelWidth, panelHeight);
  context.strokeStyle = "rgba(248, 201, 83, 0.55)";
  context.lineWidth = 3;
  context.strokeRect(panelX, panelY, panelWidth, panelHeight);

  context.fillStyle = "#f8c953";
  context.font = `700 ${Math.round(canvas.width * 0.045)}px Impact, sans-serif`;
  const winText = `${state.winnerName} wins!`;
  const winWidth = context.measureText(winText).width;
  context.fillText(winText, canvas.width / 2 - winWidth / 2, panelY + panelHeight * 0.38);

  const countdown = Math.max(1, Math.ceil(state.roundBreak?.timer || 0));
  context.font = `${Math.round(canvas.width * 0.022)}px Trebuchet MS, sans-serif`;
  context.fillStyle = "#d0dcea";
  const nextText = `Next round in ${countdown}...`;
  const nextWidth = context.measureText(nextText).width;
  context.fillText(nextText, canvas.width / 2 - nextWidth / 2, panelY + panelHeight * 0.68);
}

function drawMatchScoreBanner(state) {
  if (!state.roundBreak?.showScoreboard) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "rgba(6, 10, 18, 0.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const title = "Round wins";
  context.fillStyle = "#f8f9ff";
  context.font = `700 ${Math.round(canvas.width * 0.05)}px Impact, sans-serif`;
  const titleWidth = context.measureText(title).width;
  context.fillText(title, canvas.width / 2 - titleWidth / 2, canvas.height * 0.22);

  const rowHeight = Math.max(52, canvas.height * 0.09);
  const startY = canvas.height * 0.32;
  const sortedPlayers = [...state.players].sort(
    (a, b) => (state.roundWins[b.id] || 0) - (state.roundWins[a.id] || 0),
  );

  sortedPlayers.forEach((player, index) => {
    const wins = state.roundWins[player.id] || 0;
    const rowY = startY + index * rowHeight;
    const cardWidth = Math.min(420, canvas.width - 48);
    const cardX = (canvas.width - cardWidth) / 2;

    context.fillStyle = "rgba(12, 23, 58, 0.92)";
    context.fillRect(cardX, rowY, cardWidth, rowHeight - 8);
    context.strokeStyle = player.color || "#84d8ff";
    context.lineWidth = 3;
    context.strokeRect(cardX, rowY, cardWidth, rowHeight - 8);

    context.fillStyle = player.color || "#eef4ff";
    context.fillRect(cardX + 14, rowY + 14, 18, 18);

    context.fillStyle = "#f8f9ff";
    context.font = `700 ${Math.round(canvas.width * 0.028)}px Impact, sans-serif`;
    context.fillText(player.name, cardX + 42, rowY + rowHeight * 0.42);

    context.fillStyle = "#f8c953";
    context.font = `700 ${Math.round(canvas.width * 0.04)}px Impact, sans-serif`;
    const winLabel = String(wins);
    const winWidth = context.measureText(winLabel).width;
    context.fillText(winLabel, cardX + cardWidth - winWidth - 20, rowY + rowHeight * 0.44);
  });
}

function drawPersistentRoundScores(state) {
  if (!state.roundWins || state.phase === "finished" || state.roundBreak?.showScoreboard) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const pad = 10;
  const boxHeight = 28 + state.players.length * 22;
  const boxWidth = Math.min(200, canvas.width * 0.34);

  context.fillStyle = "rgba(10, 14, 23, 0.55)";
  context.fillRect(pad, pad, boxWidth, boxHeight);
  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.strokeRect(pad, pad, boxWidth, boxHeight);

  context.fillStyle = "#c3d2e5";
  context.font = `700 ${Math.max(11, Math.round(canvas.width * 0.014))}px Trebuchet MS, sans-serif`;
  context.fillText("Wins", pad + 10, pad + 18);

  state.players.forEach((player, index) => {
    const wins = state.roundWins[player.id] || 0;
    const rowY = pad + 34 + index * 22;
    context.fillStyle = player.color || "#eef4ff";
    context.fillRect(pad + 10, rowY - 10, 8, 8);
    context.fillStyle = "#f8f9ff";
    context.font = `${Math.max(11, Math.round(canvas.width * 0.013))}px Trebuchet MS, sans-serif`;
    context.fillText(`${player.name}`, pad + 24, rowY);
    context.fillStyle = "#f8c953";
    context.fillText(String(wins), pad + boxWidth - 24, rowY);
  });
}

function drawLiftCountdown(state) {
  if (!state.liftEvent || state.liftEvent.phase !== "countdown") {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const countdown = Math.max(0, Math.ceil(state.liftEvent.countdown));
  const countdownText = String(countdown);
  const boxSize = Math.max(56, Math.round(canvas.width * 0.12));

  if (app.mode === "offline") {
    context.fillStyle = "rgba(10, 14, 23, 0.55)";
    context.fillRect(canvas.width / 2 - boxSize / 2, 14, boxSize, boxSize * 0.76);
    context.strokeStyle = "rgba(248, 201, 83, 0.45)";
    context.strokeRect(canvas.width / 2 - boxSize / 2, 14, boxSize, boxSize * 0.76);
    context.fillStyle = "#f8c953";
    context.font = `700 ${Math.round(boxSize * 0.62)}px Impact, sans-serif`;
    const countdownWidth = context.measureText(countdownText).width;
    context.fillText(countdownText, canvas.width / 2 - countdownWidth / 2, 14 + boxSize * 0.58);
    return;
  }

  const panelHeight = 92;
  const panelWidth = Math.min(canvas.width - 36, 420);
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = canvas.height - panelHeight - 18;

  context.fillStyle = "rgba(10, 14, 23, 0.8)";
  context.fillRect(panelX, panelY, panelWidth, panelHeight);
  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.strokeRect(panelX, panelY, panelWidth, panelHeight);

  context.fillStyle = "#f8c953";
  context.font = "700 64px Impact, sans-serif";
  const countdownWidth = context.measureText(countdownText).width;
  context.fillText(countdownText, canvas.width / 2 - countdownWidth / 2, panelY + 52);

  const label = "Get on the lift before zero.";
  context.font = "16px Trebuchet MS, sans-serif";
  context.fillStyle = "#ffffff";
  const labelWidth = context.measureText(label).width;
  context.fillText(label, canvas.width / 2 - labelWidth / 2, panelY + 76);
}

function drawLevelTransition(state) {
  if (!state.levelTransition?.active) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  const progress = 1 - Math.max(0, state.levelTransition.timer / 2);
  const alpha = progress < 0.5 ? progress * 1.6 : (1 - progress) * 1.6;
  context.fillStyle = `rgba(6, 8, 12, ${Math.max(0.2, Math.min(0.9, alpha))})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8f9ff";
  context.font = `700 ${Math.round(canvas.width * 0.05)}px Impact, sans-serif`;
  const levelLabel = `Level ${state.levelTransition.nextLevel}`;
  const levelWidth = context.measureText(levelLabel).width;
  context.fillText(levelLabel, canvas.width / 2 - levelWidth / 2, canvas.height / 2 - 10);
  if (app.mode !== "offline") {
    context.font = `${Math.round(canvas.width * 0.018)}px Trebuchet MS, sans-serif`;
    context.fillStyle = "#d0dcea";
    context.fillText("The tower shifts into a new arena...", canvas.width / 2 - 140, canvas.height / 2 + 24);
  }
}

function drawPauseCurtain() {
  if (!app.paused) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "rgba(10, 14, 23, 0.22)";
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPixelHeart(x, y, filled) {
  const body = filled ? "#ff4d6d" : "rgba(255, 255, 255, 0.14)";
  const shine = filled ? "#ffd1dc" : "rgba(255, 255, 255, 0.08)";
  context.fillStyle = body;
  context.fillRect(x, y + 1, 4, 4);
  context.fillRect(x + 6, y + 1, 4, 4);
  context.fillRect(x + 2, y + 4, 6, 5);
  context.fillStyle = shine;
  context.fillRect(x + 3, y + 2, 2, 2);
}

function drawCharacterFlair(characterId, look, centerX, headY, torsoY, hurtFlash) {
  if (hurtFlash) {
    return;
  }

  switch (characterId) {
    case "kestrel":
      context.fillStyle = look.accent;
      context.fillRect(centerX - 8, headY + 5, 3, 2);
      context.fillRect(centerX + 5, headY + 5, 3, 2);
      context.fillStyle = look.scarf;
      context.fillRect(centerX - 5, headY + 15, 10, 3);
      context.fillStyle = look.trim;
      context.fillRect(centerX - 2, torsoY + 18, 4, 10);
      break;
    case "mako":
      for (let stripe = 0; stripe < 3; stripe += 1) {
        context.fillStyle = stripe % 2 === 0 ? look.accent : look.trim;
        context.fillRect(centerX - 12 + stripe * 8, torsoY + 14, 6, 3);
      }
      context.fillStyle = look.visor;
      context.fillRect(centerX - 4, headY + 7, 8, 2);
      break;
    case "piper":
      context.fillStyle = look.accent;
      context.fillRect(centerX - 10, torsoY + 10, 4, 4);
      context.fillRect(centerX + 6, torsoY + 16, 4, 4);
      context.fillRect(centerX - 2, torsoY + 22, 4, 4);
      context.fillStyle = look.scarf;
      context.fillRect(centerX - 14, headY + 16, 4, 6);
      context.fillRect(centerX + 10, headY + 16, 4, 6);
      break;
    case "rook":
      context.fillStyle = look.accent;
      context.fillRect(centerX - 4, headY + 2, 8, 4);
      context.fillStyle = look.trim;
      context.fillRect(centerX - 16, torsoY + 10, 4, 18);
      context.fillRect(centerX + 12, torsoY + 10, 4, 18);
      context.fillStyle = look.scarf;
      context.fillRect(centerX - 6, torsoY + 24, 12, 3);
      break;
    case "ember":
      context.fillStyle = look.accent;
      context.fillRect(centerX - 6, headY + 8, 12, 2);
      context.fillStyle = look.scarf;
      context.fillRect(centerX - 12, torsoY + 12, 3, 12);
      context.fillRect(centerX + 9, torsoY + 12, 3, 12);
      context.fillStyle = look.trim;
      context.fillRect(centerX - 4, torsoY + 20, 8, 4);
      break;
    case "glint":
      context.fillStyle = look.accent;
      context.fillRect(centerX - 2, headY + 3, 4, 10);
      context.fillStyle = look.visor;
      context.fillRect(centerX - 10, headY + 10, 20, 2);
      context.fillStyle = look.trim;
      context.fillRect(centerX - 14, torsoY + 14, 28, 2);
      context.fillRect(centerX - 14, torsoY + 22, 28, 2);
      break;
    default:
      context.fillStyle = look.accent;
      context.fillRect(centerX - 4, torsoY + 14, 8, 4);
      break;
  }
}

function drawPosterCharacter(character, x, y, scale) {
  const look = character.look;
  const width = 54 * scale;
  const height = 84 * scale;
  const top = y - height;
  context.save();
  context.translate(x, top);

  // Head and visor
  context.fillStyle = look.body;
  context.fillRect(width * 0.28, height * 0.00, width * 0.44, height * 0.18);
  context.fillStyle = look.visor;
  context.fillRect(width * 0.36, height * 0.06, width * 0.28, height * 0.08);
  context.fillStyle = look.trim;
  context.fillRect(width * 0.20, height * 0.04, width * 0.08, height * 0.10);
  context.fillRect(width * 0.72, height * 0.04, width * 0.08, height * 0.10);
  context.fillStyle = look.accent;
  context.fillRect(width * 0.34, height * 0.14, width * 0.32, height * 0.04);

  // Collar / scarf
  context.fillStyle = look.scarf;
  context.fillRect(width * 0.26, height * 0.18, width * 0.48, height * 0.08);

  // Torso
  context.fillStyle = look.body;
  context.fillRect(width * 0.22, height * 0.26, width * 0.56, height * 0.30);
  context.fillStyle = look.accent;
  context.fillRect(width * 0.30, height * 0.34, width * 0.40, height * 0.08);
  context.fillStyle = look.trim;
  context.fillRect(width * 0.22, height * 0.34, width * 0.08, height * 0.18);
  context.fillRect(width * 0.70, height * 0.34, width * 0.08, height * 0.18);
  context.fillStyle = "rgba(255,255,255,0.12)";
  context.fillRect(width * 0.44, height * 0.30, width * 0.08, height * 0.16);

  // Legs and boots
  context.fillStyle = look.trim;
  context.fillRect(width * 0.22, height * 0.56, width * 0.14, height * 0.18);
  context.fillRect(width * 0.64, height * 0.56, width * 0.14, height * 0.18);
  context.fillStyle = look.outline;
  context.fillRect(width * 0.22, height * 0.70, width * 0.14, height * 0.08);
  context.fillRect(width * 0.64, height * 0.70, width * 0.14, height * 0.08);

  drawCharacterFlair(character.id, look, width * 0.5, height * 0.02, height * 0.28, false);

  context.restore();
}

function characterPortraitSvg(character, size) {
  const look = character.look;
  const dimensions = size === "large" ? 190 : size === "slot" ? 94 : 112;
  const emblem = getPortraitEmblemMarkup(character.id, look);
  return `
    <svg viewBox="0 0 120 140" width="${dimensions}" height="${Math.round(dimensions * 1.18)}" aria-hidden="true">
      <rect x="8" y="10" width="104" height="120" fill="rgba(255,255,255,0.04)"></rect>
      <rect x="36" y="48" width="28" height="10" fill="${look.scarf}"></rect>
      <rect x="38" y="34" width="44" height="36" fill="${look.body}"></rect>
      <rect x="46" y="14" width="28" height="24" fill="${look.body}"></rect>
      <rect x="49" y="22" width="22" height="8" fill="${look.visor}"></rect>
      <rect x="44" y="42" width="32" height="10" fill="${look.accent}"></rect>
      <rect x="32" y="40" width="10" height="30" fill="${look.trim}"></rect>
      <rect x="78" y="40" width="10" height="30" fill="${look.trim}"></rect>
      <rect x="42" y="72" width="11" height="32" fill="${look.outline}"></rect>
      <rect x="67" y="72" width="11" height="32" fill="${look.outline}"></rect>
      <rect x="38" y="104" width="17" height="7" fill="${look.trim}"></rect>
      <rect x="65" y="104" width="17" height="7" fill="${look.trim}"></rect>
      ${emblem}
    </svg>
  `;
}

function getPortraitEmblemMarkup(characterId, look) {
  switch (characterId) {
    case "kestrel":
      return `<rect x="52" y="18" width="4" height="4" fill="${look.accent}"></rect><rect x="64" y="18" width="4" height="4" fill="${look.accent}"></rect><rect x="56" y="52" width="8" height="3" fill="${look.scarf}"></rect>`;
    case "mako":
      return `<rect x="44" y="48" width="8" height="3" fill="${look.accent}"></rect><rect x="56" y="52" width="8" height="3" fill="${look.trim}"></rect><rect x="68" y="48" width="8" height="3" fill="${look.accent}"></rect>`;
    case "piper":
      return `<rect x="42" y="46" width="4" height="4" fill="${look.accent}"></rect><rect x="74" y="54" width="4" height="4" fill="${look.accent}"></rect><rect x="58" y="60" width="4" height="4" fill="${look.accent}"></rect>`;
    case "rook":
      return `<rect x="54" y="16" width="12" height="5" fill="${look.accent}"></rect><rect x="56" y="62" width="8" height="3" fill="${look.scarf}"></rect>`;
    case "ember":
      return `<rect x="48" y="24" width="24" height="2" fill="${look.accent}"></rect><rect x="36" y="48" width="3" height="10" fill="${look.scarf}"></rect><rect x="81" y="48" width="3" height="10" fill="${look.scarf}"></rect>`;
    case "glint":
      return `<rect x="58" y="16" width="4" height="12" fill="${look.accent}"></rect><rect x="42" y="52" width="36" height="2" fill="${look.trim}"></rect><rect x="42" y="60" width="36" height="2" fill="${look.trim}"></rect>`;
    default:
      return `<rect x="56" y="50" width="8" height="4" fill="${look.accent}"></rect>`;
  }
}

function emptyInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    attack: false,
  };
}

function formatPhase(phase) {
  if (phase === "climb") {
    return "Climb Phase";
  }
  if (phase === "showdown") {
    return "Showdown";
  }
  if (phase === "finished") {
    return "Round Over";
  }
  return "Waiting";
}

function updateNetworkBadge() {
  networkBadge.textContent = navigator.onLine ? "Internet ready" : "Offline right now";
}

async function installGame() {
  if (app.installPrompt) {
    await app.installPrompt.prompt();
    app.installPrompt = null;
    installButton.classList.add("hidden");
    return;
  }
  downloadNote.textContent = "Use your browser install or add-to-home-screen option if the prompt is not available yet.";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function clearLegacyCaches() {
  if (!("caches" in window)) {
    return;
  }

  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => !key.includes("v6")).map((key) => caches.delete(key)));
}

async function registerOfflineSupport() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await clearLegacyCaches();
    const registration = await navigator.serviceWorker.register(`/sw.js?${APP_BUILD}`, { updateViaCache: "none" });

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) {
        return;
      }

      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          window.location.reload();
        }
      });
    });

    await registration.update();
  } catch (error) {
    statusText.textContent = "Offline caching could not be enabled in this browser.";
  }
}

function createInitialLocalSetup() {
  const variants = getSkinVariants();
  return [0, 1, 2, 3].map((index) => ({
    characterId: CHARACTER_ROSTER[index % CHARACTER_ROSTER.length].id,
    skinId: variants[index % variants.length],
    name: `Player ${index + 1}`,
  }));
}

function syncSelectionFromActiveSlot() {
  const slot = app.localSetup[app.activeLocalSlot];
  app.selectedCharacterId = slot.characterId;
  app.selectedSkinId = slot.skinId;
}
