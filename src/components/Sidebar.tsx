import { useMemo, useState } from 'react'
import { Activity, Baby, ChevronRight, ClipboardList, FileSpreadsheet, HeartPulse, Search, Table2, type LucideIcon } from 'lucide-react'

import type { Index, ReportEntry } from '@/lib/data'
import { cleanDescription, groupRank, prettyGroup } from '@/lib/data'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const MODULE_ICON: Record<string, LucideIcon> = {
  yankb: ClipboardList,
  dallap: FileSpreadsheet,
  krs: HeartPulse,
  elsimil: Baby,
}

/**
 * Modul yang datanya diambil live, bukan dari snapshot `public/data/`.
 * Tidak masuk `index.modules` karena tidak punya katalog laporan.
 */
const LIVE_MODULE = { id: 'verval', label: 'Verval KRS', icon: Activity }

type Props = {
  index: Index
  activeModule: string
  activeReport: ReportEntry | null
  onSelectModule: (id: string) => void
  onSelectReport: (r: ReportEntry) => void
  /** Sidebar dirender dua kali (aside desktop + Sheet mobile); id DOM harus unik. */
  idPrefix?: string
}

export function Sidebar({
  index,
  activeModule,
  activeReport,
  onSelectModule,
  onSelectReport,
  idPrefix = 'sidebar',
}: Props) {
  const [query, setQuery] = useState('')
  const searchId = `${idPrefix}-cari-laporan`

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
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      <div className="border-b border-border p-3">
        <label
          htmlFor={searchId}
          className="mb-1.5 block text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Cari laporan
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nama tabel atau kata kunci…"
            className="pl-9"
          />
        </div>
        {query && (
          <p className="mt-1.5 text-xs text-muted-foreground" role="status">
            {matchCount} laporan cocok
          </p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Daftar modul dan laporan" className="p-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelectModule(LIVE_MODULE.id)}
            aria-current={activeModule === LIVE_MODULE.id ? 'true' : undefined}
            className={cn(
              'mb-2 h-auto w-full justify-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold',
              activeModule === LIVE_MODULE.id
                ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                : 'text-foreground',
            )}
          >
            <LIVE_MODULE.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-tight">{LIVE_MODULE.label}</span>
            <Badge
              variant="muted"
              className={cn(
                'rounded-full px-1.5 text-[11px]',
                activeModule === LIVE_MODULE.id && 'bg-primary-foreground/20 text-primary-foreground',
              )}
              title="Diambil live dari server SIGA"
            >
              live
            </Badge>
          </Button>

          {byModule.map((m) => {
            const groupCount = [...m.groups.values()].flat().length
            if (searching && groupCount === 0) return null
            const isActive = activeModule === m.id
            // Saat mencari, semua modul yang punya hasil dibuka agar hasilnya terlihat.
            const expanded = isActive || searching
            const Icon = MODULE_ICON[m.id] ?? Table2
            return (
              <div key={m.id} className="mb-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectModule(m.id)}
                  aria-expanded={expanded}
                  className={cn(
                    'h-auto w-full justify-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold',
                    isActive
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 leading-tight">{m.label}</span>
                  <Badge
                    variant="muted"
                    className={cn(
                      'tabular rounded-full px-1.5 text-[11px]',
                      isActive && 'bg-primary-foreground/20 text-primary-foreground',
                    )}
                  >
                    {groupCount || m.total}
                  </Badge>
                </Button>

                {expanded && (
                  <div className="mt-1 space-y-2 border-l-2 border-border pl-2">
                    {[...m.groups.entries()].map(([group, reports]) => (
                      <div key={group}>
                        <p className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {prettyGroup(group)}
                        </p>
                        <ul className="space-y-0.5">
                          {reports.map((r) => {
                            const selected =
                              activeReport?.module === r.module &&
                              activeReport?.reportName === r.reportName &&
                              activeReport?.reportCategory === r.reportCategory
                            const filled = r.periods.filter((p) => !p.empty && !p.error).length
                            return (
                              <li key={`${r.module}-${r.reportName}-${r.reportCategory}`}>
                                <button
                                  type="button"
                                  onClick={() => onSelectReport(r)}
                                  aria-current={selected ? 'true' : undefined}
                                  className={cn(
                                    'group flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors',
                                    selected
                                      ? 'bg-accent font-medium text-primary ring-1 ring-ring/20'
                                      : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                                  )}
                                >
                                  <Badge
                                    variant="outline"
                                    className="tabular mt-px shrink-0 px-1 py-0 text-[10px] font-semibold text-muted-foreground"
                                  >
                                    {r.reportName.replace('Tabel', 'T')}
                                  </Badge>
                                  <span className="line-clamp-2 flex-1">
                                    {cleanDescription(r.description)}
                                  </span>
                                  {filled === 0 ? (
                                    <span
                                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300"
                                      title="Belum ada data pada semua periode"
                                    />
                                  ) : (
                                    <span
                                      className="tabular mt-0.5 shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                                      title={`${filled} dari ${r.periods.length} periode berisi data`}
                                    >
                                      {filled}/{r.periods.length}
                                    </span>
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                    {m.groups.size === 0 && (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Tidak ada laporan yang cocok.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  )
}
