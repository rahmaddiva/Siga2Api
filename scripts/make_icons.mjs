/**
 * Membuat ikon PNG aplikasi tanpa dependency apa pun.
 *
 * PNG ditulis manual (IHDR + IDAT + IEND) memakai zlib bawaan Node. Ikonnya
 * sengaja digambar secara prosedural — tiga batang grafik di atas bidang biru,
 * sesuai lambang aplikasi di header — supaya berkasnya bisa dibuat ulang
 * kapan pun tanpa menyimpan biner di repo.
 *
 * Jalankan: node scripts/make_icons.mjs
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BLUE = [29, 78, 216] // #1d4ed8, --primary
const WHITE = [255, 255, 255]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 10..12 = compression, filter, interlace = 0

  // Setiap baris didahului byte filter 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * `inset` > 0 membuat bidang biru menyusut, menyisakan tepi transparan —
 * itulah bentuk `maskable`, yang aman dipotong lingkaran oleh Android.
 */
function draw(size, inset) {
  const px = Buffer.alloc(size * size * 4)
  const pad = Math.round(size * inset)
  const inner = size - pad * 2
  const radius = Math.round(inner * 0.18)

  const set = (x, y, [r, g, b], alpha = 255) => {
    const i = (y * size + x) * 4
    // Alpha-blend sederhana di atas isi sebelumnya.
    const a = alpha / 255
    px[i] = Math.round(r * a + px[i] * (1 - a))
    px[i + 1] = Math.round(g * a + px[i + 1] * (1 - a))
    px[i + 2] = Math.round(b * a + px[i + 2] * (1 - a))
    px[i + 3] = Math.max(px[i + 3], alpha)
  }

  // Bidang biru dengan sudut membulat.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x - pad
      const ly = y - pad
      if (lx < 0 || ly < 0 || lx >= inner || ly >= inner) continue
      const cx = Math.min(Math.max(lx, radius), inner - radius - 1)
      const cy = Math.min(Math.max(ly, radius), inner - radius - 1)
      const dx = lx - cx
      const dy = ly - cy
      const inside = dx * dx + dy * dy <= radius * radius
      if (inside) set(x, y, BLUE)
    }
  }

  // Tiga batang grafik yang menaik, seperti lambang di header.
  const barW = Math.round(inner * 0.14)
  const gap = Math.round(inner * 0.09)
  const baseY = pad + Math.round(inner * 0.74)
  const heights = [0.34, 0.5, 0.66].map((h) => Math.round(inner * h))
  const totalW = barW * 3 + gap * 2
  const startX = pad + Math.round((inner - totalW) / 2)

  heights.forEach((h, i) => {
    const x0 = startX + i * (barW + gap)
    for (let y = baseY - h; y < baseY; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        // Ujung batang membulat 1px supaya tidak terlihat kasar di 192px.
        const r = Math.min(2, barW >> 1)
        const cx = Math.min(Math.max(x, x0 + r), x0 + barW - r - 1)
        const cy = Math.min(Math.max(y, baseY - h + r), baseY - r - 1)
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r * r) set(x, y, WHITE)
      }
    }
  })

  return px
}

const outDir = path.join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0.08 },
  { file: 'icon-512.png', size: 512, inset: 0.08 },
  // maskable butuh "safe zone": konten inti di 80% tengah.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.16 },
]

for (const { file, size, inset } of targets) {
  const buf = png(size, draw(size, inset))
  writeFileSync(path.join(outDir, file), buf)
  console.log(`${file}: ${size}x${size}, ${buf.length} bytes`)
}
