// app.js - ES module. Make sure index.html loads it with type="module".

// --- FIREBASE SDK V9 modular imports (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  setDoc,
  doc,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ----------------- CONFIGURE THIS -----------------
const firebaseConfig = {
  apiKey: "AIzaSyDJfCUOEXDZ7peKegYIf3FWLBc9vETyaJA",
  authDomain: "maphunt-8ca4e.firebaseapp.com",
  projectId: "maphunt-8ca4e",
  storageBucket: "maphunt-8ca4e.firebasestorage.app",
  messagingSenderId: "974675337809",
  appId: "1:974675337809:web:2bf45fe8068c8ac9ab8e70"
};
// -------------------------------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

//
// UI references
//
const nicknameInput = document.getElementById("nickname-input");
const startBtn = document.getElementById("start-btn");
const loginSection = document.getElementById("login-section");

const submitSection = document.getElementById("submit-section");
const displayNickname = document.getElementById("display-nickname");
const signoutBtn = document.getElementById("signout-btn");
const categoryEl = document.getElementById("category");
const fileInput = document.getElementById("file-input");
const previewCanvas = document.getElementById("preview-canvas");
const submitBtn = document.getElementById("submit-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("status");
const recentSection = document.getElementById("recent-section");
const recentList = document.getElementById("recent-list");

let currentUser = null;
let currentNickname = "";
let currentImageDataUrl = null;

// Utility: show status
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ffb4b4" : "";
}

// Sign in if user clicks start
startBtn.addEventListener("click", async () => {
  const nick = (nicknameInput.value || "").trim();
  if (!nick || nick.length < 2) {
    setStatus("Please enter a nickname (at least 2 characters).", true);
    return;
  }
  setStatus("Signing in anonymously...");
  try {
    const cred = await signInAnonymously(auth);
    // store nickname locally then push to Firestore 'users' collection
    currentNickname = nick;
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      nickname: currentNickname,
      createdAt: serverTimestamp()
    });
    setStatus("Signed in!");
  } catch (err) {
    console.error(err);
    setStatus("Sign-in failed: " + err.message, true);
  }
});

// Auth state observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginSection.classList.add("hidden");
    submitSection.classList.remove("hidden");
    recentSection.classList.remove("hidden");
    displayNickname.textContent = currentNickname || `anon-${user.uid.slice(0,6)}`;
    loadRecentSubmissions();
  } else {
    currentUser = null;
    loginSection.classList.remove("hidden");
    submitSection.classList.add("hidden");
    recentSection.classList.add("hidden");
    displayNickname.textContent = "";
    setStatus("");
    currentImageDataUrl = null;
    clearCanvas();
  }
});

// Sign out
signoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  currentNickname = "";
  nicknameInput.value = "";
});

// File input handling
fileInput.addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  await handleFileImage(file);
});

// Paste handling (Ctrl+V) to paste images
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

// Clear button
clearBtn.addEventListener("click", () => {
  currentImageDataUrl = null;
  clearCanvas();
  setStatus("");
  fileInput.value = "";
});

// Submit button
submitBtn.addEventListener("click", async () => {
  setStatus("");
  if (!currentUser) {
    setStatus("You must be signed in first.", true);
    return;
  }
  const category = categoryEl.value;
  if (!category) {
    setStatus("Please select a category.", true);
    return;
  }
  if (!currentImageDataUrl) {
    setStatus("Please select or paste an image first.", true);
    return;
  }

  // Sanity size check: prefer < 800 KB to be safe (Firestore limit ~1 MB)
  const approxBytes = Math.ceil((currentImageDataUrl.length - "data:image/jpeg;base64,".length) * 3 / 4);
  if (approxBytes > 900000) {
    setStatus("Image too large after compression (~>900 KB). Try lowering quality or use a smaller image.", true);
    return;
  }

  setStatus("Uploading screenshot to Firestore...");
  try {
    const docRef = await addDoc(collection(db, "submissions"), {
      uid: currentUser.uid,
      nickname: currentNickname || `anon-${currentUser.uid.slice(0,6)}`,
      category,
      imageBase64: currentImageDataUrl,
      createdAt: serverTimestamp()
    });
    setStatus("Submitted! Thank you. (id: " + docRef.id + ")");
    // clear preview
    currentImageDataUrl = null;
    clearCanvas();
    fileInput.value = "";
    // refresh recent
    await loadRecentSubmissions();
  } catch (err) {
    console.error(err);
    setStatus("Upload failed: " + err.message, true);
  }
});

// Handle file image: read, resize, compress, and preview
async function handleFileImage(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("Selected file is not an image.", true);
    return;
  }
  setStatus("Processing image...");
  try {
    const dataUrl = await readFileAsDataURL(file);
    // Resize/compress
    const processed = await resizeAndCompressDataUrl(dataUrl, { maxWidth: 1200, quality: 0.7 });
    // Estimate size in bytes
    const approxBytes = Math.ceil((processed.length - processed.indexOf(",") - 1) * 3 / 4);
    if (approxBytes > 1000000) {
      setStatus("Processed image still too large (>1MB). Try cropping or lower quality.", true);
      return;
    }
    currentImageDataUrl = processed;
    drawToCanvas(processed);
    setStatus(`Ready to submit — approx ${(approxBytes/1024).toFixed(0)} KB`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to process image: " + err.message, true);
  }
}

// Read file as data URL
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// Resize and compress function: returns data URL (jpeg by default)
async function resizeAndCompressDataUrl(dataUrl, { maxWidth = 1200, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // compute size preserving aspect ratio
      let { width, height } = img;
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      // canvas draw
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // clear
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      // compress to JPEG
      try {
        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(new Error("Failed to load image for resizing."));
    img.src = dataUrl;
  });
}

// Draw preview on page canvas (fit)
function drawToCanvas(dataUrl) {
  const ctx = previewCanvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    // fit image into canvas while preserving aspect ratio
    const cw = previewCanvas.width;
    const ch = previewCanvas.height;
    ctx.clearRect(0,0,cw,ch);
    // compute scale
    const scale = Math.min(cw / img.width, ch / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    ctx.fillStyle = "#081222";
    ctx.fillRect(0,0,cw,ch);
    ctx.drawImage(img, x, y, w, h);
  };
  img.src = dataUrl;
}

function clearCanvas() {
  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.fillStyle = "#081222";
  ctx.fillRect(0,0,previewCanvas.width, previewCanvas.height);
}

// Load recent submissions (public read)
async function loadRecentSubmissions() {
  recentList.innerHTML = "<li>Loading...</li>";
  try {
    const q = query(collection(db, "submissions"), orderBy("createdAt", "desc"), limit(10));
    const snap = await getDocs(q);
    recentList.innerHTML = "";
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const li = document.createElement("li");
      const thumb = document.createElement("img");
      thumb.src = data.imageBase64;
      thumb.alt = data.category || "screenshot";
      const info = document.createElement("div");
      info.innerHTML = `<strong>${escapeHtml(data.nickname||"anon")}</strong> <span class="muted">(${data.category||'—'})</span><br><small class="muted">${(data.createdAt && data.createdAt.toDate) ? data.createdAt.toDate().toLocaleString() : ''}</small>`;
      li.appendChild(thumb);
      li.appendChild(info);
      recentList.appendChild(li);
    });
    if (!snap.size) recentList.innerHTML = "<li class='muted'>No submissions yet.</li>";
  } catch (err) {
    console.error(err);
    recentList.innerHTML = "<li class='muted'>Failed to load recent submissions.</li>";
  }
}

// small helper to escape HTML for display safety
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// initial canvas background
clearCanvas();
