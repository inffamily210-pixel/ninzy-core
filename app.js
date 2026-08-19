// =========================================================
// NINZY CORE — app.js
// Manga/manhwa/manhua reader combining MangaDex (official API)
// and Komiku (via self-hosted proxy, see komiku-proxy/).
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc, getDocs, collection,
  query, orderBy, limit as fbLimit
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

/* ---------------------------------------------------------
   FIREBASE SETUP
--------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCoL8bPwTw-TSPX4q1DKXxzPbGIv82z9kg",
  authDomain: "ninzy-motion.firebaseapp.com",
  projectId: "ninzy-motion",
  storageBucket: "ninzy-motion.firebasestorage.app",
  messagingSenderId: "315522891172",
  appId: "1:315522891172:web:9e551a1d3bc96fe44ad531",
  measurementId: "G-3TM9Z6XBJ9"
};
const fbApp = initializeApp(firebaseConfig);
analyticsSupported().then(ok => { if (ok) getAnalytics(fbApp); }).catch(() => {});
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

let currentUser = null;

/* ---------------------------------------------------------
   SMALL HELPERS
--------------------------------------------------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const appEl = $("#app");

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function skeletonGrid(n = 12, wide = false) {
  return `<div class="grid ${wide ? "grid--wide" : ""}">` +
    Array.from({ length: n }).map(() => `<div class="skeleton skel-card"></div>`).join("") +
    `</div>`;
}

function stateBox({ icon = "忍", title, desc = "", actionLabel, actionHref }) {
  return `<div class="state-box">
    <div class="seal-lg">${icon}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(desc)}</p>
    ${actionLabel ? `<a href="${actionHref}" class="btn btn--primary">${escapeHtml(actionLabel)}</a>` : ""}
  </div>`;
}

/* ---------------------------------------------------------
   SOURCE MANAGEMENT (MangaDex <-> Komiku)
--------------------------------------------------------- */
const Source = {
  get current() { return localStorage.getItem("ninzy:source") || "mangadex"; },
  set current(v) { localStorage.setItem("ninzy:source", v); },
  get komikuProxy() { return localStorage.getItem("ninzy:komikuProxy") || ""; },
  set komikuProxy(v) { localStorage.setItem("ninzy:komikuProxy", v.replace(/\/$/, "")); }
};

function updateSourceChip() {
  $("#sourceLabel").textContent = Source.current === "komiku" ? "Komiku" : "MangaDex";
}

/* ---------------------------------------------------------
   ADAPTER: MangaDex — official REST API, CORS-open
   Docs: https://api.mangadex.org/docs
--------------------------------------------------------- */
const MD_BASE = "https://api.mangadex.org";
const MD_UPLOADS = "https://uploads.mangadex.org";

function mdCoverUrl(mangaId, filename, size = 256) {
  if (!filename) return "";
  return `${MD_UPLOADS}/covers/${mangaId}/${filename}.${size}.jpg`;
}

function mdMapManga(m) {
  const attr = m.attributes || {};
  const title = attr.title?.en || attr.title?.["ja-ro"] || Object.values(attr.title || {})[0] || "(Tanpa judul)";
  const desc = attr.description?.en || attr.description?.id || Object.values(attr.description || {})[0] || "";
  const coverRel = (m.relationships || []).find(r => r.type === "cover_art");
  const authorRel = (m.relationships || []).find(r => r.type === "author");
  const cover = coverRel ? mdCoverUrl(m.id, coverRel.attributes?.fileName, 512) : "";
  return {
    source: "mangadex",
    id: m.id,
    title,
    altTitles: (attr.altTitles || []).map(t => Object.values(t)[0]).filter(Boolean).slice(0, 4),
    description: desc,
    cover,
    status: attr.status,
    year: attr.year,
    tags: (attr.tags || []).map(t => t.attributes?.name?.en).filter(Boolean),
    contentRating: attr.contentRating,
    author: authorRel?.attributes?.name || "",
    lastChapter: attr.lastChapter || ""
  };
}

