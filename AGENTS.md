# AGENTS.md — Panduan Kerja di Repo Siga2Api

Repo ini **bukan** aplikasi. Ini workspace reverse engineering (RE) untuk
`https://newsiga-siga.kemendukbangga.go.id` (SIGA / SIGA Baru, BKKBN–Kemendukbangga),
tujuannya mengambil data laporan: **YAN KB, DALLAP, Keluarga Berisiko Stunting (KRS),
ELSIMIL, Verval KRS, Monitoring KRS**.

Temuan lengkap ada di [`reverse-engineering.md`](./reverse-engineering.md). Dokumen ini
adalah aturan main + resep operasional untuk agent yang bekerja di sini.

---

## 1. Prioritas modul (urutan kerja)

| # | Modul | Route SPA | Status RE |
|---|-------|-----------|-----------|
| 1 | LAPORAN → YAN KB | `#/yankb` | ✅ endpoint + katalog terverifikasi |
| 2 | LAPORAN → DALLAP | `#/dallap` | ✅ endpoint + katalog terverifikasi |
| 3 | LAPORAN → KELUARGA BERISIKO STUNTING | `#/krs` | ✅ endpoint terverifikasi (Tabel4) |
| 4 | LAPORAN → ELSIMIL (CATIN/BUMIL/PASCA/BADUTA) | `#/catin`, `#/bumil`, `#/pasca`, `#/baduta` | ✅ endpoint + katalog terverifikasi |
| 5 | VERVAL KRS → Keluarga Berisiko Stunting | `#/form/stunting` | ✅ data endpoint terverifikasi (butuh service per-provinsi) |
| 6 | VERVAL KRS → Monitoring KRS | `#/monitoring-krs` | ✅ terverifikasi live |

Jangan sentuh modul lain (DALLAP kartu pendaftaran, TPK, approval, dsb.) kecuali diminta.

---

## 2. Aturan keras

1. **Jangan pernah menulis token, password, username asli, NIK, nama, KKI, atau URL foto
   rumah/jamban ke file mana pun di repo.** Pakai placeholder: `<TOKEN>`, `<USERNAME>`,
   `<NIK>`, `<KKI>`. Saat mendokumentasikan bentuk respons, tulis **nama field saja**,
   bukan nilai.
2. **Jangan commit hasil dump.** Semua artefak (bundle JS, dump JSON, xlsx) masuk `_re/`
   yang sudah ada di `.gitignore`.
3. Sesi browser yang dipakai adalah **sesi login asli user** (relay Chrome). Jangan
   navigasi tab yang sedang dilihat user tanpa izin; buka tab kerja sendiri.
4. Endpoint `viewReport` mengembalikan **HTML JasperReports** (`text/html`), bukan JSON.
   Jangan mengira itu error kalau isinya tabel HTML.
5. `reportType` mendukung `html`, `xlsx`, `pdf` — untuk ekspor massal pakai `xlsx`.
6. Beberapa endpoint **tidak memerlukan auth** (lihat §6). Itu temuan, bukan izin untuk
   menarik data besar-besaran. Batasi pengambilan data ke volume yang wajar.

---

## 3. Anatomi aplikasi (ringkas)

- Frontend: React CRA + webpack 4, nama global `webpackJsonpeform`, hash router.
- Semua API lewat gateway: `https://siga-api-gateway.bkkbn.go.id/<service>/…`
- Auth: `Authorization: Bearer <TOKEN>`; token JWT di `localStorage.token`.
  Refresh: `POST https://newsiga-authorization-api.bkkbn.go.id/auth/refreshToken`.
- Identitas & hak akses di `localStorage.data` (`attributes.role`,
  `attributes.user.namaLevelWilayah`, flag `Entry/Ubah/Hapus/Cetak`).
- Menu di `localStorage.menu` → sumber peta route yang sah.

---

## 4. Resep: ambil data laporan (paling sering dipakai)

Semua laporan memakai pola yang sama:

```
GET https://siga-api-gateway.bkkbn.go.id/<report-service>/viewReport
    ?filterPencarian=<urlencode(JSON)>
Authorization: Bearer <TOKEN>
```

`filterPencarian` adalah JSON yang di-URL-encode:

