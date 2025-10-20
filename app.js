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
  onValue,
  push,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// ----------------- CONFIGURE THIS -----------------
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
const revealBtn = document.getElementById("reveal-btn");

const revealSection = document.getElementById("reveal-section");
const revealTableBody = document.querySelector("#reveal-table tbody");

const gameHeader = document.getElementById("game-header");
const timerDisplay = document.getElementById("timer-display");
const gameStateEl = document.getElementById("game-state");

let currentUser = null;
let currentNickname = "";
let currentImageDataUrl = null;
let lobbyId = "main-lobby";
let timerInterval = null;

// --- Auth + Login ---
startBtn.addEventListener("click", async () => {
  const nick = (nicknameInput.value || "").trim();
  if (!nick) return setStatus("Enter a nickname.", true);
  currentNickname = nick;
  setStatus("Signing in...");

  try {
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;
    // Add player to lobby in Realtime DB
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

// Auth listener
onAuthStateChanged(auth, (user) => {
  console.log("Auth state changed:", user);
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
    await set(ref(db, `lobbies/${lobbyId}/players/${currentUser.uid}`), null);
  }
  await signOut(auth);
  currentNickname = "";
});

// --- Lobby / Game ---
startGameBtn.addEventListener("click", () => {
  // anyone can start game
  update(ref(db, `lobbies/${lobbyId}`), {
    gameState: "started",
    timerStart: Date.now()
  });
});

// Listen to lobby players + game state
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

// --- Game / Timer ---
function setupGameListeners() {
  const lobbyRef = ref(db, `lobbies/${lobbyId}`);
  onValue(lobbyRef, (snap) => {
    const data = snap.val() || {};
    const state = data.gameState || "waiting";
    gameStateEl.textContent = state;

    if (state === "started") {
      lobbySection.classList.add("hidden");
      submitSection.classList.remove("hidden");
      revealBtn.classList.add("hidden");
      // start timer
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

    // Show submitted categories
    if (data.submissions) {
      submittedCategories.innerHTML = "";
      Object.values(data.submissions).forEach(s => {
        const li = document.createElement("li");
        li.textContent = `${s.nickname}: ${s.category}`;
        submittedCategories.appendChild(li);
      });
    }
  });
}

// --- Timer ---
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
      revealBtn.classList.remove("hidden");
    }
    const minutes = Math.floor(remaining/60000);
    const seconds = Math.floor((remaining%60000)/1000);
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2,'0')}`;
  }
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
}

// --- Submission ---
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
  await set(submissionRef, {
    nickname: currentNickname,
    category,
    imageBase64: currentImageDataUrl
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

// Reveal button (manual override)
revealBtn.addEventListener("click", () => {
  update(ref(db, `lobbies/${lobbyId}`), { gameState: "ended" });
});

// --- Reveal table ---
function populateRevealTable(submissions) {
  revealTableBody.innerHTML = "";
  Object.values(submissions).forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.nickname}</td>
      <td>${s.category}</td>
      <td><img src="${s.imageBase64}" /></td>
    `;
    revealTableBody.appendChild(tr);
  });
}

// --- Utilities ---
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
  // resize image to fit canvas
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




