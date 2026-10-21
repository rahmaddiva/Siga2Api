# Reverse Engineering — SIGA (newsiga-siga.kemendukbangga.go.id)

Dokumen hasil RE live pada 2026-10-18 terhadap
`https://newsiga-siga.kemendukbangga.go.id` (aplikasi "SIGA" / SIGA Baru,
Kementerian Kependudukan dan Pembangunan Keluarga / BKKBN).

Fokus: modul **LAPORAN (YAN KB, DALLAP, Keluarga Berisiko Stunting, ELSIMIL)**,
**Verval KRS**, dan **Monitoring KRS**.

> Catatan privasi: semua contoh di dokumen ini memakai placeholder. Tidak ada token,
> password, NIK, nama, KKI, atau URL foto rumah tangga yang disalin ke repo. Semua dump
> mentah ada di `_re/` (gitignored), dan dump yang mengandung baris data sudah dihapus.

---

## 1. Ringkasan arsitektur

| Lapisan | Detail |
|---|---|
| Host SPA | `https://newsiga-siga.kemendukbangga.go.id` (static React build) |
| Router | Hash router (`#/beranda`, `#/yankb`, …) |
| Bundler | webpack 4, global `webpackJsonpeform`, 227 chunk lazy-load |
| API gateway | `https://siga-api-gateway.bkkbn.go.id/<service>/…` |
| Auth server | `https://newsiga-authorization-api.bkkbn.go.id` (refresh token) |
| Report engine | JasperReports (`viewReport` → HTML/`xlsx`/`pdf`) |
| State | `localStorage`: `token`, `refreshToken`, `pass`, `username`, `name`, `data`, `menu`, `fks`, `pkn*` |

### 1.1 Cara load bundle

`index.html` memuat `static/js/main.3f5dce4b.chunk.js` dan satu inline runtime yang
berisi peta chunk `{id: hash}`. Semua 227 chunk sudah diunduh ke `_re/js/chunks/<id>.js`
(versi rapi: `_re/js/pretty/<id>.js`).

Chunk penting:

| Chunk | Isi |
|---|---|
| `206.js` | route table lengkap (173 route) |
| `145.js` | halaman login + `auth/signin` |
| `229.js` | `#/krs` + `#/krsDetail` (report KRS, kategori per tahun) |
| `175.js` | `#/yankb` + `#/yankbDetail` (builder `filterPencarian`) |
| `11.js` | `#/dallap` |
| `42.js` | `#/form/stunting` (Verval KRS) |
| `32.js` | `#/monitoring-krs` + `#/form/stunting` varian |
| `119/144/159` | varian Verval KRS per region |
| `115–117,139` | ELSIMIL CATIN (list, upsert, rekap) |
| `160–164` | ELSIMIL report (Baduta/Bumil/Catin/Pasca) |

---

## 2. Autentikasi

### 2.1 Login

```
POST https://siga-api-gateway.bkkbn.go.id/sigaauthorizationservice/auth/signin?
Content-Type: application/json

{"username":"<USERNAME>","password":"<PASSWORD>","idAplikasi":2}
```

Respons memuat `accessToken`, `refreshToken`, `faskes`, `poktan.{BKB,BKR,BKL,UPPKA,PIKR,…}`,
`data` (authorities), `menu`.

Setelah login frontend menyimpan (dari `chunks/145.js`):

```js
localStorage.setItem("token", accessToken);
localStorage.setItem("pass", password);          // plaintext
localStorage.setItem("refreshToken", refreshToken);
localStorage.setItem("data", JSON.stringify(data));   // authorities + user + wilayah
localStorage.setItem("menu", JSON.stringify(menu));
localStorage.setItem("fks", JSON.stringify(faskes));
```

Catatan: login juga memanggil endpoint statistik kunjungan
`POST /landing-page-be-v2/statistic-pengunjung/insertStatistikKunjungan?kategoriAplikasi=siga%20statistik%20rutin`.

### 2.2 Refresh token

```
POST https://newsiga-authorization-api.bkkbn.go.id/auth/refreshToken
Content-Type: application/json
Authorization: <TOKEN_LAMA>

{"idAplikasi":2,"password":"<PASSWORD>","refreshToken":"<REFRESH_TOKEN>","username":"<USERNAME>"}
```

Ini dipanggil otomatis oleh axios interceptor setiap 401. Karena butuh password
plaintext dari `localStorage.pass`, sesi bisa diperpanjang tanpa input user.

### 2.3 Header standar

```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Beberapa service (`pk23-portal-gw`, modul `verval-config`) memakai
`Authorization: Basic base64("admin:password")` yang **di-hardcode di bundle**
(modul `788` dan `782`), sehingga header ini tidak rahasia.

### 2.4 Struktur hak akses

`localStorage.data` → array; elemen `[0].attributes`:

```json
{
  "role": "<ROLE>",
  "user_name": "<USERNAME>",
  "Entry": "true", "Ubah": "false", "Hapus": "true", "Cetak": "true",
  "user": {
    "userId": "<ID>",
    "namaLevelWilayah": "Pusat|Provinsi|Kabupaten|Kecamatan|Kelurahan",
    "wilProvinsi": {"id_provinsi": 0, "nama": "…"},
    "wilKabupaten": {"id_kabupaten": 0},
    "wilKecamatan": {"id_kecamatan": 0},
    "wilKelurahan": {"id_kelurahan": 0}
  }
}
```

UI memakai ini untuk mengunci dropdown wilayah (level di bawah user dinonaktifkan).

---

## 3. Peta route (dari `localStorage.menu` + chunk 206)

### 3.1 Menu LAPORAN (target utama)

| Menu | Route | Halaman detail |
|---|---|---|
| LAPORAN → YAN KB | `#/yankb` | `#/yankbDetail/:tableCat/:tableId` |
| LAPORAN → DALLAP | `#/dallap` | `#/dallapDetail/:tableCat/:tableId` |
| LAPORAN → KELUARGA BERISIKO STUNTING | `#/krs` | `#/krsDetail/:tableCat/:tableId` |
| LAPORAN → ELSIMIL → CATIN | `#/catin` | `#/catinDetail/:tableCat/:tableId` |
| LAPORAN → ELSIMIL → IBU HAMIL | `#/bumil` | `#/bumilDetail/:tableCat/:tableId` |
| LAPORAN → ELSIMIL → PASCAPERSALINAN | `#/pasca` | `#/pascaDetail/:tableCat/:tableId` |
| LAPORAN → ELSIMIL → BADUTA | `#/baduta` | `#/badutaDetail/:tableCat/:tableId` |
| LAPORAN → MBG | `#/mbg` | `#/mbgDetail/:tableCat/:tableId` |
| REKAPITULASI | `#/tabulasi` | `#/tabulasiyankbDetail/…`, `#/tabulasidallapDetail/…`, `#/tabulasikrsDetail/…` |

Contoh konkret yang tertangkap dari DOM:

```
#/krsDetail/STUNTING/Tabel3
#/krsDetail/STUNTING/Tabel4
#/krsDetail/STUNTING/Tabel5
#/dallapDetail/Dallap-Tahunan-Prov-Kab-Kec/Tabel1
#/catinDetail/Catin-Tahunan/Tabel1
```

### 3.2 Menu VERVAL KRS

| Menu | Route |
|---|---|
| Verval KRS → Keluarga Berisiko Stunting | `#/form/stunting` |
| Verval KRS → Monitoring KRS | `#/monitoring-krs` |
| PENGATURAN → Lokus | `#/form/lokus` |

### 3.3 Route lain (untuk referensi)

