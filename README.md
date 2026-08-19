# Ninzy Core

Website baca manga/manhwa/manhua yang menggabungkan:
- **MangaDex** — lewat API resmi mereka (`api.mangadex.org`), langsung jalan tanpa setup tambahan.
- **Komiku** — lewat proxy server kecil yang disertakan (`komiku-proxy/`), karena Komiku **tidak** punya API publik/CORS-terbuka sehingga tidak bisa dipanggil langsung dari browser.

Fitur:
- Beranda: hero, terpopuler, update terbaru
- Jelajah + filter genre (MangaDex & Komiku) dengan pagination "Muat lebih banyak"
- Pencarian judul
- Komik acak ("🎲 Acak", MangaDex)
- Halaman detail: sinopsis, tag/genre, status, daftar chapter dengan **pencarian nomor chapter** & sort naik/turun
- Reader scroll-vertikal dengan progress bar, halaman lazy-load, navigasi chapter sebelumnya/selanjutnya, **navigasi keyboard (←/→)**, toggle lebar halaman, tombol kembali ke atas
- Login Google & Email/Password lewat Firebase Auth
- Rak Saya (bookmark) & Riwayat baca + tombol "Lanjut baca" tersimpan di Firestore per akun
- **3 sumber**: MangaDex (langsung aktif), Komiku (proxy scraper siap pakai), Shinigami (proxy — butuh API upstream sendiri, lihat catatan di bawah)
- Bisa di-install sebagai PWA ringan (manifest.json + favicon)
- Responsif mobile, tema gelap "hanko ink"

## Menjalankan secara lokal

Folder ini murni HTML/CSS/JS (tanpa build step), jadi cukup buka dengan server statis apa pun, misalnya:

```bash
cd ninzy-core
npx serve .
# atau: python3 -m http.server 8080
```

Lalu buka `http://localhost:8080` (atau port yang ditampilkan).

> Jangan buka `index.html` langsung lewat `file://` — modul ES (`type="module"`) dan Firebase butuh server HTTP.

## Deploy

### Opsi A — Vercel (disarankan, satu klik untuk frontend + API Komiku/Shinigami)

Repo ini sudah dilengkapi `vercel.json`, `package.json`, dan folder `api/` (serverless functions, terbagi jadi `api/komiku/` dan `api/shinigami/`) yang menjalankan proxy sumber-sumber non-MangaDex di domain yang sama — jadi tidak perlu hosting Node terpisah untuk Komiku.

```bash
npm install -g vercel
cd ninzy-core
vercel        # ikuti prompt, lalu:
vercel --prod
```

Atau lewat dashboard: **New Project → Import** folder ini (atau push ke GitHub dulu lalu import repo-nya). Vercel otomatis mendeteksi `index.html` sebagai static site dan folder `api/` sebagai serverless functions — tidak perlu isi Build Command/Output Directory apa pun.

Setelah deploy selesai, untuk **Komiku**: buka situsnya → tombol sumber (kanan atas) → pilih **Komiku** → klik **"Pakai domain situs ini"** → **Simpan**. Langsung aktif.

Untuk **Shinigami**, ada langkah tambahan karena butuh API upstream (lihat bagian "Mengaktifkan sumber Komiku & Shinigami" di bawah untuk penjelasan lengkap kenapa) — set environment variable `SHINIGAMI_API_BASE` di Project Settings Vercel dulu, redeploy, baru klik "Pakai domain situs ini" untuk Shinigami di modal sumber.

> Ingat: `komiku-proxy/` dan `shinigami-proxy/` (Express) sengaja **dibiarkan sebagai alternatif** kalau kamu tidak pakai Vercel dan ingin proxy sendiri di Render/Railway/VPS — logikanya sama persis dengan yang ada di `api/`.

### Opsi B — Firebase Hosting

