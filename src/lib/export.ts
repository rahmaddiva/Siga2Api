/**
 * Unduhan tabel: CSV dan Excel.
 *
 * Excel memakai **SpreadsheetML 2003** (satu berkas XML, ekstensi `.xls`),
 * bukan `.xlsx`. Alasannya: `.xlsx` adalah arsip ZIP berisi beberapa XML, yang
 * berarti butuh library (atau implementasi ZIP sendiri). SpreadsheetML dibuka
 * Excel/LibreOffice tanpa peringatan format, mendukung header bertingkat
 * (MergeAcross/MergeDown), lebar kolom, dan tipe angka — cukup untuk kebutuhan
 * tabel laporan ini, tanpa menambah satu pun dependency.
 */

import type { ReportData } from '@/lib/data'

const NUMERIC = /^-?[\d.,]+$/

/** `"1.234,5"` → `1234.5`; `null` bila bukan angka. */
function toNumber(v: string): number | null {
  const raw = v.replace(/\s/g, '')
  if (!NUMERIC.test(raw)) return null
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Karakter kontrol ilegal di XML 1.0 dibuang, bukan di-escape. */
function xmlText(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Nama berkas mengikuti pola CSV yang sudah dipakai repo. */
function fileStem(data: ReportData, suffix: string): string {
  const base = `${data.module}-${data.reportName}-${data.periodKey}${suffix}`
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'laporan'
  )
}

export function csvFilename(data: ReportData, suffix = ''): string {
  return `${fileStem(data, suffix)}.csv`
}

export function excelFilename(data: ReportData, suffix = ''): string {
  return `${fileStem(data, suffix)}.xls`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Unduh tabel yang SEDANG tampil. `data` dioper dari view supaya CSV ikut
 * berisi hasil saringan (kecamatan/desa), bukan snapshot kabupaten.
 */
export function downloadCsv(data: ReportData, suffix = '') {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    data.columns.map(esc).join(','),
    ...data.rows.map((row) => row.map(esc).join(',')),
  ]
  triggerDownload(
    new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    csvFilename(data, suffix),
  )
}

type Cell = { value: string; span: number; down: number; header: boolean }

/**
 * Header bertingkat: untuk setiap kolom, path `columnGroups[i]` ditulis baris
 * per baris. Sel bertetangga dengan label DAN sisa-kedalaman sama digabung
 * horizontal; kolom yang pathnya lebih pendek digabung vertikal sampai baris
 * terakhir supaya tidak ada lubang di header.
 */
function headerRows(data: ReportData): Cell[][] {
  const groups = data.columnGroups
  const depth = groups?.length ? Math.max(0, ...groups.map((g) => g.length)) : 0
  if (!groups || depth === 0) {
    return [data.columns.map((label) => ({ value: label, span: 1, down: 1, header: true }))]
  }

  const rows: Cell[][] = []
  for (let level = 0; level < depth; level++) {
    const cells: Cell[] = []
    for (let col = 0; col < groups.length; col++) {
      const path = groups[col] ?? []
      // Kolom dengan path pendek hanya muncul di baris terakhirnya, lalu
      // digabung vertikal ke bawah.
      if (level > path.length - 1) {
        const prev = cells[cells.length - 1]
        if (prev && prev.down > 1) prev.down += 1
        continue
      }
      const isLeaf = level === path.length - 1
      const value = path[level] ?? data.columns[col] ?? ''
      const down = isLeaf ? depth - path.length + 1 : 1
      const prev = cells[cells.length - 1]
      if (prev && prev.value === value && prev.down === down) prev.span += 1
      else cells.push({ value, span: 1, down, header: true })
    }
    rows.push(cells)
  }
  return rows
}

function cellXml(cell: Cell, styleId: string): string {
  const merge =
    (cell.span > 1 ? ` ss:MergeAcross="${cell.span - 1}"` : '') +
    (cell.down > 1 ? ` ss:MergeDown="${cell.down - 1}"` : '')
  return `<Cell ss:StyleID="${styleId}"${merge}><Data ss:Type="String">${xmlText(cell.value)}</Data></Cell>`
}

function valueXml(raw: string): string {
  const v = raw ?? ''
  // U+FFFD berasal dari respons server (lihat DataTable) dan tidak bisa
  // dipulihkan, jadi diperlakukan seperti sel kosong.
  if (v.trim() === '' || v.includes('\uFFFD')) return '<Cell ss:StyleID="sData"/>'
  const n = toNumber(v)
  if (n !== null) return `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${n}</Data></Cell>`
  return `<Cell ss:StyleID="sData"><Data ss:Type="String">${xmlText(v)}</Data></Cell>`
}

/** Perkiraan lebar kolom (px) dari isi terpanjang; dibatasi agar tidak ekstrem. */
function columnWidths(data: ReportData): number[] {
  return data.columns.map((label, i) => {
    const longest = data.rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), label.length)
    return Math.min(220, Math.max(60, longest * 7 + 12))
  })
}

export function downloadExcel(data: ReportData, suffix = '') {
  const widths = columnWidths(data)
  const columns = widths
    .map((w) => `<Column ss:AutoFitWidth="0" ss:Width="${w}"/>`)
    .join('')

  const meta: string[] = []
  if (data.title) meta.push(data.title)
  if (data.subtitle) meta.push(data.subtitle)
  if (data.period) meta.push(data.period)
  const wilayah = Object.entries(data.wilayah ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
  if (wilayah) meta.push(wilayah)

  const metaRows = meta
    .map(
      (line) =>
        `<Row ss:Height="16"><Cell ss:StyleID="sTitle"><Data ss:Type="String">${xmlText(line)}</Data></Cell></Row>`,
    )
    .join('')

  const head = headerRows(data)
    .map(
      (cells) =>
        `<Row ss:Height="18">${cells.map((c) => cellXml(c, 'sHead')).join('')}</Row>`,
    )
    .join('')

  const body = data.rows
    .map((row) => `<Row>${row.map((cell) => valueXml(cell)).join('')}</Row>`)
    .join('')

  // FreezePanes menahan baris judul + header saat menggulir.
  const freeze = meta.length + head.length

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="sTitle"><Font ss:Bold="1" ss:Size="12"/></Style>
    <Style ss:ID="sHead">
      <Font ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F4F8" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D6DBE3"/>
      </Borders>
    </Style>
    <Style ss:ID="sData"><Alignment ss:Vertical="Top" ss:WrapText="0"/></Style>
    <Style ss:ID="sNum">
      <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
      <NumberFormat ss:Format="#,##0.##"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${xmlText(sheetName(data))}">
    <Table>
      ${columns}
      ${metaRows}
      ${head}
      ${body}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>${freeze}</SplitHorizontal>
      <TopRowBottomPane>${freeze}</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`

  triggerDownload(
    new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    excelFilename(data, suffix),
  )
}

/** Nama sheet maksimal 31 karakter dan tidak boleh `[]:*?/\`. */
function sheetName(data: ReportData): string {
  const raw = `${data.reportName} ${data.periodKey}`.replace(/[[\]:*?/\\]/g, ' ').trim()
  return raw.slice(0, 31) || 'Laporan'
}