`#/beranda`, `#/chpass`, `#/bantuan`, `#/upload`, `#/401`, `#/user`, `#/role`,
`#/pendaftaran`, `#/pendaftaran/daftar`, `#/register`, `#/alokon`, `#/sdm/*`,
`#/sarana/*`, `#/kegiatan/*`, `#/setara/*`, `#/tpk/*`, `#/monitoring-siga-sirika`,
`#/elsimil/catin`, `#/elsimil/bumil`, `#/elsimil/pascasalin`, `#/elsimil/baduta`,
`#/elsimil/user-catin`, `#/elsimil/monitoring-catin`, `#/approval`, `#/approvalMonitoring`,
`#/batasentry`, `#/mbg`.

---

## 4. Peta service gateway

Semua base URL ditemukan dari `baseURL:` di bundle:

| Service | Kegunaan |
|---|---|
| `sigaauthorizationservice` | login, menu, refresh |
| `sigaauthorizationservice-v2` | `auth/signin`, `user/getMaintenanceStatus` |
| `location-service` | dropdown wilayah |
| `report-siga-yankb-ocp` | laporan YAN KB |
| `report-siga-dallap-ocp` | laporan DALLAP |
| `report-siga-krs-ocp` | laporan KRS (tabulasi/verval) |
| `report-siga-elsimil-ocp` | laporan ELSIMIL (Catin/Bumil/Pasca/Baduta/MBG) |
| `report-siga-ocp` | katalog parameter laporan (`getReportParameter`) |
| `modul-stunting-<service>` | data Verval KRS (per provinsi) |
| `modul-stunting-sigabaru` | Monitoring KRS, data 2023 |
| `rekap-stunting` | rekap (dipakai sebagian modul) |
| `prod-elsimil-cdb-service` | data mentah ELSIMIL (CouchDB) |
| `prod-monitoring-siga-sirika` | monitoring Sirika |
| `pk23-portal-gw.bkkbn.go.id/report` | laporan KRS (Jasper) |
| `pk23-portal-gw.bkkbn.go.id/verval-config` | resolver service verval per provinsi |

Catatan: setiap modul axios mendefinisikan base URL **production** dua kali — pertama
nilai internal (`*.apps.tkp.platform.lintasarta.net`), lalu ditimpa ke gateway publik.
Jadi host internal di bundle bukan endpoint aktif.

---

## 5. LAPORAN — pola umum `viewReport`

### 5.1 Bentuk request

```
GET https://siga-api-gateway.bkkbn.go.id/<report-service>/viewReport
    ?filterPencarian=<urlencoded JSON>
Authorization: Bearer <TOKEN>
```

`filterPencarian` (contoh YAN KB tahunan tingkat kecamatan):

```json
{"tahun":"2026","provinsiId":"22","kabupatenId":"322",
 "reportName":"Tabel1","reportType":"html","reportCategory":"YanKB-Tahunan-Kec"}
```

Respons: `200 text/html` berisi satu halaman JasperReports
(`<table class="jrPage">`), bukan JSON. Untuk ekspor: `reportType=xlsx` atau `pdf`
(`Content-Type: application/xlsx` terverifikasi).

### 5.2 Field `filterPencarian` yang dikenal

| Field | Dipakai | Nilai |
|---|---|---|
| `tahun` | tahunan & bulanan | `"2026"` |
| `bulan` | **bulanan (wajib)** | integer `1`–`12` (bukan string) |
| `bulanAwal` / `bulanAkhir` | kumulatif `Bumil-`/`Pascasalin-`/`Baduta-` | integer; rentang bulan, mis. `1` + `10` |
| `periode` | ⚠️ **diabaikan server** | `"YYYY-MM"` — jangan dipakai; jawabannya tabel kosong |
| `semester` | KRS 2023/2024 | `"1"`/`"2"` |
| `provinsiId` | semua | id numerik string |
| `kabupatenId` | semua | id numerik string; `0`/absen = level provinsi |
| `kecamatanId` | KRS Tabel5 (wajib), lain opsional | |
| `kelurahanId` | opsional | |
| `reportName` | semua | lihat katalog §6 |
| `reportType` | semua | `html`, `xlsx`, `pdf` |
| `reportCategory` | semua | lihat katalog §6 |
| `baduta`/`balita`/`pus`/`hamil` | KRS | `"V"` |
| `risiko_stunting` | KRS | nilai filter |
| `kesejahteraan_prioritas` | KRS | nilai filter (angka) |

### 5.3 Perilaku khusus per modul

**YAN KB** (`chunks/175.js`):
```js
bulan = bulan < 10 ? "0"+bulan : bulan;
reportName = kabupatenId !== 0 ? "Tabel1Kab" : "Tabel1";   // khusus Tabel 1 bulanan
filterPencarian = {
  periode: `${tahun}-${bulan}`,
  provinsiId, kabupatenId,
  reportName, reportType: "html",
  reportCategory: catTable   // "YanKB-Bulanan-Kec" | "YanKB-Tahunan-Kec" | "YanKB-Tahunan"
}
```
Perhatikan: bundle mengirim `periode`, **bukan** `tahun`+`bulan`. Potongan itu
didokumentasikan sebagai perilaku aplikasi aslinya; jangan ditiru — lihat koreksi
filter bulanan di bawah.
Terverifikasi live: `YanKB-Tahunan-Kec`/`Tabel1` → 200, 72.105 byte HTML.
`YanKB-Bulanan-Kec`/`Tabel1` dengan `periode=2026-10` → 200, 1.567 byte
(halaman kosong karena `periode` diabaikan, **bukan** karena belum ada data);
`Tabel1Kab` → 200 kosong. Filter yang benar (`tahun` + `bulan`) mengembalikan 365 `<td>`
berisi angka — lihat tabel koreksi di bawah.

**Filter bulanan — koreksi penting (terverifikasi live 2026-10, kab 322).**
Bundle `chunks/11.js` membangun URL sebagai
`{"tahun":<tahun>}` lalu menambahkan `"bulan":<bulan>` **hanya** bila
`"Dallap-Bulanan" === catTable`. Uji langsung menunjukkan `periode` selalu
diabaikan, dan `bulan` **juga** dihormati oleh kategori lain:

| `reportCategory` | `periode` saja | `tahun` saja | `tahun`+`bulan` |
|---|---|---|---|
| `YanKB-Bulanan-Kec` | 11 `<td>` (kosong) | 365 `<td>` | 365 `<td>`, isi beda per bulan |
| `Dallap-Bulanan` | 11 `<td>` (kosong) | 272 `<td>` | 272 `<td>`, isi beda per bulan |
| `Dallap-RekapBulanan` | 0 byte | 9 `<td>` | 242 `<td>`, isi beda per bulan |
| `Catin-Bulanan` (ELSIMIL) | 358 `<td>`, **identik antar bulan** | — | 358 `<td>`, beda antar bulan |

Jadi untuk semua laporan `*Bulanan*` kirim **`tahun` + `bulan`**. Label yang
dicetak laporan bulanan adalah `BULAN : OKT - 2026` (bukan `TAHUN :`), sehingga
parser metadata harus mengenali prefiks `BULAN` juga.

> ⚠️ Kolom "`tahun` saja" pada tabel di atas **bukan** hasil yang setara: jumlah
> `<td>`-nya sama, tetapi label periode tercetak `null` dan **semua sel angka 0**.
> Jangan simpulkan `bulan` opsional dari jumlah `<td>`. Ukur dengan sel numerik
> non-nol: `YanKB-Bulanan-Kec/Tabel1` 2026 → `tahun` saja 25 sel, `tahun`+`bulan`
> 138–146 sel.

**Kumulatif (`*-Komulatif` / `*-Kumulatif`) — filter berbeda lagi.** Diukur dari
sel non-nol `Tabel1`, 2026-10:

