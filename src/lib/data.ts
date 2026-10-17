export type ReportEntry = {
  module: string
  moduleLabel: string
  group: string
  reportName: string
  reportCategory: string
  description: string
  file: string
  title: string | null
  subtitle: string | null
  period: string | null
  empty: boolean
  error?: string | null
  rowCount: number
  colCount: number
}

export type Index = {
  generatedAt: string
  wilayah: { provinsi: string; provinsiId: number; kabupaten: string; kabupatenId: number }
  tahun: number
  bulan: number
  totalReports: number
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
  fetchedAt: string
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