async function mdFetch(path, params = {}) {
  const url = new URL(MD_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, item));
    else if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MangaDex API error ${res.status}`);
  return res.json();
}

const MangaDex = {
  async popular(limit = 18, offset = 0) {
    const data = await mdFetch("/manga", {
      limit, offset, "order[followedCount]": "desc",
      "includes[]": ["cover_art", "author"],
      "contentRating[]": ["safe", "suggestive"]
    });
    return data.data.map(mdMapManga);
  },
  async latest(limit = 18, offset = 0) {
    const data = await mdFetch("/manga", {
      limit, offset, "order[latestUploadedChapter]": "desc",
      "includes[]": ["cover_art", "author"],
      "contentRating[]": ["safe", "suggestive"]
    });
    return data.data.map(mdMapManga);
  },
  async search(title, limit = 24, offset = 0) {
    const data = await mdFetch("/manga", {
      title, limit, offset,
      "includes[]": ["cover_art", "author"],
      "contentRating[]": ["safe", "suggestive", "erotica"]
    });
    return data.data.map(mdMapManga);
  },
  async byGenre(tagId, limit = 24, offset = 0) {
    const data = await mdFetch("/manga", {
      limit, offset, "includedTags[]": [tagId],
      "order[followedCount]": "desc",
      "includes[]": ["cover_art", "author"],
      "contentRating[]": ["safe", "suggestive"]
    });
    return data.data.map(mdMapManga);
  },
  async random() {
    const data = await mdFetch("/manga/random", {
      "includes[]": ["cover_art", "author"],
      "contentRating[]": ["safe", "suggestive"]
    });
    return mdMapManga(data.data);
  },
  async tags() {
    const data = await mdFetch("/manga/tag");
    return (data.data || [])
      .filter(t => t.attributes?.group === "genre")
      .map(t => ({ id: t.id, name: t.attributes.name.en }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async detail(id) {
    const data = await mdFetch(`/manga/${id}`, { "includes[]": ["cover_art", "author", "artist"] });
    return mdMapManga(data.data);
  },
  async chapters(mangaId) {
    const all = [];
    let offset = 0;
    for (let i = 0; i < 6; i++) { // up to ~3000 chapters
      const data = await mdFetch(`/manga/${mangaId}/feed`, {
        limit: 500, offset,
        "translatedLanguage[]": ["en", "id"],
        "order[chapter]": "asc",
        "includes[]": ["scanlation_group"]
      });
      all.push(...data.data);
      offset += 500;
      if (data.data.length < 500 || offset >= (data.total || 0)) break;
    }
    // de-dupe by chapter number+lang, prefer id lang
    const byNum = new Map();
    all.forEach(c => {
      const attr = c.attributes;
      const key = attr.chapter ?? c.id;
      const existing = byNum.get(key);
      if (!existing || attr.translatedLanguage === "id") byNum.set(key, c);
    });
    return Array.from(byNum.values())
      .sort((a, b) => (parseFloat(a.attributes.chapter) || 0) - (parseFloat(b.attributes.chapter) || 0))
      .map(c => ({
        id: c.id,
        chapter: c.attributes.chapter || "-",
        title: c.attributes.title || "",
        lang: c.attributes.translatedLanguage,
        pages: c.attributes.pages,
        publishAt: c.attributes.publishAt,
        group: (c.relationships || []).find(r => r.type === "scanlation_group")?.attributes?.name || ""
      }));
  },
  async pages(chapterId) {
    const res = await fetch(`${MD_BASE}/at-home/server/${chapterId}`);
    if (!res.ok) throw new Error("Gagal memuat halaman chapter");
    const data = await res.json();
    const { baseUrl, chapter } = data;
    return chapter.data.map(f => `${baseUrl}/data/${chapter.hash}/${f}`);
  }
};

/* ---------------------------------------------------------
   ADAPTER: Komiku — via self-hosted proxy (no official API)
   Proxy contract (implement in komiku-proxy/server.js):
     GET /api/latest              -> [{id,title,cover,chapter,type}]
     GET /api/popular             -> same shape
     GET /api/search?q=           -> same shape
     GET /api/detail?id=          -> {id,title,cover,description,status,tags,author,chapters:[{id,chapter,title}]}
     GET /api/pages?id=           -> [imageUrl,...]
--------------------------------------------------------- */
function komikuMap(item) {
  return {
    source: "komiku",
    id: item.id,
    title: item.title,
    cover: item.cover,
    description: item.description || "",
    status: item.status || "",
    tags: item.tags || [],
    author: item.author || "",
    lastChapter: item.chapter || ""
  };
}

function requireKomikuProxy() {
  if (!Source.komikuProxy) {
    throw new Object.assign(new Error("KOMIKU_NOT_CONFIGURED"), { code: "KOMIKU_NOT_CONFIGURED" });
  }
}

const Komiku = {
  async popular() {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/popular`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return (await res.json()).map(komikuMap);
  },
  async latest() {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/latest`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return (await res.json()).map(komikuMap);
  },
  async search(q) {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return (await res.json()).map(komikuMap);
  },
  async detail(id) {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    const data = await res.json();
    return { manga: komikuMap(data), chapters: data.chapters || [] };
  },
  async pages(chapterId) {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/pages?id=${encodeURIComponent(chapterId)}`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return res.json();
  },
  async genres() {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/genres`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return res.json();
  },
  async byGenre(slug) {
    requireKomikuProxy();
    const res = await fetch(`${Source.komikuProxy}/api/genre?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error("Proxy Komiku error " + res.status);
    return (await res.json()).map(komikuMap);
  }
};

function adapterFor(source) { return source === "komiku" ? Komiku : MangaDex; }

/* ---------------------------------------------------------
   FIRESTORE: library (bookmarks) & history
--------------------------------------------------------- */
function requireAuthOrPrompt() {
  if (!currentUser) { openAuthModal(); return false; }
  return true;
}

async function addToLibrary(manga) {
  if (!requireAuthOrPrompt()) return;
  const key = `${manga.source}_${manga.id}`;
  await setDoc(doc(db, "users", currentUser.uid, "library", key), {
    source: manga.source, mangaId: manga.id, title: manga.title, cover: manga.cover,
    addedAt: Date.now()
  });
  toast("Ditambahkan ke Rak Saya");
}