```json
{
  "tahun": "2026",
  "provinsiId": "22",
  "kabupatenId": "322",
  "reportName": "Tabel1",
  "reportType": "html",
  "reportCategory": "YanKB-Tahunan-Kec"
}
```

Variasi penting:

- Laporan **bulanan** memakai `"tahun": "YYYY"` **dan** `"bulan": <int 1-12>`.
  `"periode": "YYYY-MM"` **diabaikan server** dan menghasilkan tabel kosong (11 `<td>`);
  jangan pakai lagi. Diverifikasi live 2026-10 di YAN KB, DALLAP, DALLAP Rekap,
  dan ELSIMIL. **Jangan** menyalin logika bundle `chunks/11.js` yang hanya menambah
  `bulan` untuk `Dallap-Bulanan` — `Dallap-RekapBulanan` juga menghormati `bulan`
  (tahun saja: 9 `<td>`; tahun+bulan: 242 `<td>`). Bukti lengkap: tabel di
  `reverse-engineering.md` §5.3.
- Laporan bulanan mencetak `BULAN : OKT - 2026`, bukan `TAHUN :`; parser metadata
  (`parse_report`) harus mengenali prefiks `BULAN`.
- **Kumulatif punya filter sendiri** (terverifikasi live, sel non-nol Tabel1 2026-10):
  `Catin-Komulatif` butuh `bulan` (24 → 141 sel); `Bumil-`, `Pascasalin-`, dan
  `Baduta-Kumulatif` butuh **`bulanAwal` + `bulanAkhir`** (26 → 168, 47 → 253,
  29 → 220). Salah filter tidak membuat tabel kosong — angkanya cuma jadi potongan
  tahun, jadi jauh lebih menyesatkan. Lihat `RANGE_CUMULATIVE` di `build_snapshot.py`.
- **Verifikasi panen jangan pakai jumlah `<td>`/baris.** `YanKB-Bulanan-Kec/Tabel1`
  dengan `tahun` saja juga mengembalikan 364 `<td>`, tapi angkanya nol semua.
  Hitung sel numerik non-nol (mis. `isAllDataZero`), bukan rowCount.
- YAN KB bulanan: `reportName` = `Tabel1` bila tanpa kabupaten, **`Tabel1Kab`** bila
  `kabupatenId != 0`.
- KRS Tabel5 butuh minimal `kecamatanId`.
- Tambahan filter KRS: `semester`, `baduta`/`balita`/`pus`/`hamil` = `"V"`,
  `risiko_stunting`, `kesejahteraan_prioritas`.

Katalog `reportName` + `reportCategory` yang valid **jangan ditebak** — ambil dari:

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-ocp/getReportParameter
```

Responsnya berisi grup: `yankbTahunan`, `yankbBulanan`, `dallapTahunan`,
`dallapBulanan`, `dallapRekapBulanan`, `verval`, `vervalTabulasi`, `catinTahunan`,
`catinBulanan`, `catinKomulatif`, `bumil*`, `pascasalin*`, `elsimilBaduta*`,
`elsimilMbg`, `export`, `rekapFaskes*`.

### Peta service per modul

| Modul | Service |
|-------|---------|
| YAN KB | `report-siga-yankb-ocp` |
| DALLAP | `report-siga-dallap-ocp` |
| KRS (Tabel3/4/5) | `https://pk23-portal-gw.bkkbn.go.id/report` (Basic auth) |
| KRS tabulasi (Verval-Tabulasi) | `report-siga-krs-ocp` |
| ELSIMIL (Catin/Bumil/Pasca/Baduta/MBG) | `report-siga-elsimil-ocp` |

### Data mentah KRS (bukan laporan agregat)

```
# 1) cari nama service provinsi
GET https://pk23-portal-gw.bkkbn.go.id/verval-config/verval/vervalConfig/getVervalServiceByIdProvinsi?idProvinsi=22
# → {"idProvinsi":22,"service":"regc","url":"…/modul-stunting-regc/"}

# 2) tarik data verval
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-<service>/siga/stunting/getDataStatusVerval
    ?bulan=10&tahun=2026&page=1&recordPerPage=50
    &idProvinsi=22&idKabupaten=322&idKecamatan=6157&idKelurahan=55467
# → {"page","recordPerPage","totalRecord","totalStatusKeluarga","data":[…]}
```

