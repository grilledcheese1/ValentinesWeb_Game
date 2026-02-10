const gameCanvas = document.getElementById("gameCanvas");
const ctx = gameCanvas.getContext("2d");
const scoreEl = document.getElementById("scoreEl");
const highScoreEl = document.getElementById("highScoreEl");
const heartEls = Array.from(document.querySelectorAll(".heart-icon"));
const gameContainer = document.querySelector(".game-container");
let startOverlay = document.getElementById("startOverlay");

const INTERNAL_WIDTH = 960;
const INTERNAL_HEIGHT = 540;
const HIGH_SCORE_STORAGE_KEY = "valentine_game_high_score";
const ASSET_PATHS = {
  pxGameBg: "gameImages/pxGameBg.png",
  leftCat: "gameImages/leftCat.png",
  rightCat: "gameImages/rightCat.png",
  leftCat1: "gameImages/leftCat1.png",
  rightCat1: "gameImages/rightCat1.png",
  leftJumpCat: "gameImages/leftJumpCat.png",
  rightJumpCat: "gameImages/rightJumpCat.png",
  runCatLeft: "gameImages/runCatLeft.png",
  runCatRight: "gameImages/runCatRight.png",
  strawberry: "gameImages/strawberry.png",
};

let lastTime = 0;
let isRunning = false;
let score = 0;
let highScore = Number.parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || "0", 10);
if (!Number.isFinite(highScore) || highScore < 0) {
  highScore = 0;
}
let lives = 3;
let difficulty = null;
let elapsedPlayTime = 0;
let spawnTimerSec = 0;
const strawberries = [];
const keys = {
  left: false,
  right: false,
  jump: false,
};
const player = {
  x: INTERNAL_WIDTH * 0.5 - 56,
  y: INTERNAL_HEIGHT - 138,
  groundY: INTERNAL_HEIGHT - 138,
  width: 112,
  height: 112,
  speed: 420,
  state: "idle",
  facing: "right",
  idleAnimTimer: 0,
  idleFrameIndex: 0,
  jumpVisualTimer: 0,
  isJumping: false,
  jumpVelocity: 0,
};
const IDLE_FRAME_DURATION_SEC = 0.22;
const JUMP_SPRITE_DURATION_SEC = 0.2;
const STRAWBERRY_WIDTH = 42;
const STRAWBERRY_HEIGHT = 42;
const GRAVITY = 900;
const JUMP_IMPULSE = -260;

const assets = {};
let assetsReady = false;
const DIFFICULTY_CONFIGS = {
  easy: {
    baseSpawnIntervalSec: 1.1,
    baseFallSpeed: 130,
    speedMultiplierPer10s: 1.06,
    winScore: 30,
  },
  medium: {
    baseSpawnIntervalSec: 0.8,
    baseFallSpeed: 180,
    speedMultiplierPer10s: 1.12,
    winScore: 30,
  },
  hard: {
    baseSpawnIntervalSec: 0.56,
    baseFallSpeed: 240,
    speedMultiplierPer10s: 1.2,
    winScore: 30,
  },
};

gameCanvas.width = INTERNAL_WIDTH;
gameCanvas.height = INTERNAL_HEIGHT;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width ||
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height
  );
}