async function removeFromLibrary(source, mangaId) {
  if (!currentUser) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "library", `${source}_${mangaId}`));
  toast("Dihapus dari Rak Saya");
}

async function isInLibrary(source, mangaId) {
  if (!currentUser) return false;
  const snap = await getDoc(doc(db, "users", currentUser.uid, "library", `${source}_${mangaId}`));
  return snap.exists();
}

async function getLibrary() {
  if (!currentUser) return [];
  const snap = await getDocs(query(collection(db, "users", currentUser.uid, "library"), orderBy("addedAt", "desc")));
  return snap.docs.map(d => d.data());
}

async function saveHistory(entry) {
  if (!currentUser) return; // silently skip if not logged in
  const key = `${entry.source}_${entry.mangaId}`;
  await setDoc(doc(db, "users", currentUser.uid, "history", key), { ...entry, updatedAt: Date.now() });
}

async function getHistory() {
  if (!currentUser) return [];
  const snap = await getDocs(query(collection(db, "users", currentUser.uid, "history"), orderBy("updatedAt", "desc"), fbLimit(60)));
  return snap.docs.map(d => d.data());
}

async function getHistoryFor(source, mangaId) {
  if (!currentUser) return null;
  const snap = await getDoc(doc(db, "users", currentUser.uid, "history", `${source}_${mangaId}`));
  return snap.exists() ? snap.data() : null;
}

/* ---------------------------------------------------------
   AUTH UI
--------------------------------------------------------- */
let authMode = "signin";

function openAuthModal() {
  $("#authModal").classList.remove("hidden");
  $("#authError").classList.add("hidden");
}
function closeAuthModal() { $("#authModal").classList.add("hidden"); }

$("#authModalClose").addEventListener("click", closeAuthModal);
$("#authModal").addEventListener("click", e => { if (e.target.id === "authModal") closeAuthModal(); });

$("#authSwitchBtn").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  $("#authTitle").textContent = authMode === "signin" ? "Masuk ke Ninzy Core" : "Buat Akun Ninzy Core";
  $("#authSubmitBtn").textContent = authMode === "signin" ? "Masuk" : "Daftar";
  $("#authSwitchText").textContent = authMode === "signin" ? "Belum punya akun?" : "Sudah punya akun?";
  $("#authSwitchBtn").textContent = authMode === "signin" ? "Daftar" : "Masuk";
});

$("#googleSignInBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    closeAuthModal();
  } catch (err) {
    showAuthError(err);
  }
});

$("#emailAuthForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  try {
    if (authMode === "signin") await signInWithEmailAndPassword(auth, email, password);
    else await createUserWithEmailAndPassword(auth, email, password);
    closeAuthModal();
  } catch (err) {
    showAuthError(err);
  }
});

function showAuthError(err) {
  const map = {
    "auth/invalid-credential": "Email atau kata sandi salah.",
    "auth/email-already-in-use": "Email sudah terdaftar. Coba masuk.",
    "auth/weak-password": "Kata sandi minimal 6 karakter.",
    "auth/invalid-email": "Format email tidak valid.",
    "auth/popup-closed-by-user": "Login dibatalkan."
  };
  const box = $("#authError");
  box.textContent = map[err.code] || "Terjadi kesalahan. Coba lagi.";
  box.classList.remove("hidden");
}

function renderAuthArea() {
  const el = $("#authArea");
  if (currentUser) {
    const initial = (currentUser.displayName || currentUser.email || "?")[0].toUpperCase();
    el.innerHTML = `<button class="avatar-btn" id="userMenuBtn" title="${escapeHtml(currentUser.displayName || currentUser.email)}">
      ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" alt="">` : initial}
    </button>`;
    $("#userMenuBtn").addEventListener("click", async () => {
      if (confirm("Keluar dari akun?")) await signOut(auth);
    });
  } else {
    el.innerHTML = `<button class="btn btn--primary" id="loginBtn">Masuk</button>`;
    $("#loginBtn").addEventListener("click", openAuthModal);
  }
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  renderAuthArea();
});

/* ---------------------------------------------------------
   SOURCE MODAL UI
--------------------------------------------------------- */
function renderSourceModalState() {
  $$(".source-item").forEach(el => el.classList.toggle("active", el.dataset.source === Source.current));
  const komikuOk = !!Source.komikuProxy;
  $("#komikuStatus").textContent = komikuOk ? "Terhubung" : "Belum diatur";
  $("#komikuStatus").classList.toggle("ok", komikuOk);
  $("#komikuSetup").classList.toggle("hidden", Source.current !== "komiku");
  $("#komikuProxyInput").value = Source.komikuProxy;
}

$("#sourceToggleBtn").addEventListener("click", () => {
  renderSourceModalState();
  $("#sourceModal").classList.remove("hidden");
});
$("#sourceModalClose").addEventListener("click", () => $("#sourceModal").classList.add("hidden"));
$("#sourceModal").addEventListener("click", e => { if (e.target.id === "sourceModal") $("#sourceModal").classList.add("hidden"); });

$$(".source-item").forEach(el => {
  el.addEventListener("click", () => {
    Source.current = el.dataset.source;
    updateSourceChip();
    renderSourceModalState();
    if (Source.current === "mangadex") {
      $("#sourceModal").classList.add("hidden");
      location.hash = "#/home";
      route();
    }
  });
});
$("#komikuProxySave").addEventListener("click", () => {
  Source.komikuProxy = $("#komikuProxyInput").value.trim();
  renderSourceModalState();
  toast(Source.komikuProxy ? "Proxy Komiku disimpan" : "URL proxy dikosongkan");
  route();
});
$("#komikuUseSameOrigin").addEventListener("click", () => {
  $("#komikuProxyInput").value = window.location.origin;
  Source.komikuProxy = window.location.origin;
  renderSourceModalState();
  toast("Memakai /api/* dari domain ini");
  route();
});

/* ---------------------------------------------------------
   MOBILE NAV
--------------------------------------------------------- */
$("#navToggle").addEventListener("click", () => $("#mobileNav").classList.toggle("open"));

/* ---------------------------------------------------------
   RANDOM MANGA ("Acak")
--------------------------------------------------------- */
async function goRandom() {
  if (Source.current !== "mangadex") {
    toast("Fitur acak baru tersedia untuk sumber MangaDex");
    return;
  }
  try {
    toast("Mencari komik acak…", 1500);
    const m = await MangaDex.random();
    location.hash = `#/manga/${m.source}/${encodeURIComponent(m.id)}`;
  } catch (err) {
    toast("Gagal mengambil komik acak, coba lagi.");
  }
}
$("#randomBtn").addEventListener("click", goRandom);
$("#randomBtnMobile").addEventListener("click", goRandom);