### Monitoring KRS

```
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs
    ?tahun=2026&periode=2&idProvinsi=22&idKabupaten=322[&idKecamatan=&idKelurahan=]
# → {"data":[{…, totalVervalAdaBaru, …}]}
```

`periode` = semester (`1`/`2`). **Tanpa `periode` bukan 404** (klaim lama salah):
server membalas 200 dan **menjumlahkan semester 1 + 2**, sehingga `cakupanKelurahanVerval`
bisa 200% dan `kelurahanVerval` melebihi `kelurahanTarget` (Pelaihari: 36 > 20). Itu angka
tahunan yang dobel, bukan angka semester. Bundle `chunks/32.js` menambahkan `periode` hanya
bila dropdown Semester terisi — jadi selalu kirim `periode` eksplisit.

`periode` di luar `1`/`2`: `0` dan `3` → 200 dengan `data: []`; nilai non-angka → 400.

Dimensi baris mengikuti wilayah terdalam yang diisi:

| Parameter | Baris hasil | `kategoriLaporan` |
|---|---|---|
| `idProvinsi` saja | 13 kabupaten di Kalsel | `Provinsi` |
| + `idKabupaten` | 11 kecamatan Tanah Laut | `Kabupaten` |
| + `idKecamatan=5844` | 10 desa Panyipatan | tetap `Kecamatan` (label = level yang diminta, **bukan** level baris) |
| + `idKelurahan=55409` | 1 baris Batu Tungku | `Kelurahan` |

Catatan angka: nilai numerik dikirim sebagai **string dengan pemisah ribuan**
(`"totalVervalAdaBaru": "1,198"`), kecuali `cakupanKelurahanVerval` yang float. Buang koma
sebelum `Number()`, kalau tidak hasilnya `NaN`.

Modul **Verval KRS** di aplikasi (`src/lib/verval.ts` → `src/components/VervalView.tsx`)
membaca endpoint ini langsung. Jangan menggantinya dengan `getDataStatusVerval`: endpoint itu
memuat nama/NIK/KK/foto rumah, sedangkan `getMonitoringKrs` murni agregat.

Cetak (tombol Cetak → Rekap/Detail) memakai **`report-siga-ocp` di gateway**, bukan pk23:

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-ocp/viewReport
    ?filterPencarian={"tahun":"2026","provinsiId":"22","kabupatenId":"322",
      ["kecamatanId":"…",]["kelurahanId":"…",]
      "reportName":"MonitoringVerval2024"|"MonitoringPendataanVerval2024",
      "reportType":"xlsx","periode":"2","reportCategory":"Monitoring"}
```

`reportType` `xlsx` → `application/xlsx` (44–46 KB level kabupaten), `pdf` → 148 KB. Nama
tanpa sufiks (`MonitoringVerval`, untuk tahun 2023 menurut bundle) membalas 200 dengan body
**0 byte** untuk tahun 2026.

---

## 5. Resep: menemukan endpoint baru

1. Buka `#/<route>` di tab relay, `clearRequests()`, `reload()`, tunggu 5–8 s, lalu baca
   `tab.requests()`. Filter ke `siga-api-gateway` dan buang `OPTIONS`.
2. Kalau daftar kosong / tombol tidak bisa diklik (link `href="#/..."` dengan handler
   React), klik via DOM:
   `tab.evaluate(() => Array.from(document.querySelectorAll('a')).find(a => a.textContent.startsWith('TABEL 1')).click())`.
3. Untuk bundle: `_re/js/chunks/<id>.js` (227 chunk sudah diunduh) dan versi rapi di
   `_re/js/pretty/`. Cari `baseURL`, `viewReport`, `filterPencarian`, `modul-stunting-`.
4. Chunk yang relevan: `206.js` (route table), `229.js` (KRS report + kategori tahun),
   `175.js` (YAN KB report), `11.js` (DALLAP), `42.js` (`#/form/stunting`), `32.js`
   (`#/monitoring-krs`), `115–117/139` (ELSIMIL catin), `160–164` (elsimil report).
5. Panggil langsung dari tab (bukan `curl` dari shell) agar token & CORS aman:
   `tab.run(...)` + `fetch` di konteks halaman.

---

## 6. Temuan keamanan yang wajib diingat

