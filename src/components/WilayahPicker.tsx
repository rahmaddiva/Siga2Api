import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'

import { loadWilayah, type Kecamatan } from '@/lib/wilayah'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Props = {
  /** `null` = seluruh kabupaten (snapshot statis). */
  kecamatanId: number | null
  desaId: number | null
  onKecamatanChange: (id: number | null) => void
  onDesaChange: (id: number | null) => void
  /** Modul tanpa rincian desa (YAN KB): dropdown desa dinonaktifkan. */
  desaAvailable: boolean
  disabled?: boolean
  className?: string
}

const ALL = '__all__'

/**
 * Pemilih wilayah untuk rincian per desa.
 *
 * Snapshot statis berisi baris kecamatan; memilih kecamatan memicu pengambilan
 * live dari SIGA yang mengembalikan baris desa. Desa adalah dimensi BARIS, bukan
 * parameter server: `kelurahanId` diabaikan DALLAP/YAN KB/ELSIMIL, jadi pilihan
 * desa disaring di sisi klien (lihat `filterByDesa` di `ReportView`).
 */
export function WilayahPicker({
  kecamatanId,
  desaId,
  onKecamatanChange,
  onDesaChange,
  desaAvailable,
  disabled,
  className,
}: Props) {
  const [kecamatan, setKecamatan] = useState<Kecamatan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadWilayah()
      .then((w) => {
        if (alive) setKecamatan(w.kecamatan)
      })
      .catch((e: Error) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])

  const desa = useMemo(
    () => kecamatan?.find((k) => k.id === kecamatanId)?.desa ?? [],
    [kecamatan, kecamatanId],
  )

  const level =
    kecamatanId === null ? 'seluruh kabupaten' : desaId === null ? 'satu kecamatan' : 'satu desa'

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Rincian wilayah</span>
        <span className="text-xs text-muted-foreground">{level}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          <MapPin
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Select
            value={kecamatanId === null ? ALL : String(kecamatanId)}
            onValueChange={(v) => {
              onKecamatanChange(v === ALL ? null : Number(v))
              onDesaChange(null)
            }}
            disabled={disabled || !kecamatan}
          >
            <SelectTrigger
              className="w-[min(17rem,72vw)] pl-8"
              aria-label="Pilih kecamatan"
            >
              <SelectValue placeholder={error ? 'Gagal memuat wilayah' : 'Kecamatan'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kecamatan (snapshot)</SelectItem>
              {(kecamatan ?? []).map((k) => (
                <SelectItem key={k.id} value={String(k.id)}>
                  {k.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select
          value={desaId === null ? ALL : String(desaId)}
          onValueChange={(v) => onDesaChange(v === ALL ? null : Number(v))}
          disabled={disabled || kecamatanId === null || !desaAvailable || desa.length === 0}
        >
          <SelectTrigger
            className={cn('w-[min(17rem,72vw)]', kecamatanId === null && 'opacity-60')}
            aria-label="Pilih desa/kelurahan"
          >
            <SelectValue placeholder="Desa/kelurahan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua desa di kecamatan ini</SelectItem>
            {desa.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.nama}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}

        {!desaAvailable && !error && (
          <span className="text-xs text-muted-foreground">
            Modul ini tidak dirinci per desa (barisnya faskes).
          </span>
        )}
      </div>
    </div>
  )
}
