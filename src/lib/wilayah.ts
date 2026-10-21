/**
 * Data wilayah referensi: kabupaten → kecamatan → desa/kelurahan.
 *
 * `public/data/wilayah.json` di-vendor dari `location-service` SIGA
 * (`getListKecamatanByIdKabupaten` + `getListKelurahanByIdKecamatan`) saat
 * snapshot dibuat. Daftar ini statis — kode wilayah tidak berubah antar bulan —
 * jadi tidak perlu dipanen ulang bersama laporan.
 *
 * Kenapa daftar ini ada di repo padahal laporan bisa diambil live: endpoint
 * `getListKelurahanByIdKecamatan` terbuka tanpa auth, tetapi tetap lebih cepat
 * dan lebih tahan gangguan kalau daftar 135 desa dibaca dari berkas lokal.
 */

export type Desa = { id: number; nama: string; kode: string }
export type Kecamatan = { id: number; nama: string; kode: string; desa: Desa[] }

export type Wilayah = {
  source: string
  fetchedAt: string
  provinsiId: number
  kabupatenId: number
  kecamatan: Kecamatan[]
}

let wilayahCache: Promise<Wilayah> | null = null

export function loadWilayah(): Promise<Wilayah> {
  wilayahCache ??= fetch('/data/wilayah.json').then((res) => {
    if (!res.ok) throw new Error(`Gagal memuat daftar wilayah (${res.status})`)
    return res.json() as Promise<Wilayah>
  })
  return wilayahCache
}

/**
 * Modul yang laporannya benar-benar dirinci per desa saat `kecamatanId` diisi.
 *
 * Terverifikasi live 2026-10 (kec. Panyipatan 5844, 10 desa):
 * - DALLAP, ELSIMIL, KRS → baris berubah dari kecamatan menjadi desa.
 * - YAN KB → baris tetap daftar faskes; `kecamatanId` menyaring faskes, tetapi
 *   tidak ada kolom desa sama sekali, jadi filter desa tidak bermakna.
 */
export const DESA_AWARE_MODULES: Record<string, true> = {
  dallap: true,
  elsimil: true,
  krs: true,
}
