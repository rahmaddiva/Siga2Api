# Siga2Api

Penampil data laporan **SIGA** (BKKBN / Kementerian Kependudukan dan Pembangunan Keluarga)
untuk **Kabupaten Tanah Laut, Provinsi Kalimantan Selatan**.

Web statis (Vite + React + Tailwind v4) yang membaca snapshot JSON hasil panen laporan dari
API SIGA. Tidak ada token, tidak ada backend, tidak ada data perorangan.

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
- Laporan **tahunan** / kumulatif / verval → chip per tahun: `2025`, `2026`

Chip yang tidak punya data tetap ditampilkan tapi diredupkan, dengan tooltip
"belum ada data", supaya terlihat jelas periode mana yang kosong. Kalau **semua**
periode kosong, muncul peringatan kuning di atas tabel.

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

`index.json` mengelompokkan periode per tabel:

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

Hasil panen nyata untuk Kab. Tanah Laut (Okt 2026): tabel bulanan **YAN KB dan DALLAP
kosong** (pelaporan bulanan diisi di tingkat lain); tahunan berisi data, dengan
kepercayaan periode yang berbeda per modul — lihat tabel tunggal
**"Kapan angka boleh dipercaya"** di bawah.

Bukti untuk ELSIMIL bulanan: `Catin-Bulanan/Tabel1` dengan `periode=2026-01`,
`2026-05`, dan `2026-10` menghasilkan body byte-identik. Jadi untuk ELSIMIL, angka
bulanan belum bisa dipercaya sebagai potret per bulan.

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

Script ini **resumable**: laporan yang sudah ada di `public/data/` tidak diambil ulang
kecuali `--force`.

---

## Struktur

```
public/data/
  index.json                 # katalog + metadata semua laporan
  yankb/<kategori>__<tabel>.json
  dallap/…
  krs/…
  elsimil/…

scripts/
  build_snapshot.py          # panen + parse laporan -> JSON
  fetch_verval.py            # ambil data verval (mode masked by default)

src/
  App.tsx                    # shell: header, sidebar, area konten
  components/
    Sidebar.tsx              # navigasi modul + pencarian laporan
    ReportView.tsx           # header laporan + unduh CSV
    DataTable.tsx            # tabel: sort, filter, sembunyikan kolom kosong
    Overview.tsx             # ringkasan saat belum ada laporan dipilih
  lib/data.ts                # loader + label helper
```

### Format satu file laporan

```jsonc
{
  "title": "TABEL 1",
  "subtitle": "JUMLAH TEMPAT PELAYANAN KB BERDASARKAN JENIS",
  "period": "TAHUN: 2026",
  "wilayah": { "prov": "KALIMANTAN SELATAN", "kab": "TANAH LAUT" },
  "columns": ["KODE", "KECAMATAN", "JUMLAH FASKES", "…"],
  "rows": [["01", "TAKISUNG", "14", "…"]],
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
- **ELSIMIL bulanan** (`Catin-Bulanan` dkk.) mencetak `TAHUN : null` dan **mengabaikan
  `periode` sepenuhnya** — body byte-identik antara `2026-01`, `2026-10`, `2025-03`.
- **YAN KB dan ELSIMIL tahunan** menghormati tahun dengan benar. **DALLAP tahunan**
  mencetak tahun yang benar tapi angkanya statis antar tahun.

Karena itu tabel mismatch **sengaja tidak dikeluarkan dari snapshot**: angka tetap valid
untuk periode yang diminta, dan tabel yang diisi hanya untuk tahun yang dicetak justru
harus tetap terlihat. Sinyalnya adalah peringatan, bukan penghapusan — UI menampilkan
banner kuning di atas tabel plus penanda di chip periode (lihat
`src/components/ReportView.tsx` dan `PeriodPicker.tsx`).

### Kapan angka boleh dipercaya

| Modul / jenis | `tahun`/`periode` dihormati? | Catatan |
|---|---|---|
| YAN KB tahunan | ✅ ya | label dan angka sesuai permintaan |
| ELSIMIL tahunan | ✅ ya | — |
| DALLAP tahunan | ⚠️ label saja | tahun tercetak benar, angka statis antar tahun |
| KRS tabulasi (Verval-Tabulasi) | ⚠️ hanya 2023 | hanya tahun 2023 yang terisi; tahun lain nol dengan label 2023 |
| ELSIMIL bulanan | ❌ tidak | `periode` diabaikan; `TAHUN : null`; body identik antar bulan |

Parser (`parse_report`) mengekspansi `colspan`/`rowspan` JasperReports menjadi grid 2D,
menggabungkan header multi-tingkat jadi nama kolom, dan membuang baris penomoran kolom
(`(1) (2) (3)` / `3=4+12+13`). Metadata periode kini juga menangani baris multi-sel dan
baris label/nilai terpisah — mis. `["PERIODE", ": SEMESTER II 2023"]` — yang sebelumnya
dilewati sehingga label basi tak terdeteksi; `is_index_row` kini juga menerima `/` dan `%`
agar baris penomoran seperti `6 = 5/4*100` tidak bocor jadi baris data pertama. Mode
`--index-only` membaca `periodStatus` dari tiap file, default `unknown`.

---

## Catatan keamanan

Repo ini berisi **agregat**, bukan data pribadi. Endpoint SIGA yang dipakai untuk panen
memang terbuka tanpa autentikasi (lihat `reverse-engineering.md` §13) — itu temuan yang
dilaporkan, bukan izin untuk menarik data per orang. Jangan tambahkan laporan by-name ke
snapshot.

Token tidak pernah disimpan di repo. `_re/` dan `data/` sudah gitignored.
