const headerContainer = document.getElementById("header-container");
const headerRegion = document.getElementById("header-region");
const buttonsContainer = document.getElementById("buttons-container");
const yesButton = document.getElementById("yes-button");
const noButton = document.getElementById("no-button");
const progressBar = document.getElementById("progressBar");
const proveBtn = document.getElementById("proveBtn");
const imageZone = document.getElementById("imageZone");
const safeImages = Array.from(document.querySelectorAll(".safe-image"));
const progressSegments = Array.from(document.querySelectorAll(".progress-segment"));
const headerTextEl = headerContainer.querySelector("h1");
let activeAnimationFrame = null;
let isAnimating = false;
let hasConfirmed = false;
let hasNoHoverHeaderChanged = false;
let yesClickCount = 0;
let isFull = false;
const CLICKS_PER_SEG = 3;
const SEGMENTS = 6;
const TOTAL_CLICKS = CLICKS_PER_SEG * SEGMENTS;
const typewriterStateMap = new WeakMap();

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function updateProgressUI() {
  const filledCount = Math.min(SEGMENTS, Math.ceil(yesClickCount / CLICKS_PER_SEG));

  progressSegments.forEach((segment, index) => {
    segment.classList.toggle("filled", index < filledCount);
  });

  progressBar.setAttribute("aria-valuenow", String(yesClickCount));
  progressBar.classList.toggle("complete", yesClickCount >= TOTAL_CLICKS);
  isFull = yesClickCount >= TOTAL_CLICKS;
  progressBar.hidden = false;
  progressBar.classList.toggle("is-hidden", isFull);
  proveBtn.hidden = !isFull;

  if (isFull) {
    yesButton.disabled = true;
  }
}

