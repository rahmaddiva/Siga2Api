import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Menu } from 'lucide-react'

import type { Index, PeriodEntry, ReportData, ReportEntry } from '@/lib/data'
import { groupRank, loadIndex, pickInitialPeriod } from '@/lib/data'
import { Sidebar } from '@/components/Sidebar'
import { ReportView } from '@/components/ReportView'
import { Overview } from '@/components/Overview'
import { VervalView } from '@/components/VervalView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

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

  /**
   * Unduh tabel yang SEDANG tampil. `data` dioper dari ReportView supaya CSV
   * ikut berisi hasil saringan (kecamatan/desa), bukan snapshot kabupaten.
   */
  const downloadCsv = useMemo(
    () => (data: ReportData, suffix: string) => {
      if (!active) return
      const period =
        (activePeriod && active.periods.some((p) => p.key === activePeriod.key)
          ? activePeriod
          : null) ?? pickInitialPeriod(active.periods)
      if (!period) return
      const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        data.columns.map(esc).join(','),
        ...data.rows.map((row) => row.map(esc).join(',')),
      ]
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${active.module}-${active.reportName}-${period.key}${suffix}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    [active, activePeriod],
  )

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <Alert variant="destructive">
          <AlertTitle>Data belum tersedia</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <p className="text-destructive/90">
              Jalankan{' '}
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs">
                python scripts/build_snapshot.py
              </code>{' '}
              untuk membangun snapshot terlebih dahulu.
            </p>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (!index) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">
          Memuat katalog laporan…
        </p>
      </div>
    )
  }

  // Dirender dua kali (aside desktop + Sheet mobile) dengan idPrefix berbeda
  // agar id DOM tidak kembar.
  const renderSidebar = (idPrefix: string) => (
    <Sidebar
      index={index}
      activeModule={activeModule}
      activeReport={active}
      idPrefix={idPrefix}
      onSelectModule={(id) => {
        setActiveModule(id)
        // Modul Verval KRS tidak punya laporan snapshot: kosongkan pilihan
        // supaya area konten menampilkan tampilan live, bukan laporan lama.
        if (id === 'verval') setActive(null)
        setSidebarOpen(false)
      }}
      onSelectReport={(r) => {
        setActive(r)
        setSidebarOpen(false)
      }}
    />
  )

  return (
    <>
      <div className="flex h-dvh flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka daftar laporan"
              className="lg:hidden"
            >
              <Menu />
            </Button>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm leading-tight font-semibold sm:text-base">
                  Siga2Api
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Data Laporan KB — Kab. Tanah Laut, Kalimantan Selatan
                </p>
              </div>
            </div>

            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <Badge variant="muted" className="tabular">
                {index.years.join(', ')}
              </Badge>
              <Badge variant="muted">
                {index.totalReports} laporan · {index.totalPeriods} periode
              </Badge>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-80 shrink-0 border-r border-border bg-card lg:block">
            {renderSidebar('sidebar-desktop')}
          </aside>

          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-[min(21rem,88vw)] p-0 lg:hidden">
              <SheetHeader>
                <SheetTitle>Daftar laporan</SheetTitle>
                <SheetDescription>Pilih modul, lalu pilih tabel yang ingin dilihat.</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1">{renderSidebar('sidebar-mobile')}</div>
            </SheetContent>
          </Sheet>

          <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
              {activeModule === 'verval' && !active ? (
                <VervalView onDownload={downloadCsv} />
              ) : active ? (
                <ReportView
                  key={`${active.module}-${active.reportName}-${active.reportCategory}`}
                  entry={active}
                  onDownload={downloadCsv}
                  onPeriodChange={setActivePeriod}
                />
              ) : (
                <Overview index={index} moduleId={activeModule} onSelect={setActive} />
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
