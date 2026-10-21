import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Loader2, Radio } from 'lucide-react'

import type { PeriodEntry, ReportData, ReportEntry } from '@/lib/data'
import { cleanDescription, isAllDataZero, loadReport, pickInitialPeriod } from '@/lib/data'
import { fetchLiveReport, type LiveResult } from '@/lib/live'
import { DESA_AWARE_MODULES, loadWilayah } from '@/lib/wilayah'
import { DataTable } from '@/components/DataTable'
import { PeriodPicker } from '@/components/PeriodPicker'
import { WilayahPicker } from '@/components/WilayahPicker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Props = {
  entry: ReportEntry
  onDownload: (data: ReportData, suffix: string) => void
  onPeriodChange?: (p: PeriodEntry) => void
}

/** Nama kolom yang biasanya memuat nama desa/kelurahan. */
const DESA_HEADER = /(desa|kelurahan|kel\/desa)/i

/**
 * Saring baris ke satu desa.
 *
 * `kelurahanId` diabaikan server untuk DALLAP/YAN KB/ELSIMIL, jadi penyaringan
 * dilakukan di klien. Kolom desa dicari lewat NILAI sel, bukan judul kolom:
 * header JasperReports kadang tetap "KECAMATAN" walau barisnya sudah desa, dan
 * ELSIMIL Catin mencetak "KELURAHAN" berulang di beberapa kolom dengan nama
 * hanya di kolom pertama. Judul hanya dipakai sebagai preferensi bila ada
 * beberapa kolom yang cocok.
 */
function filterByDesa(data: ReportData, desaNama: string): ReportData {
  const target = desaNama.trim().toUpperCase()
  if (!target) return data

  const candidates = data.columns
    .map((label, i) => ({
      i,
      byHeader: DESA_HEADER.test(label.trim()) ? 1 : 0,
      byValue: data.rows.some((r) => (r[i] ?? '').trim().toUpperCase() === target) ? 1 : 0,
    }))
    .filter((c) => c.byValue === 1)
    .sort((a, b) => b.byHeader - a.byHeader)

  const col = candidates[0]?.i
  if (col === undefined) return { ...data, rows: [], empty: true }

  const rows = data.rows.filter((r) => (r[col] ?? '').trim().toUpperCase() === target)
  return { ...data, rows, empty: rows.length === 0 }
}

