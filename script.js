//------------------------------------------------------------
// Jediný script.js pro: LOGIN + MENU + SUDOKU
//------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initLoginPage();
  initMenuPage();
  initSudokuPage();
});

//------------------------------------------------------------
// Společné helpery
//------------------------------------------------------------
function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "true";
}

function requireLoginOrRedirect() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

//------------------------------------------------------------
// LOGIN (login.html)
//------------------------------------------------------------
function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return; // nejsme na login stránce

  const msg = document.getElementById("msg");

  // když už je přihlášený, pošli ho rovnou do menu
  if (isLoggedIn()) {
    window.location.href = "menu.html";
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "";

    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value;

    if (!email || !password) {
      if (msg) msg.textContent = "Vyplň email i heslo.";
      return;
    }

    // Demo přihlášení (bez databáze)
    localStorage.setItem("loggedIn", "true");
    localStorage.setItem("userEmail", email);

    window.location.href = "menu.html";
  });
}

//------------------------------------------------------------
// MENU (menu.html)
//------------------------------------------------------------
function initMenuPage() {
  const logoutBtn = document.getElementById("logout");
  const helloEl = document.getElementById("hello");

  // nejsme na menu stránce
  if (!logoutBtn && !helloEl) return;

  if (!requireLoginOrRedirect()) return;

  const email = localStorage.getItem("userEmail");
  if (helloEl) helloEl.textContent = email ? `Přihlášen jako: ${email}` : "";

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedIn");
      localStorage.removeItem("userEmail");
      window.location.href = "login.html";
    });
  }
}