/* ---------------------------------------------------------
   ROUTER
--------------------------------------------------------- */
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => { updateSourceChip(); route(); });

function parseHash() {
  const hash = location.hash.replace(/^#\//, "");
  return hash.split("/").filter(Boolean).map(decodeURIComponent);
}

async function route() {
  $("#mobileNav").classList.remove("open");
  window.scrollTo(0, 0);
  const [page, ...rest] = parseHash();
  $$(".topnav a").forEach(a => a.classList.toggle("active", a.dataset.route === (page || "home")));

  try {
    if (!page || page === "home") return renderHome();
    if (page === "browse") return renderBrowse(rest[0] || Source.current);
    if (page === "search") return renderSearch(rest[0] || "");
    if (page === "manga") return renderDetail(rest[0], rest[1]);
    if (page === "read") return renderReader(rest[0], rest[1], rest[2]);
    if (page === "library") return renderLibrary();
    if (page === "history") return renderHistory();
    appEl.innerHTML = stateBox({ title: "Halaman tidak ditemukan", desc: "Coba kembali ke beranda." , actionLabel:"Ke Beranda", actionHref:"#/home"});
  } catch (err) {
    console.error(err);
    renderErrorState(err);
  }
}

function renderErrorState(err) {
  if (err && err.code === "KOMIKU_NOT_CONFIGURED") {
    appEl.innerHTML = stateBox({
      icon: "源",
      title: "Proxy Komiku belum diatur",
      desc: "Komiku tidak menyediakan API publik. Deploy komiku-proxy/ (folder Node.js yang disertakan) lalu masukkan URL-nya lewat tombol sumber di pojok kanan atas."
    });
    return;
  }
  appEl.innerHTML = stateBox({
    icon: "!",
    title: "Gagal memuat data",
    desc: err.message || "Terjadi kesalahan jaringan. Coba lagi sebentar lagi."
  });
}

/* ---------------------------------------------------------
   RENDER: HOME
--------------------------------------------------------- */
async function renderHome() {
  appEl.innerHTML = `
    <div id="heroBox">${skeletonGrid(1).replace('grid','hidden')}<div class="hero"><div class="hero__scrim"></div><div class="hero__content"><div class="hero__eyebrow">Memuat…</div></div></div></div>
    <section class="section"><div class="section__head"><h2 class="section__title">Terpopuler <small>${Source.current.toUpperCase()}</small></h2></div>${skeletonGrid(12)}</section>
    <section class="section"><div class="section__head"><h2 class="section__title">Update Terbaru</h2></div>${skeletonGrid(12)}</section>
  `;
  const adapter = adapterFor(Source.current);
  const [popular, latest] = await Promise.all([adapter.popular(), adapter.latest()]);

  const heroPick = popular[0];
  appEl.innerHTML = `
    ${heroPick ? `
    <div class="hero">
      <div class="hero__bg" style="background-image:url('${heroPick.cover}')"></div>
      <div class="hero__scrim"></div>
      <div class="hero__content">
        <div class="hero__eyebrow">Peringkat #1 · ${Source.current === "komiku" ? "Komiku" : "MangaDex"}</div>
        <h1 class="hero__title">${escapeHtml(heroPick.title)}</h1>
        <p class="hero__desc">${escapeHtml((heroPick.description || "").slice(0, 220))}${(heroPick.description || "").length > 220 ? "…" : ""}</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#/manga/${heroPick.source}/${encodeURIComponent(heroPick.id)}">Baca Sekarang</a>
          <a class="btn btn--ghost" href="#/browse/${Source.current}">Jelajahi Semua</a>
        </div>
      </div>
    </div>` : ""}

    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Terpopuler <small>${Source.current.toUpperCase()}</small></h2>
        <a class="section__more" href="#/browse/${Source.current}">Lihat semua →</a>
      </div>
      ${cardGrid(popular, { ranked: true })}
    </section>

    <section class="section">
      <div class="section__head"><h2 class="section__title">Update Terbaru</h2></div>
      ${cardGrid(latest)}
    </section>
  `;
}

function cardGrid(items, { ranked = false } = {}) {
  if (!items.length) return stateBox({ title: "Tidak ada data", desc: "Belum ada komik untuk ditampilkan." });
  return `<div class="grid grid--wide">` + items.map((m, i) => `
    <a class="card" href="#/manga/${m.source}/${encodeURIComponent(m.id)}">
      <span class="card__source ${m.source}">${m.source === "komiku" ? "Komiku" : "MangaDex"}</span>
      ${ranked ? `<span class="card__rank">${i + 1}</span>` : ""}
      <img class="card__cover" loading="lazy" src="${m.cover || ""}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22><rect width=%22200%22 height=%22300%22 fill=%22%231c1914%22/></svg>'" alt="${escapeHtml(m.title)}">
      <div class="card__body">
        <div class="card__title">${escapeHtml(m.title)}</div>
        <div class="card__meta"><span>${escapeHtml(m.status || "")}</span><span>${m.lastChapter ? "Ch. " + escapeHtml(String(m.lastChapter)) : ""}</span></div>
      </div>
    </a>`).join("") + `</div>`;
}

/* ---------------------------------------------------------
   RENDER: BROWSE (genre filter, mangadex only for now)
--------------------------------------------------------- */
async function renderBrowse(source) {
  if (source !== Source.current) Source.current = source;
  updateSourceChip();
  appEl.innerHTML = `
    <div class="section__head"><h2 class="section__title">Jelajah <small>${source.toUpperCase()}</small></h2></div>
    <div class="chip-row" id="genreChips"></div>
    <div id="browseGrid">${skeletonGrid(18)}</div>
    <div id="loadMoreWrap" style="text-align:center;margin-top:22px;"></div>
  `;
  const adapter = adapterFor(source);

  // browse pagination state (MangaDex only — Komiku proxy returns one page)
  let activeTag = "";
  let offset = 0;
  const PAGE_SIZE = 24;

  async function fetchPage(reset) {
    if (reset) offset = 0;
    const fn = activeTag
      ? MangaDex.byGenre(activeTag, PAGE_SIZE, offset)
      : adapter.popular(PAGE_SIZE, offset);
    const results = await fn;
    return results;
  }

  function renderLoadMore(hasResults) {
    const wrap = $("#loadMoreWrap");
    if (source !== "mangadex" || !hasResults) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = `<button class="btn btn--ghost" id="loadMoreBtn" style="width:auto;padding:11px 24px;">Muat lebih banyak</button>`;
    $("#loadMoreBtn").addEventListener("click", async () => {
      $("#loadMoreBtn").textContent = "Memuat…";
      $("#loadMoreBtn").disabled = true;
      offset += PAGE_SIZE;
      try {
        const more = await fetchPage(false);
        if (!more.length) { $("#loadMoreWrap").innerHTML = `<p style="color:var(--paper-dim);font-size:13px;">Tidak ada lagi hasil.</p>`; return; }
        $("#browseGrid").insertAdjacentHTML("beforeend", cardGrid(more).replace(/^<div class="grid grid--wide">|<\/div>$/g, ""));
        renderLoadMore(true);
      } catch (err) {
        toast("Gagal memuat lebih banyak");
        renderLoadMore(true);
      }
    });
  }

  const first = await fetchPage(true);
  $("#browseGrid").innerHTML = cardGrid(first);
  renderLoadMore(first.length > 0);

  if (source === "mangadex") {
    try {
      const tags = await MangaDex.tags();
      const chipsEl = $("#genreChips");
      chipsEl.innerHTML = `<button class="chip active" data-tag="">Semua</button>` +
        tags.slice(0, 24).map(t => `<button class="chip" data-tag="${t.id}">${escapeHtml(t.name)}</button>`).join("");
      chipsEl.addEventListener("click", async e => {
        const btn = e.target.closest("button[data-tag]");
        if (!btn) return;
        $$(".chip", chipsEl).forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        activeTag = btn.dataset.tag;
        $("#browseGrid").innerHTML = skeletonGrid(18);
        const results = await fetchPage(true);
        $("#browseGrid").innerHTML = cardGrid(results);
        renderLoadMore(results.length > 0);
      });
    } catch { /* genre chips are optional */ }
  } else if (source === "komiku" && Source.komikuProxy) {
    try {
      const genres = await Komiku.genres();
      const chipsEl = $("#genreChips");
      chipsEl.innerHTML = `<button class="chip active" data-tag="">Semua</button>` +
        genres.map(g => `<button class="chip" data-tag="${g.id}">${escapeHtml(g.name)}</button>`).join("");
      chipsEl.addEventListener("click", async e => {
        const btn = e.target.closest("button[data-tag]");
        if (!btn) return;
        $$(".chip", chipsEl).forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        $("#browseGrid").innerHTML = skeletonGrid(18);
        const results = btn.dataset.tag ? await Komiku.byGenre(btn.dataset.tag) : await Komiku.popular();
        $("#browseGrid").innerHTML = cardGrid(results);
        $("#loadMoreWrap").innerHTML = ""; // no pagination for Komiku genre pages
      });
    } catch { /* genre chips are optional */ }
  }
}

/* ---------------------------------------------------------
   RENDER: SEARCH
--------------------------------------------------------- */
async function renderSearch(q) {
  appEl.innerHTML = `<div class="section__head"><h2 class="section__title">Hasil pencarian: <small>"${escapeHtml(q)}"</small></h2></div>${skeletonGrid(18)}`;
  const adapter = adapterFor(Source.current);
  const results = q ? await adapter.search(q) : [];
  $("#app").innerHTML = `<div class="section__head"><h2 class="section__title">Hasil pencarian: <small>"${escapeHtml(q)}"</small></h2></div>` +
    (results.length ? cardGrid(results) : stateBox({ title: "Tidak ditemukan", desc: `Tidak ada hasil untuk "${q}" di sumber ${Source.current}.` }));
}

$("#searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
});

