import { useMemo, useState } from 'react'
import type { Index, ReportEntry } from '../lib/data'
import { cleanDescription, groupRank, prettyGroup } from '../lib/data'

const MODULE_ICON: Record<string, string> = {
  yankb: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  dallap: 'M4 19V5a1 1 0 011-1h9l6 6v9a1 1 0 01-1 1H5a1 1 0 01-1-1zM14 4v6h6',
  krs: 'M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z',
  elsimil: 'M9 3h6v4H9zM5 7h14v14H5zM9 12h6M9 16h4',
}

function Icon({ path, className = 'size-5' }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

type Props = {
  index: Index
  activeModule: string
  activeReport: ReportEntry | null
  onSelectModule: (id: string) => void
  onSelectReport: (r: ReportEntry) => void
}

export function Sidebar({ index, activeModule, activeReport, onSelectModule, onSelectReport }: Props) {
  const [query, setQuery] = useState('')

  const byModule = useMemo(() => {
    const q = query.trim().toLowerCase()
    return index.modules.map((m) => {
      const reports = index.reports
        .filter((r) => r.module === m.id)
        .filter((r) => {
          if (!q) return true
          return (
            r.description.toLowerCase().includes(q) ||
            r.reportName.toLowerCase().includes(q) ||
            prettyGroup(r.group).toLowerCase().includes(q)
          )
        })
      const groups = new Map<string, ReportEntry[]>()
      for (const r of reports) {
        const list = groups.get(r.group) ?? []
        list.push(r)
        groups.set(r.group, list)
      }
      const ordered = new Map(
        [...groups.entries()]
          .sort((a, b) => groupRank(a[0]) - groupRank(b[0]))
          .map(([g, list]) => [
            g,
            [...list].sort((x, y) => x.reportName.localeCompare(y.reportName, 'id', { numeric: true })),
          ]),
      )
      return { ...m, total: index.reports.filter((r) => r.module === m.id).length, groups: ordered }
    })
  }, [index, query])

  const matchCount = byModule.reduce((n, m) => n + [...m.groups.values()].flat().length, 0)

  // Saat mencari, tampilkan semua modul yang punya hasil — jangan biarkan
  // hasil pencarian tersembunyi karena modul lain sedang aktif.
  const searching = query.trim().length > 0

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border bg-card lg:w-80 lg:shrink-0">
      <div className="border-b border-border p-3">
        <label htmlFor="cari-laporan" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cari laporan
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            id="cari-laporan"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nama tabel atau kata kunci…"
            className="w-full rounded-lg border border-border-strong bg-white py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-slate-400 hover:border-secondary focus:border-primary"
          />
        </div>
        {query && (
          <p className="mt-1.5 text-xs text-muted-foreground" role="status">
            {matchCount} laporan cocok
          </p>
        )}
      </div>

      <nav aria-label="Daftar modul dan laporan" className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {byModule.map((m) => {
          const groupCount = [...m.groups.values()].flat().length
          if (searching && groupCount === 0) return null
          const isActive = activeModule === m.id
          // Saat mencari, semua modul yang punya hasil dibuka agar hasilnya terlihat.
          const expanded = isActive || searching
          return (
            <div key={m.id} className="mb-1">
              <button
                type="button"
                onClick={() => onSelectModule(m.id)}
                aria-expanded={expanded}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors duration-150 ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <Icon path={MODULE_ICON[m.id] ?? MODULE_ICON.dallap} />
                <span className="flex-1 leading-tight">{m.label}</span>
                <span
                  className={`tabular rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                    isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {groupCount || m.total}
                </span>
              </button>

              {expanded && (
                <div className="mt-1 space-y-2 border-l-2 border-border pl-2">
                  {[...m.groups.entries()].map(([group, reports]) => (
                    <div key={group}>
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {prettyGroup(group)}
                      </p>
                      <ul className="space-y-0.5">
                        {reports.map((r) => {
                          const selected =
                            activeReport?.module === r.module &&
                            activeReport?.reportName === r.reportName &&
                            activeReport?.reportCategory === r.reportCategory
                          return (
                            <li key={`${r.module}-${r.reportName}-${r.reportCategory}`}>
                              <button
                                type="button"
                                onClick={() => onSelectReport(r)}
                                aria-current={selected ? 'true' : undefined}
                                className={`group flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors duration-150 ${
                                  selected
                                    ? 'bg-muted font-medium text-primary ring-1 ring-border-strong'
                                    : 'text-slate-700 hover:bg-muted'
                                }`}
                              >
                                <span className="tabular mt-px shrink-0 rounded bg-white px-1 text-[10px] font-semibold text-slate-500 ring-1 ring-border">
                                  {r.reportName.replace('Tabel', 'T')}
                                </span>
                                <span className="line-clamp-2 flex-1">{cleanDescription(r.description)}</span>
                                {(() => {
                                  const filled = r.periods.filter((p) => !p.empty && !p.error).length
                                  if (filled === 0) {
                                    return (
                                      <span
                                        className="mt-1 size-1.5 shrink-0 rounded-full bg-slate-300"
                                        title="Belum ada data pada semua periode"
                                      />
                                    )
                                  }
                                  return (
                                    <span
                                      className="tabular mt-0.5 shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                                      title={`${filled} dari ${r.periods.length} periode berisi data`}
                                    >
                                      {filled}/{r.periods.length}
                                    </span>
                                  )
                                })()}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                  {m.groups.size === 0 && (
                    <p className="px-2 py-3 text-xs text-muted-foreground">Tidak ada laporan yang cocok.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