function updateHud() {
  scoreEl.textContent = String(score);
  highScoreEl.textContent = String(highScore);
  heartEls.forEach((heartEl, index) => {
    heartEl.textContent = index < lives ? "❤" : "♡";
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

async function loadAssets() {
  const entries = Object.entries(ASSET_PATHS);

  await Promise.all(
    entries.map(async ([key, src]) => {
      try {
        assets[key] = await loadImage(src);
      } catch (error) {
        assets[key] = null;
        console.warn(error.message);
      }
    })
  );

  assetsReady = true;
}

function update(dt) {
  if (!isRunning) {
    return;
  }

  updatePlayer(dt);
  updateStrawberries(dt);
  elapsedPlayTime += dt;
  score = clamp(score, 0, Number.MAX_SAFE_INTEGER);
  highScore = Math.max(highScore, score);
  localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore));
}

function render() {
  ctx.clearRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

  if (assets.pxGameBg) {
    ctx.drawImage(assets.pxGameBg, 0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  } else {
    ctx.fillStyle = "#ffd7e8";
    ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  }

  if (!assetsReady) {
    ctx.fillStyle = "#5f2b40";
    ctx.font = "700 30px Quicksand";
    ctx.textAlign = "center";
    ctx.fillText("Loading...", INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2);
  }

  renderStrawberries();
  renderPlayer();
}

function gameLoop(timestamp) {
  const dt = lastTime ? (timestamp - lastTime) / 1000 : 0;
  lastTime = timestamp;

  if (isRunning) {
    update(dt);
  }

  render();
  updateHud();
  requestAnimationFrame(gameLoop);
}

function resetGameState() {
  score = 0;
  lives = 3;
  elapsedPlayTime = 0;
  spawnTimerSec = 0;
  strawberries.length = 0;
  player.x = INTERNAL_WIDTH * 0.5 - player.width * 0.5;
  player.y = player.groundY;
  player.state = "idle";
  player.facing = "right";
  player.idleAnimTimer = 0;
  player.idleFrameIndex = 0;
  player.jumpVisualTimer = 0;
  player.isJumping = false;
  player.jumpVelocity = 0;
  keys.left = false;
  keys.right = false;
  keys.jump = false;
  updateHud();
}

function selectDifficulty(config) {
  difficulty = { ...config };
  if (startOverlay) {
    startOverlay.remove();
    startOverlay = null;
  }
  resetGameState();
  isRunning = true;
}

isRunning = false;

function attachDifficultyListeners() {
  const easyBtn = document.getElementById("easyBtn");
  const mediumBtn = document.getElementById("mediumBtn");
  const hardBtn = document.getElementById("hardBtn");

  if (!easyBtn || !mediumBtn || !hardBtn) {
    return;
  }

  easyBtn.addEventListener("click", () => {
    selectDifficulty(DIFFICULTY_CONFIGS.easy);
  });

  mediumBtn.addEventListener("click", () => {
    selectDifficulty(DIFFICULTY_CONFIGS.medium);
  });

  hardBtn.addEventListener("click", () => {
    selectDifficulty(DIFFICULTY_CONFIGS.hard);
  });
}

function createStartOverlay() {
  if (!gameContainer || document.getElementById("startOverlay")) {
    startOverlay = document.getElementById("startOverlay");
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "startOverlay";
  overlay.className = "game-overlay";
  overlay.innerHTML = `
    <h1>Choose Difficulty</h1>
    <div class="overlay-actions">
      <button id="easyBtn" type="button">Easy Peasy</button>
      <button id="mediumBtn" type="button">Medium Madness</button>
      <button id="hardBtn" type="button">Hard</button>
    </div>
  `;

  gameContainer.appendChild(overlay);
  startOverlay = overlay;
  attachDifficultyListeners();
}

function showGameOverOverlay() {
  if (!gameContainer || document.getElementById("gameOverOverlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "game-overlay";
  overlay.id = "gameOverOverlay";
  overlay.innerHTML = `
    <h1>GAME OVER</h1>
    <p>Score: <span>${score}</span></p>
    <p>High Score: <span>${highScore}</span></p>
    <div class="overlay-actions">
      <button id="playAgainBtn" type="button">Play Again</button>
    </div>
  `;

  gameContainer.appendChild(overlay);

  const playAgainBtn = overlay.querySelector("#playAgainBtn");
  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", () => {
      overlay.remove();
      createStartOverlay();
      isRunning = false;
    });
  }
}

attachDifficultyListeners();

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
  } else if (event.code === "Space") {
    if (!keys.jump) {
      triggerJump();
    }
    keys.jump = true;
    event.preventDefault();
  } else if (event.code === "ArrowUp" || event.code === "KeyW") {
    triggerJump();
  } else if (event.code === "ArrowDown") {
    // Prevent page scrolling for gameplay keys.
  }

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = false;
  } else if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = false;
  } else if (event.code === "Space") {
    keys.jump = false;
    event.preventDefault();
  }
});

function updatePlayer(dt) {
  const leftIntent = keys.left && !keys.right;
  const rightIntent = keys.right && !keys.left;
  let moveX = 0;

  if (leftIntent) {
    moveX = -1;
    player.facing = "left";
  } else if (rightIntent) {
    moveX = 1;
    player.facing = "right";
  }

  player.x += moveX * player.speed * dt;
  player.x = clamp(player.x, 0, INTERNAL_WIDTH - player.width);

  if (player.isJumping) {
    player.y += player.jumpVelocity * dt;
    player.jumpVelocity += GRAVITY * dt;
    if (player.y >= player.groundY) {
      player.y = player.groundY;
      player.isJumping = false;
      player.jumpVelocity = 0;
    }
  }

  if (player.jumpVisualTimer > 0) {
    player.jumpVisualTimer = Math.max(0, player.jumpVisualTimer - dt);
  }

  if (player.jumpVisualTimer > 0) {
    player.state = "jump";
  } else if (moveX !== 0) {
    player.state = "run";
  } else {
    player.state = "idle";
  }

  if (player.state === "idle") {
    player.idleAnimTimer += dt;
    if (player.idleAnimTimer >= IDLE_FRAME_DURATION_SEC) {
      player.idleAnimTimer = 0;
      player.idleFrameIndex = player.idleFrameIndex === 0 ? 1 : 0;
    }
  } else {
    player.idleAnimTimer = 0;
  }
}

