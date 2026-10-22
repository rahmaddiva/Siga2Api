/**
 * Deep-link berbasis hash, tanpa router pihak ketiga.
 *
 * Skema:
 *   #/                          dashboard modul default
 *   #/yankb                     dashboard modul
 *   #/yankb/tabel38c/2026-03    laporan + periode
 *   #/yankb/tabel38c/2026-03?kec=12&desa=34
 *   #/verval?tahun=2026&semester=2&kec=12&desa=34
 *
 * Hash dipilih (bukan History API path) karena aplikasi ini di-host sebagai
 * berkas statis: path sungguhan akan 404 di server mana pun tanpa aturan
 * rewrite. Semua fungsi di sini murni — tidak menyentuh `window` — supaya
 * gampang diuji dan tidak memicu efek samping saat di-import.
 */

export type Route =
  | { kind: 'dashboard'; module: string }
  | {
      kind: 'report'
      module: string
      /** `reportName` apa adanya (mis. "Tabel38C"), bukan versi URL. */
      reportName: string
      periodKey: string | null
      kec: number | null
      desa: number | null
    }
  | {
      kind: 'verval'
      tahun: number
      semester: 1 | 2
      kec: number | null
      desa: number | null
    }

export const DEFAULT_MODULE = 'yankb'
export const VERVAL_MODULE = 'verval'
export const VERVAL_TAHUN = [2026, 2025, 2024, 2023]
export const DEFAULT_VERVAL_TAHUN = 2026
export const DEFAULT_SEMESTER: 1 | 2 = 2

/** `null` bila bukan angka positif; nilai sampah dari URL tidak boleh bocor. */
function toId(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * `#/yankb/tabel38c/2026-03?kec=12` → Route.
 *
 * Tidak pernah melempar: URL yang tidak dikenal jatuh ke dashboard modul
 * default, karena alamat yang salah ketik tidak boleh menghasilkan layar kosong.
 */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart, queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  const params = new URLSearchParams(queryPart)

  const module = segments[0] || DEFAULT_MODULE
  const kec = toId(params.get('kec'))
  const desa = toId(params.get('desa'))

  if (module === VERVAL_MODULE) {
    const tahunRaw = Number(params.get('tahun'))
    const semesterRaw = Number(params.get('semester'))
    return {
      kind: 'verval',
      tahun: VERVAL_TAHUN.includes(tahunRaw) ? tahunRaw : DEFAULT_VERVAL_TAHUN,
      semester: semesterRaw === 1 ? 1 : DEFAULT_SEMESTER,
      kec,
      desa,
    }
  }

  // Hash kosong (`#`) menghasilkan nol segmen — itu dashboard, bukan laporan
  // tanpa nama. Tanpa `<=`, `segments[1]` menjadi undefined dan pencocokan
  // laporan melempar TypeError saat membaca `.toLowerCase()`.
  if (segments.length <= 1) return { kind: 'dashboard', module }

  return {
    kind: 'report',
    module,
    reportName: segments[1],
    periodKey: segments[2] || null,
    kec,
    desa,
  }
}

/** Kebalikan `parseRoute`. Urutan query tetap (kec lalu desa) agar URL stabil. */
export function buildHash(route: Route): string {
  // Modul default memakai URL terpendek supaya akar aplikasi tetap `#/`.
  if (route.kind === 'dashboard') {
    return route.module === DEFAULT_MODULE ? '#/' : `#/${route.module}`
  }

  const wilayah = (q: URLSearchParams) => {
    if (route.kec !== null) q.set('kec', String(route.kec))
    if (route.desa !== null) q.set('desa', String(route.desa))
    return q.size > 0 ? `?${q}` : ''
  }

  if (route.kind === 'verval') {
    const q = new URLSearchParams()
    q.set('tahun', String(route.tahun))
    q.set('semester', String(route.semester))
    return `#/verval${wilayah(q)}`
  }

  const period = route.periodKey ? `/${route.periodKey}` : ''
  return `#/${route.module}/${route.reportName.toLowerCase()}${period}${wilayah(new URLSearchParams())}`
}