| `reportCategory` | `tahun` | `tahun`+`bulan` | `tahun`+`bulanAwal`+`bulanAkhir` |
|---|---|---|---|
| `Catin-Komulatif` | 24 | **141** | 24 |
| `Bumil-Komulatif` | 26 | 26 | **168** |
| `Pascasalin-Komulatif` | 47 | 47 | **253** |
| `Baduta-Kumulatif` | 29 | 29 | **220** |

Jadi hanya `Catin-Komulatif` yang memakai `bulan`; tiga lainnya memakai rentang
`bulanAwal`/`bulanAkhir`. Salah filter tidak menghasilkan tabel kosong — angkanya
diam-diam jadi potongan tahun, yang lebih sulit dideteksi.

**DALLAP** (`chunks/11.js`): pola sama, `reportCategory` =
`Dallap-Tahunan-Prov-Kab-Kec` | `Dallap-Tahunan` | `Dallap-Bulanan` | `Dallap-RekapBulanan`.
Terverifikasi: `Dallap-Tahunan-Prov-Kab-Kec`/`Tabel1` → 200, 40.402 byte, 198 `<td>`.

**KRS** (`chunks/229.js`) — paling rumit, `reportCategory` berubah per tahun:

```js
let cat = "STUNTING";
if (["Tabel1","Tabel2","Tabel6"].includes(reportName)) {
  if (tahun === 2023) cat = catTable;           // "Verval-Tabulasi"
  if (tahun === 2024) cat = catTable + "2024";
} else {
  cat = tahun === 2021 ? "STUNTING"
      : tahun === 2022 ? "STUNTING2022"
      : tahun === 2023 ? "STUNTING2023"
      : tahun === 2024 ? "STUNTING2024"
      : "STUNTING2025";
}
// Tabel 3 di-rename jadi Tabel3A_NEW saat cetak
let printName = reportName === "Tabel3" ? "Tabel3A_NEW" : reportName;
```

Terverifikasi live: `Tabel4` + `STUNTING2025` + `kabupatenId=322` →
`200 text/html`, 110.714 byte, 434 `<td>`.

**ELSIMIL** (`chunks/160–164`): `reportCategory` =
`Catin-Tahunan|Bulanan|Komulatif`, `Bumil-*`, `Pascasalin-*`, `Baduta-*`, `ElsimilMbg`.
Terverifikasi: `Catin-Tahunan`/`Tabel1` → 200, 67.635 byte, 350 `<td>`;
`Bumil-Tahunan`/`Tabel1` → 200, 76.640 byte; `Baduta-Tahunan`/`Tabel1` → 200, 88.804 byte.

### 5.3.1 Dimensi wilayah: `kecamatanId` mengubah BARIS, `kelurahanId` diabaikan

Diverifikasi live 2026-10-21 (kab 322, kec Panyipatan 5844, desa Batu Tungku 55409).
Ini yang membuat rincian per desa mungkin — dan sekaligus menjelaskan kenapa filter desa
tidak bisa dikirim sebagai parameter.

| Service | tanpa `kecamatanId` | `kecamatanId` | `kecamatanId`+`kelurahanId` |
|---|---|---|---|
| `report-siga-dallap-ocp` (`Tabel1`) | 28.143 B, baris kecamatan | 23.080 B, **baris desa** | **identik** dengan tanpa `kelurahanId` |
| `report-siga-yankb-ocp` (`Tabel1`) | 72.105 B | 33.100 B, baris **faskes** | identik |
| `report-siga-elsimil-ocp` (`Catin-Bulanan`) | 68.476 B | 64.642 B, baris desa | identik |
| `report-siga-krs-ocp` (`Verval-Tabulasi`) | 53.850 B | 33.701 B, baris desa | 22.642 B, **baris RW** |
| `pk23-portal-gw/report` (`STUNTING2025` `Tabel4`) | 110.714 B | 103.954 B, baris desa | 68.381 B, baris RW |

Kesimpulan:

1. `kecamatanId` dihormati **semua** service dan menurunkan granularitas baris satu tingkat
   (kecamatan → desa).
2. `kelurahanId` **hanya** dihormati `report-siga-krs-ocp` dan `pk23-portal-gw`. Untuk
   DALLAP, YAN KB, dan ELSIMIL body-nya byte-identik (SHA-256 sama) — parameter itu
   diabaikan, bukan "tidak ada data".
3. Nama parameter lain juga diabaikan DALLAP: `id_kelurahan`, `desaId`, `kelurahan`,
   `idKelurahan` semuanya menghasilkan body identik.
4. **YAN KB tidak punya dimensi desa.** `kecamatanId` menyaring faskes, tetapi baris tetap
   daftar faskes (Tabel1/T3/T5/T7A/T8A/T9A semuanya 0 baris bernama desa). Jadi filter desa
   tidak bermakna untuk modul ini, dan aplikasi menonaktifkannya.

Karena itu Siga2Api mengambil satu kecamatan lalu menyaring desa di klien, bukan meminta
satu desa ke server.

**Daftar wilayah** (`location-service`, terbuka tanpa token):

```
GET …/location-service/siga/location/getListKecamatanByIdKabupaten?id_kabupaten=322
→ 11 kecamatan (Takisung 6157 … Bumi Makmur 6624)
GET …/location-service/siga/location/getListKelurahanByIdKecamatan?id_kecamatan=5844
→ 10 desa; tiap baris {id_kelurahan, nama_kelurahan, kodeDepdagri, id_kecamatan, …}
```

Total Kab. Tanah Laut: **11 kecamatan, 135 desa** (2–20 desa per kecamatan; Pelaihari 20,
Takisung 12). `fetch` dari origin `localhost` berhasil — gateway memantulkan `Origin`
(lihat §13.2), jadi aplikasi statis bisa memanggilnya tanpa proxy.

### 5.4 Service per modul (ringkas)

```
YAN KB      → https://siga-api-gateway.bkkbn.go.id/report-siga-yankb-ocp
DALLAP      → https://siga-api-gateway.bkkbn.go.id/report-siga-dallap-ocp
KRS         → https://pk23-portal-gw.bkkbn.go.id/report
KRS tabulasi→ https://siga-api-gateway.bkkbn.go.id/report-siga-krs-ocp
ELSIMIL     → https://siga-api-gateway.bkkbn.go.id/report-siga-elsimil-ocp
```

---

