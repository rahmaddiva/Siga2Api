import { useMemo } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Layers,
  Table2,
  TriangleAlert,
} from 'lucide-react'

import type { Index, ReportEntry } from '@/lib/data'
import { cleanDescription, prettyGroup } from '@/lib/data'
import { FALLBACK_MODULE_ICON, LIVE_MODULE, MODULE_ICON } from '@/lib/modules'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Props = {
  index: Index
  moduleId: string
  onSelect: (r: ReportEntry) => void
  onSelectModule: (id: string) => void
}

const numberFormat = new Intl.NumberFormat('id-ID')

/** Kartu angka tunggal: label kecil, angka besar, keterangan pendek. */
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint: string
  icon: typeof Database
  tone?: 'neutral' | 'primary' | 'success' | 'warning'
}) {
  const toneClass = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  }[tone]

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex min-h-9 items-start justify-between gap-3">
        <p className="eyebrow pt-1">{label}</p>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', toneClass)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="tabular mt-2 text-2xl leading-none font-semibold">{value}</p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}

export function Dashboard({ index, moduleId, onSelect, onSelectModule }: Props) {
  const { withData, emptyCount, modules, topReports, moduleLabel } = useMemo(() => {
    const filled = index.reports.filter((r) => !r.empty && !r.error)
    const grouped = index.modules.map((m) => {
      const list = index.reports.filter((r) => r.module === m.id)
      const ok = list.filter((r) => !r.empty && !r.error)
      return {
        ...m,
        total: list.length,
        filled: ok.length,
        rows: ok.reduce((n, r) => n + r.rowCount, 0),
      }
    })
    return {
      withData: filled,
      emptyCount: index.reports.length - filled.length,
      modules: grouped,
      moduleLabel: index.modules.find((m) => m.id === moduleId)?.label ?? '',
      topReports: filled
        .filter((r) => r.module === moduleId)
        .sort((a, b) => b.rowCount - a.rowCount || a.reportName.localeCompare(b.reportName, 'id', { numeric: true }))
        .slice(0, 8),
    }
  }, [index, moduleId])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Ringkasan Data</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Snapshot laporan SIGA untuk{' '}
            <span className="font-medium text-foreground">
              Kabupaten {index.wilayah.kabupaten}
            </span>
            , Provinsi {index.wilayah.provinsi}. Pilih modul atau laporan untuk melihat tabel
            lengkap.
          </p>
        </div>
        <Badge variant="outline" className="tabular">
          Snapshot {new Date(index.generatedAt).toLocaleDateString('id-ID')}
        </Badge>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Total laporan"
          value={numberFormat.format(index.reports.length)}
          hint={`${index.modules.length} modul terdaftar`}
          icon={Database}
        />
        <StatCard
          label="Berisi data"
          value={numberFormat.format(withData.length)}
          hint={`${index.reports.length ? Math.round((withData.length / index.reports.length) * 100) : 0}% dari ${numberFormat.format(index.reports.length)} laporan`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Belum ada data"
          value={numberFormat.format(emptyCount)}
          hint="Laporan kosong pada semua periode"
          icon={TriangleAlert}
          tone={emptyCount > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Tahun data"
          value={
            index.years.length === 0
              ? '—'
              : index.years.length === 1
                ? String(index.years[0])
                : `${Math.min(...index.years)}–${Math.max(...index.years)}`
          }
          hint={`${index.months.length} bulan · ${index.totalPeriods} periode`}
          icon={Layers}
          tone="primary"
        />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Modul</h3>
            <p className="text-xs text-muted-foreground">
              Ketersediaan data per modul pada snapshot ini.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {modules.map((m) => {
            const Icon = MODULE_ICON[m.id] ?? FALLBACK_MODULE_ICON
            const isActive = m.id === moduleId
            const percent = m.total ? Math.round((m.filled / m.total) * 100) : 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModule(m.id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'group flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/[0.03]'
                    : 'border-border hover:border-input hover:bg-accent/60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'grid size-8 place-items-center rounded-md',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="tabular text-xs font-medium text-muted-foreground">
                    {m.filled}/{m.total}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {percent}% laporan berisi data
                  </p>
                </div>

                <div className="mt-auto">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', isActive ? 'bg-primary' : 'bg-slate-400 dark:bg-slate-500')}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="tabular mt-2 text-xs text-muted-foreground">
                    {numberFormat.format(m.rows)} baris tersedia
                  </p>
                </div>
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => onSelectModule(LIVE_MODULE.id)}
            className={cn(
              'group flex cursor-pointer flex-col gap-3 rounded-lg border border-dashed bg-card p-4 text-left transition-colors',
              moduleId === LIVE_MODULE.id
                ? 'border-primary/40 bg-primary/[0.03]'
                : 'border-input hover:border-input hover:bg-accent/60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                <LIVE_MODULE.icon className="size-4" aria-hidden="true" />
              </span>
              <Badge variant="muted">live</Badge>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{LIVE_MODULE.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Diambil langsung dari SIGA</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
              Buka monitoring
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </span>
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              Laporan {moduleLabel || 'modul ini'} dengan data terbanyak
            </h3>
            <p className="text-xs text-muted-foreground">
              Diurutkan menurut jumlah baris pada snapshot terbaru.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {topReports.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Belum ada laporan berisi data pada modul ini.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {topReports.map((r) => (
                <li key={`${r.module}-${r.reportName}-${r.reportCategory}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(r)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="tabular grid h-6 shrink-0 place-items-center rounded border border-border bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                      {r.reportName.replace('Tabel', 'T')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {cleanDescription(r.description)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {prettyGroup(r.group)}
                      </span>
                    </span>
                    <span className="tabular hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
                      <span className="inline-flex items-center gap-1">
                        <Table2 className="size-3.5" aria-hidden="true" />
                        {numberFormat.format(r.rowCount)} baris
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileSpreadsheet className="size-3.5" aria-hidden="true" />
                        {r.colCount} kolom
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
