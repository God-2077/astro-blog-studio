#!/usr/bin/env node
/**
 * 生成 PWA 图标（无需任何第三方依赖）。
 *
 * 画面是「樱糖手帐」的抽象记号：樱粉底 + 五瓣樱 + 墨点，颜色取自
 * src/styles/app.css 的 --abs-sakura / --abs-paper / --abs-ink。
 *
 * 输出（属于生成物，请一并提交；构建时 vite-plugin-pwa 会读取它们）：
 *   public/icon-192.png           浏览器安装图标
 *   public/icon-512.png           浏览器安装图标（高清）
 *   public/icon-maskable-512.png  全出血 maskable 图标，花纹在 80% 安全区内
 *   public/apple-touch-icon.png   iOS 主屏图标（全出血，系统自己切圆角）
 *
 * 用法：pnpm pwa:icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SAFE_PINK = [201, 63, 109];
const PAPER = [255, 251, 245];
const INK = [61, 47, 54];

/** 超采样倍数：放大画再缩小，给圆弧一点抗锯齿。 */
const SUPERSAMPLE = 4;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

/** RGBA（非预乘）像素缓冲 → PNG。 */
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createCanvas(size) {
  const edge = size * SUPERSAMPLE;
  return { edge, pixels: new Float32Array(edge * edge * 4) };
}

/** 用归一化坐标 [0,1] 的形状判定填色；形状内部一律不透明。 */
function paint(canvas, color, test) {
  const { edge, pixels } = canvas;
  for (let y = 0; y < edge; y += 1) {
    const v = (y + 0.5) / edge;
    for (let x = 0; x < edge; x += 1) {
      if (!test((x + 0.5) / edge, v)) continue;
      const offset = (y * edge + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 1;
    }
  }
}

function roundedSquareTest(radius) {
  return (u, v) => {
    const x = Math.min(u, 1 - u);
    const y = Math.min(v, 1 - v);
    if (x < 0 || y < 0) return false;
    if (x >= radius || y >= radius) return true;
    const dx = radius - x;
    const dy = radius - y;
    return dx * dx + dy * dy <= radius * radius;
  };
}

function circleTest(centerX, centerY, radius) {
  return (u, v) => {
    const dx = u - centerX;
    const dy = v - centerY;
    return dx * dx + dy * dy <= radius * radius;
  };
}

/** 沿 angle 方向摆放的椭圆（花瓣长轴朝外）。 */
function petalTest(centerX, centerY, radiusX, radiusY, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (u, v) => {
    const dx = u - centerX;
    const dy = v - centerY;
    const along = dx * cos + dy * sin;
    const across = -dx * sin + dy * cos;
    return (along * along) / (radiusX * radiusX) + (across * across) / (radiusY * radiusY) <= 1;
  };
}

function downsample(canvas, size) {
  const { edge, pixels } = canvas;
  const out = Buffer.alloc(size * size * 4);
  const step = edge / size;
  const samples = step * step;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const offset = ((y * step + dy) * edge + (x * step + dx)) * 4;
          red += pixels[offset];
          green += pixels[offset + 1];
          blue += pixels[offset + 2];
          alpha += pixels[offset + 3];
        }
      }
      const outAlpha = alpha / samples;
      const offset = (y * size + x) * 4;
      if (outAlpha > 0) {
        out[offset] = Math.round(red / samples / outAlpha);
        out[offset + 1] = Math.round(green / samples / outAlpha);
        out[offset + 2] = Math.round(blue / samples / outAlpha);
        out[offset + 3] = Math.round(outAlpha * 255);
      }
    }
  }

  return out;
}

function drawIcon(size, { fullBleed }) {
  const canvas = createCanvas(size);
  paint(canvas, SAFE_PINK, fullBleed ? () => true : roundedSquareTest(0.22));

  const scale = fullBleed ? 0.7 : 1;
  const centerX = 0.5;
  const centerY = fullBleed ? 0.5 : 0.49;
  const distance = 0.135 * scale;
  const petals = 5;
  for (let index = 0; index < petals; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / petals;
    paint(
      canvas,
      PAPER,
      petalTest(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance, 0.24 * scale, 0.135 * scale, angle),
    );
  }
  paint(canvas, INK, circleTest(centerX, centerY, 0.055 * scale));

  return encodePng(size, downsample(canvas, size));
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(publicDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, fullBleed: false },
  { file: 'icon-512.png', size: 512, fullBleed: false },
  { file: 'icon-maskable-512.png', size: 512, fullBleed: true },
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true },
];

for (const target of targets) {
  const png = drawIcon(target.size, { fullBleed: target.fullBleed });
  writeFileSync(join(publicDir, target.file), png);
  console.log(`${target.file}  ${target.size}x${target.size}  ${(png.length / 1024).toFixed(1)} KiB`);
}
