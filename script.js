"use strict";

// Game settings
const STARTING_LIVES = 3;
const POINTS_PER_STAR = 10;
const BONUS_POINTS = 30;
const INITIAL_STAR_SPEED = 150;
const INITIAL_SPAWN_INTERVAL = 950;
const STORAGE_KEY = "colorCatchSavedData";

// HTML elements
const elements = {
    score: document.getElementById("score"),
    highScore: document.getElementById("highScore"),
    lives: document.getElementById("lives"),
    level: document.getElementById("level"),
    gameStatus: document.getElementById("gameStatus"),

    gameWorld: document.getElementById("gameWorld"),
    basket: document.getElementById("basket"),

    startScreen: document.getElementById("startScreen"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    gameOverOverlay: document.getElementById("gameOverOverlay"),

    startButton: document.getElementById("startButton"),
    pauseButton: document.getElementById("pauseButton"),
    resumeButton: document.getElementById("resumeButton"),
    restartButton: document.getElementById("restartButton"),
    playAgainButton: document.getElementById("playAgainButton"),

    leftButton: document.getElementById("leftButton"),
    rightButton: document.getElementById("rightButton"),
    soundButton: document.getElementById("soundButton"),

    finalScore: document.getElementById("finalScore"),
    finalHighScore: document.getElementById("finalHighScore"),
    gameOverTitle: document.getElementById("gameOverTitle"),
    gameOverEmoji: document.getElementById("gameOverEmoji"),
    gameOverMessage: document.getElementById("gameOverMessage"),
    newRecord: document.getElementById("newRecord"),

    sideHighScore: document.getElementById("sideHighScore"),
    totalCaught: document.getElementById("totalCaught"),
    totalMissed: document.getElementById("totalMissed"),
    gamesPlayed: document.getElementById("gamesPlayed"),

    catchEffect: document.getElementById("catchEffect"),
    toast: document.getElementById("toast"),
    resetRecordButton: document.getElementById("resetRecordButton")
};

// Saved records
function loadSavedData() {
    const defaults = {
        highScore: 0,
        totalCaught: 0,
        totalMissed: 0,
        gamesPlayed: 0
    };

    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (!saved || typeof saved !== "object") {
            return defaults;
        }

        return {
            highScore: validNumber(saved.highScore),
            totalCaught: validNumber(saved.totalCaught),
            totalMissed: validNumber(saved.totalMissed),
            gamesPlayed: validNumber(saved.gamesPlayed)
        };
    } catch (error) {
        return defaults;
    }
}

function validNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }

    return Math.floor(number);
}

let savedData = loadSavedData();

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
    } catch (error) {
        showToast("Your browser couldn't save the records.");
    }
}

// Current game state
let score = 0;
let lives = STARTING_LIVES;
let level = 1;

let basketX = 0;
let basketSpeed = 370;

let stars = [];
let gameState = "ready";

let animationFrame = null;
let lastFrameTime = 0;
let spawnTimer = 0;
let nextSpawnTime = INITIAL_SPAWN_INTERVAL;

let totalGameTime = 0;
let gameStartedAtLeastOnce = false;
let newRecordThisGame = false;

let soundEnabled = true;
let audioContext = null;

const keys = {
    left: false,
    right: false
};

let toastTimer = null;
let effectTimer = null;

// UI updates
function updateScoreboard() {
    elements.score.textContent = score;
    elements.highScore.textContent = savedData.highScore;

    elements.lives.textContent =
        "❤️".repeat(lives) + "🖤".repeat(STARTING_LIVES - lives);

    elements.level.textContent = level;
    elements.sideHighScore.textContent = savedData.highScore;

    elements.totalCaught.textContent = savedData.totalCaught;
    elements.totalMissed.textContent = savedData.totalMissed;
    elements.gamesPlayed.textContent = savedData.gamesPlayed;
}

function updateStatus(message) {
    elements.gameStatus.textContent = message;
}

function showToast(message) {
    clearTimeout(toastTimer);

    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    toastTimer = setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 2300);
}