function ensureTypewriterStyles() {
  if (document.getElementById("typewriter-fade-styles")) {
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = "typewriter-fade-styles";
  styleEl.textContent = `
    .twf-wrapper {
      opacity: 1;
      transition: opacity 180ms ease;
    }
    .twf-token {
      opacity: 0;
      display: inline-block;
      white-space: pre;
    }
    .twf-token.twf-visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(styleEl);
}

function splitTokens(text, splitMode) {
  if (splitMode === "word") {
    return text.split(/(\s+)/).filter((token) => token.length > 0);
  }
  return Array.from(text);
}

function clearTypewriterState(state) {
  state.cancelled = true;
  for (const timeoutId of state.timeouts) {
    clearTimeout(timeoutId);
  }
  state.timeouts.clear();
}

function waitWithState(state, ms) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      state.timeouts.delete(timeoutId);
      resolve();
    }, ms);
    state.timeouts.add(timeoutId);
  });
}

function typewriterFade(element, text, options = {}) {
  if (!element) {
    return Promise.resolve(false);
  }

  ensureTypewriterStyles();

  const previousState = typewriterStateMap.get(element);
  if (previousState) {
    clearTypewriterState(previousState);
  }

  const state = { cancelled: false, timeouts: new Set() };
  typewriterStateMap.set(element, state);

  const tokenDelayMs = options.tokenDelayMs ?? 40;
  const tokenTransitionMs = options.tokenTransitionMs ?? 180;
  const splitMode = options.splitMode === "word" ? "word" : "char";
  const fadeOutMs = 180;

  return (async () => {
    let oldWrapper = element.querySelector(".twf-wrapper");
    if (!oldWrapper) {
      oldWrapper = document.createElement("span");
      oldWrapper.className = "twf-wrapper";
      oldWrapper.textContent = element.textContent || "";
      element.textContent = "";
      element.appendChild(oldWrapper);
    }

    oldWrapper.style.opacity = "0";
    await waitWithState(state, fadeOutMs);
    if (state.cancelled) {
      return false;
    }

    const tokens = splitTokens(text, splitMode);
    const newWrapper = document.createElement("span");
    newWrapper.className = "twf-wrapper";
    newWrapper.style.opacity = "1";

    const fragment = document.createDocumentFragment();
    const tokenEls = [];

    for (const token of tokens) {
      const span = document.createElement("span");
      span.className = "twf-token";
      span.style.transition = `opacity ${tokenTransitionMs}ms ease`;
      span.textContent = token;
      tokenEls.push(span);
      fragment.appendChild(span);
    }

    newWrapper.appendChild(fragment);
    element.textContent = "";
    element.appendChild(newWrapper);

    for (const tokenEl of tokenEls) {
      if (state.cancelled) {
        return false;
      }
      tokenEl.classList.add("twf-visible");
      await waitWithState(state, tokenDelayMs);
    }

    if (!state.cancelled) {
      typewriterStateMap.delete(element);
      return true;
    }

    return false;
  })();
}

function rectanglesOverlap(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

function animateMove(frames, targetX, targetY) {
  isAnimating = true;

  const parsedLeft = Number.parseFloat(noButton.style.left);
  const parsedTop = Number.parseFloat(noButton.style.top);
  let startX = parsedLeft;
  let startY = parsedTop;

  if (Number.isNaN(startX) || Number.isNaN(startY)) {
    const buttonRect = noButton.getBoundingClientRect();
    const containerRect = buttonsContainer.getBoundingClientRect();
    startX = buttonRect.left - containerRect.left;
    startY = buttonRect.top - containerRect.top;
  }

  if (frames <= 0) {
    noButton.style.left = `${Math.round(targetX)}px`;
    noButton.style.top = `${Math.round(targetY)}px`;
    isAnimating = false;
    return;
  }

  const dx = (targetX - startX) / frames;
  const dy = (targetY - startY) / frames;
  let currentFrame = 0;

  const step = () => {
    currentFrame += 1;

    if (currentFrame >= frames) {
      noButton.style.left = `${Math.round(targetX)}px`;
      noButton.style.top = `${Math.round(targetY)}px`;
      activeAnimationFrame = null;
      isAnimating = false;
      return;
    }

    const nextX = startX + dx * currentFrame;
    const nextY = startY + dy * currentFrame;
    noButton.style.left = `${Math.round(nextX)}px`;
    noButton.style.top = `${Math.round(nextY)}px`;
    activeAnimationFrame = requestAnimationFrame(step);
  };

  activeAnimationFrame = requestAnimationFrame(step);
}

function findSafeSpot() {
  noButton.classList.add("debug-hover");

  const viewportRect = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const headerRect = (headerRegion || headerContainer).getBoundingClientRect();
  const buttonRect = noButton.getBoundingClientRect();
  const yesAreaRect = buttonsContainer.getBoundingClientRect();
  const progressBarRect = progressBar.getBoundingClientRect();
  const imageZoneRect = imageZone.getBoundingClientRect();
  const safeImageRects = safeImages.map((img) => img.getBoundingClientRect());
  const containerRect = buttonsContainer.getBoundingClientRect();
  const movementMargin = {
    top: 10,
    left: 10,
    right: 10,
    bottom: 18,
  };
  const maxAttempts = 120;

  const minX = viewportRect.left + movementMargin.left;
  const maxX = viewportRect.left + viewportRect.width - buttonRect.width - movementMargin.right;
  const minY = viewportRect.top + movementMargin.top;
  const maxY = viewportRect.top + viewportRect.height - buttonRect.height - movementMargin.bottom;

  if (maxX >= minX && maxY >= minY) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidateX = minX + Math.random() * (maxX - minX);
      const candidateY = minY + Math.random() * (maxY - minY);

      const candidateRect = {
        left: candidateX,
        top: candidateY,
        right: candidateX + buttonRect.width,
        bottom: candidateY + buttonRect.height,
      };

      const overlapsHeader = rectanglesOverlap(candidateRect, headerRect);
      const overlapsYesArea = rectanglesOverlap(candidateRect, yesAreaRect);
      const overlapsProgressBar = rectanglesOverlap(candidateRect, progressBarRect);
      const overlapsImageZone = rectanglesOverlap(candidateRect, imageZoneRect);
      const overlapsImage = safeImageRects.some((rect) => rectanglesOverlap(candidateRect, rect));
      const overlapsCurrentNoSpot = rectanglesOverlap(candidateRect, buttonRect);
      const invalidYesAreaCollision = overlapsYesArea && !overlapsCurrentNoSpot;

      if (!overlapsHeader && !invalidYesAreaCollision && !overlapsProgressBar && !overlapsImageZone && !overlapsImage) {
        return {
          x: candidateX - containerRect.left,
          y: candidateY - containerRect.top,
        };
      }
    }
  }

  return null;
}

function moveNoButton(event) {
  if (isAnimating) {
    return;
  }

  if (event && event.type === "pointerdown") {
    event.preventDefault();
  }

  const safeSpot = findSafeSpot();
  if (safeSpot) {
    console.log("No button moved");
    animateMove(18, safeSpot.x, safeSpot.y);
  }

  setTimeout(() => {
    noButton.classList.remove("debug-hover");
  }, 200);
}

noButton.setAttribute("tabindex", "-1");

noButton.addEventListener("mouseenter", moveNoButton);

if (window.PointerEvent) {
  noButton.addEventListener("pointerdown", moveNoButton);
} else {
  noButton.addEventListener(
    "touchstart",
    (event) => {
      if (isAnimating) {
        return;
      }
      event.preventDefault();
      moveNoButton();
    },
    { passive: false }
  );
}

yesButton.addEventListener("click", async () => {
  yesClickCount = Math.min(TOTAL_CLICKS, yesClickCount + 1);
  updateProgressUI();

  if (hasConfirmed) {
    return;
  }

  hasConfirmed = true;
  buttonsContainer.setAttribute("aria-label", "Valentine response confirmed");

  const messages = [
    "CLICK THE BUTTON",
    "CLICK IT!!!",
    "FASTER!!!",
  ];

  for (const message of messages) {
    await typewriterFade(headerTextEl, message, {
      tokenDelayMs: 50,
      tokenTransitionMs: 180,
      splitMode: "char",
    });
    await wait(700);
  }
});

yesButton.addEventListener("pointerenter", () => {
  typewriterFade(headerTextEl, "YES YES THAT BUTTON!", {
    tokenDelayMs: 40,
    tokenTransitionMs: 180,
    splitMode: "char",
  });
});

noButton.addEventListener("pointerenter", () => {
  if (hasNoHoverHeaderChanged) {
    return;
  }
  hasNoHoverHeaderChanged = true;
  typewriterFade(headerTextEl, "  NOOOO NOT THAT ONE!   PLEASE", {
    tokenDelayMs: 40,
    tokenTransitionMs: 180,
    splitMode: "char",
  });
});

proveBtn.addEventListener("click", () => {
  window.location.href = "game.html";
});

typewriterFade(headerTextEl, "     Michi, will you be my        \nValentine?", {
  tokenDelayMs: 45,
  tokenTransitionMs: 200,
});

updateProgressUI();

setInterval(() => {
  if (isFull || yesClickCount <= 0) {
    return;
  }

  yesClickCount = Math.max(0, yesClickCount - CLICKS_PER_SEG);
  updateProgressUI();
}, 2000);
