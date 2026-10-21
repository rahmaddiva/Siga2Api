/**
 * Data Verval KRS (agregat) dari SIGA.
 *
 * Sumbernya `getMonitoringKrs` — satu-satunya endpoint verval yang stabil dan
 * **tidak memuat data pribadi**. Semua field adalah hitungan per wilayah
 * (keluarga, PUS, baduta, balita, cakupan), bukan baris per orang. Jangan
 * mengganti ini dengan `getDataStatusVerval`: endpoint itu memuat nama, NIK,
 * nomor KK, koordinat, dan URL foto rumah (lihat reverse-engineering.md §7.2).
 *
 * Perilaku yang sudah diverifikasi live 2026-10-21 (reverse-engineering.md §8.0):
 * - `periode` WAJIB. Tanpa `periode` server membalas 200 tetapi menjumlahkan
 *   semester 1 + 2, sehingga cakupan bisa 200%.
 * - Baris mengikuti wilayah terdalam: provinsi → kabupaten → kecamatan → desa.
 * - Angka dikirim sebagai string berpemisah ribuan (`"1,198"`).
 */

import { sleep } from '@/lib/sleep'

const GW = 'https://siga-api-gateway.bkkbn.go.id'

const FIELDS = [
  'namaDaerah',
  'kelurahanAda',
  'kelurahanTarget',
  'kelurahanVerval',
  'cakupanKelurahanVerval',
  'sasaranPrioritas',
  'prioritasTerverval',
  'pusSasaran',
  'pusVervalAdaBaru',
  'pusHamilSasaran',
  'pushamilVervalAdaBaru',
  'badutaSasaran',
  'badutaVervalAdaBaru',
  'balitaSasaran',
  'balitaVervalAdaBaru',
  'totalSasaran',
  'totalVervalAda',
  'totalVervalBaru',
  'totalVervalAdaBaru',
  'keluargaSasaranCatin',
  'adaBaruLainTerverval',
  'persenTarget',
] as const

export type VervalField = (typeof FIELDS)[number]

export type VervalRow = Record<VervalField, string> & {
  /** Level baris yang dikembalikan server (lihat `kategoriLaporan`). */
  level: string
}

/**
 * Header tabel. `group` hanya berisi INDUK (tanpa daun); komponen menambahkan
 * `label` sebagai daun sehingga path header = `[...group, label]`.
 */
export const VERVAL_COLUMNS: { field: VervalField; label: string; group: string[] }[] = [
  { field: 'namaDaerah', label: 'Wilayah', group: [] },
  { field: 'kelurahanAda', label: 'Ada', group: ['Desa/Kelurahan'] },
  { field: 'kelurahanTarget', label: 'Target', group: ['Desa/Kelurahan'] },
  { field: 'kelurahanVerval', label: 'Terverval', group: ['Desa/Kelurahan'] },
  { field: 'cakupanKelurahanVerval', label: 'Cakupan %', group: ['Desa/Kelurahan'] },
  { field: 'sasaranPrioritas', label: 'Sasaran', group: ['Sasaran Prioritas'] },
  { field: 'prioritasTerverval', label: 'Terverval', group: ['Sasaran Prioritas'] },
  { field: 'persenTarget', label: 'Target %', group: ['Sasaran Prioritas'] },
  { field: 'pusSasaran', label: 'Sasaran', group: ['PUS'] },
  { field: 'pusVervalAdaBaru', label: 'Verval', group: ['PUS'] },
  { field: 'pusHamilSasaran', label: 'Sasaran', group: ['PUS Hamil'] },
  { field: 'pushamilVervalAdaBaru', label: 'Verval', group: ['PUS Hamil'] },
  { field: 'badutaSasaran', label: 'Sasaran', group: ['Anak 0-23 bulan'] },
  { field: 'badutaVervalAdaBaru', label: 'Verval', group: ['Anak 0-23 bulan'] },
  { field: 'balitaSasaran', label: 'Sasaran', group: ['Anak 24-59 bulan'] },
  { field: 'balitaVervalAdaBaru', label: 'Verval', group: ['Anak 24-59 bulan'] },
  { field: 'totalSasaran', label: 'Sasaran', group: ['Keluarga'] },
  { field: 'totalVervalAda', label: 'Ada', group: ['Keluarga Terverval'] },
  { field: 'totalVervalBaru', label: 'Baru', group: ['Keluarga Terverval'] },
  { field: 'totalVervalAdaBaru', label: 'Jumlah', group: ['Keluarga Terverval'] },
  { field: 'keluargaSasaranCatin', label: 'Sasaran Catin', group: ['Keluarga Catin'] },
  { field: 'adaBaruLainTerverval', label: 'Selain Ada/Baru', group: ['Terverval Lainnya'] },
]

export type VervalQuery = {
  tahun: number
  /** Semester: 1 atau 2. */
  periode: 1 | 2
  kecamatanId?: number | null
  kabupatenId?: number
}

export type VervalData = {
  rows: VervalRow[]
  /** Level baris: "Kabupaten" | "Kecamatan" | "Kelurahan". */
  level: string
  query: VervalQuery
  fetchedAt: string
}

// Yang di-cache adalah PROMISE, bukan hasil: dua pemanggilan beruntun
// (React StrictMode memasang efek dua kali) berbagi satu permintaan.
const cache = new Map<string, Promise<VervalData>>()

/** `"1,198"` → `"1198"`; nilai non-numerik dibiarkan apa adanya. */
function plainNumber(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  if (/^-?[\d.,]+$/.test(s)) return s.replace(/[,.]/g, '')
  return s
}

/**
 * Ambil agregat verval. Di-cache per (tahun, semester, kecamatan) supaya
 * berpindah desa atau bolak-balik kecamatan tidak memanggil server lagi.
 */
export function fetchVerval(query: VervalQuery): Promise<VervalData> {
  const key = `${query.tahun}|${query.periode}|${query.kecamatanId ?? 0}|${query.kabupatenId ?? 0}`
  const hit = cache.get(key)
  if (hit) return hit
  const promise = loadVerval(query)
  cache.set(key, promise)
  // Kegagalan jangan mengunci cache: hapus supaya percobaan berikutnya jalan.
  promise.catch(() => cache.delete(key))
  return promise
}

async function loadVerval(query: VervalQuery): Promise<VervalData> {

  const params = new URLSearchParams({
    tahun: String(query.tahun),
    periode: String(query.periode),
    idProvinsi: '22',
    idKabupaten: String(query.kabupatenId ?? 322),
  })
  if (query.kecamatanId) params.set('idKecamatan', String(query.kecamatanId))

  const url = `${GW}/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs?${params}`

  // Satu percobaan ulang: gateway kadang memutus koneksi atau membalas body kosong.
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(900)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`SIGA menolak permintaan (HTTP ${res.status})`)
      const json = (await res.json()) as { data?: Record<string, unknown>[] }
      if (!json.data) throw new Error('Respons SIGA tidak berisi data.')
      const rows = json.data.map((raw) => {
        const row = {} as VervalRow
        for (const f of FIELDS) row[f] = plainNumber(raw[f])
        row.level = String(raw.kategoriLaporan ?? '')
        return row
      })
      return {
        rows,
        level: rows[0]?.level ?? '',
        query,
        fetchedAt: new Date().toISOString(),
      }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal mengambil data verval.')
}
