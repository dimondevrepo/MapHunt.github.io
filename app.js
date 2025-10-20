import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// ----------------- CONFIG -----------------
const firebaseConfig = {
  apiKey: "AIzaSyDJfCUOEXDZ7peKegYIf3FWLBc9vETyaJA",
  authDomain: "maphunt-8ca4e.firebaseapp.com",
  projectId: "maphunt-8ca4e",
  storageBucket: "maphunt-8ca4e.firebasestorage.app",
  databaseURL: "https://maphunt-8ca4e-default-rtdb.europe-west1.firebasedatabase.app/",
  messagingSenderId: "974675337809",
  appId: "1:974675337809:web:2bf45fe8068c8ac9ab8e70"
};
// -------------------------------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// UI elements
const nicknameInput = document.getElementById("nickname-input");
const startBtn = document.getElementById("start-btn");
const loginSection = document.getElementById("login-section");

const lobbySection = document.getElementById("lobby-section");
const playerList = document.getElementById("player-list");
const displayNickname = document.getElementById("display-nickname");
const signoutBtn = document.getElementById("signout-btn");
const startGameBtn = document.getElementById("start-game-btn");

const submitSection = document.getElementById("submit-section");
const categoryEl = document.getElementById("category");
const fileInput = document.getElementById("file-input");
const previewCanvas = document.getElementById("preview-canvas");
const submitBtn = document.getElementById("submit-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("status");
const submittedCategories = document.getElementById("submitted-categories");

const revealSection = document.getElementById("reveal-section");
const revealTableBody = document.querySelector("#reveal-table tbody");
const revealBtn = document.getElementById("reveal-btn");

const gameHeader = document.getElementById("game-header");
const timerDisplay = document.getElementById("timer-display");
const gameStateEl = document.getElementById("game-state");

let currentUser = null;
let currentNickname = "";
let currentImageDataUrl = null;
let lobbyId = "main-lobby";
let timerInterval = null;

// --- AUTH ---
startBtn.addEventListener("click", async () => {
  const nick = (nicknameInput.value || "").trim();
  if (!nick) return setStatus("Enter a nickname.", true);
  currentNickname = nick;
  setStatus("Signing in...");

  try {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    await set(ref(db, `lobbies/${lobbyId}/players/${uid}`), {
      nickname: currentNickname,
      submitted: false
    });
    setStatus("Joined lobby!");
  } catch (err) {
    console.error(err);
    setStatus("Sign-in failed: " + err.message, true);
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginSection.classList.add("hidden");
    lobbySection.classList.remove("hidden");
    gameHeader.classList.remove("hidden");
    displayNickname.textContent = currentNickname || `anon-${user.uid.slice(0,6)}`;
    setupLobbyListeners();
    setupGameListeners();
  } else {
    loginSection.classList.remove("hidden");
    lobbySection.classList.add("hidden");
    submitSection.classList.add("hidden");
    revealSection.classList.add("hidden");
    gameHeader.classList.add("hidden");
    clearCanvas();
  }
});

signoutBtn.addEventListener("click", async () => {
  if (currentUser) {
    await remove(ref(db, `lobbies/${lobbyId}/players/${currentUser.uid}`));
  }
  await signOut(auth);
  currentNickname = "";
});

// --- LOBBY / START GAME ---
startGameBtn.addEventListener("click", async () => {
  // Clear previous game data
  await remove(ref(db, `lobbies/${lobbyId}/players`));
  await remove(ref(db, `lobbies/${lobbyId}/submissions`));

  // Start new game
  await update(ref(db, `lobbies/${lobbyId}`), {
    gameState: "started",
    timerStart: Date.now()
  });
});

// --- LOBBY LISTENERS ---
function setupLobbyListeners() {
  onValue(ref(db, `lobbies/${lobbyId}/players`), (snap) => {
    const val = snap.val() || {};
    playerList.innerHTML = "";
    Object.values(val).forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.nickname + (p.submitted ? " ✅" : "");
      playerList.appendChild(li);
    });
  });
}

