/* =========================
   👑 TLAPKING 2.6 FULL
   Kompletní verze
   ========================= */

let score = 0;
let lives = 3;

let gameInterval;
let spawnRate = 900;

let baseSpeed = 3;
let speed = baseSpeed;

/* BUFF SYSTEM */
let buffs = {
    slow: null,
    power: null
};

const gameArea = document.getElementById("gameArea");
const scoreDisplay = document.getElementById("score");
const livesDisplay = document.getElementById("lives");
const buffStatus = document.getElementById("buffStatus");

/* =========================
   START GAME
   ========================= */

function startGame() {

    score = 0;
    lives = 3;
    spawnRate = 900;

    baseSpeed = 3;
    speed = baseSpeed;

    buffs = { slow: null, power: null };

    scoreDisplay.textContent = score;
    livesDisplay.textContent = lives;

    gameArea.innerHTML = "";
    gameArea.classList.remove("rage");

    buffStatus.classList.add("hidden");
    buffStatus.textContent = "";

    document.getElementById("gameOver").classList.add("hidden");

    clearInterval(gameInterval);
    gameInterval = setInterval(spawnObject, spawnRate);
}

/* =========================
   SPAWN
   ========================= */

function spawnObject() {

    const obj = document.createElement("div");
    obj.classList.add("object");

    const rand = Math.random();

    if (rand < 0.48) {
        obj.textContent = "🐭";
        obj.dataset.type = "mouse";
    }
    else if (rand < 0.63) {
        obj.textContent = "🐟";
        obj.dataset.type = "fish";
    }
    else if (rand < 0.73) {
        obj.textContent = "🧀";
        obj.dataset.type = "slow";
    }
    else if (rand < 0.83) {
        obj.textContent = "👑";
        obj.dataset.type = "power";
    }
    else if (rand < 0.86) {
        obj.textContent = "🥛";
        obj.dataset.type = "milk";
    }
    else if (rand < 0.88) {
        obj.textContent = "🐍";
        obj.dataset.type = "snake";
    }
    else if (rand < 0.90) {
        obj.textContent = "🐾";
        obj.dataset.type = "life";
    }
    else if (rand < 0.99) {
        obj.textContent = "💣";
        obj.dataset.type = "bomb";
    }
    else {
        obj.textContent = "☠️";
        obj.dataset.type = "killer";
    }

    const maxX = Math.max(10, gameArea.clientWidth - 48);
    obj.style.left = Math.floor(Math.random() * maxX) + "px";
    obj.style.top = "0px";

    gameArea.appendChild(obj);

    let fall = setInterval(() => {
        let currentTop = parseInt(obj.style.top) || 0;
        obj.style.top = (currentTop + speed) + "px";

        if (currentTop > gameArea.offsetHeight) {
            obj.remove();
            clearInterval(fall);
        }
    }, 20);

    obj.addEventListener("touchstart", (e) => {
        e.preventDefault();
        hitObject(obj, fall);
    }, { passive: false });

    obj.addEventListener("click", () => hitObject(obj, fall));
}

/* =========================
   HIT
   ========================= */

function hitObject(obj, fall) {

    clearInterval(fall);

    let text = "";
    let color = "#d3a34a";

    const multiplier = getMultiplier();

    switch (obj.dataset.type) {

        case "mouse": {
            const points = 1 * multiplier;
            score += points;
            text = "+" + points;
            break;
        }

        case "fish": {
            const points = 3 * multiplier;
            score += points;
            text = "+" + points;
            break;
        }

        case "milk": {
            const points = 10 * multiplier;
            score += points;
            text = "+" + points;
            break;
        }

        case "life": {
            const lifeGain = 1 * multiplier;
            lives += lifeGain;
            livesDisplay.textContent = lives;
            text = "+" + lifeGain + " ❤️";
            color = "lightgreen";
            break;
        }

        case "snake":
            lives -= 1;
            livesDisplay.textContent = lives;
            text = "-1 ❤️";
            color = "red";
            break;

        case "bomb":
            lives -= 1;
            livesDisplay.textContent = lives;
            text = "-1 ❤️";
            color = "red";
            break;

        case "killer":
            lives -= 5;
            livesDisplay.textContent = lives;
            text = "-5 ❤️";
            color = "darkred";
            break;

        case "slow":
            activateSlow();
            text = "SLOW";
            break;

        case "power":
            activatePower();
            text = "POWER UP";
            break;
    }

    scoreDisplay.textContent = score;

    showFloatingText(obj, text, color);

    obj.remove();

    if (lives <= 0) endGame();
}

/* ========================= */

function getMultiplier() {
    return buffs.power ? 2 : 1;
}

/* ========================= */

function activateSlow() {

    const duration = 2000;

    if (!buffs.slow) speed *= 0.5;
    else clearTimeout(buffs.slow.timeout);

    buffs.slow = {
        endTime: Date.now() + duration,
        timeout: setTimeout(() => {
            speed = baseSpeed;
            buffs.slow = null;
            updateBuffUI();
        }, duration)
    };

    updateBuffUI();
}

function activatePower() {

    const duration = 5000;

    if (buffs.power) clearTimeout(buffs.power.timeout);

    gameArea.classList.add("rage");

    buffs.power = {
        endTime: Date.now() + duration,
        timeout: setTimeout(() => {
            buffs.power = null;
            gameArea.classList.remove("rage");
            updateBuffUI();
        }, duration)
    };

    updateBuffUI();
}

/* ========================= */

function updateBuffUI() {

    let text = [];

    if (buffs.slow) {
        const t = (buffs.slow.endTime - Date.now()) / 1000;
        if (t > 0) text.push(`Slow motion (${t.toFixed(1)}s)`);
    }

    if (buffs.power) {
        const t = (buffs.power.endTime - Date.now()) / 1000;
        if (t > 0) text.push(`Power UP x2 (${t.toFixed(1)}s)`);
    }

    if (text.length === 0) {
        buffStatus.classList.add("hidden");
        return;
    }

    buffStatus.classList.remove("hidden");
    buffStatus.textContent = text.join(" | ");

    requestAnimationFrame(updateBuffUI);
}

/* ========================= */

function showFloatingText(obj, text, color) {

    const float = document.createElement("div");
    float.className = "floating-text";
    float.textContent = text;
    float.style.color = color;

    float.style.left = obj.style.left;
    float.style.top = obj.style.top;

    gameArea.appendChild(float);

    setTimeout(() => float.remove(), 800);
}

/* ========================= */

function endGame() {
    clearInterval(gameInterval);
    document.getElementById("finalScore").textContent = score;
    document.getElementById("gameOver").classList.remove("hidden");
}

/* =========================
   LEADERBOARD
   ========================= */

function saveScore() {

    const name = document.getElementById("playerName").value.trim();
    if (!name) return;

    let scores = JSON.parse(localStorage.getItem("tlapking")) || [];

    scores.push({ name, score });

    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10);

    localStorage.setItem("tlapking", JSON.stringify(scores));

    displayScores();
}

function displayScores() {

    const scores = JSON.parse(localStorage.getItem("tlapking")) || [];
    const list = document.getElementById("scoresList");

    list.innerHTML = "";

    scores.forEach((entry, index) => {

        const li = document.createElement("li");

        let medal = "";
        if (index === 0) medal = " 🥇";
        else if (index === 1) medal = " 🥈";
        else if (index === 2) medal = " 🥉";

        li.textContent = `${entry.name} - ${entry.score}${medal}`;
        list.appendChild(li);
    });
}

displayScores();