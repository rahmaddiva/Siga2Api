import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Menu } from 'lucide-react'

import type { Index, PeriodEntry, ReportData, ReportEntry } from '@/lib/data'
import { loadIndex, pickInitialPeriod } from '@/lib/data'
import { Sidebar } from '@/components/Sidebar'
import { ReportView } from '@/components/ReportView'
import { Dashboard } from '@/components/Dashboard'
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

  // Modul tanpa laporan terpilih = dashboard modul tersebut. Ini yang membuat
  // ringkasan selalu terlihat lebih dulu, bukan langsung menimpa dengan tabel.
  useEffect(() => {
    setActivePeriod(active ? pickInitialPeriod(active.periods) : null)
  }, [active])

  /**
   * Unduh tabel yang SEDANG tampil. `data` dioper dari view supaya CSV ikut
   * berisi hasil saringan (kecamatan/desa), bukan snapshot kabupaten.
   *
   * Nama berkas diambil dari `data`, bukan dari `active`: modul Verval tidak
   * punya `ReportEntry` (datanya live), dan dulu unduhannya gagal karena itu.
   */
  const downloadCsv = useMemo(
    () => (data: ReportData, suffix: string) => {
      const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
      const lines = [
        data.columns.map(esc).join(','),
        ...data.rows.map((row) => row.map(esc).join(',')),
      ]
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.module}-${data.reportName}-${data.periodKey}${suffix}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
    [],
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
        // Pilih modul = kembali ke ringkasannya; modul Verval menampilkan
        // tampilan live, modul snapshot menampilkan dashboard.
        setActive(null)
        setSidebarOpen(false)
      }}
      onSelectReport={(r) => {
        setActiveModule(r.module)
        setActive(r)
        setSidebarOpen(false)
      }}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
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
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <BarChart3 className="size-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm leading-tight font-semibold">Siga2Api</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Data Laporan KB — Kab. Tanah Laut, Kalimantan Selatan
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden tabular md:inline-flex">
              {index.years.join(' · ')}
            </Badge>
            <Badge variant="muted" className="tabular hidden sm:inline-flex">
              {index.totalReports} laporan · {index.totalPeriods} periode
            </Badge>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-card lg:block">
          {renderSidebar('sidebar-desktop')}
        </aside>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[min(20rem,88vw)] p-0 lg:hidden">
            <SheetHeader>
              <SheetTitle>Daftar laporan</SheetTitle>
              <SheetDescription>Pilih modul, lalu pilih tabel yang ingin dilihat.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1">{renderSidebar('sidebar-mobile')}</div>
          </SheetContent>
        </Sheet>

        <main className="thin-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
            {activeModule === 'verval' && !active ? (
              <VervalView onDownload={downloadCsv} />
            ) : active ? (
              <ReportView
                key={`${active.module}-${active.reportName}-${active.reportCategory}`}
                entry={active}
                onDownload={downloadCsv}
                onPeriodChange={setActivePeriod}
                onBackToDashboard={() => setActive(null)}
              />
            ) : (
              <Dashboard
                index={index}
                moduleId={activeModule}
                onSelect={setActive}
                onSelectModule={(id) => {
                  setActiveModule(id)
                  setActive(null)
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
