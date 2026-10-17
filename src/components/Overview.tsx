import type { Index, ReportEntry } from '../lib/data'
import { cleanDescription, prettyGroup } from '../lib/data'

type Props = {
  index: Index
  moduleId: string
  onSelect: (r: ReportEntry) => void
}

export function Overview({ index, moduleId, onSelect }: Props) {
  const withData = index.reports.filter((r) => !r.empty)
  const empty = index.reports.length - withData.length
  const moduleLabel = index.modules.find((m) => m.id === moduleId)?.label ?? ''
  const moduleReports = withData.filter((r) => r.module === moduleId)

  const stats = [
    { label: 'Total laporan', value: index.reports.length },
    { label: 'Berisi data', value: withData.length },
    { label: 'Belum ada data', value: empty },
    { label: 'Modul', value: index.modules.length },
  ]

  return (
    <div>
      <section className="mb-6">
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          Ringkasan Data
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Snapshot laporan SIGA untuk <strong className="font-medium text-foreground">Kabupaten {index.wilayah.kabupaten}</strong>,
          Provinsi {index.wilayah.provinsi}. Pilih laporan di panel kiri untuk melihat tabel lengkap.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Modul</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {index.modules.map((m) => {
            const list = index.reports.filter((r) => r.module === m.id)
            const filled = list.filter((r) => !r.empty).length
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">{m.label}</p>
                <p className="tabular mt-0.5 text-xs text-muted-foreground">
                  {filled} dari {list.length} laporan berisi data
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${list.length ? (filled / list.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Laporan {moduleLabel} yang berisi data
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {moduleReports
            .slice(0, 12)
            .map((r) => (
              <li key={r.file}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted"
                >
                  <span className="tabular shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {r.reportName}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {cleanDescription(r.description)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {prettyGroup(r.group)} · {r.rowCount} baris · {r.colCount} kolom
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4 shrink-0 text-slate-400" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          {moduleReports.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">Belum ada laporan berisi data.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