## 6. Katalog laporan (`getReportParameter`)

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-ocp/getReportParameter
```

Respons JSON dengan grup berikut (jumlah entri):

| Grup | n | `reportCategory` |
|---|---|---|
| `yankbTahunan` | 34 | `YanKB-Tahunan-Kec`, `YanKB-Tahunan` |
| `yankbBulanan` | 95 | `YanKB-Bulanan-Kec` |
| `dallapTahunan` | 73 | `Dallap-Tahunan-Prov-Kab-Kec`, `Dallap-Tahunan` |
| `dallapBulanan` | 31 | `Dallap-Bulanan` |
| `dallapRekapBulanan` | 16 | `Dallap-RekapBulanan` |
| `verval` | 3 | `STUNTING` |
| `vervalTabulasi` | 3 | `Verval-Tabulasi` |
| `vervalTabulasi2024` | 0 | — |
| `export` | 12 | `Export-R1` |
| `rekapFaskesProv/Kab/Kec` | 4 each | `RekapFaskesProv/Kab/Kec` |
| `rekapFaskes` | 4 | `RekapFaskes` |
| `catinTahunan/Bulanan/Komulatif` | 4 each | `Catin-Tahunan/Bulanan/Komulatif` |
| `bumilTahunan/Bulanan/Komulatif` | 3 each | `Bumil-*` |
| `bumilIndividu` | 1 | `Bumil-Individu` |
| `pascasalinTahunan/Bulanan/Komulatif` | 3 each | `Pascasalin-*` |
| `pascasalinIndividu` | 1 | `Pascasalin-Individu` |
| `elsimilBadutaBulanan/Tahunan/Kumulatif` | 5 each | `Baduta-*` |
| `elsimilMbg` | 2 | `ElsimilMbg` |

### 6.1 Verval KRS (grup `verval`, `reportCategory = "STUNTING"`)

| reportName | Isi |
|---|---|
| `Tabel3` | Rekapitulasi KRS berdasarkan nama dan alamat |
| `Tabel4` | Rekapitulasi KRS berdasarkan wilayah |
| `Tabel5` | Formulir verifikasi & validasi KRS (butuh minimal `kecamatanId`) |

### 6.2 Verval Tabulasi (grup `vervalTabulasi`, `reportCategory = "Verval-Tabulasi"`)

| reportName | Isi |
|---|---|
| `Tabel1` | Jumlah keluarga sasaran berisiko stunting diverval |
| `Tabel2` | … menurut status keluarga |
| `Tabel6` | Rekapitulasi verval menurut jenis pendampingan |

### 6.3 YAN KB tahunan (34 tabel)

`Tabel1`, `Tabel1A`, `Tabel1B`, `Tabel2`, `Tabel3`, `Tabel3A`, `Tabel3B`, `Tabel4`,
`Tabel5`, `Tabel5A`, `Tabel5B`, `Tabel6`, `Tabel7A`, `Tabel7B`, `Tabel8A`, `Tabel8B`,
`Tabel8C`, `Tabel9A`, `Tabel9B`, `Tabel9C`, `Tabel10A`, `Tabel10B`, `Tabel10C`,
`Tabel11A`, `Tabel11B`, `Tabel11C` → `YanKB-Tahunan-Kec`;
`Tabel12`, `Tabel12A–C`, `Tabel13`, `Tabel13A–C` → `YanKB-Tahunan` (tingkat provinsi).

### 6.4 DALLAP tahunan (73 tabel)

`Tabel1` (cakupan data potensi wilayah) → `Dallap-Tahunan-Prov-Kab-Kec`;
`Tabel2A … Tabel23B` → `Dallap-Tahunan`. Mencakup PKB, PLKB, PPKBD, SUB PPKBD, POK-KB,
BKB/BKR/BKL/UPPKA/PIK-R, Rumah Dataku, PPKS, Kampung KB, balai penyuluhan, dan
rekapitulasi potensi wilayah (Tabel 20–23).

### 6.5 ELSIMIL

- **CATIN** (4 tabel): pendaftaran & kelompok umur, hasil pemeriksaan kesehatan wanita,
  hasil skrining pria, status/jenis pendampingan.
- **BUMIL** (3 tabel + 1 individu).
- **PASCASALIN** (3 tabel + 1 individu).
- **BADUTA** (5 tabel).
- **MBG** (2 tabel: BNBA penerima manfaat, jumlah penerima manfaat).

> Katalog lengkap (deskripsi per tabel) ada di `_re/getReportParameter.json`
> (gitignored). Jangan menyalin isi file itu ke repo tanpa menyaring.

---

## 7. Verval KRS — data mentah (`#/form/stunting`)

### 7.1 Resolver service per provinsi

Verval KRS **tidak** memakai satu host tetap; service ditentukan per provinsi:

```
GET https://pk23-portal-gw.bkkbn.go.id/verval-config/verval/vervalConfig/getVervalServiceByIdProvinsi?idProvinsi=22
Authorization: Bearer <TOKEN>   (praktiknya juga 200 tanpa auth)

→ {"namaProvinsi":"KALIMANTAN SELATAN","idProvinsi":22,
   "service":"regc",
   "url":"https://siga-api-gateway.bkkbn.go.id/modul-stunting-regc/"}
```

Jadi base data = `https://siga-api-gateway.bkkbn.go.id/modul-stunting-<service>/siga/stunting/`.
Provinsi 22 → `regc`. Tahun 2023 memakai `modul-stunting-sigabaru`.

### 7.2 Daftar keluarga (grid utama)

```
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-<service>/siga/stunting/getDataStatusVerval
    ?bulan=10&tahun=2026&page=1&recordPerPage=50
    [&nik=<NIK>][&nama=<NAMA>]
    [&idProvinsi=][&idKabupaten=][&idKecamatan=][&idKelurahan=][&idRw=][&idRt=]
    [&balita=][&baduta=][&statusHamil=][&statusPus=][&statusKeluarga=]
    [&statusKrs=][&statusVerval=]
Authorization: Bearer <TOKEN>
```

Respons:

```json
{"page":1,"recordPerPage":50,"totalRecord":398,"totalStatusKeluarga":1990,"data":[ … ]}
```

`totalRecord` = jumlah baris keluarga, `totalStatusKeluarga` = total status KRS agregat.

**Field per baris** (92 field, hanya nama field yang dicatat):

```
id_stunting, kki, nik, nama, hubungan_dengan_kk, tanggal_lahir, usia, status_pus,
status_hamil, kesertaan_kb_modern, id_provinsi, id_kabupaten, id_kecamatan,
id_kelurahan, id_rw, id_rt, sumber_air_minum, memiliki_tempat_bab, status_keluarga,
kesejahteraan_prioritas, pendampingan_tpk, terlalu_muda, terlalu_tua, terlalu_dekat,
terlalu_banyak, sasaran_stunting, status_verval, tanggal_verval, nama_istri, balita,
baduta, usia_bulan, pus_hamil, resiko_stunting, pus_kb_modern,
pendampingan_tpk_{rujukan,bansos,kie,elsimil,eppgbm,baas,pmt,tidak_ada,genting},
kode_ibu_kandung, latitude, longitude, jenis_kelamin, audit_trail, status_draft,
nik_istri, usia_kehamilan, keterangan, foto_rumah, foto_jamban, tanggal_capture,
bulan_rekap, tahun_rekap, individuAkanMenikah, nik_tidak_wajar, flag, flag_posyandu,
sudah_diukur, status_pengukuran, tanggal_kunjungan, sasaran_genting,
dapat_bansos_genting, sts_paud, id_frm, no_kk, jarak_sam, memiliki_aset, jns_atap,
kondisi_atap, jns_dinding, kondisi_dinding, jns_lantai, kondisi_lantai,
sumber_penerangan, daya_penerangan, jml_orang_tinggal, bahan_bakar_masak,
kepemilikan_bangunan, luas_rumah, foto_bantuan, status_pengukuranAsInt
```

> **PII**: baris berisi `nama`, `nik`, `nik_istri`, `no_kk`, `kki`, `id_frm`
> (pola `<timestamp>p<kode wilayah><nama>`), koordinat, dan URL foto rumah/jamban.
> Jangan disimpan/dibagikan. Ambil hanya field agregat yang dibutuhkan.

### 7.3 Detail satu keluarga

```
GET …/modul-stunting-<service>/siga/stunting/getDetailVervalKrs
    ?bulan=<1-12>&tahun=<YYYY>&nomorKeluarga=<KKI>[&idProvinsi=<ID>]
```

### 7.4 Agregat wilayah (untuk peta/tabel ringkas)

```
GET …/modul-stunting-<service>/siga/stunting/getVervalWilayah
    ?idProvinsi=&idKabupaten=&idKecamatan=&idKelurahan=
→ {"data":[ … ]}
```

### 7.5 Ringkasan & KB aktif (dipakai panel ringkasan)

```
GET …/getRingkasanRekapPK?bulan=&tahun=[&nik=][&nama=][&idProvinsi=][&idKabupaten=]
    [&idKecamatan=][&idKelurahan=][&idRw=][&idRt=]
GET …/getRingkasanKbAktifRekapPK?bulan=&tahun=… (parameter sama)
```