function currentSpawnIntervalSec() {
  if (!difficulty) {
    return Number.POSITIVE_INFINITY;
  }
  const growthSteps = Math.floor(elapsedPlayTime / 10);
  const speedGrowth = Math.pow(difficulty.speedMultiplierPer10s, growthSteps);
  return difficulty.baseSpawnIntervalSec / speedGrowth;
}

function currentFallSpeed() {
  if (!difficulty) {
    return 0;
  }
  const growthSteps = Math.floor(elapsedPlayTime / 10);
  return difficulty.baseFallSpeed * Math.pow(difficulty.speedMultiplierPer10s, growthSteps);
}

function spawnStrawberry() {
  const x = randRange(0, INTERNAL_WIDTH - STRAWBERRY_WIDTH);
  strawberries.push({
    x,
    y: -STRAWBERRY_HEIGHT,
    width: STRAWBERRY_WIDTH,
    height: STRAWBERRY_HEIGHT,
    speed: currentFallSpeed(),
  });
}

function updateStrawberries(dt) {
  if (!difficulty) {
    return;
  }

  const intervalSec = currentSpawnIntervalSec();
  spawnTimerSec += dt;
  while (spawnTimerSec >= intervalSec) {
    spawnTimerSec -= intervalSec;
    spawnStrawberry();
  }

  const fallSpeed = currentFallSpeed();
  for (const strawberry of strawberries) {
    strawberry.speed = fallSpeed;
    strawberry.y += strawberry.speed * dt;
  }

  for (let i = strawberries.length - 1; i >= 0; i -= 1) {
    if (
      rectsOverlap(strawberries[i], {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
      })
    ) {
      strawberries.splice(i, 1);
      score += 1;

      if (score > highScore) {
        highScore = score;
        localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore));
      }
    }
  }

  for (let i = strawberries.length - 1; i >= 0; i -= 1) {
    if (strawberries[i].y > INTERNAL_HEIGHT) {
      strawberries.splice(i, 1);
      lives = Math.max(0, lives - 1);
      if (lives === 0) {
        isRunning = false;
        showGameOverOverlay();
        break;
      }
    }
  }
}

function triggerJump() {
  if (player.isJumping) {
    return;
  }
  player.jumpVisualTimer = JUMP_SPRITE_DURATION_SEC;
  player.isJumping = true;
  player.jumpVelocity = JUMP_IMPULSE;
}

function getPlayerSprite() {
  if (player.state === "jump") {
    return player.facing === "left" ? assets.leftJumpCat : assets.rightJumpCat;
  }

  if (player.state === "run") {
    return player.facing === "left" ? assets.runCatLeft : assets.runCatRight;
  }

  if (player.facing === "left") {
    return player.idleFrameIndex === 0 ? assets.leftCat : assets.leftCat1;
  }

  return player.idleFrameIndex === 0 ? assets.rightCat : assets.rightCat1;
}

function renderPlayer() {
  const sprite = getPlayerSprite();
  if (sprite) {
    ctx.drawImage(sprite, player.x, player.y, player.width, player.height);
    return;
  }

  ctx.fillStyle = "#f1487a";
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function renderStrawberries() {
  for (const strawberry of strawberries) {
    if (assets.strawberry) {
      ctx.drawImage(
        assets.strawberry,
        strawberry.x,
        strawberry.y,
        strawberry.width,
        strawberry.height
      );
      continue;
    }

    ctx.fillStyle = "#e33a76";
    ctx.beginPath();
    ctx.arc(
      strawberry.x + strawberry.width * 0.5,
      strawberry.y + strawberry.height * 0.5,
      strawberry.width * 0.45,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

updateHud();
void loadAssets().finally(() => {
  requestAnimationFrame(gameLoop);
  gameCanvas.focus();
});

