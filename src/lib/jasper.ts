/**
 * Parser halaman JasperReports → tabel.
 *
 * Port 1:1 dari `parse_report()` di `scripts/build_snapshot.py`. Keduanya HARUS
 * menghasilkan output yang sama: snapshot statis dan data live (per kecamatan)
 * dirender oleh komponen yang sama, jadi kalau parser berbeda, satu tabel bisa
 * punya `columnGroups` sementara yang lain tidak.
 *
 * Aturan yang diwarisi dari skrip Python (lihat AGENTS.md §10):
 * - `colspan`/`rowspan` diekspansi ke grid 2D penuh agar semua baris selebar tabel.
 * - `columnGroups` dibangun dari RENTANG SEL ASLI (`start, colspan, teks`), bukan
 *   dari grid hasil ekspansi: grid hanya menaruh teks di kolom pertama sel
 *   ber-`colspan`, sehingga anak di kolom kedua kehilangan nama induknya.
 * - `columns` tetap datar; daun duplikat diberi prefiks induk langsungnya.
 * - Baris penomoran kolom (`(1) (2)`, `3=4+12+13`, `6=5/4*100`) dibuang.
 * - Jangan dedup label di parser; penggabungan sel adalah urusan renderer.
 */

export type ParsedReport = {
  title: string | null
  subtitle: string | null
  period: string | null
  printedPeriod: string | null
  wilayah: Record<string, string>
  columns: string[]
  colNumbers: string[] | null
  columnGroups: string[][]
  rows: string[][]
  empty: boolean
  emptyReason: 'no-data' | 'empty-table' | null
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

/** Kata kunci yang menandai baris header tabel (bukan baris metadata/wilayah). */
const HEADER_HINT = [
  'KODE', 'KECAMATAN', 'KELURAHAN', 'DESA', 'JUMLAH', 'URAIAN',
  'NAMA', 'KELOMPOK', 'SASARAN', 'TOTAL', 'JENIS', 'NO',
]

const WILAYAH_ALIASES: Record<string, string[]> = {
  prov: ['prov', 'propinsi', 'provinsi'],
  kab: ['kab', 'kabupaten'],
  kec: ['kec', 'kecamatan'],
  desa: ['desa', 'kelurahan', 'kel'],
}

const WILAYAH_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(WILAYAH_ALIASES).flatMap(([k, aliases]) => aliases.map((a) => [a, k])),
)

const MONTH_WORDS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3,
  april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12,
}

/** Ganti `<br>` dengan spasi, buang tag, decode entity, rapikan spasi. */
export function cellText(inner: string): string {
  let txt = inner.replace(/<br\s*\/?>/gi, ' ')
  txt = txt.replace(/<[^>]+>/g, '')
  for (const [k, v] of Object.entries(ENTITIES)) txt = txt.split(k).join(v)
  txt = txt.replace(/\u00a0/g, ' ')
  return txt.replace(/\s+/g, ' ').trim()
}

/**
 * Nilai periode dari label cetak, atau null bila hanya placeholder.
 * Template ELSIMIL kadang mencetak "TAHUN null" / "TAHUN :" tanpa nilai.
 */
export function usablePeriod(t: string): string | null {
  const v = t.trim()
  if (/\bnull\b/i.test(v)) return null
  if (v.includes(':')) return v.split(':').slice(1).join(':').trim() ? v : null
  return /\d/.test(v) ? v : null
}

/** Ambil (tahun, bulan) dari label periode yang DICETAK template. Konservatif. */
export function extractPrintedPeriod(s: string | null | undefined): {
  year: number | null
  month: number | null
} {
  if (!s) return { year: null, month: null }
  const years = new Set<number>()
  for (const m of s.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)) years.add(Number(m[1]))
  const year = years.size === 1 ? [...years][0] : null

  let months = new Set<number>()
  for (const w of s.matchAll(/[A-Za-z]+/g)) {
    const n = MONTH_WORDS[w[0].toLowerCase()]
    if (n) months.add(n)
  }
  if (months.size > 1) months = new Set()
  if (months.size === 0) {
    const m =
      s.match(/(?<!\d)(?:19|20)\d{2}-(0[1-9]|1[0-2])(?!\d)/) ??
      s.match(/(?<!\d)(0[1-9]|1[0-2])\/(?:19|20)\d{2}(?!\d)/)
    if (m) months = new Set([Number(m[1])])
  }
  const month = months.size === 1 ? [...months][0] : null
  return { year, month }
}

