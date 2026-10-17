import { useMemo, useState } from 'react'
import type { ReportData } from '../lib/data'
import { cleanDescription } from '../lib/data'

type Sort = { col: number; dir: 'asc' | 'desc' } | null

const NUMERIC = /^-?[\d.,]+$/

function isNumericCell(v: string) {
  return NUMERIC.test(v.replace(/\s/g, ''))
}

function toNumber(v: string) {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function DataTable({ data }: { data: ReportData }) {
  const [sort, setSort] = useState<Sort>(null)
  const [filter, setFilter] = useState('')
  const [hideEmptyCols, setHideEmptyCols] = useState(true)

  // Kolom yang seluruhnya kosong biasanya artefak layout JasperReports.
  const keepCols = useMemo(() => {
    if (!hideEmptyCols || data.rows.length === 0) return data.columns.map((_, i) => i)
    const keep: number[] = []
    const width = Math.max(data.columns.length, ...data.rows.map((r) => r.length))
    for (let i = 0; i < width; i++) {
      if (data.rows.some((r) => (r[i] ?? '').trim() !== '')) keep.push(i)
    }
    return keep
  }, [data, hideEmptyCols])

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let out = data.rows
    if (q) {
      out = out.filter((r) => r.some((c) => c.toLowerCase().includes(q)))
    }
    if (sort) {
      const { col, dir } = sort
      out = [...out].sort((a, b) => {
        const av = a[col] ?? ''
        const bv = b[col] ?? ''
        if (isNumericCell(av) && isNumericCell(bv)) {
          const an = toNumber(av) ?? 0
          const bn = toNumber(bv) ?? 0
          return dir === 'asc' ? an - bn : bn - an
        }
        return dir === 'asc' ? av.localeCompare(bv, 'id') : bv.localeCompare(av, 'id')
      })
    }
    return out
  }, [data.rows, filter, sort])

  if (data.empty) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-3 size-10 text-slate-300" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium text-foreground">
          {data.error ? 'Data tidak tersedia' : 'Belum ada data untuk laporan ini'}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {data.error
            ? 'Laporan ini gagal diambil saat snapshot dibuat. Lihat detail di atas.'
            : 'SIGA mengembalikan tabel kosong untuk periode dan wilayah ini. Coba periode lain, atau laporan ini memang belum diisi pada tingkat Kabupaten Tanah Laut.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Cari di dalam tabel…"
            aria-label="Cari di dalam tabel"
            className="w-full rounded-lg border border-border-strong bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 hover:border-secondary focus:border-primary"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-700 transition-colors duration-150 hover:bg-muted">
          <input
            type="checkbox"
            checked={hideEmptyCols}
            onChange={(e) => setHideEmptyCols(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
          Sembunyikan kolom kosong
        </label>

        <p className="tabular ml-auto text-xs text-muted-foreground" role="status" aria-live="polite">
          {rows.length} dari {data.rows.length} baris
          {filter && ` · filter "${filter}"`}
        </p>
      </div>

      <div className="thin-scroll overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">
            {data.title} — {cleanDescription(data.description)}
          </caption>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted">
              <th scope="col" className="w-10 border-b border-border px-2 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                #
              </th>
              {keepCols.map((i) => {
                const label = data.columns[i] || `Kolom ${i + 1}`
                const active = sort?.col === i
                return (
                  <th
                    key={i}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="border-b border-border px-3 py-2.5 text-left align-bottom text-xs font-semibold text-foreground"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          active && sort.dir === 'asc'
                            ? { col: i, dir: 'desc' }
                            : active && sort.dir === 'desc'
                              ? null
                              : { col: i, dir: 'asc' },
                        )
                      }
                      className="group flex cursor-pointer items-center gap-1 text-left hover:text-primary"
                      title={`Urutkan berdasarkan ${label}`}
                    >
                      <span className="line-clamp-3 leading-tight">{label}</span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        className={`size-3 shrink-0 transition-opacity duration-150 ${
                          active ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-50'
                        } ${active && sort.dir === 'desc' ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      >
                        <path d="m6 9 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr
                key={ri}
                className="group border-b border-border/60 last:border-0 hover:bg-muted/50"
              >
                <td className="tabular px-2 py-2 text-right text-xs text-slate-400">{ri + 1}</td>
                {keepCols.map((i) => {
                  const v = r[i] ?? ''
                  const numeric = isNumericCell(v) && v !== ''
                  const isTotal = /^(JUMLAH|TOTAL|SUB\s*JUMLAH)/i.test(r[0] ?? '')
                  return (
                    <td
                      key={i}
                      className={`px-3 py-2 align-top ${
                        numeric ? 'tabular text-right tabular-nums' : 'text-left'
                      } ${isTotal ? 'font-semibold text-foreground' : 'text-slate-700'}`}
                    >
                      {v === '' ? <span className="text-slate-300">—</span> : v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && filter && (
        <p className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Tidak ada baris yang mengandung <strong className="font-semibold text-foreground">{filter}</strong>.
        </p>
      )}
    </div>
  )
}