- `https://pk23-portal-gw.bkkbn.go.id/report/viewReport` **merespons 200 tanpa header
  Authorization** dan mengembalikan data KRS penuh (terverifikasi Tabel4: 434 `<td>`).
- `report-siga-ocp/getReportParameter` dan
  `sigaauthorizationservice/menu/getMenuByUserName?username=…` juga tanpa auth.
- Kredensial `Basic` di-hardcode di bundle: `btoa("admin:password")` (modul 788 & 782).
- Password user disimpan **plaintext** di `localStorage.pass` dan dipakai untuk refresh
  token. Token JWT HS512 berlaku ±24 hari.
- Service worker didaftarkan ke `service-worker.js` yang 404.

Laporkan ini sebagai temuan di `reverse-engineering.md`; jangan mengeksploitasi lebih jauh.

---

## 7. Konvensi output data

- Simpan hasil tarik ke `_re/data/<modul>/<tahun>/<reportName>.<ext>` (gitignored).
- `reportType=xlsx` untuk rekap; `html` untuk verifikasi cepat jumlah baris (`<td>`).
- Jangan pernah menyimpan respons `getDataStatusVerval` / `getDetailCatin` mentah —
  keduanya mengandung PII rumah tangga. Kalau perlu, simpan **hanya nama field**.

---

## 8. Definisi selesai

Sebuah modul dianggap selesai di-RE bila:

1. URL + method + parameter + header terdokumentasi di `reverse-engineering.md`.
2. Ada satu contoh respons sukses (status + ukuran + bentuk, **tanpa nilai PII**).
3. Katalog `reportName`/`reportCategory` modul tersebut tercatat.
4. Perbedaan perilaku (mis. `Tabel1` vs `Tabel1Kab`, butuh `kecamatanId`) dicatat.

---

## 9. Dimensi desa (rincian per kecamatan) — live fetch

Snapshot `public/data/` hanya berisi baris **kecamatan** (dipanen dengan `kabupatenId`
tanpa `kecamatanId`). Rincian per desa diambil **live dari browser**, bukan dari snapshot.

Aturan yang tidak boleh dilanggar:

1. **`kecamatanId` = penentu granularitas baris.** Menambahkannya mengubah laporan dari
   baris kecamatan menjadi baris desa. Ini satu-satunya cara mendapat rincian desa.
2. **`kelurahanId` diabaikan** `report-siga-dallap-ocp`, `report-siga-yankb-ocp`, dan
   `report-siga-elsimil-ocp` (body byte-identik). Jangan menambahkan parameter itu dan
   mengira hasilnya tersaring. Hanya `report-siga-krs-ocp` dan `pk23-portal-gw/report`
   yang menghormatinya.
3. **Desa disaring di klien**, memakai kolom bernama `DESA`/`KELURAHAN`. Jangan
   "memperbaiki" ini dengan mengirim `kelurahanId` — hasilnya akan sama persis dengan satu
   kecamatan, dan pengguna akan mengira filter rusak.
4. **YAN KB tidak dirinci per desa** (barisnya faskes). `DESA_AWARE_MODULES` di
   `src/lib/wilayah.ts` adalah satu-satunya daftar modul yang boleh menampilkan dropdown
   desa. Perluas set itu hanya setelah membuktikan baris desa benar-benar muncul.
5. **Parser ganda harus tetap sinkron.** `src/lib/jasper.ts` adalah port 1:1 dari
   `parse_report()` di `scripts/build_snapshot.py`. Setiap perubahan aturan parsing harus
   dilakukan di KEDUA tempat; kalau tidak, data live dan snapshot akan berbeda bentuk
   (mis. `columnGroups` hilang di salah satu jalur). Uji paritas: parse HTML yang sama
   dengan keduanya, bandingkan `columns`, `columnGroups`, `rows`, `period`.
6. **Jangan simpan HTML live ke repo.** `_re/` untuk sampel; `public/data/` hanya untuk
   hasil panen yang sudah terparse.
7. **Parameter filter tidak diduplikasi di frontend.** `fetchLiveReport()` membaca `filter`
   yang tersimpan di berkas snapshot periode itu, membuang `kelurahanId`, lalu menambahkan
   `kecamatanId`. Aturan bulanan/kumulatif tetap milik `report_url()` di skrip Python.
   Kalau `filter` tidak ada di berkas lama, fungsi itu melempar galat yang menyuruh panen
   ulang — jangan mengarang filter di sisi klien.
