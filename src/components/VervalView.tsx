import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Radio } from 'lucide-react'

import type { ReportData } from '@/lib/data'
import { fetchVerval, VERVAL_COLUMNS, type VervalData } from '@/lib/verval'
import { loadWilayah } from '@/lib/wilayah'
import { DataTable } from '@/components/DataTable'
import { WilayahPicker } from '@/components/WilayahPicker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const TAHUN = [2026, 2025, 2024, 2023]

type Props = {
  onDownload: (data: ReportData, suffix: string) => void
}

/**
 * Verval KRS — agregat pendataan verval per wilayah, diambil live.
 *
 * Tidak memakai snapshot: `public/data/` hanya berisi laporan JasperReports, dan
 * laporan KRS di sana kosong untuk tahun berjalan (basis data lama hanya terisi
 * s.d. semester II 2023/2024). Angka verval terkini justru ada di endpoint
 * `getMonitoringKrs`.
 */
export function VervalView({ onDownload }: Props) {
  const [tahun, setTahun] = useState(2026)
  const [periode, setPeriode] = useState<1 | 2>(2)
  const [kecamatanId, setKecamatanId] = useState<number | null>(null)
  const [desaId, setDesaId] = useState<number | null>(null)
  const [data, setData] = useState<VervalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nama, setNama] = useState<{ kec: string; desa: string }>({ kec: '', desa: '' })

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetchVerval({ tahun, periode, kecamatanId })
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e: Error) => {
        if (!alive) return
        setData(null)
        setError(
          `${e.message} Data verval diambil langsung dari server SIGA, jadi butuh koneksi internet.`,
        )
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tahun, periode, kecamatanId])

  useEffect(() => {
    let alive = true
    if (kecamatanId === null) {
      setNama({ kec: '', desa: '' })
      return
    }
    loadWilayah()
      .then((w) => {
        if (!alive) return
        const kec = w.kecamatan.find((k) => k.id === kecamatanId)
        const desa = kec?.desa.find((d) => d.id === desaId)
        setNama({ kec: kec?.nama ?? '', desa: desa?.nama ?? '' })
      })
      .catch(() => {
        if (alive) setNama({ kec: '', desa: '' })
      })
    return () => {
      alive = false
    }
  }, [kecamatanId, desaId])

  /** Bentuk tabel yang dipakai `DataTable` (sort/filter/sembunyikan kolom kosong). */
  const table = useMemo<ReportData | null>(() => {
    if (!data) return null
    const rows = nama.desa
      ? data.rows.filter((r) => r.namaDaerah.toUpperCase() === nama.desa.toUpperCase())
      : data.rows
    return {
      title: 'MONITORING VERVAL KRS',
      subtitle: `Semester ${periode} ${tahun}`,
      period: `SEMESTER ${periode === 1 ? 'I' : 'II'} ${tahun}`,
      wilayah: {},
      columns: VERVAL_COLUMNS.map((c) => c.label),
      // `columnGroups` adalah path penuh induk→daun (kontrak parser JasperReports);
      // kolom tanpa grup tetap butuh satu elemen agar header tidak hilang.
      columnGroups: VERVAL_COLUMNS.map((c) => [...c.group, c.label]),
      rows: rows.map((r) => VERVAL_COLUMNS.map((c) => r[c.field])),
      empty: rows.length === 0,
      module: 'verval',
      moduleLabel: 'Verval KRS',
      group: 'monitoring',
      reportName: 'Monitoring',
      reportCategory: 'Monitoring',
      description: 'Monitoring Verval KRS',
      periodType: 'cumulative',
      periodKey: `${tahun}-S${periode}`,
      periodLabel: `Semester ${periode} ${tahun}`,
      fetchedAt: data.fetchedAt,
      periodStatus: 'match',
    }
  }, [data, nama.desa, periode, tahun])

  const level = kecamatanId === null ? 'kecamatan' : 'desa/kelurahan'

  return (
    <section aria-labelledby="judul-verval" className="min-w-0">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge>Verval KRS</Badge>
          <Badge variant="outline">Live · agregat</Badge>
          <Badge variant="muted">Baris: {level}</Badge>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="judul-verval" className="text-xl leading-snug font-semibold sm:text-2xl">
              Monitoring Verval KRS — Kab. Tanah Laut
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pendataan verval Keluarga Berisiko Stunting per wilayah. Angka agregat, bukan data
              per orang.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!table || table.empty}
            onClick={() =>
              table &&
              onDownload(
                table,
                `-verval-${tahun}-S${periode}${nama.kec ? `-${nama.kec.toLowerCase()}` : ''}${
                  nama.desa ? `-${nama.desa.toLowerCase()}` : ''
                }`,
              )
            }
          >
            <Download />
            Unduh CSV
          </Button>
        </div>
      </header>

      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Periode
        </span>
        <span className="text-xs text-muted-foreground">
          semester wajib — tanpa semester server menjumlahkan kedua semester
        </span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={String(tahun)}
          onValueChange={(v) => setTahun(Number(v))}
          disabled={loading && !data}
        >
          <SelectTrigger className="w-[7.5rem]" aria-label="Pilih tahun">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAHUN.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(periode)}
          onValueChange={(v) => setPeriode(Number(v) === 1 ? 1 : 2)}
          disabled={loading && !data}
        >
          <SelectTrigger className="w-[11rem]" aria-label="Pilih semester">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Semester 1</SelectItem>
            <SelectItem value="2">Semester 2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <WilayahPicker
        kecamatanId={kecamatanId}
        desaId={desaId}
        onKecamatanChange={setKecamatanId}
        onDesaChange={setDesaId}
        desaAvailable
        disabled={loading && !data}
      />

      {loading && (
        <div aria-busy="true" aria-label="Memuat data" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Mengambil data verval dari SIGA…
          </div>
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {error && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Gagal mengambil data verval</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && table && !error && (
        <Alert className="mb-4">
          <Radio />
          <AlertTitle>Data live</AlertTitle>
          <AlertDescription>
            Diambil langsung dari SIGA saat halaman dibuka — bukan dari snapshot statis. Angka
            dapat berubah sewaktu-waktu; tahun 2023 dan 2024 berisi data, tahun berjalan mengikuti
            pendataan yang sudah masuk.
          </AlertDescription>
        </Alert>
      )}

      {!loading && table && !error && <DataTable data={table} />}

      {!loading && table && !table.empty && (
        <p className="mt-4 text-xs text-muted-foreground">
          Semester {periode} {tahun}
          {nama.kec ? ` · Kec. ${nama.kec}` : ''}
          {nama.desa ? ` · Desa ${nama.desa}` : ''} · sumber: SIGA BKKBN — data live diambil{' '}
          {new Date(data!.fetchedAt).toLocaleString('id-ID')}. Agregat per wilayah; tidak memuat
          identitas perorangan.
        </p>
      )}
    </section>
  )
}
