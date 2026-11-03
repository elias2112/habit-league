// Genera los iconos PNG de la PWA (mismo diseño que public/icon.svg) sin dependencias.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [15, 23, 42], GREEN = [16, 185, 129]

function crc32(buf) {
  let c, crc = ~0
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
// Cobertura con supermuestreo 4x4 para bordes suaves. Coordenadas en espacio 512.
function color(x, y, full) {
  const inCircle = Math.hypot(x - 256, y - 256) <= (full ? 190 : 170)
  const check = Math.min(distSeg(x, y, 170, 262, 230, 322), distSeg(x, y, 230, 322, 346, 194)) <= 22
  if (inCircle && !check) return GREEN
  return BG
}
function png(size, file, full = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const c = color(((x + (sx + 0.5) / 4) * 512) / size, ((y + (sy + 0.5) / 4) * 512) / size, full)
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = acc[0] / 16; raw[o + 1] = acc[1] / 16; raw[o + 2] = acc[2] / 16; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  console.log('✓', file)
}
png(192, 'public/pwa-192.png')
png(512, 'public/pwa-512.png')
png(180, 'public/apple-touch-icon.png')
