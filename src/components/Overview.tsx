import { ChevronRight } from 'lucide-react'

import type { Index, ReportEntry } from '@/lib/data'
import { cleanDescription, prettyGroup } from '@/lib/data'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
        <h2 className="text-xl font-semibold sm:text-2xl">Ringkasan Data</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Snapshot laporan SIGA untuk{' '}
          <strong className="font-medium text-foreground">
            Kabupaten {index.wilayah.kabupaten}
          </strong>
          , Provinsi {index.wilayah.provinsi}. Pilih laporan di panel kiri untuk melihat tabel
          lengkap.
        </p>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 py-4">
            <CardHeader>
              <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="tabular text-2xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mb-6">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Modul
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {index.modules.map((m) => {
            const list = index.reports.filter((r) => r.module === m.id)
            const filled = list.filter((r) => !r.empty).length
            return (
              <Card key={m.id} className="gap-2 py-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    {m.label}
                    <Badge variant="muted" className="tabular">
                      {filled}/{list.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="tabular text-xs text-muted-foreground">
                    {filled} dari {list.length} laporan berisi data
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${list.length ? (filled / list.length) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Laporan {moduleLabel} yang berisi data
        </h3>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {moduleReports.slice(0, 12).map((r) => (
            <li key={`${r.module}-${r.reportName}-${r.reportCategory}`}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <Badge variant="outline" className="tabular shrink-0 font-semibold">
                  {r.reportName}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {cleanDescription(r.description)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {prettyGroup(r.group)} · {r.rowCount} baris · {r.colCount} kolom
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
          {moduleReports.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              Belum ada laporan berisi data.
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
