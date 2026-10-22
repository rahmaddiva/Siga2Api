import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Menu } from 'lucide-react'

import type { Index, PeriodEntry, ReportData, ReportEntry } from '@/lib/data'
import { loadIndex, pickInitialPeriod } from '@/lib/data'
import { buildHash, DEFAULT_MODULE, parseRoute, VERVAL_MODULE, type Route } from '@/lib/route'
import { downloadCsv } from '@/lib/export'
import { Sidebar } from '@/components/Sidebar'
import { ReportView } from '@/components/ReportView'
import { Dashboard } from '@/components/Dashboard'
import { VervalView } from '@/components/VervalView'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

/**
 * Cari laporan yang diminta URL.
 *
 * `reportName` di URL ditulis huruf kecil, dan satu nama bisa punya beberapa
 * kategori (bulanan vs tahunan). Bila segmen periode ada, pilih entri yang
 * benar-benar punya periode itu; kalau tidak, dahulukan yang berisi data.
 */
function resolveReport(index: Index, module: string, reportName: string, periodKey: string | null) {
  const candidates = index.reports.filter(
    (r) => r.module === module && r.reportName.toLowerCase() === reportName.toLowerCase(),
  )
  if (candidates.length === 0) return null
  if (periodKey) {
    const exact = candidates.find((r) => r.periods.some((p) => p.key === periodKey))
    if (exact) return exact
  }
  return candidates.find((r) => !r.empty && !r.error) ?? candidates[0]
}

export function App() {
  const [index, setIndex] = useState<Index | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message))
  }, [])

  // Back/Forward dan edit hash manual harus mengubah tampilan. `pushState` yang
  // kita panggil sendiri tidak memicu event ini, jadi tidak ada loop.
  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const activeModule = route.kind === 'verval' ? VERVAL_MODULE : route.module

  // `route` adalah state; TypeScript tidak bisa mempertahankan penyempitan
  // tipenya di dalam callback JSX. Simpan versi yang sudah sempit di sini.
  const reportRoute = route.kind === 'report' ? route : null
  const vervalRoute = route.kind === 'verval' ? route : null

  const active = useMemo<ReportEntry | null>(() => {
    if (!index || route.kind !== 'report') return null
    return resolveReport(index, route.module, route.reportName, route.periodKey)
  }, [index, route])

  // Laporan yang diminta tapi tidak ada di katalog: jangan tampilkan halaman
  // kosong, jatuh ke dashboard modul itu.
  const missingReport = route.kind === 'report' && index !== null && active === null

  /**
   * Periode aktif selalu diturunkan dari URL, lalu divalidasi terhadap periode
   * yang benar-benar tersedia di laporan itu.
   */
  const activePeriod = useMemo<PeriodEntry | null>(() => {
    if (!active) return null
    const wanted = route.kind === 'report' ? route.periodKey : null
    const match = wanted ? active.periods.find((p) => p.key === wanted) : undefined
    return match ?? pickInitialPeriod(active.periods)
  }, [active, route])

  /**
   * `replace` untuk perubahan parameter (periode/wilayah) supaya tombol Back
   * tidak menelusuri setiap klik chip; `push` untuk pindah halaman.
   */
  const navigate = useCallback((next: Route, mode: 'push' | 'replace' = 'push') => {
    const hash = buildHash(next)
    if (window.location.hash === hash) return
    const url = `${window.location.pathname}${window.location.search}${hash}`
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
    setRoute(next)
  }, [])

  const goDashboard = useCallback(
    (module: string) => navigate({ kind: 'dashboard', module }),
    [navigate],
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
        goDashboard(id)
        setSidebarOpen(false)
      }}
      onSelectReport={(r) => {
        navigate({ kind: 'report', module: r.module, reportName: r.reportName, periodKey: null, kec: null, desa: null })
        setSidebarOpen(false)
      }}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="no-print sticky top-0 z-30 shrink-0 border-b border-border bg-card">
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

          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault()
              goDashboard(DEFAULT_MODULE)
            }}
            className="flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <BarChart3 className="size-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold">Siga2Api</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                Data Laporan KB — Kab. Tanah Laut, Kalimantan Selatan
              </span>
            </div>
          </a>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden tabular md:inline-flex">
              {index.years.join(' · ')}
            </Badge>
            <Badge variant="muted" className="tabular hidden sm:inline-flex">
              {index.totalReports} laporan · {index.totalPeriods} periode
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="no-print hidden w-72 shrink-0 border-r border-border bg-card lg:block">
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
            {vervalRoute ? (
              <VervalView
                tahun={vervalRoute.tahun}
                semester={vervalRoute.semester}
                kecamatanId={vervalRoute.kec}
                desaId={vervalRoute.desa}
                onChange={(next, mode) =>
                  navigate(
                    {
                      kind: 'verval',
                      tahun: next.tahun,
                      semester: next.semester,
                      kec: next.kec,
                      desa: next.desa,
                    },
                    mode,
                  )
                }
                onDownload={downloadCsv}
              />
            ) : active ? (
              <ReportView
                key={`${active.module}-${active.reportName}-${active.reportCategory}`}
                entry={active}
                period={activePeriod}
                kecamatanId={reportRoute?.kec ?? null}
                desaId={reportRoute?.desa ?? null}
                onPeriodChange={(p) =>
                  navigate(
                    {
                      kind: 'report',
                      module: active.module,
                      reportName: active.reportName,
                      periodKey: p.key,
                      kec: reportRoute?.kec ?? null,
                      desa: reportRoute?.desa ?? null,
                    },
                    'replace',
                  )
                }
                onWilayahChange={(kec, desa) =>
                  navigate(
                    {
                      kind: 'report',
                      module: active.module,
                      reportName: active.reportName,
                      periodKey: activePeriod?.key ?? null,
                      kec,
                      desa,
                    },
                    'replace',
                  )
                }
                onDownload={downloadCsv}
                onBackToDashboard={() => goDashboard(active.module)}
              />
            ) : (
              <Dashboard
                index={index}
                moduleId={missingReport ? route.module : activeModule}
                onSelect={(r) =>
                  navigate({
                    kind: 'report',
                    module: r.module,
                    reportName: r.reportName,
                    periodKey: null,
                    kec: null,
                    desa: null,
                  })
                }
                onSelectModule={goDashboard}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