/* ---------------------------------------------------------
   RENDER: DETAIL
--------------------------------------------------------- */
async function renderDetail(source, id) {
  appEl.innerHTML = `<div class="detail"><div><div class="skeleton" style="aspect-ratio:2/3;border-radius:12px;"></div></div><div><div class="skeleton" style="height:40px;width:70%;margin-bottom:14px;border-radius:6px;"></div><div class="skeleton" style="height:100px;border-radius:6px;"></div></div></div>`;

  let manga, chapters;
  if (source === "komiku") {
    const data = await Komiku.detail(id);
    manga = data.manga;
    chapters = data.chapters.map(c => ({ id: c.id, chapter: c.chapter, title: c.title || "" }));
  } else {
    manga = await MangaDex.detail(id);
    chapters = await MangaDex.chapters(id);
  }

  const [inLib, hist] = await Promise.all([isInLibrary(source, id), getHistoryFor(source, id)]);

  appEl.innerHTML = `
    <div class="detail">
      <div>
        <div class="detail__cover"><img src="${manga.cover}" alt="${escapeHtml(manga.title)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22360%22><rect width=%22240%22 height=%22360%22 fill=%22%231c1914%22/></svg>'"></div>
        <div class="detail__actions">
          <button class="btn btn--primary" id="libBtn">${inLib ? "★ Di Rak Saya" : "☆ Tambah ke Rak"}</button>
        </div>
        ${hist ? `<a class="btn btn--ghost" style="margin-top:10px" href="#/read/${source}/${encodeURIComponent(id)}/${encodeURIComponent(hist.chapterId)}">Lanjut Ch. ${escapeHtml(String(hist.chapterTitle || ""))}</a>` : ""}
      </div>
      <div>
        <span class="card__source ${source}" style="position:static; display:inline-flex; margin-bottom:10px;">${source === "komiku" ? "Komiku" : "MangaDex"}</span>
        <h1 class="detail__title">${escapeHtml(manga.title)}</h1>
        ${manga.altTitles?.length ? `<div class="detail__alt">${escapeHtml(manga.altTitles.join(" · "))}</div>` : ""}
        <div class="detail__tags">
          ${manga.status ? `<span class="tag status-${escapeHtml(manga.status)}">${escapeHtml(manga.status)}</span>` : ""}
          ${manga.year ? `<span class="tag">${manga.year}</span>` : ""}
          ${(manga.tags || []).slice(0, 8).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <p class="detail__desc">${escapeHtml(manga.description || "Belum ada sinopsis.")}</p>
        <div class="detail__stats">
          <div><b>${chapters.length}</b><span>Chapter</span></div>
          ${manga.author ? `<div><b style="font-size:14px">${escapeHtml(manga.author)}</b><span>Penulis</span></div>` : ""}
        </div>

        <div class="chapter-list">
          <div class="section__head"><h2 class="section__title" style="font-size:20px">Daftar Chapter <small>${chapters.length}</small></h2>
            <button class="section__more" id="sortChaptersBtn" style="background:none;border:none;cursor:pointer;">↕ Urutkan</button>
          </div>
          <div class="chapter-search">
            <input id="chapterFilterInput" type="search" placeholder="Cari nomor chapter…">
          </div>
          <div id="chapterListEl">${renderChapterRows([...chapters].reverse(), source, id)}</div>
        </div>
      </div>
    </div>
  `;

  $("#libBtn").addEventListener("click", async () => {
    if (inLib) { await removeFromLibrary(source, id); }
    else { await addToLibrary(manga); }
    renderDetail(source, id);
  });

  let descending = true; // default: chapter terbaru di atas
  let filterQuery = "";

  function refreshChapterList() {
    let list = chapters;
    if (filterQuery) {
      list = list.filter(c =>
        String(c.chapter ?? "").toLowerCase().includes(filterQuery) ||
        String(c.title ?? "").toLowerCase().includes(filterQuery)
      );
    }
    list = [...list];
    if (descending) list.reverse();
    $("#chapterListEl").innerHTML = renderChapterRows(list, source, id);
  }

  $("#sortChaptersBtn").addEventListener("click", () => {
    descending = !descending;
    $("#sortChaptersBtn").textContent = descending ? "↕ Terbaru dulu" : "↕ Terlama dulu";
    refreshChapterList();
  });

  $("#chapterFilterInput").addEventListener("input", e => {
    filterQuery = e.target.value.trim().toLowerCase();
    refreshChapterList();
  });
}

