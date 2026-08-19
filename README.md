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
- Ganti sumber (MangaDex ⇄ Komiku) lewat tombol di kanan atas
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

### Opsi A — Vercel (disarankan, satu klik untuk frontend + API Komiku)

Repo ini sudah dilengkapi `vercel.json`, `package.json`, dan folder `api/` (serverless functions) yang menjalankan proxy Komiku di domain yang sama — jadi tidak perlu hosting Node terpisah.

```bash
npm install -g vercel
cd ninzy-core
vercel        # ikuti prompt, lalu:
vercel --prod
```

Atau lewat dashboard: **New Project → Import** folder ini (atau push ke GitHub dulu lalu import repo-nya). Vercel otomatis mendeteksi `index.html` sebagai static site dan folder `api/` sebagai serverless functions — tidak perlu isi Build Command/Output Directory apa pun.

Setelah deploy selesai:
1. Buka situsnya, klik tombol sumber ("MangaDex") di kanan atas → pilih **Komiku**.
2. Klik **"Pakai domain situs ini"** (otomatis mengisi URL proxy dengan domain Vercel-mu, karena `/api/*` sudah ikut ter-deploy) → **Simpan**.
3. Selesai — sumber Komiku langsung aktif tanpa server tambahan.

> Ingat: `komiku-proxy/server.js` (Express) sengaja **dibiarkan sebagai alternatif** kalau kamu tidak pakai Vercel dan ingin proxy sendiri di Render/Railway/VPS — logikanya sama persis dengan yang ada di `api/`.

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

## Mengaktifkan sumber Komiku (opsional)

MangaDex langsung aktif tanpa setup. Untuk Komiku ada dua cara:

**Cara termudah — sudah otomatis kalau deploy ke Vercel** (lihat "Opsi A" di atas): tinggal klik "Pakai domain situs ini" di modal sumber.

**Cara manual — proxy terpisah** (kalau tidak pakai Vercel):
1. `cd komiku-proxy && npm install`
2. Jalankan lokal untuk tes: `npm start` → server jalan di `http://localhost:8787`
3. Deploy folder `komiku-proxy/` ke layanan Node hosting (Render, Railway, Fly.io, atau VPS biasa).
4. Di Ninzy Core, klik tombol sumber ("MangaDex") di kanan atas → pilih **Komiku** → tempel URL proxy publikmu → **Simpan**.

**Catatan jujur soal Komiku:** karena Komiku tidak menyediakan API resmi, baik `komiku-proxy/server.js` maupun `api/*.js` bekerja dengan cara scraping (membaca & mengurai HTML halaman Komiku) — logikanya identik, cuma dikemas beda (Express server vs Vercel Functions). Ini berarti:
- Selector CSS di dalamnya dibuat berdasarkan struktur halaman Komiku saat ini dan **bisa berhenti bekerja kalau Komiku mengubah tampilan situsnya** — cek response `/api/latest` dsb kalau hasilnya kosong, lalu sesuaikan selector di `api/_lib/komiku.js` (dan `komiku-proxy/server.js` kalau kamu pakai itu juga) — gunakan DevTools → Inspect di komiku.org untuk cari selector barunya.
- Daftar genre Komiku (`/api/genres`) di-hardcode karena Komiku tidak mengeksposnya lewat API — edit array `KOMIKU_GENRES` di `api/_lib/komiku.js` kalau perlu menambah/mengubah.
- Fitur "Muat lebih banyak" & "Acak" saat ini hanya jalan untuk sumber MangaDex; Komiku hanya menampilkan satu halaman hasil per kategori/genre.
- Gunakan secukupnya untuk keperluan pribadi/belajar, hormati `robots.txt` dan ketentuan layanan Komiku, dan jangan jadikan proxy publik dengan trafik besar mengatasnamakan orang lain.

## Struktur proyek

```
ninzy-core/
├── index.html          # shell halaman + modal auth/sumber
├── style.css            # design system "hanko ink"
├── app.js                # router, adapter MangaDex & Komiku, Firebase, reader
├── manifest.json         # metadata PWA ringan
├── vercel.json            # konfigurasi deploy Vercel (headers, function config)
├── package.json           # dependency untuk serverless functions (cheerio)
├── api/                    # proxy Komiku sebagai Vercel Serverless Functions
│   ├── _lib/komiku.js       # logika scraping bersama
│   ├── latest.js / popular.js / search.js / detail.js / pages.js / genres.js / genre.js
└── komiku-proxy/            # ALTERNATIF: proxy Komiku standalone (Express), untuk hosting di luar Vercel
    ├── server.js
    └── package.json
```

## Menambah sumber lain

Adapter dibuat modular di `app.js`. Untuk menambah sumber baru (mis. dari repo GitHub lain), buat objek adapter baru dengan method yang sama seperti `MangaDex`/`Komiku` (`popular`, `latest`, `search`, `detail`, `pages`/`chapters`), lalu daftarkan di fungsi `adapterFor()`.
