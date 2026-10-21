import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from 'lucide-react'

import type { ReportData } from '@/lib/data'
import { cleanDescription } from '@/lib/data'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type HeaderCell = {
  key: string
  label: string
  span: number
  rowSpan: number
  /** Posisi kolom (indeks ke `keepCols`) tempat sel ini mulai. */
  col: number
}

/**
 * Susun header bertingkat dari `columnGroups` dalam SATU lintasan.
 *
 * `columnGroups[k]` adalah path induk -> daun untuk kolom k. Total baris header
 * = panjang path terpanjang. Untuk kolom dengan path sepanjang L:
 *   - baris 0..L-2 memuat sel grup (rowSpan 1),
 *   - baris L-1 memuat daun dengan rowSpan = maxLen - L + 1, sehingga sel daun
 *     menjulang sampai baris terakhir tanpa diulang.
 * Sel bertetangga digabung bila label DAN rowSpan-nya sama.
 *
 * Dengan begitu jumlah sel persis seperti tabel aslinya (Tabel3B: 3 baris,
 * 20 sel termasuk kolom "#"), tanpa duplikasi label.
 */
function buildHeaderGroups(groups: string[][] | undefined, keepCols: number[]): HeaderCell[][] {
  if (!groups || keepCols.length === 0) return []

  const paths = keepCols.map((i) => groups[i] ?? [])
  const maxLen = Math.max(0, ...paths.map((p) => p.length))
  if (maxLen <= 1) return []

  const levels: HeaderCell[][] = []
  for (let row = 0; row < maxLen; row++) {
    const cells: HeaderCell[] = []
    for (let k = 0; k < paths.length; k++) {
      const path = paths[k]
      if (row > path.length - 1) continue // dicakup rowspan sel daun
      const isLeafRow = row === path.length - 1
      const label = path[row] ?? ''
      const rowSpan = isLeafRow ? maxLen - path.length + 1 : 1

      const prev = cells[cells.length - 1]
      if (prev && prev.label === label && prev.rowSpan === rowSpan) {
        prev.span += 1
        continue
      }
      cells.push({ key: `${row}-${k}`, label, span: 1, rowSpan, col: k })
    }
    levels.push(cells)
  }
  return levels
}

type Sort = { col: number; dir: 'asc' | 'desc' } | null

const NUMERIC = /^-?[\d.,]+$/

function isNumericCell(v: string) {
  return NUMERIC.test(v.replace(/\s/g, ''))
}