function renderChapterRows(chapters, source, mangaId) {
  if (!chapters.length) return stateBox({ title: "Belum ada chapter", desc: "Coba kata kunci lain, atau chapter memang belum tersedia." });
  return chapters.map(c => `
    <a class="chapter-row" href="#/read/${source}/${encodeURIComponent(mangaId)}/${encodeURIComponent(c.id)}">
      <div class="chapter-row__num">${escapeHtml(String(c.chapter ?? "-"))}</div>
      <div class="chapter-row__info">
        <div class="chapter-row__title">Chapter ${escapeHtml(String(c.chapter ?? "-"))}${c.title ? " — " + escapeHtml(c.title) : ""}</div>
        <div class="chapter-row__meta">${c.group ? escapeHtml(c.group) : ""} ${c.publishAt ? "· " + new Date(c.publishAt).toLocaleDateString("id-ID") : ""}</div>
      </div>
    </a>
  `).join("");
}

/* ---------------------------------------------------------
   RENDER: READER
--------------------------------------------------------- */
async function renderReader(source, mangaId, chapterId) {
  // navigating chapter-to-chapter re-runs this function without a hashchange
  // cleanup event firing first (same #/read/ prefix), so clear old listeners here.
  if (route._readerKeydownCleanup) { route._readerKeydownCleanup(); route._readerKeydownCleanup = null; }
  window.onscroll = null;

  appEl.innerHTML = `<div class="reader"><div class="reader__topbar"><span class="reader__title">Memuat halaman…</span></div><div class="reader__pages">${Array.from({length:3}).map(()=>'<div class="skeleton reader__page-loading"></div>').join('')}</div></div>`;

  const adapter = adapterFor(source);
  const [pages, manga, chapters] = await Promise.all([
    adapter.pages(chapterId),
    adapter.detail ? adapter.detail(mangaId).then(d => d.manga || d) : null,
    source === "mangadex" ? MangaDex.chapters(mangaId) : (await Komiku.detail(mangaId)).chapters
  ]);

  const idx = chapters.findIndex(c => c.id === chapterId);
  const prevCh = idx > 0 ? chapters[idx - 1] : null;
  const nextCh = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const curCh = idx >= 0 ? chapters[idx] : { chapter: "?" };

  const widthMode = localStorage.getItem("ninzy:readerWidth") || "normal";
  const prevHref = prevCh ? `#/read/${source}/${encodeURIComponent(mangaId)}/${encodeURIComponent(prevCh.id)}` : null;
  const nextHref = nextCh ? `#/read/${source}/${encodeURIComponent(mangaId)}/${encodeURIComponent(nextCh.id)}` : null;

  appEl.innerHTML = `
    <div class="reader__progress" id="readerProgress" style="width:0%"></div>
    <div class="reader">
      <div class="reader__topbar">
        <a class="btn btn--ghost" href="#/manga/${source}/${encodeURIComponent(mangaId)}">← Detail</a>
        <span class="reader__title">${escapeHtml(manga?.title || "")} · Ch. ${escapeHtml(String(curCh.chapter))}</span>
        <button class="btn btn--ghost" id="widthToggleBtn" style="width:auto;padding:8px 12px;font-size:12px;flex-shrink:0;" title="Lebar halaman">${widthMode === "wide" ? "↔ Lebar" : "↕ Normal"}</button>
        <span id="pageCounter" style="font-size:12.5px;color:var(--paper-dim);flex-shrink:0;">0/${pages.length}</span>
      </div>
      <div class="reader__pages ${widthMode === "wide" ? "wide" : ""}" id="pagesWrap">
        ${pages.map((src, i) => `<img data-i="${i}" loading="lazy" src="${src}" alt="Halaman ${i + 1}" onerror="this.style.opacity=0.3">`).join("")}
      </div>
      <div class="reader__nav">
        ${prevHref ? `<a class="btn btn--ghost" href="${prevHref}">‹ Ch. ${escapeHtml(String(prevCh.chapter))}</a>` : `<span></span>`}
        <a class="btn btn--primary" href="#/manga/${source}/${encodeURIComponent(mangaId)}">Daftar Chapter</a>
        ${nextHref ? `<a class="btn btn--ghost" href="${nextHref}">Ch. ${escapeHtml(String(nextCh.chapter))} ›</a>` : `<span></span>`}
      </div>
    </div>
    <button id="backToTopBtn" class="chip" style="position:fixed;bottom:80px;right:20px;z-index:45;display:none;">↑ Atas</button>
  `;

  $("#widthToggleBtn").addEventListener("click", () => {
    const next = widthMode === "wide" ? "normal" : "wide";
    localStorage.setItem("ninzy:readerWidth", next);
    $("#pagesWrap").classList.toggle("wide", next === "wide");
    $("#widthToggleBtn").textContent = next === "wide" ? "↔ Lebar" : "↕ Normal";
  });

  $("#backToTopBtn").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  function onReaderKeydown(e) {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight" && nextHref) location.hash = nextHref;
    if (e.key === "ArrowLeft" && prevHref) location.hash = prevHref;
  }
  document.addEventListener("keydown", onReaderKeydown);
  route._readerKeydownCleanup = () => document.removeEventListener("keydown", onReaderKeydown);

  // Save reading history (debounced on scroll)
  if (currentUser && manga) {
    saveHistory({
      source, mangaId, title: manga.title, cover: manga.cover,
      chapterId, chapterTitle: String(curCh.chapter)
    });
  }

  const pagesWrap = $("#pagesWrap");
  const imgs = $$("img", pagesWrap);
  const progress = $("#readerProgress");
  const counter = $("#pageCounter");
  const backToTop = $("#backToTopBtn");
  let lastSaved = 0;
  window.onscroll = () => {
    const scrollTop = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? Math.min(100, (scrollTop / docH) * 100) : 0;
    progress.style.width = pct + "%";
    backToTop.style.display = scrollTop > 600 ? "block" : "none";
    let current = 0;
    imgs.forEach((img, i) => { if (img.getBoundingClientRect().top < window.innerHeight * 0.6) current = i + 1; });
    counter.textContent = `${current}/${imgs.length}`;
    if (currentUser && manga && Date.now() - lastSaved > 4000) {
      lastSaved = Date.now();
      saveHistory({ source, mangaId, title: manga.title, cover: manga.cover, chapterId, chapterTitle: String(curCh.chapter), page: current });
    }
  };
}