Field ringkasan: `jumlahKeluarga`, `jumlahJiwa`, `jumlahPus`, `jumlahWanitaHamil`,
`inginAnak`, `inginAnakDitunda`, `tidakInginAnakLagi`, `sasaranPoktan`, `kesertaanPoktan`,
`jumlahSasaranBkb/Bkr/Bkl`, `jumlahKesertaanBkb/Bkr/Bkl/Uppka`.

### 7.6 KKI berikutnya (form entri)

```
GET …/siga/stunting/getNextKki?idWilayah=<id_kelurahan>
```

### 7.7 Catatan validasi UI

- Role `Operator Krs` + level `Kecamatan` → wajib pilih kecamatan.
- Role lain → wajib minimal desa/kelurahan ("Wilayah harus dimasukkan minimal Desa/Kelurahan").
- Tanpa itu grid tidak memanggil API sama sekali.

---

## 8. Monitoring KRS (`#/monitoring-krs`)

```
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs
    ?tahun=2026&periode=2
    [&idProvinsi=22][&idKabupaten=322][&idKecamatan=][&idKelurahan=]
Authorization: Bearer <TOKEN>
```

- `periode` = semester (`1`/`2`). **Tanpa `periode` bukan 404** — lihat koreksi di §8.0.
- Respons: `{"data":[{…}]}`; frontend membuang baris dengan `totalVervalAdaBaru === 0`.
- Terverifikasi live 2026-10-18: 200, data per kecamatan untuk Kab. Tanah Laut.

### 8.0 Koreksi & dimensi wilayah (terverifikasi live 2026-10-21)

**Klaim lama "tanpa `periode` → 404" salah.** `getMonitoringKrs` tanpa `periode` membalas
**200** dan mengembalikan penjumlahan semester 1 + 2:

| Kecamatan | `periode=1` | `periode=2` | tanpa `periode` | cakupan tanpa `periode` |
|---|---|---|---|---|
| TAKISUNG | 209 | 166 | **375** | 200% |
| JORONG | 124 | 111 | **235** | 190,91% |
| PELAIHARI | 305 | 893 | **1.198** | 180% |

`kelurahanVerval` juga dobel (Pelaihari 36 dari target 20). Jadi angka tanpa `periode`
diam-diam berisi dua semester; bukan "semua data", dan bukan galat. Bundle `chunks/32.js`
hanya menambahkan `periode` bila dropdown Semester terisi — jangan tiru, selalu kirim
eksplisit.

`periode` di luar 1/2: `0` dan `3` → 200 `{"data":[]}`; nilai non-angka → **400**.

**Dimensi baris mengikuti wilayah terdalam:**

| Parameter | Baris | `kategoriLaporan` |
|---|---|---|
| `idProvinsi=22` | 13 kabupaten (Kalsel) | `Provinsi` |
| `+idKabupaten=322` | 11 kecamatan (Tanah Laut) | `Kabupaten` |
| `+idKecamatan=5844` | 10 desa (Panyipatan) | `Kecamatan` ← label level yang diminta, bukan level baris |
| `+idKelurahan=55409` | 1 baris (Batu Tungku) | `Kelurahan` |

Artinya `kategoriLaporan` adalah **level kueri**, bukan level baris. Jangan pakai field itu
untuk menebak granularitas; pakai keberadaan `idKecamatan`/`idKelurahan`.

`tahun` benar-benar dihormati: 2025 TAKISUNG `totalVervalAdaBaru` = 2.121, 2026 = 166.
Tahun 2023 membalas **5 baris** (hanya kecamatan yang punya data), bukan 11.

**Tipe data:** semua angka dikirim sebagai **string berpemisah ribuan**
(`"totalVervalAdaBaru": "1,198"`, `"pusSasaran": "4,741"`), kecuali
`cakupanKelurahanVerval` (float). `Number("1,198")` = `NaN`; buang koma dulu.

**Field lengkap per baris (34):** `kategoriLaporan`, `kode`, `namaDaerah`, `kelurahanAda`,
`kelurahanTarget`, `kelurahanVerval`, `cakupanKelurahanVerval`, `pusSasaran`,
`pusVervalAda`, `pusVervalBaru`, `pusVervalAdaBaru`, `pusHamilSasaran`,
`pushamilVervalAda`, `pushamilVervalBaru`, `badutaSasaran`, `badutaVervalAda`,
`badutaVervalBaru`, `balitaSasaran`, `balitaVervalAda`, `balitaVervalBaru`,
`keluargaSasaranCatin`, `sasaranPrioritas`, `prioritasTerverval`, `adaBaruLainTerverval`,
`totalSasaran`, `totalVervalAdaBaru`, `totalVervalAda`, `totalVervalBaru`, `total`,
`pushamilVerval`, `badutaVerval`, `balitaVerval`, `totalRekap`, `persenTarget`.

Kolom tabel (urutan tampilan):

```
Nama Kecamatan,
Jumlah Desa/Kelurahan (ada), (target), (telah di-Verval), Cakupan %,
Jumlah Sasaran KRS (Baseline), Jumlah Sasaran KRS Verval,
PUS {Verval, Sasaran},
PUS Hamil/Ibu Hamil {Verval, Sasaran},
Keluarga punya anak 0-23 bulan {Verval, Sasaran},
Keluarga punya anak 24-59 bulan {Verval, Sasaran},
TOTAL SASARAN PRIORITAS {Sasaran Prioritas, Prioritas Terverval},
Jumlah Keluarga {Ada, Baru, Jumlah},
TOTAL (20+21),
Keluarga Sasaran Catin {Ada, Baru},
Selain Ada/Baru Terverval
```

Field yang dipakai frontend: `totalVervalAdaBaru` (filter), plus field agregat lain
pada objek baris.

### 8.1 Cetak Monitoring KRS

Tombol **Cetak** memanggil dua laporan berbeda, **keduanya di gateway
`report-siga-ocp`** — bukan `pk23-portal-gw` seperti yang sempat tercatat. Ditangkap dari
jaringan saat tombol ditekan (Dialog "Cetak Formulir" → Rekap/Detail):

```
# Detail (tombol "Detail")
GET https://siga-api-gateway.bkkbn.go.id/report-siga-ocp/viewReport
    ?filterPencarian={"tahun":"2026","provinsiId":"22","kabupatenId":"322",
      ["kecamatanId":"…",]"reportName":"MonitoringVerval2024",
      "reportType":"xlsx","periode":"2","reportCategory":"Monitoring"}

# Rekap (tombol "Rekap")
GET https://siga-api-gateway.bkkbn.go.id/report-siga-ocp/viewReport
    ?filterPencarian={"tahun":"2026","provinsiId":"22","kabupatenId":"322",
      ["kecamatanId":"…",]["kelurahanId":"…",]"reportName":"MonitoringPendataanVerval2024",
      "reportType":"xlsx","periode":"2","reportCategory":"Monitoring"}
```

`reportName` memakai sufiks `2024` untuk tahun ≠ 2023 (sesuai `chunks/32.js`); tanpa sufiks
(`MonitoringVerval`) membalas **200 dengan body 0 byte** untuk tahun 2026. Wajib minimal
`provinsiId`.

Terverifikasi: level kabupaten `application/xlsx` 45.601 B (Detail) / 44.386 B (Rekap);
level kecamatan 7.825 B; `reportType=pdf` → `application/pdf` 148.133 B.

---

## 9. ELSIMIL — data operasional

Base: `https://siga-api-gateway.bkkbn.go.id/prod-elsimil-cdb-service`

