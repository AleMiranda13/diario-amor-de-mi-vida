import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, deleteDoc,
  query, orderBy, onSnapshot,
  getDocs, limit
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

// ID del diario (fijo, sin "/")
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

// Admin
const adminCard = document.getElementById("adminCard");
const partnerUidEl = document.getElementById("partnerUid");
const adminStatus = document.getElementById("adminStatus");

// Botones edición (en tu HTML)
const btnSave = document.getElementById("btnSave");
const btnUpdate = document.getElementById("btnUpdate");
const btnCancelEdit = document.getElementById("btnCancelEdit");
const btnClear = document.getElementById("btnClear");

// Botón export PDF (agregar en HTML con id="btnExportPdf")
const btnExportPdf = document.getElementById("btnExportPdf");

// Portada typewriter (2 líneas)
const type1 = document.getElementById("typeLine1");
const type2 = document.getElementById("typeLine2");

// -------- Estado
let unsubEntries = null;
let unsubDiaryDoc = null;
let entriesCache = [];
let editingEntryId = null;

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

btnClear && (btnClear.onclick = () => {
  titleEl.value = "";
  contentEl.value = "";
  appStatus.textContent = "";
  stopEdit("");
});

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

// -------- Core: asegurar doc del diario (sin leer)
async function ensureDiary(uid) {
  const diaryRef = doc(db, "diaries", DIARY_ID);

  await setDoc(
    diaryRef,
    { ownerUid: uid, allowedUids: [uid], createdAt: Date.now() },
    { merge: true }
  );

  return diaryRef;
}

// -------- Seed: primera entrada (solo una vez)
async function seedFirstEntryIfEmpty(ownerUid) {
  const diaryRef = doc(db, "diaries", DIARY_ID);
  const diarySnap = await getDoc(diaryRef);
  const diaryData = diarySnap.data();

  // Solo el owner crea el seed (para evitar duplicados)
  if (!diaryData || diaryData.ownerUid !== ownerUid) return;

  // ¿Hay al menos 1 entrada?
  const q = query(collection(db, `diaries/${DIARY_ID}/entries`), limit(1));
  const any = await getDocs(q);
  if (!any.empty) return;

  const title = "11 meses";
  const content =
`Hoy cumplimos 11 meses y me dieron ganas de regalarte un lugar.
No un regalo que se gasta, sino uno que se queda.

Este diario es tuyo: para lo que pensás, lo que soñás, lo que te sale lindo y lo que te sale desordenado. Para tus días buenos, para los raros, para los que cuestan.

Yo solo hice la puerta, y la hice con amor.

Gracias por elegirme incluso con kilómetros y horarios en el medio. Gracias por tu forma de mirar el mundo, por lo que escribís y por cómo me hacés sentir en casa desde lejos.

Ojalá este cuaderno virtual te abrace cuando lo necesites.
Ich liebe dich mi amor hermosa, podria dedicarte millones de palabras una y otra vez pero jamas me van a alcanzar comparado a el amor inmenso que siento por vos. Gracias por formar parte de mi vida, y permitirme estar en la tuya, por muchos meses más junto a vos mi amor preciosa`;

  await addDoc(collection(db, `diaries/${DIARY_ID}/entries`), {
    date: new Date().toISOString().slice(0, 10),
    title,
    content,
    authorUid: ownerUid,
    createdAt: Date.now(),
    isPinned: true,
  });
}

// -------- Edición UI
function startEdit(entry) {
  editingEntryId = entry.id;

  dateEl.value = entry.date || new Date().toISOString().slice(0, 10);
  titleEl.value = entry.title || "";
  contentEl.value = entry.content || "";

  btnSave?.classList.add("hidden");
  btnUpdate?.classList.remove("hidden");
  btnCancelEdit?.classList.remove("hidden");

  appStatus.textContent = "Editando entrada...";
  contentEl.focus();
}

function stopEdit(msg = "") {
  editingEntryId = null;

  btnSave?.classList.remove("hidden");
  btnUpdate?.classList.add("hidden");
  btnCancelEdit?.classList.add("hidden");

  if (msg) appStatus.textContent = msg;
}

btnCancelEdit && (btnCancelEdit.onclick = () => stopEdit("Edición cancelada."));

// -------- Guardar (nuevo)
btnSave && (btnSave.onclick = async () => {
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
    await ensureDiary(user.uid);

    await addDoc(collection(db, `diaries/${DIARY_ID}/entries`), {
      date,
      title,
      content,
      authorUid: user.uid,
      createdAt: Date.now(),
    });

    titleEl.value = "";
    contentEl.value = "";
    stopEdit("");
    if (document.body.classList.contains("focus")) contentEl.focus();
  });
});

// -------- Actualizar (editar)
btnUpdate && (btnUpdate.onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;
  if (!editingEntryId) {
    appStatus.textContent = "No hay una entrada seleccionada para editar.";
    return;
  }

  const date = dateEl.value || new Date().toISOString().slice(0, 10);
  const title = titleEl.value.trim();
  const content = contentEl.value;

  if (!content.trim()) {
    appStatus.textContent = "Escribí algo antes de actualizar 🙂";
    return;
  }

  await withStatus(appStatus, "Actualizando...", async () => {
    await updateDoc(doc(db, `diaries/${DIARY_ID}/entries/${editingEntryId}`), {
      date,
      title,
      content,
      updatedAt: Date.now(),
    });

    titleEl.value = "";
    contentEl.value = "";
    stopEdit("Actualizada 💗");
    if (document.body.classList.contains("focus")) contentEl.focus();
  });
});