/* cleanup reader-only listeners (scroll + keyboard nav) when leaving the reader */
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#/read/")) {
    window.onscroll = null;
    if (route._readerKeydownCleanup) { route._readerKeydownCleanup(); route._readerKeydownCleanup = null; }
  }
});

/* ---------------------------------------------------------
   RENDER: LIBRARY
--------------------------------------------------------- */
function renderLoggedOutState(title, desc) {
  appEl.innerHTML = `<div class="state-box">
    <div class="seal-lg">忍</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(desc)}</p>
    <button class="btn btn--primary" id="loggedOutAuthBtn" style="width:auto;margin:16px auto 0;padding:10px 20px;">Masuk</button>
  </div>`;
  $("#loggedOutAuthBtn").addEventListener("click", openAuthModal);
}

async function renderLibrary() {
  if (!currentUser) {
    renderLoggedOutState("Masuk untuk melihat Rak Saya", "Simpan komik favoritmu setelah masuk akun.");
    return;
  }
  appEl.innerHTML = `<div class="section__head"><h2 class="section__title">Rak Saya</h2></div><div id="libList">${skeletonGrid(6).replace(/skel-card/g,'')}</div>`;
  const items = await getLibrary();
  $("#libList").innerHTML = items.length ? items.map(m => `
    <div class="lib-item">
      <img src="${m.cover || ""}" alt="">
      <div class="lib-item__info">
        <a href="#/manga/${m.source}/${encodeURIComponent(m.mangaId)}" class="lib-item__title">${escapeHtml(m.title)}</a>
        <div class="lib-item__meta">${m.source === "komiku" ? "Komiku" : "MangaDex"}</div>
      </div>
      <button class="lib-item__remove" data-source="${m.source}" data-id="${m.mangaId}">&times;</button>
    </div>
  `).join("") : stateBox({ title: "Rak masih kosong", desc: "Tambahkan komik dari halaman detail." , actionLabel:"Jelajahi", actionHref:"#/browse/mangadex"});

  $$(".lib-item__remove").forEach(btn => btn.addEventListener("click", async () => {
    await removeFromLibrary(btn.dataset.source, btn.dataset.id);
    renderLibrary();
  }));
}

