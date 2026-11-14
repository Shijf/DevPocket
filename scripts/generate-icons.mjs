import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
// Standalone raster logo generation; avoids remote assets and native dependencies.
function crc32(buffer) { let crc = -1; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), out.length - 4); return out; }
mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const raster = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + .5) / size, py = (y + .5) / size;
    const inside = px > .06 && px < .94 && py > .06 && py < .94 && !(Math.min(px, 1 - px) < .15 && Math.min(py, 1 - py) < .15 && (Math.min(px, 1 - px) - .15) ** 2 + (Math.min(py, 1 - py) - .15) ** 2 > .09 ** 2);
    const line = [.32, .5, .68].some(yy => px > .24 && px < .76 && Math.abs(py - yy) < .024);
    const knob = [[.4, .32], [.62, .5], [.44, .68]].some(([xx, yy]) => Math.abs(px - xx) < .036 && Math.abs(py - yy) < .06);
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const white = line || knob;
    raster[i] = 255; raster[i + 1] = white ? 255 : 80; raster[i + 2] = white ? 255 : 0; raster[i + 3] = inside ? 255 : 0;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(`public/icons/icon-${size}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0))]));
}
