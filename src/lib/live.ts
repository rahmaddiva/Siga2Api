/**
 * Pengambilan laporan SIGA secara live dari browser (tanpa token, tanpa backend).
 *
 * Latar belakang (diverifikasi live 2026-10 lewat sesi login asli):
 *
 * 1. Snapshot statis di `public/data/` hanya berisi baris KECAMATAN, karena
 *    dipanen dengan `kabupatenId=322` tanpa `kecamatanId`.
 * 2. Menambahkan `kecamatanId` mengubah laporan menjadi baris DESA — itulah
 *    satu-satunya cara mendapatkan rincian per desa dari server SIGA.
 * 3. `kelurahanId` **diabaikan** oleh `report-siga-dallap-ocp`,
 *    `report-siga-yankb-ocp`, dan `report-siga-elsimil-ocp` (body byte-identik
 *    dengan/tanpa parameter itu), jadi satu desa tidak bisa diminta langsung;
 *    desa harus disaring dari hasil satu kecamatan.
 *    Pengecualian: `report-siga-krs-ocp` dan `pk23-portal-gw/report` (KRS
 *    Tabel4) benar-benar menghormati `kelurahanId`.
 * 4. Gateway memantulkan `Origin` + `allow-credentials: true`, jadi `fetch`
 *    lintas origin dari halaman ini berhasil (diuji dari `localhost`).
 *
 * Semua parameter filter diambil dari `filter` yang tersimpan di berkas
 * snapshot periode itu (`public/data/**`), lalu `kecamatanId` ditambahkan.
 * Dengan begitu aturan periode yang rumit (bulanan vs kumulatif rentang vs
 * tahunan) tidak diduplikasi di frontend — sumbernya tetap `report_url()`.
 */

import { extractPrintedPeriod, parseReport, periodStatus, type ParsedReport } from '@/lib/jasper'
import type { ReportData, ReportEntry, PeriodEntry } from '@/lib/data'
import { sleep } from '@/lib/sleep'

const GATEWAY = 'https://siga-api-gateway.bkkbn.go.id'
const PK23 = 'https://pk23-portal-gw.bkkbn.go.id/report'

/** Service per modul; `null` = laporan ada di pk23 (KRS rekap wilayah). */
const MODULE_SERVICE: Record<string, string | null> = {
  yankb: 'report-siga-yankb-ocp',
  dallap: 'report-siga-dallap-ocp',
  elsimil: 'report-siga-elsimil-ocp',
  krs: null,
}

/**
 * Grup katalog KRS yang dilayani `report-siga-krs-ocp` (tabulasi verval).
 * Sisanya (`verval`) memakai pk23 dengan kategori `STUNTING2025`.
 */
const KRS_GATEWAY_GROUPS: Record<string, true> = { vervalTabulasi: true }

function viewReportUrl(module: string, group: string): string {
  if (module !== 'krs') {
    const svc = MODULE_SERVICE[module]
    if (!svc) throw new Error(`Modul ${module} belum punya service laporan.`)
    return `${GATEWAY}/${svc}/viewReport`
  }
  return KRS_GATEWAY_GROUPS[group]
    ? `${GATEWAY}/report-siga-krs-ocp/viewReport`
    : `${PK23}/viewReport`
}

export type LiveResult = ReportData & {
  /** Parameter yang benar-benar dikirim, untuk transparansi di UI. */
  liveFilter: Record<string, string | number>
  liveUrl: string
}

/**
 * Hasil per (laporan, periode, kecamatan). Berpindah desa di dalam satu
 * kecamatan tidak memanggil server lagi — desa disaring dari hasil yang sama —
 * dan kembali ke kecamatan sebelumnya tidak perlu menunggu 5–15 detik.
 * Tidak ada invalidasi: halaman ini menampilkan angka live "saat dibuka",
 * dan refresh browser mengosongkan cache.
 */
const liveCache = new Map<string, LiveResult>()

/**
 * GET dengan satu percobaan ulang.
 *
 * Gateway SIGA kadang memutus koneksi (ECONNRESET) atau membalas `200` dengan
 * body kosong untuk laporan yang sebenarnya ada — lihat `fetch()` di
 * `build_snapshot.py`. Tanpa retry, filter desa akan tampak rusak sesekali.
 * Hanya satu retry: ini interaktif, pengguna tidak menunggu 4x backoff.
 */
async function fetchReportHtml(url: string, signal?: AbortSignal): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(900)
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`SIGA menolak permintaan (HTTP ${res.status})`)
      const html = await res.text()
      if (html.trim()) return html
      lastError = new Error('SIGA membalas body kosong')
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gagal mengambil laporan dari SIGA')
}

/**
 * Ambil laporan periode `period` untuk satu kecamatan dan parse jadi bentuk
 * yang sama dengan berkas snapshot.
 *
 * `baseFilter` berasal dari `filter` berkas snapshot periode tersebut; kunci
 * yang mengubah cakupan wilayah dibuang lalu diganti `kecamatanId`.
 */
export async function fetchLiveReport(
  entry: ReportEntry,
  period: PeriodEntry,
  kecamatanId: number,
  signal?: AbortSignal,
): Promise<LiveResult> {
  const cacheKey = `${entry.module}|${entry.group}|${entry.reportName}|${period.key}|${kecamatanId}`
  const cached = liveCache.get(cacheKey)
  if (cached) return cached

  const snapshot = await fetch(`/data/${period.file}`, { signal }).then(async (r) => {
    if (!r.ok) throw new Error(`Gagal memuat filter laporan (${r.status})`)
    return (await r.json()) as ReportData & { filter?: Record<string, string | number> }
  })

  if (!snapshot.filter) {
    throw new Error(
      'Berkas laporan ini tidak menyimpan parameter filter, jadi data per kecamatan tidak bisa diminta. Panen ulang snapshot dengan build_snapshot.py.',
    )
  }

  const filter: Record<string, string | number> = { ...snapshot.filter }
  delete filter.kelurahanId
  filter.kecamatanId = String(kecamatanId)

  const url = `${viewReportUrl(entry.module, entry.group)}?filterPencarian=${encodeURIComponent(
    JSON.stringify(filter),
  )}`

  const html = await fetchReportHtml(url, signal)

  const parsed: ParsedReport = parseReport(html)
  const { year } = extractPrintedPeriod(parsed.printedPeriod)

  const result: LiveResult = {
    ...parsed,
    module: entry.module,
    moduleLabel: entry.moduleLabel,
    group: entry.group,
    reportName: entry.reportName,
    reportCategory: entry.reportCategory,
    description: entry.description,
    periodType: entry.periodType,
    periodKey: period.key,
    periodLabel: period.label,
    fetchedAt: new Date().toISOString(),
    printedYear: year,
    periodStatus: periodStatus(parsed.printedPeriod, period.key),
    liveFilter: filter,
    liveUrl: url,
  }
  liveCache.set(cacheKey, result)
  return result
}