8. **Gagal live ≠ tampilkan snapshot.** Kalau permintaan live gagal, UI menampilkan banner
   galat dan tidak menampilkan tabel, supaya angka kabupaten tidak disangka angka desa.
9. **Daftar wilayah** ada di `public/data/wilayah.json` (11 kecamatan, 135 desa),
   di-vendor dari `location-service`. Itu data referensi, bukan hasil panen; aman
   di-commit dan tidak perlu disegarkan tiap bulan.

---

## 10. Dimensi periode (bulanan, kumulatif & tahunan)

Snapshot sekarang multi-periode, bukan satu file per tabel. Jenis periode ditentukan
`period_type_of(reportCategory)`, dan **kategori adalah sumber kebenaran** — bukan
`periodType` yang tersimpan di file:

| `periodType` | `reportCategory` | Filter yang dikirim |
|---|---|---|
| `monthly` | mengandung `Bulanan` | `tahun` + `bulan` (int 1-12) |
| `cumulative` | mengandung `Komulatif`/`Kumulatif` | `tahun` + `bulan`, atau `tahun` + `bulanAwal` + `bulanAkhir` (aturan per kategori di §4 / `RANGE_CUMULATIVE`) |
| `annual` | sisanya | `tahun` saja |

Kunci periode internal tetap `"YYYY-MM"` (laporan kumulatif pun satu file per bulan
akhir), tetapi **tidak** dikirim apa adanya ke API — `report_url()` memecahnya jadi
`tahun` + `bulan`, atau `tahun` + `bulanAwal`/`bulanAkhir` untuk kategori kumulatif
berentang.
Di `index.json` tiap laporan punya `periodType` (`annual`/`monthly`/`cumulative`) dan
`periods[]` berisi `key`, `label`, `file`, `empty`, `error`, `rowCount`, `colCount`,
`periodStatus`.

File lama mencatat `"annual"` untuk laporan yang kini tergolong kumulatif. Karena itu
`collect_local()` menghitung ulang jenis periode dari `reportCategory`; jangan membaca
`periodType` tersimpan, atau satu laporan muncul dua kali di index.

```bash
# --skip-monthly / --skip-annual memilih jenis periode, --force mengabaikan cache,
# --years & --months menerima daftar (2025,2026) atau rentang (1-10).
TOKEN=<jwt> python scripts/build_snapshot.py --years 2026 --months 1-10
TOKEN=<jwt> python scripts/build_snapshot.py --years 2025,2026 --months 1,2,3 --only elsimil
TOKEN=<jwt> python scripts/build_snapshot.py --skip-monthly --force   # ulang semua tahunan
python scripts/build_snapshot.py --index-only                         # susun ulang index.json
```

**Nama file.** `<reportCategory>__<reportName>__<periodKey>.json` di
`public/data/<modul>/`, contoh `YanKB-Bulanan-Kec__Tabel3__2026-10.json`.

**Token opsional.** `build_snapshot.py` hanya mencetak INFO bila `TOKEN` tidak diset:
endpoint laporan SIGA saat ini tidak menegakkan auth (§6), jadi panen bisa dijalankan cron
tanpa menyimpan kredensial. Bila `TOKEN` ada, header `Authorization` tetap dikirim.

**Penyegaran bulanan otomatis** ada di `scripts/refresh.sh`: panen ulang bulan lalu + bulan
ini (data disusulkan setelah bulan berganti) dan seluruh laporan tahunan tahun berjalan,
lalu menulis ulang `index.json`. Jangan mengubahnya menjadi "hanya bulan berjalan" — angka
bulan lalu masih bisa berubah selama beberapa hari setelah bulan berakhir.

**Cache (`work()`) tidak sama dengan `--force`.** File yang sudah ada dipakai ulang
kecuali salah satu dari ini benar: berisi `error`, `filter` tersimpannya berbeda dari
filter yang akan dikirim, atau tidak punya `"columnGroups"`. Jadi backfill skema (mis.
menambah field baru) cukup dijalankan tanpa `--force` — file lama otomatis diambil ulang
sekali, file yang sudah sesuai skema tidak.