/* ---------------------------------------------------------
   RENDER: HISTORY
--------------------------------------------------------- */
async function renderHistory() {
  if (!currentUser) {
    renderLoggedOutState("Masuk untuk melihat Riwayat", "Riwayat baca tersimpan otomatis setelah masuk akun.");
    return;
  }
  appEl.innerHTML = `<div class="section__head"><h2 class="section__title">Riwayat Baca</h2></div><div id="histList">${skeletonGrid(6).replace(/skel-card/g,'')}</div>`;
  const items = await getHistory();
  $("#histList").innerHTML = items.length ? items.map(m => `
    <div class="lib-item">
      <img src="${m.cover || ""}" alt="">
      <div class="lib-item__info">
        <a href="#/read/${m.source}/${encodeURIComponent(m.mangaId)}/${encodeURIComponent(m.chapterId)}" class="lib-item__title">${escapeHtml(m.title)}</a>
        <div class="lib-item__meta">Terakhir: Ch. ${escapeHtml(String(m.chapterTitle || ""))} · ${new Date(m.updatedAt).toLocaleString("id-ID")}</div>
      </div>
    </div>
  `).join("") : stateBox({ title: "Belum ada riwayat", desc: "Mulai baca komik untuk melihatnya di sini.", actionLabel:"Jelajahi", actionHref:"#/browse/mangadex" });
}