// --- GAME / TIMER / SUBMISSIONS ---
function setupGameListeners() {
  const lobbyRef = ref(db, `lobbies/${lobbyId}`);
  onValue(lobbyRef, (snap) => {
    const data = snap.val() || {};
    const state = data.gameState || "waiting";
    gameStateEl.textContent = state;

    if (state === "started") {
      lobbySection.classList.add("hidden");
      submitSection.classList.remove("hidden");
      revealSection.classList.add("hidden");
      revealBtn?.classList.add("hidden");
      startTimer(data.timerStart || Date.now());
    } else if (state === "ended") {
      submitSection.classList.add("hidden");
      revealSection.classList.remove("hidden");
      stopTimer();
      populateRevealTable(data.submissions || {});
    } else {
      submitSection.classList.add("hidden");
      revealSection.classList.add("hidden");
    }

    // Live submissions list
    recentList.innerHTML = "";
    if (data.submissions) {
    Object.values(data.submissions).forEach(userSubmissions => {
    Object.values(userSubmissions).forEach(sub => {
      const li = document.createElement("li");
      li.textContent = `${sub.nickname}: ${sub.category}`;
      recentList.appendChild(li);
        });
      });
    }
  });

  // Also listen directly to submissions for live reveal table
  onValue(ref(db, `lobbies/${lobbyId}/submissions`), (snap) => {
    const submissions = snap.val() || {};
    populateRevealTable(submissions);
  });
}

// --- TIMER ---
function startTimer(startTime) {
  stopTimer();
  function updateTimer() {
    const now = Date.now();
    const end = startTime + 15*60*1000; // 15 mins
    let remaining = end - now;
    if (remaining <= 0) {
      remaining = 0;
      stopTimer();
      update(ref(db, `lobbies/${lobbyId}`), { gameState: "ended" });
      revealBtn?.classList.remove("hidden");
    }
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2,'0')}`;
  }
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
}

// --- SUBMISSIONS ---
fileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  await handleFileImage(file);
});

document.addEventListener("paste", async (ev) => {
  const items = ev.clipboardData && ev.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        await handleFileImage(file);
        ev.preventDefault();
        break;
      }
    }
  }
});

clearBtn.addEventListener("click", () => {
  currentImageDataUrl = null;
  clearCanvas();
  setStatus("");
  fileInput.value = "";
});

submitBtn.addEventListener("click", async () => {
  setStatus("");
  const category = categoryEl.value;
  if (!category || !currentImageDataUrl) return setStatus("Choose category & image.", true);

  const submissionRef = ref(db, `lobbies/${lobbyId}/submissions/${currentUser.uid}`);
  await push(submissionRef, {
  nickname: currentNickname,
  category,
  imageBase64: currentImageDataUrl,
  timestamp: Date.now()
});

  // mark as submitted
  await update(ref(db, `lobbies/${lobbyId}/players/${currentUser.uid}`), {
    submitted: true
  });

  setStatus("Submitted!");
  currentImageDataUrl = null;
  clearCanvas();
  fileInput.value = "";
});

// Reveal button
revealBtn.addEventListener("click", () => {
  update(ref(db, `lobbies/${lobbyId}`), { gameState: "ended" });
});

// --- REVEAL TABLE ---
function populateRevealTable(submissions) {
  revealTableBody.innerHTML = "";
  Object.values(submissions).forEach(userSubmissions => {
    Object.values(userSubmissions).forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.nickname}</td>
        <td>${s.category}</td>
        <td><img class="clickable-img" src="${s.imageBase64}" /></td>
      `;
      revealTableBody.appendChild(tr);
    });
  });

  // Click to view full size
  document.querySelectorAll(".clickable-img").forEach(img => {
    img.addEventListener("click", () => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = 0;
      overlay.style.left = 0;
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = 1000;
      const fullImg = document.createElement("img");
      fullImg.src = img.src;
      fullImg.style.maxWidth = "90%";
      fullImg.style.maxHeight = "90%";
      fullImg.style.border = "2px solid white";
      overlay.appendChild(fullImg);
      overlay.addEventListener("click", () => overlay.remove());
      document.body.appendChild(overlay);
    });
  });
}

// --- UTILITIES ---
function setStatus(msg, isError=false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "red" : "white";
}

function clearCanvas() {
  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

async function handleFileImage(file) {
  const img = new Image();
  img.src = await fileToDataURL(file);
  await new Promise(r => img.onload = r);
  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0,0,previewCanvas.width, previewCanvas.height);
  const ratio = Math.min(previewCanvas.width/img.width, previewCanvas.height/img.height);
  const w = img.width*ratio;
  const h = img.height*ratio;
  ctx.drawImage(img, 0, 0, w, h);
  currentImageDataUrl = previewCanvas.toDataURL("image/jpeg", 0.7);
}

function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = e => rej(e);
    reader.readAsDataURL(file);
  });
}

// --- GLOBAL HELPERS ---
window.db = db;
window.ref = ref;
window.update = update;
window.endGame = () => {
  update(ref(db, `lobbies/${lobbyId}`), { gameState: "ended" });
};




