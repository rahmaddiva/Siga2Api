import { useEffect, useMemo, useState } from 'react'
import type { Index, PeriodEntry, ReportEntry } from './lib/data'
import { groupRank, loadIndex, pickInitialPeriod } from './lib/data'
import { Sidebar } from './components/Sidebar'
import { ReportView } from './components/ReportView'
import { Overview } from './components/Overview'

export function App() {
  const [index, setIndex] = useState<Index | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState('yankb')
  const [active, setActive] = useState<ReportEntry | null>(null)
  const [activePeriod, setActivePeriod] = useState<PeriodEntry | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message))
  }, [])

  // Pilih laporan pertama yang punya data saat modul diganti: utamakan tabel
  // dengan baris terbanyak di grup paling awal (biasanya tabel ringkasan).
  useEffect(() => {
    if (!index) return
    const list = index.reports.filter((r) => r.module === activeModule)
    const filled = list.filter((r) => !r.empty && !r.error)
    const best = filled.sort(
      (a, b) =>
        groupRank(a.group) - groupRank(b.group) ||
        b.rowCount - a.rowCount ||
        a.reportName.localeCompare(b.reportName, 'id', { numeric: true }),
    )[0]
    setActive(best ?? list[0] ?? null)
  }, [index, activeModule])

  // Periode ikut direset saat laporan berganti, sejalan dengan periode awal
  // yang dipilih ReportView.
  useEffect(() => {
    setActivePeriod(active ? pickInitialPeriod(active.periods) : null)
  }, [active])

  const downloadCsv = useMemo(
    () => () => {
      if (!active) return
      const selected =
        activePeriod && active.periods.some((p) => p.key === activePeriod.key)
          ? activePeriod
          : null
      const period = selected ?? pickInitialPeriod(active.periods)
      if (!period) return
      fetch(`/data/${period.file}`)
        .then((r) => r.json())
        .then((d) => {
          const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
          const lines = [
            d.columns.map(esc).join(','),
            ...d.rows.map((row: string[]) => row.map(esc).join(',')),
          ]
          const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${active.module}-${active.reportName}-${period.key}.csv`
          a.click()
          URL.revokeObjectURL(url)
        })
        .catch(() => alert('Gagal mengunduh CSV.'))
    },
    [active, activePeriod],
  )

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h1 className="font-semibold text-red-900">Data belum tersedia</h1>
          <p className="mt-1 text-sm text-red-800">{error}</p>
          <p className="mt-3 text-sm text-red-700">
            Jalankan <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">python scripts/build_snapshot.py</code>{' '}
            untuk membangun snapshot terlebih dahulu.
          </p>
        </div>
      </main>
    )
  }

  if (!index) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">Memuat katalog laporan…</p>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            aria-label="Buka daftar laporan"
            className="cursor-pointer rounded-lg border border-border p-2 text-foreground transition-colors duration-150 hover:bg-muted lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5" aria-hidden="true">
                <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base">
                Siga2Api
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Data Laporan KB — Kab. Tanah Laut, Kalimantan Selatan
              </p>
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <span className="tabular rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {index.years.join(', ')}
            </span>
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {index.totalReports} laporan · {index.totalPeriods} periode
            </span>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          id="sidebar"
          className={`${sidebarOpen ? 'block' : 'hidden'} absolute inset-0 z-20 bg-card lg:static lg:block lg:w-80 lg:shrink-0`}
        >
          <Sidebar
            index={index}
            activeModule={activeModule}
            activeReport={active}
            onSelectModule={(id) => {
              setActiveModule(id)
              setSidebarOpen(false)
            }}
            onSelectReport={(r) => {
              setActive(r)
              setSidebarOpen(false)
            }}
          />
        </div>

        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
            {active ? (
              <ReportView
                key={`${active.module}-${active.reportName}-${active.reportCategory}`}
                entry={active}
                onDownload={downloadCsv}
                onPeriodChange={setActivePeriod}
              />
            ) : (
              <Overview
                index={index}
                moduleId={activeModule}
                onSelect={(r) => setActive(r)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