//------------------------------------------------------------
// SUDOKU (sudoku.html)
// - ochrana: bez loginu nepustí
// - sudoku kód se spustí jen když existuje #board
//------------------------------------------------------------
function initSudokuPage() {
  const boardEl = document.getElementById("board");
  if (!boardEl) return; // nejsme na sudoku stránce

  if (!requireLoginOrRedirect()) return;

  //------------------------------------------------------------
  // SUDOKU – tvůj kód (přesunutý tak, aby neběžel na login/menu)
  //------------------------------------------------------------

  //------------------------------------------------------------
  // 1) DOM prvky
  //------------------------------------------------------------
  const diffEl = document.getElementById("difficulty");
  const newBtn = document.getElementById("new");
  const solveBtn = document.getElementById("solve");
  const checkBtn = document.getElementById("check");
  const hintBtn = document.getElementById("hint");
  const dailyBtn = document.getElementById("daily");

  const $ = (id) => document.getElementById(id);

  const ui = {
    timer: $("timer"),
    hintInfo: $("hintInfo"),
    gamesPlayed: $("gamesPlayed"),
    gamesSolved: $("gamesSolved"),
    byDiff: {
      easy: $("solved-easy"),
      medium: $("solved-medium"),
      hard: $("solved-hard"),
      expert: $("solved-expert"),
    },
    best: {
      easy: $("best-easy"),
      medium: $("best-medium"),
      hard: $("best-hard"),
      expert: $("best-expert"),
    },
    dailySolved: $("dailySolved"),
    resetBtn: $("resetStats"),
  };

  //------------------------------------------------------------
  // 2) Stav hry
  //------------------------------------------------------------
  let givens = new Set();
  let currentSolutionStr = null;
  let currentPuzzleStr = null;

  let hintsLeft = 3;

  let timerStart = null;
  let timerInt = null;
  let timerRunning = false;
  let currentSolved = false;

  let currentIsDaily = false;

  //------------------------------------------------------------
  // 3) Statistiky v localStorage
  //------------------------------------------------------------
  const LS_KEY = "sudokuStatsV1";

  const defaultStats = {
    totalPlayed: 0,
    totalSolved: 0,
    byDiff: { easy: 0, medium: 0, hard: 0, expert: 0 },
    bestSec: { easy: null, medium: null, hard: null, expert: null },
    dailySolved: 0,
    lastDailyDate: null,
  };

  let stats = loadStats();

  function loadStats() {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY)) || {};
      return { ...defaultStats, ...stored };
    } catch {
      return { ...defaultStats };
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(stats));
    } catch {}
  }

  function formatTime(sec) {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function updateStatsUI() {
    if (ui.gamesPlayed) ui.gamesPlayed.textContent = stats.totalPlayed;
    if (ui.gamesSolved) ui.gamesSolved.textContent = stats.totalSolved;

    for (const d of ["easy", "medium", "hard", "expert"]) {
      if (ui.byDiff[d]) ui.byDiff[d].textContent = stats.byDiff[d];
      if (ui.best[d]) ui.best[d].textContent = formatTime(stats.bestSec[d]);
    }

    if (ui.hintInfo) ui.hintInfo.textContent = `Nápovědy: ${hintsLeft} / 3`;
    if (ui.dailySolved) ui.dailySolved.textContent = stats.dailySolved;

    updateDailyButtonState();
  }

  function resetStats() {
    stats = JSON.parse(JSON.stringify(defaultStats));
    saveStats();
    updateStatsUI();
  }

  //------------------------------------------------------------
  // 4) Pomocné funkce + solver
  //------------------------------------------------------------
  const randInt = (n) => Math.floor(Math.random() * n);

  const shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const row = (i) => Math.floor(i / 9);
  const col = (i) => i % 9;
  const box = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  function solve(grid, countOnly = false, limit = 2) {
    const rows = [...Array(9)].map(() => new Set());
    const cols = [...Array(9)].map(() => new Set());
    const boxes = [...Array(9)].map(() => new Set());
    const empties = [];

    for (let i = 0; i < 81; i++) {
      const v = grid[i];
      if (v) {
        const r = row(i),
          c = col(i),
          b = box(r, c);
        rows[r].add(v);
        cols[c].add(v);
        boxes[b].add(v);
      } else empties.push(i);
    }

    let solutions = 0;

    function dfs(pos) {
      if (solutions >= limit) return;
      if (pos === empties.length) {
        solutions++;
        return;
      }

      const i = empties[pos];
      const r = row(i),
        c = col(i),
        b = box(r, c);

      for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (!rows[r].has(v) && !cols[c].has(v) && !boxes[b].has(v)) {
          rows[r].add(v);
          cols[c].add(v);
          boxes[b].add(v);
          grid[i] = v;

          dfs(pos + 1);
          if (!countOnly && solutions > 0) return;

          rows[r].delete(v);
          cols[c].delete(v);
          boxes[b].delete(v);
          grid[i] = 0;
        }
      }
    }

    dfs(0);
    return countOnly ? solutions : solutions > 0 ? grid.slice() : null;
  }

  //------------------------------------------------------------
  // 5) Generování sudoku
  //------------------------------------------------------------
  function generateFull() {
    let full = solve(Array(81).fill(0));
    while (!full) full = solve(Array(81).fill(0));
    return full;
  }

  const DIFF = {
    easy: { clues: 40 },
    medium: { clues: 32 },
    hard: { clues: 26 },
    expert: { clues: 22 },
  };

  function makePuzzle(level) {
    const cfg = DIFF[level] || DIFF.easy;
    const full = generateFull();
    const fullStr = full.map(String).join("");

    const puzzle = full.slice();
    const order = shuffled([...Array(81).keys()]);
    const targetHoles = 81 - cfg.clues;
    let holes = 0;

    for (const i of order) {
      if (holes >= targetHoles) break;
      const backup = puzzle[i];
      puzzle[i] = 0;

      const sols = solve(puzzle.slice(), true, 2);
      if (sols !== 1) puzzle[i] = backup;
      else holes++;
    }

    currentSolutionStr = fullStr;
    currentPuzzleStr = puzzle.map(String).join("");
    return currentPuzzleStr;
  }

  //------------------------------------------------------------
  // 6) Vykreslení desky
  //------------------------------------------------------------
  function cellIndex(r, c) {
    return r * 9 + c;
  }

  function renderBoard(puzzleStr) {
    boardEl.innerHTML = "";
    givens.clear();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const i = cellIndex(r, c);
        const ch = puzzleStr[i];

        const cell = document.createElement("div");
        cell.className = "cell";
        if ((c + 1) % 3 === 0) cell.dataset.br = "";
        if ((r + 1) % 3 === 0) cell.dataset.bb = "";

        const input = document.createElement("input");
        input.className = "digit";
        input.maxLength = 1;
        input.setAttribute("inputmode", "numeric");
        input.setAttribute("aria-label", `Řádek ${r + 1}, Sloupec ${c + 1}`);

        if (ch !== "0") {
          input.value = ch;
          input.readOnly = true;
          input.classList.add("prefilled");
          givens.add(i);
        }

        input.addEventListener("beforeinput", (e) => {
          if (e.data && !/[1-9]/.test(e.data)) e.preventDefault();
          maybeStartTimer(input);
        });

        input.addEventListener("input", () => {
          if (!/^[1-9]$/.test(input.value)) input.value = "";
          clearBadMarks();
          validateConflicts();
          if (getGridStr() === currentSolutionStr) finishGame();
        });

        input.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            maybeStartTimer(input);
            if (!givens.has(i)) input.value = "";
            clearBadMarks();
            validateConflicts();
            return;
          }

          const dir = {
            ArrowUp: -9,
            ArrowDown: +9,
            ArrowLeft: -1,
            ArrowRight: +1,
          }[e.key];

          if (dir != null) {
            e.preventDefault();
            const ni = i + dir;
            const goingLeftOut = e.key === "ArrowLeft" && c === 0;
            const goingRightOut = e.key === "ArrowRight" && c === 8;

            if (ni >= 0 && ni < 81 && !goingLeftOut && !goingRightOut) {
              boardEl.querySelectorAll("input")[ni].focus();
            }
          }
        });

        cell.appendChild(input);
        boardEl.appendChild(cell);
      }
    }

    validateConflicts();
  }

  //------------------------------------------------------------
  // 7) Časovač
  //------------------------------------------------------------
  function maybeStartTimer(input) {
    if (input.readOnly) return;
    if (!timerRunning) {
      timerRunning = true;
      timerStart = Date.now();
      timerInt = setInterval(() => {
        const sec = Math.floor((Date.now() - timerStart) / 1000);
        if (ui.timer) ui.timer.textContent = formatTime(sec);
      }, 250);
    }
  }

  function stopTimer() {
    if (timerInt) clearInterval(timerInt);
    timerInt = null;
    timerRunning = false;
  }

  function currentTimeSec() {
    if (!timerRunning || timerStart == null) return null;
    return Math.floor((Date.now() - timerStart) / 1000);
  }

  //------------------------------------------------------------
  // 8) UI helpery – konflikty, mřížka, nápověda, kontrola
  //------------------------------------------------------------
  function getGridStr() {
    return Array.from(boardEl.querySelectorAll("input"))
      .map((inp) => inp.value || "0")
      .join("");
  }

  function clearBadMarks() {
    boardEl
      .querySelectorAll(".cell.bad")
      .forEach((el) => el.classList.remove("bad"));
  }

  function validateConflicts() {
    const inputs = Array.from(boardEl.querySelectorAll("input"));
    inputs.forEach((i) => i.classList.remove("conflict"));

    const grid = inputs.map((i) => i.value || "0");

    function mark(indices) {
      const seen = new Map();
      for (const idx of indices) {
        const v = grid[idx];
        if (v === "0") continue;
        if (!seen.has(v)) {
          seen.set(v, idx);
        } else {
          inputs[idx].classList.add("conflict");
          inputs[seen.get(v)].classList.add("conflict");
        }
      }
    }

    for (let r = 0; r < 9; r++) mark([...Array(9)].map((_, c) => cellIndex(r, c)));
    for (let c = 0; c < 9; c++) mark([...Array(9)].map((_, r) => cellIndex(r, c)));

    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const idxs = [];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            idxs.push((br * 3 + r) * 9 + (bc * 3 + c));
          }
        }
        mark(idxs);
      }
    }
  }

  function giveHint() {
    if (hintsLeft <= 0 || !currentSolutionStr) return;

    const inputs = Array.from(boardEl.querySelectorAll("input"));
    const empties = [];

    inputs.forEach((inp, idx) => {
      if (!inp.value && !inp.readOnly) empties.push(idx);
    });

    if (empties.length === 0) return;

    const i = empties[randInt(empties.length)];
    inputs[i].value = currentSolutionStr[i];

    hintsLeft--;
    if (hintBtn) hintBtn.textContent = `Nápověda (${hintsLeft})`;
    if (ui.hintInfo) ui.hintInfo.textContent = `Nápovědy: ${hintsLeft} / 3`;

    clearBadMarks();
    validateConflicts();
  }

  function checkNow() {
    if (!currentSolutionStr) return;

    const inputs = boardEl.querySelectorAll("input");
    const cellsEl = boardEl.querySelectorAll(".cell");

    clearBadMarks();

    let allCorrect = true;

    for (let i = 0; i < 81; i++) {
      const val = inputs[i].value;
      const sol = currentSolutionStr[i];
      if (val !== sol) {
        cellsEl[i].classList.add("bad");
        allCorrect = false;
      }
    }

    if (allCorrect) alert("🎉 Výborně! Vše je správně vyplněné.");
  }

  function solveNow() {
    if (!currentSolutionStr) return;

    const inputs = boardEl.querySelectorAll("input");
    for (let i = 0; i < 81; i++) {
      if (!inputs[i].value) inputs[i].value = currentSolutionStr[i];
    }
    clearBadMarks();
    finishGame();
  }

  //------------------------------------------------------------
  // 9) Daily Challenge – cooldown
  //------------------------------------------------------------
  function updateDailyButtonState() {
    if (!dailyBtn) return;

    const today = todayKey();
    if (stats.lastDailyDate === today) {
      dailyBtn.disabled = true;
      dailyBtn.textContent = "Daily (zítra znovu)";
    } else {
      dailyBtn.disabled = false;
      dailyBtn.textContent = "Daily Challenge";
    }
  }

  function startDailyChallenge() {
    const today = todayKey();

    if (stats.lastDailyDate === today) {
      alert("Daily Challenge už jste dnes hráli. Nová bude dostupná zítra po půlnoci.");
      updateDailyButtonState();
      return;
    }

    currentIsDaily = true;
    stats.lastDailyDate = today;
    saveStats();

    if (diffEl) diffEl.value = "hard";
    newGame();

    updateDailyButtonState();
  }

  //------------------------------------------------------------
  // 10) Dokončení hry a nová hra
  //------------------------------------------------------------
  function finishGame() {
    if (currentSolved) return;
    if (getGridStr() !== currentSolutionStr) return;

    const elapsed = currentTimeSec();
    stopTimer();
    currentSolved = true;

    stats.totalSolved += 1;
    stats.byDiff[diffEl.value] += 1;

    if (currentIsDaily) stats.dailySolved += 1;

    if (elapsed != null) {
      const best = stats.bestSec[diffEl.value];
      if (best == null || elapsed < best) stats.bestSec[diffEl.value] = elapsed;
    }

    saveStats();
    updateStatsUI();
  }

  function resetHints() {
    hintsLeft = 3;
    if (hintBtn) hintBtn.textContent = "Nápověda (3)";
    if (ui.hintInfo) ui.hintInfo.textContent = "Nápovědy: 3 / 3";
  }

  function newGame() {
    try {
      const puz = makePuzzle(diffEl.value) || "0".repeat(81);
      renderBoard(puz);

      stats.totalPlayed += 1;
      saveStats();
      updateStatsUI();

      resetHints();
      stopTimer();
      if (ui.timer) ui.timer.textContent = "00:00";
      timerStart = null;
      currentSolved = false;
      clearBadMarks();
    } catch (err) {
      console.error("Chyba při newGame():", err);
    }
  }

  //------------------------------------------------------------
  // 11) Listenery a start
  //------------------------------------------------------------
  if (ui.resetBtn) ui.resetBtn.addEventListener("click", resetStats);

  if (newBtn) {
    newBtn.addEventListener("click", () => {
      currentIsDaily = false;
      newGame();
    });
  }

  if (diffEl) {
    diffEl.addEventListener("change", () => {
      currentIsDaily = false;
      newGame();
    });
  }

  if (checkBtn) checkBtn.addEventListener("click", checkNow);
  if (solveBtn) solveBtn.addEventListener("click", solveNow);
  if (hintBtn) hintBtn.addEventListener("click", giveHint);
  if (dailyBtn) dailyBtn.addEventListener("click", startDailyChallenge);

  updateStatsUI();
  currentIsDaily = false;
  newGame();
}
