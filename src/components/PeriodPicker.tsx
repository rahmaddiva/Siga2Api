import type { PeriodEntry } from '../lib/data'

type Props = {
  periods: PeriodEntry[]
  activeKey: string | null
  onSelect: (p: PeriodEntry) => void
  periodType: 'annual' | 'monthly'
}

/**
 * Pemilih periode. Untuk laporan bulanan tampil sebagai baris chip yang bisa
 * digeser; untuk laporan tahunan cukup satu chip per tahun.
 */
export function PeriodPicker({ periods, activeKey, onSelect, periodType }: Props) {
  if (periods.length === 0) return null

  // Urutkan kronologis (index sudah desc, kita tampilkan asc agar bulan mengalir kiri→kanan)
  const ordered = [...periods].sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {periodType === 'monthly' ? 'Periode bulanan' : 'Periode tahunan'}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          {periods.filter((p) => !p.empty && !p.error).length}/{periods.length} tersedia
        </span>
      </div>

      <div
        role="group"
        aria-label={periodType === 'monthly' ? 'Pilih bulan' : 'Pilih tahun'}
        className="thin-scroll flex gap-1.5 overflow-x-auto pb-1"
      >
        {ordered.map((p) => {
          const selected = p.key === activeKey
          const unavailable = p.empty || p.error
          const mismatch = p.periodStatus === 'mismatch'
          const baseTitle = p.error
            ? `${p.label} — gagal diambil`
            : p.empty
              ? `${p.label} — belum ada data`
              : `${p.label} — ${p.rowCount} baris`
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelect(p)}
              aria-pressed={selected}
              title={mismatch ? `${baseTitle} — label laporan menyebut tahun lain` : baseTitle}
              className={`tabular shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                selected
                  ? 'border-primary bg-primary text-white'
                  : unavailable
                    ? 'border-border bg-muted text-slate-400 hover:border-border-strong hover:text-slate-600'
                    : 'border-border-strong bg-card text-foreground hover:border-secondary hover:bg-muted'
              }`}
            >
              {p.label}
              {mismatch && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`ml-1 inline-block size-3.5 align-[-2px] ${
                    selected ? 'text-amber-200' : 'text-amber-500'
                  }`}
                  role="img"
                  aria-label="Label laporan tidak cocok dengan periode ini"
                >
                  <path d="M12 9v4m0 4h.01M10.3 4.3 2.6 18a1.7 1.7 0 0 0 1.5 2.5h15.8a1.7 1.7 0 0 0 1.5-2.5L13.7 4.3a1.7 1.7 0 0 0-3 0Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {unavailable && !selected && (
                <span aria-hidden="true" className="ml-1 text-slate-300">
                  ·
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
