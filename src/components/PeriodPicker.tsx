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

const PERIOD_LABEL: Record<PeriodType, string> = {
  monthly: 'Periode bulanan',
  cumulative: 'Periode kumulatif',
  annual: 'Periode tahunan',
}

/**
 * Pemilih periode. Untuk laporan bulanan tampil sebagai baris chip yang bisa
 * digeser; untuk laporan tahunan cukup satu chip per tahun.
 */
export function PeriodPicker({ periods, activeKey, onSelect, periodType }: Props) {
  if (periods.length === 0) return null

  // Urutkan kronologis (index sudah desc, kita tampilkan asc agar bulan mengalir kiri→kanan)
  const ordered = [...periods].sort((a, b) => a.key.localeCompare(b.key))
  const available = periods.filter((p) => !p.empty && !p.error).length

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">{PERIOD_LABEL[periodType]}</span>
        <span className="tabular text-xs text-muted-foreground">
          {available}/{periods.length} tersedia
        </span>
      </div>

      <div className="thin-scroll -mx-0.5 overflow-x-auto px-0.5 pb-1">
        <ToggleGroup
          type="single"
          value={activeKey ?? ''}
          onValueChange={(v) => {
            const next = ordered.find((p) => p.key === v)
            if (next) onSelect(next)
          }}
          aria-label={periodType === 'annual' ? 'Pilih tahun' : 'Pilih bulan'}
          className="w-max gap-1.5"
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
                  'tabular shrink-0 gap-1.5 border px-2.5 transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground'
                    : unavailable
                      ? 'border-border bg-muted text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground'
                      : 'border-input bg-card text-foreground hover:bg-accent',
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
