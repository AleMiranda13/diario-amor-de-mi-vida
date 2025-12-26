import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** 🔧 Firebase config (tuya) */
const firebaseConfig = {
  apiKey: "AIzaSyCb8a123qJzz5Ej0PY4hy-feZLX5SfgyR8",
  authDomain: "mi-portfolio-con-db.firebaseapp.com",
  projectId: "mi-portfolio-con-db",
  storageBucket: "mi-portfolio-con-db.firebasestorage.app",
  messagingSenderId: "393977142911",
  appId: "1:393977142911:web:c66fd26be11b741119694a",
};


// ID del diario (dejarlo fijo)
const DIARY_ID = "diary-20250126";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------- UI refs
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const authStatus = document.getElementById("authStatus");

const whoami = document.getElementById("whoami");
const dateEl = document.getElementById("date");
const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");
const appStatus = document.getElementById("appStatus");

const entriesEl = document.getElementById("entries");
const searchEl = document.getElementById("search");

const btnFocus = document.getElementById("btnFocus");
const adminCard = document.getElementById("adminCard");
const partnerUidEl = document.getElementById("partnerUid");
const adminStatus = document.getElementById("adminStatus");

// Portada typewriter (2 líneas)
const type1 = document.getElementById("typeLine1");
const type2 = document.getElementById("typeLine2");

// -------- Typewriter init
(async () => {
  if (type1) await typewriter(type1, type1.dataset.text || "", { startDelay: 220 });
  if (type2) await typewriter(type2, type2.dataset.text || "", { startDelay: 120 });
})();

// -------- Auth actions
document.getElementById("btnLogin").onclick = () =>
  withStatus(authStatus, "Ingresando...", async () => {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  });

document.getElementById("btnRegister").onclick = () =>
  withStatus(authStatus, "Creando cuenta...", async () => {
    await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
  });

document.getElementById("btnLogout").onclick = async () => {
  await signOut(auth);
};

document.getElementById("btnClear").onclick = () => {
  titleEl.value = "";
  contentEl.value = "";
};

// -------- Focus mode
if (btnFocus) {
  btnFocus.onclick = () => {
    document.body.classList.toggle("focus");
    btnFocus.textContent = document.body.classList.contains("focus") ? "Salir de foco" : "Modo foco";
    if (document.body.classList.contains("focus")) setTimeout(() => contentEl?.focus(), 50);
  };

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("focus")) {
      document.body.classList.remove("focus");
      btnFocus.textContent = "Modo foco";
    }
  });
}

// -------- Save entry (FIX permisos)
document.getElementById("btnSave").onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const date = dateEl.value || new Date().toISOString().slice(0, 10);
  const title = titleEl.value.trim();
  const content = contentEl.value;

  if (!content.trim()) {
    appStatus.textContent = "Escribí algo antes de guardar 🙂";
    return;
  }

  await withStatus(appStatus, "Guardando...", async () => {
    // 1) Asegurar el doc del diario y CONFIRMAR su existencia antes de escribir entries
    const diaryRef = doc(db, "diaries", DIARY_ID);
    const snap = await getDoc(diaryRef);

    if (!snap.exists()) {
      await setDoc(diaryRef, {
        ownerUid: user.uid,
        allowedUids: [user.uid],
        createdAt: Date.now(),
      });
    }

    // 2) Ahora sí, crear la entrada
    const col = collection(db, `diaries/${DIARY_ID}/entries`);
    await addDoc(col, {
      date,
      title,
      content,
      authorUid: user.uid,
      createdAt: Date.now(),
    });

    titleEl.value = "";
    contentEl.value = "";
    if (document.body.classList.contains("focus")) contentEl.focus();
  });
};

// -------- Admin: add partner UID (solo owner)
document.getElementById("btnAddPartner").onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const partnerUid = partnerUidEl.value.trim();
  if (!partnerUid) {
    adminStatus.textContent = "Pegá un UID válido.";
    return;
  }

  await withStatus(adminStatus, "Agregando UID...", async () => {
    const diaryRef = doc(db, "diaries", DIARY_ID);
    const snap = await getDoc(diaryRef);

    if (!snap.exists()) {
      // Si todavía no existe, lo crea el owner actual (vos)
      await setDoc(diaryRef, {
        ownerUid: user.uid,
        allowedUids: [user.uid],
        createdAt: Date.now(),
      });
    }

    const data = (await getDoc(diaryRef)).data();

    // Solo owner puede actualizar (rules también lo exigen)
    if (data.ownerUid !== user.uid) {
      throw new Error("Solo el owner del diario puede agregar UIDs.");
    }

    const allowed = Array.isArray(data.allowedUids) ? data.allowedUids : [];
    const newAllowed = Array.from(new Set([...allowed, partnerUid]));

    await updateDoc(diaryRef, { allowedUids: newAllowed });
    adminStatus.textContent = "Listo. Ahora ella ya puede entrar y ver/guardar.";
  });
};