// -------- Admin: agregar UID (solo owner)
document.getElementById("btnAddPartner").onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const partnerUid = partnerUidEl.value.trim();
  if (!partnerUid) {
    adminStatus.textContent = "Pegá un UID válido.";
    return;
  }

  await withStatus(adminStatus, "Agregando UID...", async () => {
    const diaryRef = await ensureDiary(user.uid);
    const snap = await getDoc(diaryRef);
    const data = snap.data();

    if (!data) throw new Error("No pude leer el diario (¿rules?).");
    if (data.ownerUid !== user.uid) throw new Error("Solo el owner del diario puede agregar UIDs.");

    const allowed = Array.isArray(data.allowedUids) ? data.allowedUids : [];
    const newAllowed = Array.from(new Set([...allowed, partnerUid]));

    await updateDoc(diaryRef, { allowedUids: newAllowed });
    adminStatus.textContent = "Listo. Ahora ella ya puede entrar y ver/guardar.";
  });
};

// -------- Export PDF (imprimir -> guardar como PDF)
btnExportPdf && (btnExportPdf.onclick = () => {
  const term = (searchEl?.value || "").toLowerCase().trim();
  const list = term
    ? entriesCache.filter((e) =>
        (e.title || "").toLowerCase().includes(term) ||
        (e.content || "").toLowerCase().includes(term) ||
        (e.date || "").toLowerCase().includes(term)
      )
    : entriesCache;

  const data = [...list].reverse(); // viejo->nuevo
  const html = buildPrintableHtml(data);

  const w = window.open("", "_blank");
  if (!w) return;

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
});

function buildPrintableHtml(entries) {
  const safe = (s) =>
    String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  const items = entries
    .map(
      (e) => `
      <div class="entry">
        <div class="meta">${safe(e.date)} • ${safe(e.title || "Sin título")}</div>
        <div class="text">${safe(e.content).replaceAll("\n", "<br>")}</div>
      </div>
    `
    )
    .join("");

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Diario - Export</title>
      <style>
        body{ font-family: Georgia, "Times New Roman", serif; padding: 28px; }
        h1{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0 0 14px; }
        .sub{ color:#555; margin: 0 0 22px; font-family: system-ui; }
        .entry{ page-break-inside: avoid; border-top: 1px solid #ddd; padding: 14px 0; }
        .meta{ color:#666; font-size: 12px; margin-bottom: 8px; font-family: system-ui; }
        .text{ line-height: 1.65; font-size: 14px; white-space: normal; }
        @media print { body{ padding: 0; } }
      </style>
    </head>
    <body>
      <h1>Diario</h1>
      <p class="sub">Exportado el ${new Date().toLocaleString()}</p>
      ${items || "<p>No hay entradas.</p>"}
    </body>
  </html>`;
}

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
    if (targetEl) targetEl.textContent = e?.message || e?.code || "Ocurrió un error.";
  }
}

// -------- Entries subscription & render
onAuthStateChanged(auth, async (user) => {
  // cleanup
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
  if (unsubDiaryDoc) { unsubDiaryDoc(); unsubDiaryDoc = null; }
  entriesCache = [];
  if (entriesEl) entriesEl.innerHTML = "";
  stopEdit("");

  if (!user) {
    authView?.classList.remove("hidden");
    appView?.classList.add("hidden");
    whoami && (whoami.textContent = "");
    adminCard && adminCard.classList.add("hidden");
    setDefaultDate();

    if (document.body.classList.contains("focus")) {
      document.body.classList.remove("focus");
      btnFocus && (btnFocus.textContent = "Modo foco");
    }
    return;
  }

  authView?.classList.add("hidden");
  appView?.classList.remove("hidden");
  setDefaultDate();

  whoami && (whoami.textContent = `Tu UID: ${user.uid} (solo para compartirlo una vez si hace falta)`);

  const diaryRef = await ensureDiary(user.uid);

  // Admin visible solo si sos owner
  unsubDiaryDoc = onSnapshot(
    diaryRef,
    (snap) => {
      const data = snap.data();
      if (!adminCard) return;
      if (data?.ownerUid === user.uid) adminCard.classList.remove("hidden");
      else adminCard.classList.add("hidden");
    },
    () => adminCard && adminCard.classList.add("hidden")
  );

  // Seed inicial (solo owner, solo si no hay entradas)
  await seedFirstEntryIfEmpty(user.uid);

  // Suscripción entradas
  const q = query(collection(db, `diaries/${DIARY_ID}/entries`), orderBy("createdAt", "desc"));
  unsubEntries = onSnapshot(
    q,
    (snap) => {
      entriesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  let list = term
    ? entriesCache.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(term) ||
          (e.content || "").toLowerCase().includes(term) ||
          (e.date || "").toLowerCase().includes(term)
      )
    : entriesCache;

  // Si hay pinned, lo ponemos arriba
  const pinned = list.filter((e) => e.isPinned);
  const rest = list.filter((e) => !e.isPinned);
  list = [...pinned, ...rest];

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

    // Editar solo si es tuya
    if (e.authorUid === me) {
      const edit = document.createElement("button");
      edit.className = "ghost";
      edit.textContent = "Editar";
      edit.onclick = () => startEdit(e);
      actions.appendChild(edit);

      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "Borrar";
      del.onclick = async () => {
        if (!confirm("¿Borrar esta entrada?")) return;
        await deleteDoc(doc(db, `diaries/${DIARY_ID}/entries/${e.id}`));
        if (editingEntryId === e.id) stopEdit("Entrada borrada.");
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