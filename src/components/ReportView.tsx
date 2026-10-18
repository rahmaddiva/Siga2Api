import { useEffect, useMemo, useRef, useState } from 'react'
import type { PeriodEntry, ReportData, ReportEntry } from '../lib/data'
import { cleanDescription, loadReport, pickInitialPeriod } from '../lib/data'
import { DataTable } from './DataTable'
import { PeriodPicker } from './PeriodPicker'

type Props = {
  entry: ReportEntry
  onDownload: () => void
  onPeriodChange?: (p: PeriodEntry) => void
}

export function ReportView({ entry, onDownload, onPeriodChange }: Props) {
  const [period, setPeriod] = useState<PeriodEntry | null>(() =>
    pickInitialPeriod(entry.periods),
  )
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Simpan callback di ref agar efek di bawah tidak ikut jalan saat induk
  // merender ulang dengan fungsi baru (bisa mereset periode pilihan pengguna).
  const notifyRef = useRef(onPeriodChange)
  notifyRef.current = onPeriodChange

  useEffect(() => {
    const next = pickInitialPeriod(entry.periods)
    setPeriod(next)
    if (next) notifyRef.current?.(next)
  }, [entry])

  useEffect(() => {
    if (!period) {
      setData(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)
    loadReport(period.file)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [period])

  const periodSummary = useMemo(() => {
    const filled = entry.periods.filter((p) => !p.empty && !p.error)
    return { filled: filled.length, total: entry.periods.length }
  }, [entry.periods])

  return (
    <section aria-labelledby="judul-laporan" className="min-w-0">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            {entry.moduleLabel}
          </span>
          <span className="tabular rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {entry.reportName}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {entry.reportCategory}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {entry.periodType === 'monthly' ? 'Bulanan' : 'Tahunan'}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="judul-laporan"
              className="text-balance text-xl font-semibold leading-snug text-foreground sm:text-2xl"
            >
              {entry.reportName} — {cleanDescription(entry.description)}
            </h2>
            {data?.wilayah && Object.keys(data.wilayah).length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {Object.entries(data.wilayah)
                  .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${v}`)
                  .join(' · ')}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={!data || data.empty}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="size-4" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Unduh CSV
          </button>
        </div>
      </header>

      <PeriodPicker
        periods={entry.periods}
        activeKey={period?.key ?? null}
        periodType={entry.periodType}
        onSelect={(p) => {
          setPeriod(p)
          notifyRef.current?.(p)
        }}
      />

      {periodSummary.total > 0 && periodSummary.filled === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Belum ada data pada semua periode yang tersedia</p>
          <p className="mt-0.5 text-amber-800">
            Server SIGA mengembalikan tabel kosong untuk {entry.periodType === 'monthly'
              ? 'setiap bulan'
              : 'tahun'}{' '}
            yang dipanen. Laporan ini mungkin diisi pada tingkat wilayah lain (provinsi),
            atau memang belum ada pelaporan pada periode tersebut.
          </p>
        </div>
      )}

      {loading && <TableSkeleton />}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Gagal memuat data</p>
          <p className="mt-0.5 text-red-700">{error}</p>
        </div>
      )}

      {!loading && data && data.error && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Laporan ini gagal diambil dari server SIGA</p>
          <p className="mt-0.5 text-amber-800">
            Coba periode lain, atau jalankan ulang{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">
              build_snapshot.py --force
            </code>{' '}
            saat server stabil.
          </p>
          <p className="tabular mt-1.5 text-xs text-amber-700">{data.error}</p>
        </div>
      )}

      {!loading && data && <DataTable data={data} />}

      {!loading && data && !data.empty && (
        <p className="mt-4 text-xs text-muted-foreground">
          Periode {data.periodLabel} · sumber: SIGA BKKBN — snapshot statis diambil{' '}
          {new Date(data.fetchedAt).toLocaleString('id-ID')}. Data bersifat agregat per
          wilayah; tidak memuat identitas perorangan.
        </p>
      )}
    </section>
  )
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat data" className="animate-pulse">
      <div className="mb-3 h-9 w-full max-w-xs rounded-lg bg-muted" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="h-11 bg-muted" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border/60 px-4 py-3 last:border-0">
            <div className="h-3 w-6 rounded bg-muted" />
            <div className="h-3 flex-1 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