// -------- Helpers
function setDefaultDate() {
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
}

async function withStatus(targetEl, msg, fn) {
  if (targetEl) targetEl.textContent = msg;
  try {
    await fn();
    if (targetEl) targetEl.textContent = "Listo.";
  } catch (e) {
    console.error(e);
    if (targetEl) targetEl.textContent = e?.message || "Ocurrió un error.";
  }
}

// -------- Entries subscription & render
let unsub = null;
let entriesCache = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (unsub) { unsub(); unsub = null; }
    authView?.classList.remove("hidden");
    appView?.classList.add("hidden");
    entriesEl && (entriesEl.innerHTML = "");
    entriesCache = [];
    whoami && (whoami.textContent = "");
    setDefaultDate();

    if (adminCard) adminCard.classList.add("hidden");

    if (document.body.classList.contains("focus")) {
      document.body.classList.remove("focus");
      if (btnFocus) btnFocus.textContent = "Modo foco";
    }
    return;
  }

  authView?.classList.add("hidden");
  appView?.classList.remove("hidden");
  setDefaultDate();

  if (whoami) whoami.textContent = `Tu UID: ${user.uid} (solo para compartirlo una vez si hace falta)`;

  const diaryRef = doc(db, "diaries", DIARY_ID);

  // Asegurar doc del diario (si sos el primero en entrar)
  const snap = await getDoc(diaryRef);
  if (!snap.exists()) {
    await setDoc(diaryRef, {
      ownerUid: user.uid,
      allowedUids: [user.uid],
      createdAt: Date.now(),
    });
  }

  // Mostrar Admin SOLO si sos owner
  const diarySnap = await getDoc(diaryRef);
  const diaryData = diarySnap.data();

  if (adminCard) {
    if (diarySnap.exists() && diaryData?.ownerUid === user.uid) adminCard.classList.remove("hidden");
    else adminCard.classList.add("hidden");
  }

  // Suscripción entradas
  const q = query(collection(db, `diaries/${DIARY_ID}/entries`), orderBy("createdAt", "desc"));
  if (unsub) unsub();
  unsub = onSnapshot(
    q,
    (snap2) => {
      entriesCache = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderFiltered();
    },
    (err) => {
      console.error(err);
      if (entriesEl) entriesEl.innerHTML = `<p class="hint">No tenés acceso a este diario todavía.</p>`;
    }
  );
});

searchEl?.addEventListener("input", renderFiltered);

function renderFiltered() {
  const term = (searchEl?.value || "").toLowerCase().trim();
  const list = term
    ? entriesCache.filter((e) =>
        (e.title || "").toLowerCase().includes(term) ||
        (e.content || "").toLowerCase().includes(term) ||
        (e.date || "").toLowerCase().includes(term)
      )
    : entriesCache;

  if (!entriesEl) return;
  entriesEl.innerHTML = "";

  if (!list.length) {
    entriesEl.innerHTML = `<p class="hint">No hay entradas (o no coinciden con la búsqueda).</p>`;
    return;
  }

  const me = auth.currentUser?.uid;

  for (const e of list) {
    const el = document.createElement("div");
    el.className = "entry";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${escapeHtml(e.date || "")}</span><span>${e.authorUid === me ? "Vos" : "Ella"}</span>`;

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = e.title?.trim() ? e.title : "Sin título";

    const text = document.createElement("p");
    text.className = "text";
    text.textContent = e.content || "";

    const actions = document.createElement("div");
    actions.className = "actions";

    if (e.authorUid === me) {
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "Borrar";
      del.onclick = async () => {
        if (!confirm("¿Borrar esta entrada?")) return;
        await deleteDoc(doc(db, `diaries/${DIARY_ID}/entries/${e.id}`));
      };
      actions.appendChild(del);
    }

    el.append(meta, title, text, actions);
    entriesEl.appendChild(el);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -------- Typewriter (pausas tipo máquina)
async function typewriter(el, text, opts = {}) {
  const {
    startDelay = 200,
    minDelay = 18,
    maxDelay = 40,
    commaPause = 120,
    dotPause = 220,
    longPause = 320,
  } = opts;

  if (!el) return;
  el.textContent = "";
  await sleep(startDelay);

  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];

    const ch = text[i];
    let d = rand(minDelay, maxDelay);

    if (ch === "," || ch === ";" || ch === ":") d += commaPause;
    if (ch === "." || ch === "!" || ch === "?") d += dotPause;
    if (ch === "—") d += longPause;

    if (Math.random() < 0.08) d += rand(40, 120);

    await sleep(d);
  }
}

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