// Audio effects use the browser's Web Audio API.
function playSound(frequency = 700, duration = 0.09, type = "sine") {
    if (!soundEnabled) {
        return;
    }

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        if (!audioContext) {
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(
            frequency,
            audioContext.currentTime
        );

        gain.gain.setValueAtTime(0.07, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        // Gameplay continues if audio is unavailable.
    }
}

// Basket positioning
function getBasketBounds() {
    const worldWidth = elements.gameWorld.clientWidth;
    const basketWidth = elements.basket.offsetWidth;

    return {
        min: 0,
        max: Math.max(0, worldWidth - basketWidth)
    };
}

function positionBasket() {
    const bounds = getBasketBounds();

    basketX = Math.max(bounds.min, Math.min(bounds.max, basketX));

    elements.basket.style.left = `${basketX}px`;
    elements.basket.style.transform = "none";
}

function centerBasket() {
    const worldWidth = elements.gameWorld.clientWidth;
    const basketWidth = elements.basket.offsetWidth;

    basketX = (worldWidth - basketWidth) / 2;

    positionBasket();
}

// Star creation and removal
function createStar() {
    if (gameState !== "playing") {
        return;
    }

    const star = document.createElement("div");
    const isBonus = Math.random() < 0.12;

    star.className = isBonus ? "falling-star bonus" : "falling-star";
    star.textContent = isBonus ? "💎" : randomStarEmoji();

    const size = isBonus ? 44 : 40;
    const maxX = Math.max(0, elements.gameWorld.clientWidth - size);
    const x = Math.random() * maxX;

    star.style.left = `${x}px`;
    star.style.top = "-50px";

    elements.gameWorld.appendChild(star);

    stars.push({
        element: star,
        x,
        y: -50,
        size,
        speed: INITIAL_STAR_SPEED + (level - 1) * 18 +
            Math.random() * 55,
        bonus: isBonus
    });
}

function randomStarEmoji() {
    const choices = ["⭐", "🌟", "✨"];

    return choices[Math.floor(Math.random() * choices.length)];
}

function removeStar(index) {
    if (stars[index]) {
        stars[index].element.remove();
        stars.splice(index, 1);
    }
}

function clearStars() {
    stars.forEach(star => star.element.remove());
    stars = [];
}

// Catch effect
function showCatchEffect(points, x, y) {
    elements.catchEffect.classList.remove("hidden");

    elements.catchEffect.textContent = `+${points} ⭐`;
    elements.catchEffect.style.left = `${x}px`;
    elements.catchEffect.style.top = `${y}px`;

    // Restart the CSS animation.
    elements.catchEffect.style.animation = "none";
    void elements.catchEffect.offsetWidth;
    elements.catchEffect.style.animation = "";

    clearTimeout(effectTimer);

    effectTimer = setTimeout(() => {
        elements.catchEffect.classList.add("hidden");
    }, 850);
}

// Collision detection
function checkCollision(star) {
    const basket = elements.basket;

    const basketLeft = basketX + 8;
    const basketRight = basketX + basket.offsetWidth - 8;

    const basketTop =
        elements.gameWorld.clientHeight - basket.offsetHeight - 13;

    const basketBottom = basketTop + basket.offsetHeight;

    const starLeft = star.x + 5;
    const starRight = star.x + star.size - 5;

    const starTop = star.y + 5;
    const starBottom = star.y + star.size - 5;

    return (
        starRight > basketLeft &&
        starLeft < basketRight &&
        starBottom > basketTop &&
        starTop < basketBottom
    );
}

// Scoring
function catchStar(star, index) {
    const points = star.bonus ? BONUS_POINTS : POINTS_PER_STAR;

    score += points;
    savedData.totalCaught += 1;

    const previousHighScore = savedData.highScore;

    if (score > previousHighScore) {
        savedData.highScore = score;

        if (previousHighScore > 0 || score > 0) {
            newRecordThisGame = true;
        }
    }

    const effectX = star.x;
    const effectY = star.y;

    removeStar(index);

    showCatchEffect(points, effectX, effectY);

    playSound(star.bonus ? 1100 : 760, 0.1);

    if (star.bonus) {
        showToast("Amazing! Bonus gem caught! +30 💎");
    }

    const newLevel = Math.floor(score / 100) + 1;

    if (newLevel > level) {
        level = newLevel;
        showToast(`Level ${level}! You're a superstar! 🌟`);
        playSound(950, 0.16);
    }

    updateScoreboard();
    saveData();
}

// Missing a star
function missStar(index) {
    removeStar(index);

    lives -= 1;
    savedData.totalMissed += 1;

    updateScoreboard();
    saveData();

    playSound(180, 0.2, "triangle");

    if (lives > 0) {
        showToast(`Oops! One life lost. ${lives} left! 💗`);
    } else {
        endGame();
    }
}

// Input controls
function moveBasket(direction, deltaTime) {
    const bounds = getBasketBounds();

    basketX += direction * basketSpeed * deltaTime;

    basketX = Math.max(bounds.min, Math.min(bounds.max, basketX));

    positionBasket();
}

function updateBasket(deltaTime) {
    let direction = 0;

    if (keys.left) {
        direction -= 1;
    }

    if (keys.right) {
        direction += 1;
    }

    if (direction !== 0) {
        moveBasket(direction, deltaTime);
    }
}

function setKeyState(key, isPressed) {
    if (key === "ArrowLeft" || key.toLowerCase() === "a") {
        keys.left = isPressed;
    }

    if (key === "ArrowRight" || key.toLowerCase() === "d") {
        keys.right = isPressed;
    }
}

document.addEventListener("keydown", event => {
    if (
        ["ArrowLeft", "ArrowRight", " "].includes(event.key)
    ) {
        event.preventDefault();
    }

    if (event.key === "Escape" && gameState === "playing") {
        pauseGame();
        return;
    }

    if (event.key === "Escape" && gameState === "paused") {
        resumeGame();
        return;
    }

    if (gameState === "playing") {
        setKeyState(event.key, true);
    }
});

document.addEventListener("keyup", event => {
    setKeyState(event.key, false);
});

window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;

    if (gameState === "playing") {
        pauseGame();
    }
});