export function ReportView({ entry, onDownload, onPeriodChange }: Props) {
  const [period, setPeriod] = useState<PeriodEntry | null>(() =>
    pickInitialPeriod(entry.periods),
  )
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [kecamatanId, setKecamatanId] = useState<number | null>(null)
  const [desaId, setDesaId] = useState<number | null>(null)
  const [live, setLive] = useState<LiveResult | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [wilayah, setWilayah] = useState<{ kecNama: string; desaNama: string } | null>(null)

  // Simpan callback di ref agar efek di bawah tidak ikut jalan saat induk
  // merender ulang dengan fungsi baru (bisa mereset periode pilihan pengguna).
  const notifyRef = useRef(onPeriodChange)
  notifyRef.current = onPeriodChange

  useEffect(() => {
    const next = pickInitialPeriod(entry.periods)
    setPeriod(next)
    if (next) notifyRef.current?.(next)
  }, [entry])

  // Pilihan wilayah tidak berlaku lintas laporan: kecamatan berbeda punya
  // desa berbeda, dan tidak semua modul dirinci per desa.
  useEffect(() => {
    setKecamatanId(null)
    setDesaId(null)
    setLive(null)
    setLiveError(null)
    setWilayah(null)
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

  // Data live hanya diminta saat kecamatan dipilih; tanpa pilihan itu snapshot
  // statis dipakai apa adanya (baris kecamatan).
  useEffect(() => {
    if (kecamatanId === null || !period) {
      setLive(null)
      setLiveError(null)
      setLiveLoading(false)
      return
    }
    const controller = new AbortController()
    setLiveLoading(true)
    setLiveError(null)
    fetchLiveReport(entry, period, kecamatanId, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setLive(r)
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return
        setLiveError(
          e.name === 'AbortError'
            ? 'Permintaan dibatalkan.'
            : `${e.message} Data per kecamatan diambil langsung dari server SIGA, jadi butuh koneksi internet.`,
        )
        setLive(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLiveLoading(false)
      })
    return () => controller.abort()
  }, [entry, period, kecamatanId])

  // Nama kecamatan/desa terpilih, dipakai untuk menyaring baris dan memberi
  // konteks pada judul tabel.
  useEffect(() => {
    if (kecamatanId === null) {
      setWilayah(null)
      return
    }
    let alive = true
    loadWilayah()
      .then((w) => {
        if (!alive) return
        const kec = w.kecamatan.find((k) => k.id === kecamatanId)
        const desa = kec?.desa.find((d) => d.id === desaId)
        setWilayah({ kecNama: kec?.nama ?? '', desaNama: desa?.nama ?? '' })
      })
      .catch(() => {
        if (alive) setWilayah(null)
      })
    return () => {
      alive = false
    }
  }, [kecamatanId, desaId])

  /** Sumber baris aktif: data live bila kecamatan dipilih, selain itu snapshot. */
  const view = useMemo<ReportData | null>(() => {
    if (kecamatanId !== null) {
      if (!live) return null
      return wilayah?.desaNama ? filterByDesa(live, wilayah.desaNama) : live
    }
    return data
  }, [kecamatanId, live, data, wilayah])

  /** Akhiran nama berkas CSV agar unduhan tidak tertukar antar wilayah. */
  const downloadSuffix = wilayah
    ? `-${wilayah.kecNama.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${
        wilayah.desaNama ? `-${wilayah.desaNama.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''
      }`
    : ''

  const periodSummary = useMemo(() => {
    const filled = entry.periods.filter((p) => !p.empty && !p.error)
    return { filled: filled.length, total: entry.periods.length }
  }, [entry.periods])

  return (
    <section aria-labelledby="judul-laporan" className="min-w-0">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge>{entry.moduleLabel}</Badge>
          <Badge variant="muted" className="tabular">
            {entry.reportName}
          </Badge>
          <Badge variant="outline">{entry.reportCategory}</Badge>
          <Badge variant="outline">
            {entry.periodType === 'monthly'
              ? 'Bulanan'
              : entry.periodType === 'cumulative'
                ? 'Kumulatif'
                : 'Tahunan'}
          </Badge>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="judul-laporan"
              className="text-xl leading-snug font-semibold text-balance sm:text-2xl"
            >
              {entry.reportName} — {cleanDescription(entry.description)}
            </h2>
            {view?.wilayah && Object.keys(view.wilayah).length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {Object.entries(view.wilayah)
                  .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${v}`)
                  .join(' · ')}
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => view && onDownload(view, downloadSuffix)}
            disabled={!view || view.empty}
          >
            <Download />
            Unduh CSV
          </Button>
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

      <WilayahPicker
        kecamatanId={kecamatanId}
        desaId={desaId}
        onKecamatanChange={setKecamatanId}
        onDesaChange={setDesaId}
        desaAvailable={DESA_AWARE_MODULES[entry.module] === true}
        disabled={loading || !period}
      />

      {periodSummary.total > 0 && periodSummary.filled === 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Belum ada data pada semua periode yang tersedia</AlertTitle>
          <AlertDescription>
            SIGA tidak mengembalikan data untuk{' '}
            {entry.periodType === 'annual' ? 'tahun-tahun' : 'bulan-bulan'} yang tersedia. Laporan
            ini mungkin diisi pada tingkat wilayah lain (provinsi), atau memang belum ada
            pelaporan pada periode tersebut.
          </AlertDescription>
        </Alert>
      )}

      {view && view.periodStatus === 'mismatch' && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Periode laporan tidak cocok</AlertTitle>
          <AlertDescription>
            Laporan ini diminta untuk periode {view.periodLabel}
            {view.printedPeriod ? (
              <>, tetapi dokumen yang dikembalikan mencetak &quot;{view.printedPeriod}&quot;. </>
            ) : (
              ', tetapi dokumen yang dikembalikan mencetak periode lain. '
            )}
            Angka di bawah adalah data untuk periode yang diminta, namun label pada dokumen sumber
            tidak diperbarui.
            {(view.empty || isAllDataZero(view)) && (
              <>
                {' '}
                Tabel ini tidak memuat angka selain nol: templat sumber tampaknya hanya terisi untuk
                tahun yang dicetak, sehingga nilai nol di sini kemungkinan berarti &quot;belum ada
                data pada periode ini&quot;, bukan nol sesungguhnya.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {kecamatanId !== null && liveLoading && <TableSkeleton />}

      {liveError && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Gagal mengambil rincian per kecamatan</AlertTitle>
          <AlertDescription>{liveError}</AlertDescription>
        </Alert>
      )}

      {view && live && !liveError && (
        <Alert className="mb-4">
          <Radio />
          <AlertTitle>Data live per kecamatan</AlertTitle>
          <AlertDescription>
            Tabel ini diambil langsung dari server SIGA saat halaman dibuka
            {wilayah?.kecNama ? ` untuk Kec. ${wilayah.kecNama}` : ''}
            {wilayah?.desaNama ? `, desa ${wilayah.desaNama}` : ''} — bukan dari snapshot statis.
            Angka dapat berubah sewaktu-waktu.
          </AlertDescription>
        </Alert>
      )}

      {loading && kecamatanId === null && <TableSkeleton />}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Gagal memuat data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && view && view.error && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Laporan ini gagal diambil dari server SIGA</AlertTitle>
          <AlertDescription>
            <p>
              Coba periode lain, atau jalankan ulang{' '}
              <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">
                build_snapshot.py --force
              </code>{' '}
              saat server stabil.
            </p>
            <p className="tabular text-xs opacity-80">{view.error}</p>
          </AlertDescription>
        </Alert>
      )}

      {!loading && view && <DataTable data={view} />}

      {!loading && view && !view.empty && (
        <p className="mt-4 text-xs text-muted-foreground">
          Periode {view.periodLabel} · sumber: SIGA BKKBN —{' '}
          {live ? 'data live diambil' : 'snapshot statis diambil'}{' '}
          {new Date(view.fetchedAt).toLocaleString('id-ID')}. Data bersifat agregat per wilayah;
          tidak memuat identitas perorangan.
        </p>
      )}
    </section>
  )
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat data" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Memuat tabel…
      </div>
      <Skeleton className="h-8 w-full max-w-xs" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border/60 px-4 py-3 last:border-0">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
