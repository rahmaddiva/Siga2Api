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
python scripts/build_snapshot.py --tahun 2025          # tahun lain
python scripts/build_snapshot.py --bulan 9             # periode bulanan lain
python scripts/build_snapshot.py --force               # abaikan cache
```

Default: `--prov 22 --kab 322 --tahun 2026 --bulan 10` (Tanah Laut, 2026, Oktober).

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
  "fetchedAt": "2026-10-18T02:10:00"
}
```

Parser (`parse_report`) mengekspansi `colspan`/`rowspan` JasperReports menjadi grid 2D,
menggabungkan header multi-tingkat jadi nama kolom, dan membuang baris penomoran kolom
(`(1) (2) (3)` / `3=4+12+13`).

---

## Catatan keamanan

Repo ini berisi **agregat**, bukan data pribadi. Endpoint SIGA yang dipakai untuk panen
memang terbuka tanpa autentikasi (lihat `reverse-engineering.md` §13) — itu temuan yang
dilaporkan, bukan izin untuk menarik data per orang. Jangan tambahkan laporan by-name ke
snapshot.

Token tidak pernah disimpan di repo. `_re/` dan `data/` sudah gitignored.