Karena project ini statis, bisa juga dipakai:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # pilih project "ninzy-motion", public directory = folder ini
firebase deploy
```

> Catatan: Firebase Hosting tidak menjalankan folder `api/` (itu format Vercel Functions). Kalau deploy ke Firebase Hosting dan tetap mau sumber Komiku, jalankan `komiku-proxy/` secara terpisah (lihat bagian "Mengaktifkan sumber Komiku" di bawah) dan tempel URL-nya manual.

### Opsi C — Vercel/Netlify/GitHub Pages lain

Sama saja karena semuanya statis untuk bagian frontend-nya.

## Setup Firebase (auth & data)

Di [Firebase Console](https://console.firebase.google.com/) project **ninzy-motion**:

1. **Authentication → Sign-in method** → aktifkan **Google** dan **Email/Password**.
2. **Firestore Database** → buat database (mode production), lalu set rules seperti ini supaya tiap user hanya bisa baca/tulis datanya sendiri:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Kalau login Google gagal dengan error domain, tambahkan domain hosting kamu di **Authentication → Settings → Authorized domains**.

## Mengaktifkan sumber Komiku & Shinigami (opsional)

MangaDex langsung aktif tanpa setup. Komiku dan Shinigami sama-sama butuh "proxy" karena tidak punya API publik ber-CORS — tapi sifatnya beda jauh, baca baik-baik sebelum pilih Shinigami.

### Komiku — mudah, sudah pasti bisa jalan

**Cara termudah — otomatis kalau deploy ke Vercel:** klik tombol sumber (kanan atas) → **Komiku** → **"Pakai domain situs ini"**. Selesai, karena `api/komiku/*` sudah ikut ter-deploy satu domain dengan frontend.

**Cara manual (di luar Vercel):**
1. `cd komiku-proxy && npm install && npm start` (jalan di `http://localhost:8787`)
2. Deploy folder itu ke Render/Railway/Fly.io/VPS.
3. Di modal sumber, pilih **Komiku** → tempel URL proxy publikmu → **Simpan**.

Baik `komiku-proxy/server.js` maupun `api/komiku/*.js` bekerja dengan scraping HTML (Komiku server-rendered, jadi ini reliable). Selector-nya bisa perlu disesuaikan kalau Komiku mengubah tampilan situsnya — cek `api/_lib/komiku.js`.

### Shinigami — butuh usaha ekstra, **tidak otomatis jalan out-of-the-box**

Ini catatan jujur, bukan basa-basi: situs Shinigami saat ini (`app.shinigami.asia`, yang juga sudah ganti domain belasan kali dalam setahun terakhir) adalah **single-page app** — HTML yang diterima server itu kosong, semua data manga/chapter dimuat belakangan lewat JavaScript yang memanggil API backend Shinigami sendiri. Itu artinya:

- Teknik scraping ala Komiku (fetch HTML + Cheerio) **tidak akan berhasil** untuk Shinigami, karena kontennya baru muncul setelah JS jalan.
- Shinigami juga memakai proteksi Cloudflare, jadi memanggil endpoint backend-nya langsung pun bisa diblokir tanpa fingerprint browser asli.

Karena itu `api/shinigami/*.js` dan `shinigami-proxy/server.js` **bukan** scraper siap pakai — keduanya adalah jembatan "bring your own upstream API": kamu perlu mengarahkannya ke sebuah API JSON yang sudah tahu cara bicara ke Shinigami, lewat environment variable `SHINIGAMI_API_BASE`. Sampai variabel itu diisi, semua endpoint `/api/shinigami/*` akan mengembalikan error 501 yang jelas (bukan data palsu).

Opsi yang bisa kamu coba (pihak ketiga, **belum kami verifikasi** — cek dulu kodenya sebelum mempercayakan trafik ke sana):
- [`Sansekai/Unofficial-Shinigami-Api`](https://github.com/Sansekai/Unofficial-Shinigami-Api)
- [`AzwarKusumah/ryukoapi-shinigami`](https://github.com/AzwarKusumah/ryukoapi-shinigami)

Atau opsi paling solid: reverse-engineer sendiri endpoint JSON Shinigami lewat tab Network di DevTools saat membuka situsnya, lalu arahkan `SHINIGAMI_API_BASE` ke situ, dan sesuaikan nama field di `api/_lib/shinigami.js` (fungsi `normalizeCard`/`normalizeChapter`) dan path endpoint di tiap `api/shinigami/*.js` (ada komentar `// TODO` di tiap file) supaya cocok dengan bentuk respons API pilihanmu.

**Cara set env var di Vercel:** Project Settings → Environment Variables → tambah `SHINIGAMI_API_BASE` = URL API upstream pilihanmu → redeploy.
**Cara lokal:** `SHINIGAMI_API_BASE=https://upstream-pilihanmu.com npm start` di folder `shinigami-proxy/`.

### Catatan umum untuk keduanya
- Daftar genre Komiku (`KOMIKU_GENRES`) di-hardcode di `api/_lib/komiku.js` karena Komiku tidak mengeksposnya lewat API.
- Fitur "Muat lebih banyak" & "Acak" saat ini hanya jalan untuk sumber MangaDex.
- Gunakan secukupnya untuk keperluan pribadi/belajar, hormati `robots.txt`/ToS masing-masing situs, dan jangan jadikan proxy publik dengan trafik besar mengatasnamakan orang lain.

## Struktur proyek

```
ninzy-core/
├── index.html          # shell halaman + modal auth/sumber
├── style.css            # design system "hanko ink"
├── app.js                # router, adapter MangaDex/Komiku/Shinigami, Firebase, reader
├── manifest.json         # metadata PWA ringan
├── vercel.json            # konfigurasi deploy Vercel (headers, function config)
├── package.json           # dependency untuk serverless functions (cheerio)
├── api/                    # proxy sumber non-MangaDex sebagai Vercel Serverless Functions
│   ├── _lib/komiku.js        # logika scraping Komiku
│   ├── _lib/shinigami.js     # jembatan "bring your own API" untuk Shinigami
│   ├── komiku/                 # /api/komiku/latest, popular, search, detail, pages, genres, genre
│   └── shinigami/               # /api/shinigami/... (endpoint sama, perlu SHINIGAMI_API_BASE)
├── komiku-proxy/            # ALTERNATIF: proxy Komiku standalone (Express), untuk hosting di luar Vercel
│   ├── server.js
│   └── package.json
└── shinigami-proxy/          # ALTERNATIF: bridge Shinigami standalone (Express)
    ├── server.js
    └── package.json
```

## Troubleshooting

**`net::ERR_CERT_COMMON_NAME_INVALID` saat memanggil `api.mangadex.org`**
Ini bukan bug di kode — artinya browser menerima sertifikat HTTPS yang tidak cocok dengan domain MangaDex, tanda klasik koneksi sedang di-*intercept* di level jaringan (ISP dengan DNS/TLS filtering, firewall kantor/sekolah, atau antivirus dengan "HTTPS scanning"). Cara pastikan: buka `https://api.mangadex.org/manga` langsung di tab baru — kalau muncul peringatan sertifikat yang sama, itu konfirmasi jaringanmu yang memblokir, bukan situsnya atau kode Ninzy Core. Coba jaringan lain (data seluler), matikan sementara HTTPS-scan antivirus, atau ganti DNS/pakai VPN.

**CORS error yang nyebut domain situs sumber langsung** (mis. `Access to fetch at 'https://komiku.org/...' blocked by CORS`)
Ini tanda field "URL proxy" di modal sumber salah diisi dengan domain situs sumbernya sendiri (`komiku.org`, `shinigami.asia`, dst), bukan domain proxy/hosting-mu sendiri. Field itu harus diisi domain **kamu** (misalnya domain Vercel-mu, atau server proxy yang kamu deploy) — bukan domain Komiku/Shinigami. Ninzy Core sekarang otomatis memperingatkan kalau kamu mengetik domain seperti ini, dan ada tombol **"Tes koneksi"** di modal sumber untuk mengecek proxy-mu bekerja sebelum disimpan.

**"Proxy \_\_\_ belum diatur"**
Klik tombol sumber (kanan atas) → pilih sumbernya → isi/pilih URL proxy (lihat bagian "Mengaktifkan sumber Komiku & Shinigami" di atas), lalu **Simpan**.

**Error 501 dari `/api/shinigami/*`**
Berarti environment variable `SHINIGAMI_API_BASE` belum diisi di server/Vercel-mu — wajar, lihat penjelasan lengkap di bagian Shinigami di atas.

## Menambah sumber lain

Adapter dibuat modular di `app.js`:
- **MangaDex** punya adapter khusus (`MangaDex`) karena API resminya berbeda bentuk.
- Sumber lain yang perlu proxy (seperti Komiku & Shinigami) tinggal dibuat lewat `makeProxyAdapter("nama-sumber")` — otomatis dapat method `popular/latest/search/detail/pages/genres/byGenre` yang memanggil `{proxyBase}/api/nama-sumber/...`. Tambahkan entri di `SOURCE_LABELS`, `PROXY_SOURCES`, dan `adapterFor()`, lalu buat proxy-nya (folder `api/nama-sumber/` + `nama-sumber-proxy/server.js`) yang mengembalikan JSON sesuai kontrak yang didokumentasikan di komentar atas `makeProxyAdapter` pada `app.js`.
