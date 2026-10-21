import type { PeriodEntry, PeriodType } from '@/lib/data'
import { AlertTriangle } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type Props = {
  periods: PeriodEntry[]
  activeKey: string | null
  onSelect: (p: PeriodEntry) => void
  periodType: PeriodType
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
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {periodType === 'monthly'
            ? 'Periode bulanan'
            : periodType === 'cumulative'
              ? 'Periode kumulatif'
              : 'Periode tahunan'}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          {periods.filter((p) => !p.empty && !p.error).length}/{periods.length} tersedia
        </span>
      </div>

      <div className="thin-scroll overflow-x-auto pb-1">
        <ToggleGroup
          type="single"
          value={activeKey ?? ''}
          onValueChange={(v) => {
            const next = ordered.find((p) => p.key === v)
            if (next) onSelect(next)
          }}
          aria-label={periodType === 'annual' ? 'Pilih tahun' : 'Pilih bulan'}
          className="w-max"
        >
          {ordered.map((p) => {
            const unavailable = p.empty || p.error
            const mismatch = p.periodStatus === 'mismatch'
            const selected = p.key === activeKey
            const baseTitle = p.error
              ? `${p.label} — gagal diambil`
              : p.empty
                ? `${p.label} — belum ada data`
                : `${p.label} — ${p.rowCount} baris`
            return (
              <ToggleGroupItem
                key={p.key}
                value={p.key}
                size="sm"
                // Tampilan "terpilih" digerakkan oleh state React, bukan
                // atribut: Radix menulis data-state sendiri (on/off) dan
                // aria-checked sudah diberikan ToggleGroup (role=radio).
                title={mismatch ? `${baseTitle} — label laporan menyebut tahun lain` : baseTitle}
                className={cn(
                  'tabular shrink-0 border',
                  selected && 'border-primary bg-primary text-primary-foreground',
                  !selected &&
                    unavailable &&
                    'border-border bg-muted text-muted-foreground/60 hover:bg-muted hover:text-foreground',
                  !selected && !unavailable && 'border-input',
                )}
              >
                {p.label}
                {mismatch && (
                  <AlertTriangle
                    className={cn('size-3.5', selected ? 'text-amber-200' : 'text-warning')}
                    role="img"
                    aria-label="Label laporan tidak cocok dengan periode ini"
                  />
                )}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
    </div>
  )
}