**Merge `index.json` dilakukan PER-PERIODE, bukan per-laporan.** Panen parsial
(`--months 10`, `--skip-annual`, `--max`, `--only`) hanya menyegarkan sebagian periode;
periode lain dari laporan yang sama **tidak boleh hilang** dari index. Bug lama membuang
laporan utuh sehingga index menyusut 1863 → 1425 periode. Aturannya:

- identitas laporan = `(module, group, reportName, reportCategory)`;
- identitas periode = `periods[].file`;
- periode lama dipertahankan bila `file`-nya tidak muncul di hasil panen baru **dan
  berkasnya masih ada di disk** (kalau tidak, entri dibuang — dulu index sempat menunjuk
  17 berkas hilang dan UI gagal memuatnya dengan 404);
- dedup berdasarkan `file` sekaligus mencegah laporan kembar
  (`krs/STUNTING__Tabel4__2026.json` pernah tercatat sebagai `STUNTING` dan
  `STUNTING2025` karena `groupOverrides` menimpa kategori).

`--only` hanya membatasi modul yang **dipanen**, bukan isi index — katalog tetap utuh.

**Aturan saat mengubah parser.** `parse_report()` di `scripts/build_snapshot.py` harus
tetap mengembalikan kontrak yang sama: `title, subtitle, period, wilayah, columns,
columnGroups, rows, empty`. Jangan pernah mengisi `columns` dengan string kosong — pakai
`Kolom N` sebagai fallback. Jangan menulis `period` berisi placeholder `null`.

**Hierarki header (`columnGroups`).** `columnGroups` adalah array sejajar `columns`;
tiap elemennya path header dari induk ke daun, mis.
`["KELUARGA ANGGOTA BKB HADIR DALAM PERTEMUAN", "INFORMASI KESERTAAN KB", "STATUS PUS"]`.
Path **wajib** dibangun dari rentang sel asli (`start, colspan, teks`), bukan dari grid
hasil ekspansi: grid hanya menaruh teks di kolom pertama sel ber-`colspan`, sehingga anak
di kolom kedua dan seterusnya kehilangan nama induknya (mis. `VIRTUAL` kehilangan induk
`CARA PENYULUHAN`). Kalau kolom dipangkas di tepi, `columnGroups` ikut dipotong dengan
`lo:hi+1` agar tetap sejajar.

**Jangan dedup label di parser.** Hierarki harus diekspor apa adanya, termasuk label
induk yang berulang di banyak kolom. Duplikasi adalah urusan renderer: `DataTable.tsx`
menggabungkan sel bertetangga yang label **dan** `rowSpan`-nya sama. Aturan render
(diverifikasi pada DALLAP `Tabel3B` bulanan — 3 baris header, 20 sel, `#`/`KODE`/
`KECAMATAN` rowSpan 3, `CARA PENYULUHAN` colspan 2, `KELUARGA ANGGOTA BKB HADIR DALAM
PERTEMUAN` colspan 8, sama dengan dokumen JasperReports aslinya):

- jumlah baris header = panjang path terpanjang (`maxLen`);
- kolom dengan path panjang `L` menaruh daun di baris `L-1` dengan
  `rowSpan = maxLen - L + 1`, sehingga sel daun menjulang sampai baris terakhir;
- sel bertetangga digabung hanya bila label DAN `rowSpan` sama;
- `maxLen <= 1` (tanpa hierarki) → satu baris label biasa, tanpa sel grup.

Karena itu `columns` tetap datar dan **boleh** berisi daun duplikat. Jangan mengubah
`columnGroups` demi menghilangkan duplikasi; kalau `columns` perlu dibedakan, beri
prefiks induk (lihat aturan `columns` di README).

**Kontrak label periode tercetak (`printedPeriod`/`printedYear`/`periodStatus`).** Tiap
file laporan sekarang juga membawa `printedPeriod` (teks periode yang dicetak di dalam
dokumen, string|null), `printedYear` (int|null), dan `periodStatus`
(`"match"`/`"mismatch"`/`"unknown"` — `match` = tahun tercetak = tahun diminta,
`mismatch` = berbeda, `unknown` = tidak ada yang bisa diurai, mis. `TAHUN : null`).
`index.json` → `periods[]` juga membawa `periodStatus`. File lama tanpa field ini harus
dibaca sebagai `unknown` (UI tidak menampilkan peringatan untuk `unknown`/`match`).
`--index-only` membaca `periodStatus` dari tiap file, default `unknown`.