function toNumber(v: string) {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Sel header yang bisa diklik untuk mengurutkan kolom. */
function SortableHead({
  col,
  label,
  rowSpan,
  sort,
  onSort,
}: {
  col: number
  label: string
  rowSpan?: number
  sort: Sort
  onSort: (s: Sort) => void
}) {
  const active = sort?.col === col
  return (
    <TableHead
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      rowSpan={rowSpan && rowSpan > 1 ? rowSpan : undefined}
      className="border-l border-border/60 px-3 align-bottom"
    >
      <button
        type="button"
        onClick={() =>
          onSort(
            active && sort.dir === 'asc'
              ? { col, dir: 'desc' }
              : active && sort.dir === 'desc'
                ? null
                : { col, dir: 'asc' },
          )
        }
        className="group flex cursor-pointer items-center gap-1 text-left hover:text-primary"
        title={`Urutkan berdasarkan ${label}`}
      >
        <span className="line-clamp-3 leading-tight whitespace-normal">{label}</span>
        {active ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3 shrink-0 text-primary" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown
            className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50"
            aria-hidden="true"
          />
        )}
      </button>
    </TableHead>
  )
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
      <div className="flex flex-col items-center rounded-xl border border-dashed border-input bg-card px-6 py-16 text-center">
        <Inbox className="mb-3 size-10 text-slate-300" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          {data.error
            ? 'Data tidak tersedia'
            : data.emptyReason === 'no-data'
              ? 'Server SIGA tidak menemukan data'
              : 'Belum ada data untuk laporan ini'}
        </p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {data.error
            ? 'Laporan ini gagal diambil saat snapshot dibuat. Lihat detail di atas.'
            : data.emptyReason === 'no-data'
              ? 'SIGA menjawab "HASIL PENCARIAN DATA TIDAK DITEMUKAN" untuk periode dan wilayah ini. Ini bukan kegagalan filter: laporan tersebut memang belum diisi pada tingkat Kabupaten Tanah Laut.'
              : 'SIGA mengembalikan tabel kosong untuk periode dan wilayah ini. Coba periode lain, atau laporan ini memang belum diisi pada tingkat Kabupaten Tanah Laut.'}
        </p>
      </div>
    )
  }

  // Bangun header bertingkat dari `columnGroups` (path induk -> anak yang
  // berasal dari colspan/rowspan asli). Kolom dengan path sama digabung jadi
  // satu sel ber-colspan, persis seperti dokumen JasperReports.
  const headerGroups = buildHeaderGroups(data.columnGroups, keepCols)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Cari di dalam tabel…"
            aria-label="Cari di dalam tabel"
            className="pl-9"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
          <Checkbox
            checked={hideEmptyCols}
            onCheckedChange={(v) => setHideEmptyCols(v === true)}
            aria-label="Sembunyikan kolom kosong"
          />
          Sembunyikan kolom kosong
        </label>

        <p className="tabular ml-auto text-xs text-muted-foreground" role="status" aria-live="polite">
          {rows.length} dari {data.rows.length} baris
          {filter && ` · filter "${filter}"`}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table containerClassName="thin-scroll" maxHeight="min(70vh, 40rem)">
          <TableCaption className="sr-only">
            {data.title} — {cleanDescription(data.description)}
          </TableCaption>
          <TableHeader>
            {headerGroups.length === 0 ? (
              <TableRow className="hover:bg-muted">
                <TableHead className="w-10 px-2 text-right text-muted-foreground">#</TableHead>
                {keepCols.map((i) => (
                  <SortableHead
                    key={i}
                    col={i}
                    label={data.columns[i] || `Kolom ${i + 1}`}
                    sort={sort}
                    onSort={setSort}
                  />
                ))}
              </TableRow>
            ) : (
              headerGroups.map((level, li) => (
                <TableRow key={`h${li}`} className="hover:bg-muted">
                  {li === 0 && (
                    <TableHead
                      rowSpan={headerGroups.length}
                      className="w-10 px-2 text-right align-bottom text-muted-foreground"
                    >
                      #
                    </TableHead>
                  )}
                  {level.map((cell) =>
                    cell.span === 1 ? (
                      <SortableHead
                        key={cell.key}
                        col={keepCols[cell.col]}
                        label={cell.label}
                        rowSpan={cell.rowSpan}
                        sort={sort}
                        onSort={setSort}
                      />
                    ) : (
                      <TableHead
                        key={cell.key}
                        colSpan={cell.span}
                        rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        className="border-l border-border/60 px-3 text-left align-bottom"
                      >
                        <span className="line-clamp-3 whitespace-normal">{cell.label}</span>
                      </TableHead>
                    ),
                  )}
                </TableRow>
              ))
            )}
          </TableHeader>
          <TableBody>
            {rows.map((r, ri) => {
              const isTotal = /^(JUMLAH|TOTAL|SUB\s*JUMLAH)/i.test(r[0] ?? '')
              return (
                <TableRow key={ri} data-total={isTotal || undefined}>
                  <TableCell className="tabular px-2 text-right text-xs text-muted-foreground">
                    {ri + 1}
                  </TableCell>
                  {keepCols.map((i) => {
                    const v = r[i] ?? ''
                    // U+FFFD sudah ada di respons server (byte mentah EF BF BD di
                    // dalam <span> kosong, decode UTF-8 strict lolos), jadi bukan
                    // salah charset di sisi kita dan tidak bisa dipulihkan.
                    // Diperlakukan seperti sel kosong agar tidak tampil "�".
                    const blank = v === '' || v.includes('\uFFFD')
                    const numeric = isNumericCell(v) && v !== ''
                    return (
                      <TableCell
                        key={i}
                        className={cn(
                          'whitespace-normal',
                          numeric ? 'tabular text-right' : 'text-left',
                          isTotal ? 'font-semibold text-foreground' : 'text-foreground/80',
                        )}
                      >
                        {blank ? <span className="text-slate-300">—</span> : v}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {rows.length === 0 && filter && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Badge variant="muted">0 baris</Badge>
          Tidak ada baris yang mengandung{' '}
          <strong className="font-semibold text-foreground">{filter}</strong>.
        </div>
      )}
    </div>
  )
}