function stopMovement() {
    keys.left = false;
    keys.right = false;
}

function bindHoldButton(button, direction) {
    const startMoving = event => {
        event.preventDefault();

        if (gameState !== "playing") {
            return;
        }

        if (direction === "left") {
            keys.left = true;
        } else {
            keys.right = true;
        }
    };

    const stopMoving = event => {
        if (event) {
            event.preventDefault();
        }

        if (direction === "left") {
            keys.left = false;
        } else {
            keys.right = false;
        }
    };

    button.addEventListener("pointerdown", startMoving);
    button.addEventListener("pointerup", stopMoving);
    button.addEventListener("pointerleave", stopMoving);
    button.addEventListener("pointercancel", stopMoving);
    button.addEventListener("lostpointercapture", stopMoving);

    button.addEventListener("contextmenu", event => {
        event.preventDefault();
    });
}

bindHoldButton(elements.leftButton, "left");
bindHoldButton(elements.rightButton, "right");

// Main game loop
function gameLoop(timestamp) {
    if (gameState !== "playing") {
        return;
    }

    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const deltaTime = Math.min(
        (timestamp - lastFrameTime) / 1000,
        0.035
    );

    lastFrameTime = timestamp;

    totalGameTime += deltaTime * 1000;
    spawnTimer += deltaTime * 1000;

    updateBasket(deltaTime);

    if (spawnTimer >= nextSpawnTime) {
        createStar();
        spawnTimer = 0;

        nextSpawnTime = Math.max(
            320,
            INITIAL_SPAWN_INTERVAL - (level - 1) * 55
        );
    }

    for (let i = stars.length - 1; i >= 0; i--) {
        if (gameState !== "playing") {
            break;
        }

        const star = stars[i];

        star.y += star.speed * deltaTime;
        star.element.style.top = `${star.y}px`;

        if (checkCollision(star)) {
            catchStar(star, i);
            continue;
        }

        if (star.y > elements.gameWorld.clientHeight) {
            missStar(i);
        }
    }

    if (gameState === "playing") {
        animationFrame = requestAnimationFrame(gameLoop);
    }
}

// Starting and restarting
function prepareNewGame() {
    cancelAnimationFrame(animationFrame);

    score = 0;
    lives = STARTING_LIVES;
    level = 1;

    spawnTimer = 0;
    nextSpawnTime = INITIAL_SPAWN_INTERVAL;
    totalGameTime = 0;

    lastFrameTime = 0;
    newRecordThisGame = false;

    stopMovement();
    clearStars();
    centerBasket();

    elements.startScreen.classList.add("hidden");
    elements.pauseOverlay.classList.add("hidden");
    elements.gameOverOverlay.classList.add("hidden");
    elements.newRecord.classList.add("hidden");

    elements.pauseButton.disabled = false;

    gameState = "playing";

    updateStatus("Catch those stars! ⭐");
    updateScoreboard();

    savedData.gamesPlayed += 1;
    saveData();

    gameStartedAtLeastOnce = true;

    playSound(600, 0.12);

    animationFrame = requestAnimationFrame(gameLoop);
}

