export type PeriodEntry = {
  key: string
  label: string
  file: string
  empty: boolean
  error?: string | null
  rowCount: number
  colCount: number
  periodStatus?: 'match' | 'mismatch' | 'unknown'
}

export type ReportEntry = {
  module: string
  moduleLabel: string
  group: string
  reportName: string
  reportCategory: string
  description: string
  periodType: 'annual' | 'monthly'
  periods: PeriodEntry[]
  rowCount: number
  colCount: number
  empty: boolean
  error?: string | null
}

export type Index = {
  generatedAt: string
  wilayah: { provinsi: string; provinsiId: number; kabupaten: string; kabupatenId: number }
  years: number[]
  months: number[]
  totalReports: number
  totalPeriods: number
  modules: { id: string; label: string }[]
  reports: ReportEntry[]
}

export type ReportData = {
  title: string | null
  subtitle: string | null
  period: string | null
  wilayah: Record<string, string>
  columns: string[]
  rows: string[][]
  empty: boolean
  error?: string | null
  module: string
  moduleLabel: string
  group: string
  reportName: string
  reportCategory: string
  description: string
  periodType: 'annual' | 'monthly'
  periodKey: string
  periodLabel: string
  fetchedAt: string
  printedPeriod?: string | null
  printedYear?: number | null
  periodStatus?: 'match' | 'mismatch' | 'unknown'
}

const cache = new Map<string, unknown>()

async function loadJson<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Gagal memuat ${path} (${res.status})`)
  const json = (await res.json()) as T
  cache.set(path, json)
  return json
}

export const loadIndex = () => loadJson<Index>('/data/index.json')
export const loadReport = (file: string) => loadJson<ReportData>(`/data/${file}`)

/** Periode awal: yang terbaru dan berisi data, kalau tidak ada ambil yang terbaru. */
export function pickInitialPeriod(periods: PeriodEntry[]): PeriodEntry | null {
  const filled = periods.filter((p) => !p.empty && !p.error)
  const pool = filled.length > 0 ? filled : periods
  return [...pool].sort((a, b) => b.key.localeCompare(a.key))[0] ?? null
}

/** Urutan grup yang masuk akal: tahunan dulu, lalu bulanan, lalu sisanya. */
const GROUP_ORDER = [
  'yankbTahunan', 'yankbBulanan',
  'dallapTahunan', 'dallapBulanan', 'dallapRekapBulanan',
  'verval', 'vervalTabulasi',
  'catinTahunan', 'catinBulanan', 'catinKomulatif',
  'bumilTahunan', 'bumilBulanan', 'bumilKomulatif',
  'pascasalinTahunan', 'pascasalinBulanan', 'pascasalinKomulatif',
  'elsimilBadutaTahunan', 'elsimilBadutaBulanan', 'elsimilBadutaKumulatif',
  'elsimilMbg',
]

export function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group)
  return i === -1 ? GROUP_ORDER.length : i
}

/** Rapikan label grup katalog jadi judul yang enak dibaca. */
export function prettyGroup(group: string): string {
  const map: Record<string, string> = {
    yankbTahunan: 'Tahunan',
    yankbBulanan: 'Bulanan',
    dallapTahunan: 'Tahunan',
    dallapBulanan: 'Bulanan',
    dallapRekapBulanan: 'Rekap Bulanan',
    verval: 'Rekap KRS',
    vervalTabulasi: 'Tabulasi Verval',
    catinTahunan: 'Catin — Tahunan',
    catinBulanan: 'Catin — Bulanan',
    catinKomulatif: 'Catin — Kumulatif',
    bumilTahunan: 'Ibu Hamil — Tahunan',
    bumilBulanan: 'Ibu Hamil — Bulanan',
    bumilKomulatif: 'Ibu Hamil — Kumulatif',
    pascasalinTahunan: 'Pascapersalinan — Tahunan',
    pascasalinBulanan: 'Pascapersalinan — Bulanan',
    pascasalinKomulatif: 'Pascapersalinan — Kumulatif',
    elsimilBadutaTahunan: 'Baduta — Tahunan',
    elsimilBadutaBulanan: 'Baduta — Bulanan',
    elsimilBadutaKumulatif: 'Baduta — Kumulatif',
    elsimilMbg: 'MBG',
  }
  return map[group] ?? group
}

/** Deskripsi tabel tanpa prefiks "TABEL n - " yang duplikatif. */
export function cleanDescription(desc: string): string {
  return desc
    .replace(/^TABEL\s+[\dA-Z]+\s*[-–]\s*/i, '')
    .replace(/^TABLE\s+[\dA-Z]+\s*[-–]\s*/i, '')
    .replace(/\s*-\s*\((bulanan|tahunan|kumulatif)\)\s*$/i, '')
    .trim()
}

/** Kolom identitas yang bukan data: nomor urut, kode/wilayah, dan hitung desa. */
const IDENTITY_COLUMNS: Record<string, true> = {
  no: true,
  'no.': true,
  kode: true,
  kecamatan: true,
  kelurahan: true,
  desa: true,
  'yang ada': true,
}

/**
 * Apakah semua nilai data laporan efektif nol? Dipakai untuk banner mismatch:
 * tabel bisa punya baris (empty=false) tapi seluruh kolom data berisi "0",
 * jadi jangan mengira itu bukti data terisi.
 *
 * - Lewati kolom identitas (label cocok NO/KODE/KECAMATAN/KELURAHAN/DESA/YANG ADA,
 *   case-insensitive) dan sel yang tidak bisa diurai sebagai angka
 *   (mis. placeholder "%" berisi "\uFFFD"/"-"/kosong).
 * - true hanya bila ada minimal satu sel numerik dan semuanya 0;
 *   tanpa sel numerik sama sekali → false (tidak ada yang bisa dinilai).
 */
export function isAllDataZero(data: Pick<ReportData, 'columns' | 'rows'>): boolean {
  let seen = false
  for (const row of data.rows) {
    for (let i = 0; i < row.length; i++) {
      const label = data.columns[i]?.trim().toLowerCase() ?? ''
      if (IDENTITY_COLUMNS[label]) continue
      // Buang pemisah ribuan lalu coba urai; sel non-numerik dilewati.
      const n = Number(row[i]?.replace(/\s|\u00A0/g, '').replace(/\./g, '').replace(/,/g, '.'))
      if (!Number.isFinite(n)) continue
      seen = true
      if (n !== 0) return false
    }
  }
  return seen
}
