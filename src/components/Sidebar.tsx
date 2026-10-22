import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Search, type LucideIcon } from 'lucide-react'

import type { Index, ReportEntry } from '@/lib/data'
import { cleanDescription, groupRank, prettyGroup } from '@/lib/data'
import { FALLBACK_MODULE_ICON, LIVE_MODULE, MODULE_ICON } from '@/lib/modules'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

type Props = {
  index: Index
  activeModule: string
  activeReport: ReportEntry | null
  onSelectModule: (id: string) => void
  onSelectReport: (r: ReportEntry) => void
  /** Sidebar dirender dua kali (aside desktop + Sheet mobile); id DOM harus unik. */
  idPrefix?: string
}

/** Baris navigasi datar: ikon, label, dan metadata kanan. */
function NavRow({
  icon: Icon,
  label,
  meta,
  active,
  onClick,
  className,
}: {
  icon: LucideIcon
  label: string
  meta?: ReactNode
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-primary/[0.07] font-semibold text-primary'
          : 'font-medium text-foreground hover:bg-accent',
        className,
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <Icon
        className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="flex-1 truncate leading-tight">{label}</span>
      {meta}
    </button>
  )
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
  // Hanya satu modul terbuka pada satu waktu: 300 laporan sekaligus membuat
  // sidebar tak terbaca. Modul yang punya laporan terpilih selalu terbuka.
  const [openId, setOpenId] = useState<string | null>(null)
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
            [...list].sort((x, y) =>
              x.reportName.localeCompare(y.reportName, 'id', { numeric: true }),
            ),
          ]),
      )
      return {
        ...m,
        total: index.reports.filter((r) => r.module === m.id).length,
        groups: ordered,
      }
    })
  }, [index, query])

  const matchCount = byModule.reduce((n, m) => n + [...m.groups.values()].flat().length, 0)
  const searching = query.trim().length > 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-card">
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={searchId} className="sr-only">
            Cari laporan
          </label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari laporan…"
            className="h-9 border-transparent bg-muted pl-8.5 text-sm shadow-none focus-visible:border-ring focus-visible:bg-card"
          />
        </div>
        {query && (
          <p className="mt-1.5 px-1 text-xs text-muted-foreground" role="status">
            {matchCount} laporan cocok
          </p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Daftar modul dan laporan" className="px-3 pb-4">
          <p className="eyebrow mb-1 px-1">Modul</p>

          <NavRow
            icon={LIVE_MODULE.icon}
            label={LIVE_MODULE.label}
            active={activeModule === LIVE_MODULE.id}
            meta={
              <span className="rounded border border-border px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                live
              </span>
            }
            onClick={() => onSelectModule(LIVE_MODULE.id)}
          />

          {byModule.map((m) => {
            const groupCount = [...m.groups.values()].flat().length
            if (searching && groupCount === 0) return null
            const isActive = activeModule === m.id
            // Saat mencari, semua modul yang punya hasil dibuka agar hasilnya terlihat.
            const expanded =
              searching || openId === m.id || (openId === null && activeReport?.module === m.id)
            const Icon = MODULE_ICON[m.id] ?? FALLBACK_MODULE_ICON
            return (
              <div key={m.id}>
                <div className="flex items-center">
                  <NavRow
                    icon={Icon}
                    label={m.label}
                    active={isActive && !activeReport}
                    onClick={() => onSelectModule(m.id)}
                    className="pr-1"
                    meta={
                      <span
                        className={cn(
                          'tabular text-[11px] font-medium',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {groupCount || m.total}
                      </span>
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : m.id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Tutup' : 'Buka'} daftar laporan ${m.label}`}
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-0.5 mb-2 ml-4 space-y-3 border-l border-border pl-2">
                    {[...m.groups.entries()].map(([group, reports]) => (
                      <div key={group}>
                        <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                          {prettyGroup(group)}
                        </p>
                        <ul>
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
                                    'group flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left text-[13px] leading-snug transition-colors',
                                    selected
                                      ? 'bg-primary/[0.07] font-medium text-primary'
                                      : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'tabular mt-px shrink-0 rounded border px-1 text-[10px] font-semibold',
                                      selected
                                        ? 'border-primary/25 bg-card text-primary'
                                        : 'border-border bg-muted text-muted-foreground',
                                    )}
                                  >
                                    {r.reportName.replace('Tabel', 'T')}
                                  </span>
                                  <span className="line-clamp-2 flex-1">
                                    {cleanDescription(r.description)}
                                  </span>
                                  {filled === 0 ? (
                                    <span
                                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                                      title="Belum ada data pada semua periode"
                                    />
                                  ) : (
                                    <span
                                      className="tabular mt-0.5 shrink-0 text-[10px] font-medium text-muted-foreground"
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

      <div className="border-t border-border px-3 py-2.5">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Sumber: SIGA BKKBN · snapshot {new Date(index.generatedAt).toLocaleDateString('id-ID')}
        </p>
      </div>
    </div>
  )
}