function startGame() {
    prepareNewGame();
}

function restartGame() {
    prepareNewGame();
    showToast("Fresh start! Catch those stars! 🌟");
}

function pauseGame() {
    if (gameState !== "playing") {
        return;
    }

    gameState = "paused";

    cancelAnimationFrame(animationFrame);
    stopMovement();

    elements.pauseOverlay.classList.remove("hidden");
    elements.pauseButton.textContent = "▶ Resume";

    updateStatus("Paused ⏸️");
}

function resumeGame() {
    if (gameState !== "paused") {
        return;
    }

    gameState = "playing";

    elements.pauseOverlay.classList.add("hidden");
    elements.pauseButton.textContent = "⏸ Pause";

    lastFrameTime = 0;

    updateStatus("Catch those stars! ⭐");

    animationFrame = requestAnimationFrame(gameLoop);
}

// End of game
function endGame() {
    gameState = "over";

    cancelAnimationFrame(animationFrame);
    stopMovement();

    clearStars();

    elements.pauseButton.disabled = true;

    elements.finalScore.textContent = score;
    elements.finalHighScore.textContent = savedData.highScore;

    elements.newRecord.classList.toggle(
        "hidden",
        !newRecordThisGame
    );

    if (newRecordThisGame) {
        elements.gameOverTitle.textContent = "Amazing! New Record!";
        elements.gameOverEmoji.textContent = "👑";
        elements.gameOverMessage.textContent =
            "You beat your personal best! Keep shining! ✨";

        playSound(950, 0.25);
    } else {
        elements.gameOverTitle.textContent = "Game Over!";
        elements.gameOverEmoji.textContent = "🌟";
        elements.gameOverMessage.textContent =
            score === 0
                ? "Ready for another try? You can do it!"
                : "Great effort! Can you beat your best score?";

        playSound(240, 0.25, "triangle");
    }

    elements.gameOverOverlay.classList.remove("hidden");

    updateStatus("Game finished!");

    updateScoreboard();
    saveData();
}

// Sound toggle
function toggleSound() {
    soundEnabled = !soundEnabled;

    elements.soundButton.textContent = soundEnabled ? "🔊" : "🔇";

    elements.soundButton.setAttribute(
        "aria-label",
        soundEnabled ? "Turn sound off" : "Turn sound on"
    );

    if (soundEnabled) {
        playSound(700, 0.1);
        showToast("Sound is on! 🔊");
    } else {
        showToast("Sound is off! 🔇");
    }
}

// Reset saved records
function resetRecords() {
    const confirmed = window.confirm(
        "Reset your high score, statistics, and saved records? This cannot be undone."
    );

    if (!confirmed) {
        return;
    }

    savedData = {
        highScore: 0,
        totalCaught: 0,
        totalMissed: 0,
        gamesPlayed: 0
    };

    score = 0;

    saveData();
    updateScoreboard();

    elements.finalHighScore.textContent = "0";
    elements.newRecord.classList.add("hidden");

    showToast("All saved records have been reset! 🧹");
}

// Buttons
elements.startButton.addEventListener("click", startGame);

elements.pauseButton.addEventListener("click", () => {
    if (gameState === "playing") {
        pauseGame();
    } else if (gameState === "paused") {
        resumeGame();
    }
});

elements.resumeButton.addEventListener("click", resumeGame);
elements.restartButton.addEventListener("click", restartGame);
elements.playAgainButton.addEventListener("click", startGame);

elements.soundButton.addEventListener("click", toggleSound);

elements.resetRecordButton.addEventListener("click", resetRecords);

// Keep the basket within the game area after resizing.
window.addEventListener("resize", () => {
    positionBasket();

    stars.forEach(star => {
        const maxX = Math.max(
            0,
            elements.gameWorld.clientWidth - star.size
        );

        star.x = Math.min(star.x, maxX);
        star.element.style.left = `${star.x}px`;
    });
});

// Initial display
function initializeGame() {
    updateScoreboard();
    centerBasket();

    elements.soundButton.textContent = "🔊";

    updateStatus("Ready to play!");

    elements.pauseButton.disabled = true;
}

initializeGame();