/**
 * Status tri-state: "match" | "mismatch" | "unknown".
 * Tri-state, bukan boolean: sebagian template mencetak label basi
 * ("SEMESTER II 2023" untuk tahun apa pun) atau tidak mencetak periode
 * sama sekali. "Tidak tahu" harus bisa dibedakan dari "cocok".
 */
export function periodStatus(
  printed: string | null | undefined,
  requestedKey: string,
): 'match' | 'mismatch' | 'unknown' {
  const { year, month } = extractPrintedPeriod(printed)
  if (year === null) return 'unknown'
  const parts = String(requestedKey || '').split('-')
  const reqYear = Number(parts[0])
  if (!Number.isFinite(reqYear)) return 'unknown'
  if (year !== reqYear) return 'mismatch'
  if (parts.length > 1) {
    const reqMonth = Number(parts[1])
    if (!Number.isFinite(reqMonth)) return 'unknown'
    if (month !== null && month !== reqMonth) return 'mismatch'
  }
  return 'match'
}

/**
 * Baris footer JasperReports. Tanda ":" wajib ada supaya nama wilayah yang
 * kebetulan diawali kata kunci ini ("SUMBER MAKMUR") tidak ikut dibuang.
 */
const FOOTER_RE = /^(sumber|dicetak|diprint|halaman|page|cetak)\s*:/i

type Span = [start: number, colspan: number, text: string]

/** Ekspansi `colspan`/`rowspan` menjadi grid penuh + rentang sel asli per baris. */
function expandGrid(html: string): { grid: string[][]; spans: Span[][] } {
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
  const grid: string[][] = []
  const spans: Span[][] = []
  const occupied = new Map<string, string>()
  const key = (r: number, c: number) => `${r}:${c}`

  trs.forEach((tr, ri) => {
    const cells = [...tr.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)]
    const row: string[] = []
    const rowSpans: Span[] = []
    let col = 0
    for (const [, attrs, inner] of cells) {
      const cs = Number(attrs.match(/colspan\s*=\s*"?(\d+)/i)?.[1] ?? 1)
      const rs = Number(attrs.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1)
      const val = cellText(inner)
      while (occupied.has(key(ri, col))) {
        row.push(occupied.get(key(ri, col))!)
        occupied.delete(key(ri, col))
        col += 1
      }
      row.push(val)
      rowSpans.push([col, cs, val])
      for (let k = 1; k < cs; k++) row.push('')
      for (let dr = 1; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          occupied.set(key(ri + dr, col + dc), dc === 0 ? val : '')
        }
      }
      col += cs
    }
    while (occupied.has(key(ri, col))) {
      row.push(occupied.get(key(ri, col))!)
      occupied.delete(key(ri, col))
      col += 1
    }
    grid.push(row)
    spans.push(rowSpans)
  })

  const width = Math.max(0, ...grid.map((r) => r.length))
  return { grid: grid.map((r) => [...r, ...Array(width - r.length).fill('')]), spans }
}

const EMPTY: ParsedReport = {
  title: null,
  subtitle: null,
  period: null,
  printedPeriod: null,
  wilayah: {},
  columns: [],
  colNumbers: null,
  columnGroups: [],
  rows: [],
  empty: true,
  emptyReason: 'empty-table',
}