### 9.1 Daftar / detail CATIN

```
GET /elsimil/catin/getDetailCatin?idProvinsi=&idKabupaten=&idKecamatan=&idKelurahan=&idRw=&idRt=
→ [ { … } ]        (array, bukan envelope)
```

Wajib sampai level RT (validasi UI: "Wilayah harus dimasukkan sampai tingkat RT").
Terverifikasi live: 200, 1 record pada `idKelurahan=55467`.

Field (95 field, hanya nama): `_id`, `_rev`, `id_catin`, `nama_wanita`, `nik_wanita`,
`tgl_lahir_wanita`, `usia_wanita`, `no_hp_wanita`, `kki_rekap_wanita`, alamat & kode
wilayah (`*_wanita` / `*_pria` untuk prov/kab/kec/kel/rw/rt, termasuk `*_depdagri_*`),
`nama_pria`, `nik_pria`, `tgl_lahir_pria`, `data_kunjungan[]`, `status_nikah`,
`status_verifikasi`, `tgl_rencana_pernikahan`, `tgl_nikah`, `longitude`, `latitude`,
`status_imt`, `status_hemoglobin`, `status_lila`, `tanggal_pendaftaran`,
`konfirmasi_pindah*`, `created_*`, `updated_*`, `audit_*`.

### 9.2 Tulis / hapus CATIN

```
POST   /elsimil/catin/upsertCatin              (body = objek catin, JSON.stringify)
DELETE /elsimil/catin/deleteCatinTPKByIdCatin?idCatin=&kkiRekapWanita=&namaWanita=&nikWanita=&namaWanitaRekap=&nikWanitaRekap=
```

### 9.3 Rekap ELSIMIL

```
GET /elsimil/rekap/getRekapByLocation?page=<n>&jenisKelamin=1|2
GET /elsimil/rekap/getRekapByNik?jenisKelamin=1|2
```

### 9.4 Login CATIN mandiri

```
POST /catinAuth/signin    (username numerik = NIK)
POST /auth/signin         (username non-numerik)
body: {"idAplikasi":2,"password":"<PASSWORD>","refreshToken":"<REFRESH_TOKEN>","username":"<USERNAME>"}
→ { accessToken, refreshToken, wilayahPenugasan:[{idRw, idRt}] }
```

### 9.5 Lain-lain

`/elsimil/ubah-kata-sandi`, `/elsimil/konfirmasi-email` (route UI `#/elsimil/user-catin`).

---

## 10. Location service (dipakai semua filter)

```
GET https://siga-api-gateway.bkkbn.go.id/location-service/siga/location/getListProvinsi
GET …/getListKabupatenByIdProvinsi?id_provinsi=<id>
GET …/getListKecamatanByIdKabupaten?id_kabupaten=<id>
GET …/getListKelurahanByIdKecamatan?id_kecamatan=<id>
GET …/getListRwByIdKelurahan?id_kelurahan=<id>
GET …/getListRtByIdRw?id_rw=<id>
```

Bentuk baris provinsi: `{id_provinsi, nama, kodeDepdagri}` (38 provinsi).
Kabupaten: `{id_kabupaten, id_provinsi, nama_kabupaten, kodeDepdagri, …}`.
Kecamatan: `{id_kecamatan, id_kabupaten, nama_kecamatan, kodeDepdagri, …}`.
Kelurahan: `{id_kelurahan, id_kecamatan, nama_kelurahan, kodeDepdagri, …}`.

Contoh terverifikasi: provinsi `22` = KALIMANTAN SELATAN, `322` = TANAH LAUT,
`6157` = TAKISUNG, `55467` = BANUA LAWAS.

Catatan: semua ID ini **internal SIGA**, bukan kode BPS. `kodeDepdagri` yang dipakai
untuk tampilan (mis. `63`, `01`).

---

## 11. Resep reproduksi cepat

### 11.1 Ambil token dari sesi aktif (browser)

```js
// di konteks halaman (tab relay)
const token = localStorage.getItem('token');
fetch(url, { headers: { Authorization: 'Bearer ' + token } });
```

### 11.2 YAN KB — Tabel 1 tahunan Kab. Tanah Laut (HTML)

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-yankb-ocp/viewReport
 ?filterPencarian=%7B%22tahun%22%3A%222026%22%2C%22provinsiId%22%3A%2222%22%2C%22kabupatenId%22%3A%22322%22%2C%22reportName%22%3A%22Tabel1%22%2C%22reportType%22%3A%22html%22%2C%22reportCategory%22%3A%22YanKB-Tahunan-Kec%22%7D
Authorization: Bearer <TOKEN>
```

### 11.3 DALLAP — Tabel 1 tahunan

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-dallap-ocp/viewReport
 ?filterPencarian=<{tahun:"2026",provinsiId:"22",kabupatenId:"322",
   reportName:"Tabel1",reportType:"html",reportCategory:"Dallap-Tahunan-Prov-Kab-Kec"}>
```

### 11.4 KRS — Tabel 4 (rekap wilayah)

```
GET https://pk23-portal-gw.bkkbn.go.id/report/viewReport
 ?filterPencarian=<{tahun:"2026",provinsiId:"22",kabupatenId:"322",
   reportName:"Tabel4",reportType:"html",reportCategory:"STUNTING2025"}>
Authorization: Basic base64("admin:password")   # tidak wajib — lihat §13
```

### 11.5 KRS — Tabel 3 (nama & alamat) / Tabel 5 (form verval)

Sama seperti §11.4 dengan `reportName:"Tabel3"` / `"Tabel5"`.
`Tabel5` butuh `kecamatanId`. `Tabel3` pada `kabupatenId=322` mengembalikan halaman
kosong (1.572 byte) — kemungkinan butuh `kecamatanId`/semester; **belum terverifikasi**.

### 11.6 ELSIMIL — CATIN tahunan

```
GET https://siga-api-gateway.bkkbn.go.id/report-siga-elsimil-ocp/viewReport
 ?filterPencarian=<{tahun:"2026",provinsiId:"22",kabupatenId:"322",
   reportName:"Tabel1",reportType:"html",reportCategory:"Catin-Tahunan"}>
```

### 11.7 Verval KRS — daftar keluarga

```
1. GET …/verval-config/verval/vervalConfig/getVervalServiceByIdProvinsi?idProvinsi=22 → service="regc"
2. GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-regc/siga/stunting/getDataStatusVerval
       ?bulan=10&tahun=2026&page=1&recordPerPage=50&idProvinsi=22&idKabupaten=322
       &idKecamatan=6157&idKelurahan=55467
```

### 11.8 Monitoring KRS

```
GET https://siga-api-gateway.bkkbn.go.id/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs
    ?tahun=2026&periode=2&idProvinsi=22&idKabupaten=322
```

---

## 12. Hal teknis yang sering bikin salah

1. **`viewReport` selalu 200** walau data kosong — cek ukuran body / jumlah `<td>`,
   bukan status code.
2. `Content-Type` kadang `null` dan body kosong (0 byte) untuk kombinasi
   `reportName`/`reportCategory` yang tidak cocok. Itu "tidak ada laporan", bukan error.
3. `reportType=xlsx` mengembalikan `application/xlsx` (~6 KB untuk tabel kosong).
4. `periode` **diabaikan server** — jangan kirim `periode` sama sekali. Laporan bulanan
   memakai `tahun` + `bulan` (int `1`–`12`); kumulatif memakai `bulan` atau
   `bulanAwal`/`bulanAkhir` (lihat §5.3).
5. `reportName` YAN KB bulanan berubah jadi `Tabel1Kab` bila kabupaten dipilih —
   `Tabel1` + kabupaten menghasilkan halaman kosong.