**Laporan KRS di snapshot berasal dari basis data lama.** `Verval-Tabulasi` (T1/T2/T6) dan
`STUNTING*` `Tabel4` di `pk23-portal-gw` hanya terisi s.d. semester II 2023/2024; tahun 2025+
kosong dengan label basi. Angka verval terkini ada di `getMonitoringKrs` (§4). Jangan
menambal snapshot dengan data dari endpoint lain — modul Verval KRS menampilkannya terpisah.

**Jangan hapus tabel mismatch dari snapshot.** Angkanya tetap data untuk periode yang
diminta; penghapusan justru menyembunyikan fakta bahwa tabel terisi untuk tahun yang
dicetak. Sinyalnya adalah peringatan di UI (banner kuning + penanda chip, lihat
`src/components/ReportView.tsx`, `src/components/PeriodPicker.tsx`; ringkasan user-facing
di README "Label periode basi di dokumen sumber").

**Parser: jangan rusak lagi.** Dua bug yang sudah diperbaiki dan tidak boleh kambuh:
(1) metadata periode harus menangani baris multi-sel dan pasangan label/nilai terpisah
(`["PERIODE", ": SEMESTER II 2023"]`) — versi lama melewatinya sehingga label basi tak
terdeteksi; (2) `is_index_row` harus menerima `/` dan `%` agar baris penomoran kolom
seperti `6 = 5/4*100` dibuang, bukan bocor sebagai baris data pertama.

**Tabel kepercayaan periode** (detail & bukti di README "Kapan angka boleh dipercaya"):

| Modul | Perilaku |
|---|---|
| YAN KB tahunan | ✅ tahun dihormati |
| ELSIMIL tahunan | ✅ tahun dihormati |
| DALLAP tahunan | ⚠️ label tahun benar, angka statis antar tahun |
| KRS Verval-Tabulasi (`report-siga-krs-ocp`, Tabel1/2/6) | ⚠️ hanya 2023 terisi (42 sel non-zero di Tabel1); tahun lain nol semua dengan label basi `PERIODE : SEMESTER II 2023` — file 2026 = data 2026 yang memang kosong, BUKAN data 2023 |
| YAN KB bulanan | ✅ `tahun`+`bulan` dihormati (`BULAN : OKT - 2026`) |
| DALLAP bulanan | ✅ `tahun`+`bulan` dihormati (`BULAN : OKT - 2026`) |
| ELSIMIL bulanan | ✅ `tahun`+`bulan` dihormati; body berbeda antar bulan |
| ELSIMIL kumulatif | ✅ filter per kategori dihormati (Catin: `bulan`; Bumil/Pascasalin/Baduta: `bulanAwal`+`bulanAkhir`) |

**Jangan tambahkan laporan by-name (PII).** Daftar pengecualian ada di `PII_REPORTS`
dalam script; perluas set itu, jangan bikin filter terpisah.

**Keterbatasan sumber (bukan bug scraper).** DALLAP `Tabel18`/`Tabel19`/`Tabel20`
bulanan dijawab server dengan `"HASIL PENCARIAN DATA TIDAK DITEMUKAN"` untuk Kab.
Tanah Laut (juga saat `kecamatanId` diisi). File tersimpan bertanda
`emptyReason: "no-data"` dan UI membedakannya dari tabel kosong biasa.

**Temuan ketersediaan data (diperbarui 2026-10).** Klaim lama "YAN KB & DALLAP
bulanan kosong" dan "ELSIMIL bulanan identik antar bulan" **tidak lagi berlaku**: itu
artefak bug filter `periode` di scraper, bukan perilaku server. Dengan `tahun`+`bulan`,
YAN KB bulanan Tabel1 mengembalikan 365 `<td>`, DALLAP Tabel3B 272 `<td>`, dan ELSIMIL
berbeda antar bulan. Snapshot lama cukup dipanen ulang dengan `--skip-annual` **tanpa**
`--force`: cache mengenali `filter` basi (dan `columnGroups` yang belum ada) lalu
mengambil ulang hanya file yang perlu.
