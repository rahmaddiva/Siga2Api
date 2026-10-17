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

- Laporan **bulanan** memakai `"periode": "YYYY-MM"` (bukan `tahun`).
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

`periode` = semester (`1`/`2`). Tanpa `periode` → 404.

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