6. KRS `reportCategory` bergantung tahun (`STUNTING2022…STUNTING2025`), sedangkan
   `Tabel1/2/6` memakai `Verval-Tabulasi` (2023) atau `Verval-Tabulasi2024`.
7. Verval KRS: path `modul-stunting-sigabaru` hanya untuk tahun 2023; selain itu
   pakai `modul-stunting-<service>` dari resolver provinsi.
8. `getMonitoringKrs` **tanpa** `periode` → 200, tetapi angkanya penjumlahan dua
   semester (cakupan bisa 200%). Selalu kirim `periode=1|2`; lihat §8.0.
9. Link daftar laporan adalah `<a href="#/...">` dengan handler React; klik programatik
   lewat DOM lebih andal daripada klik koordinat.
10. Login memanggil `auth/signin?` (dengan tanda tanya) — tetap bekerja.

---

## 13. Temuan keamanan (defensive notes)

Diuji pada 2026-10-18. Semua bukti di bawah adalah **status code, ukuran body, dan jumlah
baris** — tidak ada nilai data yang disalin. Pengujian dibatasi pada GET yang sudah
dipanggil UI; tidak ada enumerasi endpoint, brute force, atau penarikan data massal.

### 13.1 Kritis — beberapa service tidak menegakkan autentikasi

Uji pembanding: request `curl`/`urllib` dari shell, **tanpa** header `Authorization`,
**tanpa** cookie, dengan `Accept: application/json`. Untuk memastikan token tidak
sekadar "diabaikan browser", tiap endpoint juga diuji dengan **token palsu**
(`Bearer token.palsu.tidak.valid`).

| Service / endpoint | Tanpa token | Token palsu | Token valid | Catatan |
|---|---|---|---|---|
| `modul-stunting-regc/siga/stunting/getDataStatusVerval` | **200**, 5.402 B, `totalRecord=398` | 200, body **identik** | 200 | **PII rumah tangga** |
| `modul-stunting-sigabaru/siga/stunting/getMonitoringKrs` | **200**, 11.226 B, 37 baris | 200, body **identik** | 200 | agregat per kecamatan |
| `prod-elsimil-cdb-service/elsimil/catin/getDetailCatin` | **200**, 3.988 B, 1 baris | 200, body **identik** | 200 | **PII catin** |
| `report-siga-yankb-ocp/viewReport` | **200**, 72.105 B | — | 200 | laporan agregat |
| `report-siga-elsimil-ocp/viewReport` | **200**, 67.635 B | — | 200 | laporan agregat |
| `pk23-portal-gw/report/viewReport` | **200**, 110.714 B, 434 `<td>` | — | 200 | KRS Tabel4 |
| `location-service/siga/location/getListProvinsi` | **200**, 15.103 B | — | 200 | data referensi |
| `report-siga-ocp/getReportParameter` | **200**, 59.194 B | — | 200 | katalog laporan |
| `sigaauthorizationservice/menu/getMenuByUserName` | **200**, 14.456 B | — | 200 | enumerasi menu per user |
| `sigaauthorizationservice-v2/user/getMaintenanceStatus` | **200** | — | 200 | status sistem |

"Body identik" = SHA-256 body tanpa-token == body dengan token palsu (dibandingkan
16 karakter pertama). Artinya server **tidak membaca klaim token sama sekali** pada
endpoint tersebut — bukan sekadar "token valid tidak diwajibkan".

Sanity check agar hasil di atas tidak salah tafsir:

- Path ngawur di service yang sama (`/modul-stunting-regc/siga/stunting/endpointTidakAda`)
  → **404** (162 B). Jadi service hidup dan routing benar; 200 di atas bukan stub/catch-all.
- `sumber-daya-manusia/siga/sdm/getDataPkb` dengan token palsu → **401**.
  Jadi gateway tidak "mati total" — proteksi tidak konsisten per service.

Kontrol pembanding (service yang **memang** menegakkan auth):

| Service | Tanpa token | Token palsu |
|---|---|---|
| `sumber-daya-manusia/siga/sdm/getDataPkb` | 401 | 401 |
| `daftar-tempatkb/siga/tempatkb/getDataTempatKb` | 401 | — |
| `registerpelayanankb/siga/pelayanankb/getDataPelayananKb` | 401 | — |

**Dampak**: endpoint Verval KRS, Monitoring KRS, dan ELSIMIL CATIN — yang memuat NIK,
nomor KK, nama, koordinat, dan URL foto rumah/jamban — dapat dibaca tanpa login.

**Tidak ada pembatasan wilayah.** Karena server tidak punya klaim token untuk
dibandingkan, parameter `idProvinsi`/`idKabupaten`/`idKecamatan`/`idKelurahan` bebas
diisi. Diuji: provinsi 9 (Jawa Barat) memakai service `rega` (dari resolver
`getVervalServiceByIdProvinsi`, juga terbuka) → `getDataStatusVerval` tanpa token
mengembalikan **200, `totalRecord=667`** untuk satu desa di Jawa Barat. Jadi akun
tingkat kecamatan pun secara teknis tidak terkurung pada wilayahnya.

**Enumerasi wilayah gratis**: `location-service` terbuka dan memberi rantai lengkap
38 provinsi → kabupaten → kecamatan → desa → RW → RT (15.103 B untuk provinsi saja).
Cukup iterasi `getVervalServiceByIdProvinsi` + `getListKabupatenByIdProvinsi` +
`getListKecamatanByIdKabupaten` + `getListKelurahanByIdKecamatan` untuk menyusun daftar
seluruh desa di Indonesia, lalu menembak `getDataStatusVerval` per desa.

**Field PII yang ada di respons tanpa-login** (nama field saja, nilai tidak dicatat):
`nama`, `nik`, `nik_istri`, `no_kk`, `kki`, `id_frm`, `latitude`, `longitude`,
`foto_rumah`, `foto_jamban` — 86 field total per baris.

**Yang belum terbukti terbuka** (jangan diklaim):

- KRS `Tabel3` (rekap berdasarkan **nama dan alamat**) dan `Tabel5` — diuji tanpa token
  dengan `tahun`/`provinsiId`/`kabupatenId`/`kecamatanId` → hanya halaman kosong
  (1.572 B, 11 `<td>`), tanpa kolom NIK/NAMA/ALAMAT. Kemungkinan butuh parameter
  tambahan (mis. `semester`) yang belum ditemukan. **Tidak** diklaim sebagai jalur
  kebocoran by-name.
- `Tabel4` (rekap **per wilayah**) **memang** terbuka: 200, 110.714 B, 434 `<td>` —
  ini agregat, bukan per-orang.
- Endpoint tulis (`upsertCatin`, `deleteCatinTPKByIdCatin`, `upsert*`, `updateBatasEntri`)
  **tidak diuji**. Jangan diasumsikan terbuka maupun tertutup.

### 13.2 Tinggi — CORS mencerminkan origin apa pun + credentials

Gateway mengembalikan `access-control-allow-methods: *`,
`access-control-allow-headers: *`, `access-control-allow-credentials: true`, dan
`Access-Control-Allow-Origin` yang **memantulkan `Origin` request**:

| Request | `Access-Control-Allow-Origin` |
|---|---|
| tanpa header `Origin` | `*` |
| `Origin: https://evil.example` | `https://evil.example` |
| `Origin: null` | `null` |

Ini lebih buruk daripada `*` polos. Dengan `ACAO: <origin pemanggil>` +
`allow-credentials: true`, browser **mengizinkan** pembacaan respons lintas origin
(aturan `*` + credentials tidak berlaku karena origin dipantulkan, bukan wildcard).

Diuji pada tiga endpoint sensitif dengan `Origin: https://evil.example`, tanpa
`Authorization`, tanpa cookie:

| Endpoint | Status | `ACAO` | `ACAC` |
|---|---|---|---|
| `getDataStatusVerval` | 200 | `https://evil.example` | `true` |
| `getDetailCatin` | 200 | `https://evil.example` | `true` |
| `getMonitoringKrs` | 200 | `https://evil.example` | `true` |

Konsekuensi: **halaman web mana pun** yang dibuka korban dapat menjalankan `fetch()`
ke endpoint di §13.1 dan membaca responsnya langsung di browser korban — tanpa perlu
login, tanpa perlu tahu token. Ini mengubah "API terbuka" menjadi "data bisa dieksfiltrasi
dari browser siapa pun yang mengunjungi situs berbahaya". Karena `allow-credentials:
true`, cookie korban untuk domain itu juga akan ikut terkirim bila ada.

### 13.3 Tinggi — kredensial hardcoded di bundle publik

```js
Authorization: "Basic " + btoa("admin:password")
```

Muncul di dua modul bundle yang bisa diunduh siapa saja tanpa login:

| Modul | Service | File |
|---|---|---|
| `788` | `https://pk23-portal-gw.bkkbn.go.id/report/` | `_re/js/chunks/7.js` |
| `782` | `https://pk23-portal-gw.bkkbn.go.id/verval-config/verval/vervalConfig/` | `_re/js/chunks/42.js` |

Kredensial ini bukan rahasia lagi. (Diuji: `pk23-portal-gw/report/viewReport`
mengembalikan body identik dengan atau tanpa header ini, jadi header tersebut tidak
menambah akses — tapi tetap merupakan kredensial yang terekspos.)

### 13.4 Tinggi — password plaintext di localStorage

`chunks/145.js`:

```js
localStorage.setItem("pass", this.state.fields.password);   // plaintext
localStorage.setItem("token", accessToken);
localStorage.setItem("refreshToken", refreshToken);
```

`pass` dipakai ulang oleh setiap axios interceptor untuk refresh:

```json
{"idAplikasi":2,"password":"<PASSWORD>","refreshToken":"<REFRESH_TOKEN>","username":"<USERNAME>"}
```

Konsekuensi:
- XSS di origin mana pun pada domain itu → pencurian password **asli**, bukan cuma token.
- Password tidak pernah kedaluwarsa selama refresh token masih valid; tidak ada rotasi.
- Sesi dapat diperpanjang tanpa interaksi user.

### 13.5 Sedang — masa hidup token & tidak ada pembatasan laju

- JWT HS512 dengan `exp - iat` = 2.073.600 detik (**24 hari**). Satu token bocor = akses
  hampir sebulan, dan bisa diperpanjang terus lewat `refreshToken`.
- `getMenuByUserName?username=…` mengembalikan 200 untuk username yang tidak ada
  (body 3 byte) maupun kosong (1.081 byte) — perbedaan ukuran respons memungkinkan
  **enumerasi username**. Tidak ada rate limit / lockout yang teramati saat uji.

### 13.6 Rendah — hardening & bug

| Temuan | Bukti |
|---|---|
| Tidak ada header keamanan di SPA (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security` absen) | `curl -D -` ke root: hanya `Set-Cookie … SameSite=None`, `nosniff`, `X-XSS-Protection` |
| `X-XSS-Protection: 1; mode=block` | header usang, tidak lagi relevan |
| Service worker didaftarkan ke `service-worker.js` yang 404 | error console tiap load |
| Endpoint statistik kunjungan tanpa auth | `POST /landing-page-be-v2/statistic-pengunjung/insertStatistikKunjungan` |
| Kredensial sesi di `localStorage` (bukan cookie `HttpOnly`) | seluruh bundle |

### 13.7 Rekomendasi (untuk pemilik sistem)

1. **Prioritas 1**: tegakkan verifikasi JWT di `modul-stunting-*`, `prod-elsimil-cdb-service`,
   `report-siga-*`, `location-service`, dan `pk23-portal-gw` — samakan dengan
   `sumber-daya-manusia` / `daftar-tempatkb` yang sudah 401.
2. Batasi `Access-Control-Allow-Origin` ke domain aplikasi; jangan `*` +
   `allow-credentials: true`.
3. Hapus kredensial Basic dari bundle; rotasi kredensial tersebut.
4. Jangan simpan password di `localStorage`; gunakan cookie `HttpOnly`/`Secure` untuk
   refresh token.
5. Pangkas field PII pada respons grid verval (kirim NIK/KK/foto hanya pada endpoint
   detail yang terautorisasi).
6. Turunkan masa hidup access token (mis. 15–60 menit) dan tambahkan rate limit pada
   endpoint auth.

> Catatan metodologi: temuan di atas berasal dari pemakaian sesi login yang sah milik
> pengguna pada repo ini. Token/password dari sesi tersebut **tidak boleh** dipakai ulang
> di luar keperluan pengujian, dan tidak disalin ke dokumen ini.

---

## 14. Status & pekerjaan lanjutan

Sudah terverifikasi live:

- ✅ YAN KB: `report-siga-yankb-ocp` + katalog tahunan/bulanan (34 + 95 tabel)
- ✅ DALLAP: `report-siga-dallap-ocp` + katalog (73 + 31 + 16 tabel)
- ✅ KRS laporan: `pk23-portal-gw/report` (Tabel4), `report-siga-krs-ocp` (tabulasi)
- ✅ ELSIMIL laporan: `report-siga-elsimil-ocp` (Catin/Bumil/Baduta)
- ✅ Verval KRS: resolver provinsi + `getDataStatusVerval` (200, 398 baris)
- ✅ Monitoring KRS: `getMonitoringKrs` (200)

Belum / perlu verifikasi tambahan:

- ⬜ KRS `Tabel3` & `Tabel5` dengan `kecamatanId` (parameter persisnya)
- ⬜ `report-siga-krs-ocp` untuk `Tabel1/Tabel2/Tabel6` (Verval-Tabulasi) — 200 diterima,
  isi belum divalidasi terhadap UI
- ⬜ ELSIMIL BUMIL/PASCASALIN/BADUTA endpoint data mentah (`prod-elsimil-*`), baru laporan
  agregat yang terverifikasi
- ⬜ `getVervalWilayah`, `getDetailVervalKrs`, `getNextKki` — path sudah ada di bundle,
  belum diuji dengan parameter lengkap
- ✅ Parameter `periode` pada `getMonitoringKrs` untuk tahun < 2024 — tahun 2023 +
  `periode=2` membalas 5 baris (hanya kecamatan berisi data), tahun 2025 terisi (§8.0)
- ⬜ Struktur `data_kunjungan[]` pada CATIN (nested, belum dipetakan)
- ⬜ `#/tabulasi` (REKAPITULASI) — route ada, endpoint belum ditelusuri
- ✅ Dimensi desa per kecamatan: `kecamatanId` mengubah baris jadi desa; `kelurahanId`
  diabaikan DALLAP/YAN KB/ELSIMIL (§5.3.1)

---

## 15. Artefak

| Path | Isi |
|---|---|
| `_re/js/chunks/*.js` | 227 chunk asli (gitignored) |
| `_re/js/pretty/*.js` | 30 chunk yang di-beautify (route, report, verval, monitoring) |
| `_re/js/inline_1.js` | webpack runtime + peta chunk |
| `_re/js/chunkmap.json` | `{chunkId: hash}` |
| `_re/getReportParameter.json` | katalog laporan lengkap (gitignored) |

Jalankan ulang pengambilan bundle:

```bash
# hash chunk ada di inline runtime; unduh static/js/<name>.<hash>.chunk.js
curl -s https://newsiga-siga.kemendukbangga.go.id/ -o index.html
```
