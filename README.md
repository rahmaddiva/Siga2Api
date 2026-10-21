# Siga2Api

Penampil data laporan **SIGA** (BKKBN / Kementerian Kependudukan dan Pembangunan Keluarga)
untuk **Kabupaten Tanah Laut, Provinsi Kalimantan Selatan**.

Web statis (Vite + React + Tailwind v4 + shadcn/ui) yang membaca snapshot JSON hasil panen
laporan dari API SIGA. Tidak ada token, tidak ada backend, tidak ada data perorangan.

Snapshot statis berisi angka **tingkat kabupaten** (baris = kecamatan). Untuk melihat rincian
**per desa**, aplikasi meminta laporan satu kecamatan langsung ke gateway SIGA saat halaman
dibuka — lihat [Rincian per desa](#rincian-per-desa-kecamatan--desa).

---

## Apa yang ditampilkan

Empat modul, masing-masing dengan katalog tabelnya sendiri:

| Modul | Isi | Contoh tabel |
|---|---|---|
| **YAN KB** | Tempat pelayanan KB, pelayanan peserta KB, alokon | Tabel 1 (faskes per jenis), Tabel 3 (KB baru per metode) |
| **DALLAP** | Data potensi wilayah, PKB/PLKB, PPKBD, BKB/BKR/BKL/UPPKA/PIK-R, Kampung KB | Tabel 1 (cakupan wilayah), Tabel 8A (BKB) |
| **Keluarga Berisiko Stunting** | Rekap KRS per wilayah, tabulasi verval | Tabel 4 (rekap per wilayah), Tabel 1 (tabulasi verval) |
| **ELSIMIL** | Catin, ibu hamil, pascapersalinan, baduta, MBG | Catin Tabel 1, Bumil Tabel 1 |

**Yang sengaja tidak diambil**: laporan by-name (`KRS Tabel3`/`Tabel5`,
`Bumil-Individu`, `Pascasalin-Individu`) karena memuat NIK, nama, dan alamat warga.
Lihat `scripts/build_snapshot.py` → `PII_REPORTS`.

---

## Menjalankan

```bash
bun install
bun run dev          # http://localhost:5173
```

Build produksi:

```bash
bun run build        # -> dist/
bun run preview
```

---

## Periode (bulan / tahun)

Setiap tabel punya **deret periode** yang bisa dipilih di UI:

- Laporan **bulanan** (`reportCategory` mengandung `Bulanan`) → chip per bulan: `Jan 2026`, `Feb 2026`, …
- Laporan **kumulatif** (`Komulatif`/`Kumulatif`) → juga chip per bulan, berlabel "Periode kumulatif"
- Laporan **tahunan** / verval → chip per tahun: `2025`, `2026`

Chip yang tidak punya data tetap ditampilkan tapi diredupkan, dengan tooltip
"belum ada data", supaya terlihat jelas periode mana yang kosong. Kalau **semua**
periode kosong, muncul peringatan kuning di atas tabel.

### Penyegaran otomatis bulanan

`scripts/refresh.sh` memanen ulang snapshot untuk **bulan lalu + bulan ini** (plus seluruh
laporan tahunan tahun berjalan), lalu menyusun ulang `index.json`.

```bash
./scripts/refresh.sh              # bulan lalu + bulan ini + tahunan
./scripts/refresh.sh --max 5      # uji cepat, hanya 5 job per tahap
```

Kenapa bulan lalu ikut diambil: data SIGA masih bisa disusulkan setelah bulan berganti,
jadi bulan yang baru selesai diambil ulang dengan `--force`. `index.json` digabung **per
periode**, jadi periode lama tidak hilang (terlihat di log: `merge index: 1861 periode
lama dipertahankan`).

**Token tidak diperlukan.** Endpoint laporan SIGA saat ini membalas tanpa header
`Authorization` (temuan `reverse-engineering.md` §13.1), jadi cron tidak menyimpan secret
apa pun. Kalau nanti autentikasi ditegakkan, cukup `export TOKEN=<jwt>` sebelum
menjalankan skrip — script tetap mengirim header itu bila ada.

Pasang jadwal (awal bulan, 03:15):

```cron
# Linux/macOS — crontab -e
15 3 1 * *  cd /path/ke/Siga2Api && ./scripts/refresh.sh >> _re/logs/cron.log 2>&1
```

```powershell
# Windows — Task Scheduler, aksi "Start a program":
#   Program:   bash
#   Arguments: scripts/refresh.sh
#   Start in:  C:\path\ke\Siga2Api
```

Yang perlu diingat:

- Cron hanya memperbarui **berkas di disk**. Kalau situs disajikan dari `dist/`, jalankan
  `bun run build` lalu deploy; kalau dari repo, commit `public/data/` hasil panen.
- Laporan yang memang tidak pernah terisi (mis. YAN KB `Tabel12`/`Tabel13*` tingkat
  provinsi, DALLAP `Tabel18–20` bulanan) tetap ditandai `error`/`empty` — script mencatat
  `ERR` di log dan **tidak** menghapus periode lain.
- Modul **Verval KRS** tidak ikut: ia selalu live, tidak memakai snapshot.

### Rincian per desa (kecamatan → desa)

Di bawah pemilih periode ada **Rincian wilayah**: pilih kecamatan, lalu (opsional) desa.

```
RINCIAN WILAYAH   [ Semua kecamatan (snapshot) ▾ ]  [ Semua desa di kecamatan ini ▾ ]
```

- **Semua kecamatan** (default) → snapshot statis, baris = kecamatan, tanpa jaringan.
- **Satu kecamatan** → aplikasi memanggil `viewReport` live dengan `kecamatanId`, dan
  laporan SIGA berubah menjadi **baris desa** (10–20 desa per kecamatan).
- **Satu desa** → baris disaring di klien ke desa itu.

Kenapa desa disaring di klien, bukan dikirim ke server: `kelurahanId` **diabaikan** oleh
`report-siga-dallap-ocp`, `report-siga-yankb-ocp`, dan `report-siga-elsimil-ocp` (body
respons byte-identik dengan/tanpa parameter). Hanya `report-siga-krs-ocp` dan
`pk23-portal-gw/report` (KRS Tabel4) yang menghormatinya — tetapi karena hasil satu
kecamatan sudah memuat semua desa, satu jalur penyaringan dipakai untuk semua modul.

Catatan:

- **YAN KB tidak punya dimensi desa.** Barisnya daftar faskes, bukan wilayah; dropdown
  desa dinonaktifkan dan diberi keterangan. `kecamatanId` tetap menyaring faskes.
- Pilihan wilayah **direset** saat laporan diganti, karena tiap kecamatan punya daftar desa
  sendiri dan tidak semua modul dirinci per desa.
- Data live butuh koneksi internet. Kalau gagal, muncul banner kuning dan tabel snapshot
  tidak ditampilkan (bukan angka campuran) supaya tidak salah tafsir. Permintaan diulang
  sekali (gateway SIGA kadang memutus koneksi atau membalas body kosong), dan hasilnya
  di-cache per laporan+periode+kecamatan — berpindah desa tidak memanggil server lagi.
- Daftar 11 kecamatan / 135 desa ada di `public/data/wilayah.json`, di-vendor dari
  `location-service` (`getListKecamatanByIdKabupaten` + `getListKelurahanByIdKecamatan`).
  Daftar ini statis; kode wilayah tidak berubah antar bulan.
- Baris rekap (`JUMLAH TOTAL`) dibuang saat satu desa dipilih, karena nilainya mencakup
  seluruh kecamatan.
- "Unduh CSV" mengikuti tabel yang sedang tampil, jadi CSV ikut tersaring per desa.

## Verval KRS (live)

Modul **Verval KRS** di sidebar tidak memakai snapshot: datanya diambil langsung dari
`getMonitoringKrs` saat dibuka.

```
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs
    ?tahun=2026&periode=2&idProvinsi=22&idKabupaten=322[&idKecamatan=…]
```

- Pilih **tahun** (2023–2026), **semester** (1/2), lalu kecamatan dan desa seperti laporan lain.
- Baris mengikuti wilayah terdalam: kabupaten → 11 kecamatan; +kecamatan → 10–20 desa.
- **Semester wajib.** Tanpa `periode` server membalas 200 tetapi menjumlahkan semester 1 + 2,
  sehingga cakupan bisa 200% dan `kelurahanVerval` melebihi target. UI selalu mengirimnya.
- Angka dikirim sebagai string berpemisah ribuan (`"1,198"`); dinormalisasi sebelum dirender.
- Hanya **agregat** (keluarga, PUS, baduta, balita, cakupan). Tidak ada NIK/nama/KK — endpoint
  mentah `getDataStatusVerval` sengaja tidak dipakai karena memuat data pribadi.

### Kenapa laporan KRS di snapshot kosong

Laporan KRS di `public/data/krs/` berasal dari mesin laporan lama (JasperReports di
`pk23-portal-gw` / `report-siga-krs-ocp`). Basis data itu hanya terisi sampai **semester II
2023/2024**; tahun 2025–2026 kosong sementara labelnya tetap tercetak
`PERIODE : SEMESTER II 2023`.

Diukur dengan menghitung sel non-nol (kab. Tanah Laut):

| Laporan | 2023 | 2024 | 2026 |
|---|---|---|---|
| `Verval-Tabulasi` Tabel1 | 59 | 117 | **0** |
| `Verval-Tabulasi` Tabel2 | 39 | — | **0** |
| `Verval-Tabulasi` Tabel6 | 72 | — | **0** |
| `STUNTING2025` Tabel4 | — | — | **0** |

Angka verval 2026 yang sebenarnya ada di endpoint `getMonitoringKrs` (mis. Takisung 166
keluarga terverval, semester 2). Jadi kekosongan itu **bukan** bug filter maupun bug scraper:
laporan tersebut memang membaca dataset lama yang tidak lagi diisi. Karena itu modul
**Verval KRS** membaca sumber yang benar, bukan menambal snapshot.

### Memanen beberapa periode

```bash
# Semua bulan Jan–Okt 2026 + tahunan 2026
python scripts/build_snapshot.py --years 2026 --months 1-10

# Beberapa tahun + hanya Desember
python scripts/build_snapshot.py --years 2024,2025,2026 --months 12

# Hanya laporan tahunan (lebih cepat)
python scripts/build_snapshot.py --skip-monthly

# Hanya laporan bulanan
python scripts/build_snapshot.py --skip-annual --months 1-10
```

Struktur file mengikuti periode:

```
public/data/yankb/YanKB-Tahunan-Kec__Tabel1__2026.json
public/data/yankb/YanKB-Bulanan-Kec__Tabel3__2026-10.json
public/data/dallap/Dallap-Bulanan__Tabel1__2026-10.json
```

`index.json` mengelompokkan periode per tabel. `periodType` bernilai
`annual` / `monthly` / `cumulative`; laporan kumulatif tetap memakai satu file per bulan
akhir, jadi chip-nya juga bulanan:

```jsonc
{
  "module": "yankb",
  "reportName": "Tabel3",
  "periodType": "monthly",
  "periods": [
    { "key": "2026-10", "label": "Okt 2026", "file": "yankb/…__2026-10.json",
      "empty": true, "rowCount": 0 },
    { "key": "2026-09", "label": "Sep 2026", "file": "…", "empty": false, "rowCount": 12 }
  ]
}
```

### Catatan ketersediaan data

Hasil panen nyata untuk Kab. Tanah Laut (Okt 2026): laporan bulanan **berisi data**
setelah filter diperbaiki (lihat catatan di bawah); tahunan berisi data, dengan
kepercayaan periode yang berbeda per modul — lihat tabel tunggal
**"Kapan angka boleh dipercaya"** di bawah.

> **Koreksi (Okt 2026).** Catatan lama "YAN KB & DALLAP bulanan kosong" dan "ELSIMIL
> bulanan identik antar bulan" adalah **artefak bug scraper**, bukan perilaku server.
> Scraper mengirim `"periode": "YYYY-MM"`, yang diabaikan server (jawaban: tabel kosong
> 11 `<td>`). Filter yang benar adalah `"tahun": "YYYY"` + `"bulan": <int>`. Dengan
> filter itu: YAN KB bulanan Tabel1 → 365 `<td>`, DALLAP Tabel3B → 272 `<td>`, dan
> ELSIMIL berbeda antar bulan.

---

## Membangun ulang snapshot data

Snapshot disimpan di `public/data/` dan ikut ter-commit supaya web bisa jalan tanpa token.
Untuk menyegarkan data:

```bash
# 1. Ambil token dari sesi login SIGA Anda sendiri (browser, localStorage.token)
export TOKEN='<jwt>'

# 2. Panen semua laporan (paralel, ~8 worker)
python scripts/build_snapshot.py --out public/data --workers 8

# Opsi lain
python scripts/build_snapshot.py --only yankb          # satu modul saja
python scripts/build_snapshot.py --years 2025          # tahun lain
python scripts/build_snapshot.py --months 9            # periode bulanan lain
python scripts/build_snapshot.py --force               # abaikan cache
```

Default: `--prov 22 --kab 322 --years 2026 --months 1-10` (Tanah Laut, 2026, Jan–Okt).

Script ini **resumable**: file yang sudah ada di `public/data/` tidak diambil ulang,
kecuali `--force` atau file itu terbukti basi (mis. dibuat dengan filter lama). Aturan
lengkapnya ada di `AGENTS.md` §10. `index.json` digabung **per periode**
(`periods[].file`), jadi panen sebagian seperti `--months 10` atau `--skip-annual`
tidak menghapus periode lain dari laporan yang sama. Entri lama yang berkasnya sudah
tidak ada di disk dibuang, supaya index tidak menunjuk berkas hilang.

---

## Struktur

```
public/data/
  index.json                 # katalog + metadata semua laporan
  wilayah.json               # 11 kecamatan + 135 desa (referensi location-service)
  yankb/<kategori>__<tabel>__<periode>.json
  dallap/…
  krs/…
  elsimil/…

scripts/
  build_snapshot.py          # panen + parse laporan -> JSON
  fetch_verval.py            # ambil data verval (mode masked by default)

src/
  App.tsx                    # shell: header sticky, sidebar (Sheet di mobile), area konten
  components/
    Sidebar.tsx              # navigasi modul + pencarian laporan
    ReportView.tsx           # header laporan + unduh CSV + banner peringatan
    PeriodPicker.tsx         # chip periode (ToggleGroup)
    WilayahPicker.tsx        # dropdown kecamatan + desa (Select)
    VervalView.tsx           # modul Verval KRS (live, agregat)
    DataTable.tsx            # tabel: header bertingkat, sort, filter, sembunyikan kolom kosong
    Overview.tsx             # ringkasan saat belum ada laporan dipilih
    ui/                      # primitives shadcn/ui (button, card, table, alert, …)
  lib/data.ts                # loader + label helper
  lib/jasper.ts              # parser HTML JasperReports (port dari build_snapshot.py)
  lib/live.ts                # pengambilan laporan live per kecamatan
  lib/verval.ts              # agregat Verval KRS (getMonitoringKrs)
  lib/sleep.ts               # jeda retry permintaan SIGA
  lib/wilayah.ts             # loader wilayah.json + daftar modul ber-rincian desa
  lib/utils.ts               # cn() untuk merge class
```

### Konvensi UI (shadcn/ui)

- Primitives ada di `src/components/ui/` (gaya `new-york`). Tambah komponen lewat
  `bunx --bun shadcn@latest add <nama>`, jangan menulis tombol/kartu manual lagi.
  `npx shadcn@latest add` juga sah; `bunx` dipilih agar konsisten dengan repo yang
  memakai `bun.lock` dan tidak memunculkan lockfile kedua.
- Token warna & radius di `src/index.css` (`:root` + `@theme inline`). `--accent` di
  shadcn berarti permukaan hover, **bukan** warna merek; amber peringatan ada di
  `--warning` dan dipakai `Alert`/`Badge` varian `warning`.
- Alias `@/` → `src/` (lihat `components.json` + `vite.config.ts`).
- **Jebakan:** jangan membungkus `ToggleGroupItem` dengan `TooltipTrigger asChild`.
  Radix menimpa `data-state` item (`on` → `closed`) sehingga gaya terpilih hilang
  diam-diam. Pakai atribut `title` native untuk chip periode.
- Fokus keyboard memakai `outline` (aturan top-level di `index.css`), bukan utility
  `ring-*`: di build Tailwind v4 ini `--tw-ring-shadow` terkomposisi transparan.
- Sidebar dirender dua kali (aside desktop + Sheet mobile); setiap instance wajib
  diberi `idPrefix` berbeda agar `id` DOM tidak kembar.

### Format satu file laporan

```jsonc
{
  "title": "TABEL 1",
  "subtitle": "JUMLAH TEMPAT PELAYANAN KB BERDASARKAN JENIS",
  "period": "TAHUN: 2026",
  "wilayah": { "prov": "KALIMANTAN SELATAN", "kab": "TANAH LAUT" },
  "columns": ["KODE", "KECAMATAN", "JUMLAH FASKES", "RS UMUM"],
  "colNumbers": ["1", "", "2", "3=4+12+13"],
  "columnGroups": [
    ["KODE"],
    ["KECAMATAN"],
    ["JENIS TEMPAT PELAYANAN KB", "JUMLAH FASKES"],
    ["JENIS TEMPAT PELAYANAN KB", "JENIS FASKES", "RS UMUM"]
  ],
  "rows": [["01", "TAKISUNG", "14", "3"]],
  "empty": false,
  "module": "yankb",
  "reportName": "Tabel1",
  "reportCategory": "YanKB-Tahunan-Kec",
  "description": "TABEL 1 - JUMLAH TEMPAT PELAYANAN KB BERDASARKAN JENIS",
  "periodKey": "2026",
  "periodLabel": "2026",
  "fetchedAt": "2026-10-18T02:10:00",
  "printedPeriod": "TAHUN: 2026",
  "printedYear": 2026,
  "periodStatus": "match"
}
```

`printedPeriod` / `printedYear` adalah teks periode yang **dicetak di dalam dokumen**;
`periodStatus` (`"match"` / `"mismatch"` / `"unknown"`) membandingkannya dengan periode
yang diminta. `unknown` berarti tidak ada label yang bisa diurai (mis. `TAHUN : null`);
file lama tanpa field ini dibaca sebagai `unknown`.

`columnGroups` sejajar indeks dengan `columns` dan menyimpan **path header asli** dari
induk ke daun (mis. `["CARA PENYULUHAN", "VIRTUAL"]`). `columns` tetap datar untuk
kompatibilitas: isinya daun, dan bila daun itu duplikat **dan punya induk** diberi
prefiks induk langsungnya (mis. dua kolom `POSKESDES/ POLINDES` →
`"JENIS JARINGAN / JEJARING / POSKESDES/ POLINDES"`). `columnGroups` dibangun dari
rentang sel **asli** (`colspan`/`rowspan`), bukan dari grid hasil ekspansi — grid hanya
menaruh teks di kolom pertama sel ber-`colspan`, sehingga anak kolom kedua dan seterusnya
kehilangan nama induknya. File lama tanpa field ini dirender dengan header satu baris
biasa.

`colNumbers` (opsional) adalah baris penomoran kolom dokumen (`3=4+12+13`) bila templat
mencetaknya; nilainya `null` kalau tidak ada.

### Label periode basi di dokumen sumber (PENTING)

Beberapa templat SIGA mencetak label periode **hardcoded** yang tidak mengikuti parameter
yang diminta. Ini ditemukan nyata dan tidak boleh disalahartikan sebagai data salah:

- **KRS tabulasi** (`report-siga-krs-ocp`, kategori `Verval-Tabulasi`, Tabel1/2/6) selalu
  mencetak `PERIODE : SEMESTER II 2023`, apa pun `tahun` yang diminta.
- **Data tetap mengikuti `tahun` yang diminta**: `tahun=2023` memang mengembalikan angka
  sungguhan (Tabel1 berisi 42 sel non-zero), sedangkan tahun lain (2015–2027)
  mengembalikan body **nol semua dengan label 2023 itu**. Jadi file tersimpan 2026 adalah
  **data 2026 yang memang kosong, dengan label basi** — BUKAN data 2023. Angkanya benar
  per tahun; yang basi hanya labelnya.
- **Laporan bulanan** (semua modul) memakai `tahun` + `bulan` (int). Mengirim
  `periode: "YYYY-MM"` membuat server menjawab tabel kosong — itulah sebabnya snapshot
  lama tampak kosong/identik antar bulan.
- **YAN KB dan ELSIMIL tahunan** menghormati tahun dengan benar. **DALLAP tahunan**
  mencetak tahun yang benar tapi angkanya statis antar tahun.

Karena itu tabel mismatch **sengaja tidak dikeluarkan dari snapshot**: angka tetap valid
untuk periode yang diminta, dan tabel yang diisi hanya untuk tahun yang dicetak justru
harus tetap terlihat. Sinyalnya adalah peringatan, bukan penghapusan — UI menampilkan
banner kuning di atas tabel plus penanda di chip periode (lihat
`src/components/ReportView.tsx` dan `PeriodPicker.tsx`).

### Kapan angka boleh dipercaya

| Modul / jenis | `tahun`/`bulan` dihormati? | Catatan |
|---|---|---|
| YAN KB tahunan | ✅ ya | label dan angka sesuai permintaan |
| ELSIMIL tahunan | ✅ ya | — |
| DALLAP tahunan | ⚠️ label saja | tahun tercetak benar, angka statis antar tahun |
| KRS tabulasi (Verval-Tabulasi) | ⚠️ hanya 2023 | hanya tahun 2023 yang terisi; tahun lain nol dengan label 2023 |
| YAN KB bulanan | ✅ ya | `BULAN : OKT - 2026` tercetak sesuai permintaan |
| DALLAP bulanan | ✅ ya | `BULAN : OKT - 2026` tercetak sesuai permintaan |
| ELSIMIL bulanan | ✅ ya | body berbeda antar bulan setelah filter `tahun`+`bulan` |
| ELSIMIL kumulatif | ✅ ya | `Catin-Komulatif` pakai `bulan`; `Bumil-`/`Pascasalin-`/`Baduta-Kumulatif` pakai `bulanAwal`+`bulanAkhir` — salah filter hanya memotong tahun, tabelnya tidak kosong |

Parser (`parse_report`) mengekspansi `colspan`/`rowspan` JasperReports menjadi grid 2D,
menyimpan hierarki header aslinya di `columnGroups`, menggabungkan header multi-tingkat
jadi nama kolom, dan membuang baris penomoran kolom (`(1) (2) (3)` / `3=4+12+13`).
`DataTable` merender `columnGroups` jadi header bertingkat (rowspan/colspan) persis
dokumen aslinya; penggabungan sel dilakukan saat render, bukan di parser. Metadata
periode kini juga menangani baris multi-sel dan baris label/nilai terpisah — mis.
`["PERIODE", ": SEMESTER II 2023"]` — yang sebelumnya dilewati sehingga label basi tak
terdeteksi; `is_index_row` kini juga menerima `/` dan `%` agar baris penomoran seperti
`6 = 5/4*100` tidak bocor jadi baris data pertama. Mode `--index-only` membaca
`periodStatus` dari tiap file, default `unknown`.

---

## Catatan keamanan

Repo ini berisi **agregat**, bukan data pribadi. Endpoint SIGA yang dipakai untuk panen
memang terbuka tanpa autentikasi (lihat `reverse-engineering.md` §13) — itu temuan yang
dilaporkan, bukan izin untuk menarik data per orang. Jangan tambahkan laporan by-name ke
snapshot.

Token tidak pernah disimpan di repo. `_re/` dan `data/` sudah gitignored.

**Rincian per kecamatan memakai panggilan live tanpa token.** Aplikasi memanggil
`viewReport` langsung dari browser saat kecamatan dipilih; ini hanya bekerja karena
gateway SIGA membalas tanpa memeriksa `Authorization` (temuan §13.1 di
`reverse-engineering.md`). Konsekuensinya, kalau pemilik sistem menegakkan autentikasi,
fitur ini akan berhenti dengan banner galat — bukan diam-diam menampilkan angka salah.
Aplikasi tetap tidak mengirim, menyimpan, atau meminta token apa pun.