export function parseReport(html: string): ParsedReport {
  const { grid, spans } = expandGrid(html)
  const width = Math.max(0, ...grid.map((r) => r.length))
  if (grid.length === 0 || width === 0) return { ...EMPTY }

  // JasperReports menandai hasil kosong dengan teks khusus, bukan tabel kosong.
  const flatUpper = grid.flat().join(' ').toUpperCase()
  if (flatUpper.includes('DATA TIDAK DITEMUKAN')) {
    return { ...EMPTY, emptyReason: 'no-data' }
  }

  /**
   * Sel dipecah jadi kata: label gabungan seperti "DESA/KELURAHAN" atau
   * "JUMLAH KELOMPOK KEGIATAN ..." tidak pernah cocok bila dibandingkan utuh,
   * sehingga header asli terlewat dan seluruh tabel bergeser (Tabel22D
   * berakhir dengan kolom ":" dan "Kolom 12..30").
   */
  const isTableHeaderRow = (row: string[]) => {
    const toks = new Set<string>()
    for (const v of row) {
      for (const w of v.toUpperCase().split(/[^A-Z0-9]+/)) {
        if (w) toks.add(w)
      }
    }
    let hits = 0
    for (const t of toks) if (HEADER_HINT.includes(t)) hits += 1
    return hits >= 2
  }

  /** Pasangan (kunci, nilai) wilayah dari sel-sel satu baris. */
  function* wilayahPairs(vals: string[]): Generator<[string, string]> {
    const aliasPattern = Object.keys(WILAYAH_KEY).join('|')
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]
      const m = v.match(new RegExp(`^\\s*(${aliasPattern})\\b\\s*[:.]?\\s*(.*)$`, 'i'))
      if (!m) continue
      const k = WILAYAH_KEY[m[1].toLowerCase()]
      let val = (m[2] ?? '').replace(/^[\s.-]+|[\s.-]+$/g, '')
      if (!val && i + 1 < vals.length) {
        const nxt = vals[i + 1].replace(/^\s+/, '')
        val = (nxt.startsWith(':') ? nxt.slice(1) : nxt).replace(/^[\s.-]+|[\s.-]+$/g, '')
      }
      if (
        val &&
        val.length <= 60 &&
        /[A-Za-z]{2}/.test(val) &&
        !WILAYAH_KEY[val.toLowerCase()] &&
        !/\bnull\b/i.test(val)
      ) {
        yield [k, val]
      }
    }
  }

  // --- 2. metadata dokumen
  let title: string | null = null
  let subtitle: string | null = null
  let period: string | null = null
  let printedPeriod: string | null = null
  let pendingLabel: string | null = null
  const wilayah: Record<string, string> = {}

  for (const row of grid.slice(0, 24)) {
    const vals = row.filter((v) => v)
    if (vals.length === 0) continue
    if (isTableHeaderRow(row)) break
    for (const [k, val] of wilayahPairs(vals)) {
      if (!(k in wilayah)) wilayah[k] = val
    }

    let joined = vals.join(' ').replace(/\s+/g, ' ').trim()
    if (pendingLabel) {
      if (/^[\d/\-.\s]+$/.test(joined)) joined = `${pendingLabel} ${joined}`
      pendingLabel = null
    }
    if (/^(TAHUN|PERIODE|BULAN)\b/i.test(joined)) {
      const val = usablePeriod(joined)
      if (val) {
        if (!period) period = val
        if (!printedPeriod) printedPeriod = joined
      } else if (/^(TAHUN|PERIODE|BULAN)\s*:?\s*$/i.test(joined)) {
        pendingLabel = joined
      } else if (!printedPeriod) {
        printedPeriod = joined
      }
      continue
    }

    if (vals.length === 1) {
      const t = vals[0]
      if (t.toUpperCase().startsWith('TABEL') && !title) title = t
      else if (title && !subtitle && t.length > 3 && !t.toUpperCase().startsWith('TAHUN') && !/^null$/i.test(t)) {
        subtitle = t
      }
    }
  }

  // --- 3. blok header
  let headerIdx: number | null = null
  for (let i = 0; i < grid.length; i++) {
    const vals = grid[i].filter((v) => v)
    if (vals.length < 3) continue
    // Python: `any(h in v.upper() for h in HEADER_HINT)` — substring, bukan
    // token persis. Berbeda dari `isTableHeaderRow` yang memakai token-set.
    if (vals.some((v) => HEADER_HINT.some((h) => v.toUpperCase().includes(h)))) {
      headerIdx = i
      break
    }
  }

  /** Baris penomoran kolom: (1) (2) (3), 3=4+12+13, 6=5/4*100 — bukan header/data. */
  const isIndexRow = (row: string[]) => {
    const vals = row.filter((v) => v)
    if (vals.length < 3) return false
    return vals.every((v) => /^[\d\s.,=+\-∑Σ()*/%]*$/.test(v) && v.length <= 14)
  }

  if (headerIdx === null) {
    const body = grid.filter((r) => r.some((v) => v))
    return {
      ...EMPTY,
      title,
      subtitle,
      period,
      printedPeriod,
      wilayah,
      rows: body,
      empty: !body.some((r) => r.some((x) => x.trim())),
      emptyReason: body.some((r) => r.some((x) => x.trim())) ? null : 'empty-table',
    }
  }

  const headerRows: string[][] = []
  const headerRowIdx: number[] = []
  const indexRows: string[][] = []
  let dataStart: number | null = null

  for (let i = headerIdx; i < grid.length; i++) {
    const row = grid[i]
    if (!row.some((v) => v.trim())) continue
    if (isIndexRow(row)) {
      indexRows.push(row)
      continue
    }
    if (i > headerIdx && row.filter((v) => v && /^[\d.,-]+$/.test(v)).length >= 2) {
      dataStart = i
      break
    }
    headerRows.push(row)
    headerRowIdx.push(i)
    if (headerRows.length > 5) {
      dataStart = i + 1
      break
    }
  }

  // --- 4. nama kolom dari rentang sel asli
  const paths: string[][] = Array.from({ length: width }, () => [])
  for (const ri of headerRowIdx) {
    for (const [start, cs, txt] of spans[ri]) {
      if (!txt) continue
      for (let c = start; c < Math.min(start + cs, width); c++) {
        if (!paths[c].includes(txt)) paths[c].push(txt)
      }
    }
  }

  const leaves = paths.map((p) => (p.length ? p[p.length - 1] : ''))
  const counts = new Map<string, number>()
  for (const lf of leaves) counts.set(lf, (counts.get(lf) ?? 0) + 1)

  let columns: string[] = paths.map((p) => {
    if (p.length === 0) return ''
    const lf = p[p.length - 1]
    return (counts.get(lf) ?? 0) > 1 && p.length >= 2 ? `${p[p.length - 2]} / ${lf}` : lf
  })
  let columnGroups: string[][] = paths.map((p) => [...p])

  let colNumbers: string[] | null = null
  if (indexRows.length > 0) {
    const cand = indexRows[indexRows.length - 1]
    if (cand.filter((v) => v).length >= width * 0.6) colNumbers = cand
  }

  // --- 5. baris data
  let rows: string[][] = []
  if (dataStart !== null) {
    for (const row of grid.slice(dataStart)) {
      if (!row.some((v) => v.trim())) continue
      if (isIndexRow(row)) continue
      const filled = row.filter((v) => v.trim())
      // Footer JasperReports ("Sumber: SIGA", "Dicetak: 22/10/2026") bukan data.
      // Kata kuncinya WAJIB diikuti ":" — tanpa itu, desa bernama "SUMBER
      // MAKMUR" / "SUMBER MULIA" / "SUMBER JAYA" ikut terbuang, dan laporan
      // per kecamatan kehilangan baris desa tersebut (filter desa lalu kosong).
      if (filled.length <= 2 && FOOTER_RE.test(filled[0].trim())) {
        continue
      }
      rows.push(row)
    }
  }

  // Buang kolom yang seluruhnya kosong di tepi kiri/kanan (artefak layout).
  if (rows.length > 0 && columns.length > 0) {
    const keep: number[] = []
    for (let i = 0; i < columns.length; i++) {
      if (rows.some((r) => (r[i] ?? '').trim())) keep.push(i)
    }
    if (keep.length > 0) {
      const lo = keep[0]
      const hi = keep[keep.length - 1]
      columns = columns.slice(lo, hi + 1)
      rows = rows.map((r) =>
        r.length >= hi + 1 ? r.slice(lo, hi + 1) : [...r.slice(lo), ...Array(hi + 1 - r.length).fill('')],
      )
      if (colNumbers) colNumbers = colNumbers.slice(lo, hi + 1)
      columnGroups = columnGroups.slice(lo, hi + 1)
    }
  }

  // --- 6. label kolom yang kosong
  const indexLabel = (col: number) => {
    if (colNumbers && col < colNumbers.length) {
      const num = colNumbers[col].trim().replace(/^[([\s]+|[)\]\s]+$/g, '')
      if (num) return `Kolom ${num}`
    }
    return `Kolom ${col + 1}`
  }

  /** Nama grup induk terdekat yang membentang di atas `col`. */
  const parentLabel = (col: number) => {
    for (let level = headerRows.length - 2; level >= 0; level--) {
      for (const [start, cs, txt] of spans[headerRowIdx[level]]) {
        if (txt && start <= col && col < start + cs) return txt
      }
    }
    return ''
  }

  const filledCols: string[] = []
  columns.forEach((lbl, i) => {
    if (lbl) {
      filledCols.push(lbl)
      return
    }
    const hasData = rows.some((r) => (r[i] ?? '').trim())
    const inherited = hasData ? parentLabel(i) : ''
    if (inherited && !filledCols.includes(inherited)) filledCols.push(inherited)
    else filledCols.push(indexLabel(i))
  })
  columns = filledCols

  return {
    title,
    subtitle,
    period,
    printedPeriod,
    wilayah,
    columns,
    colNumbers,
    columnGroups,
    rows,
    empty: rows.length === 0,
    emptyReason: rows.length === 0 ? 'empty-table' : null,
  }
}
