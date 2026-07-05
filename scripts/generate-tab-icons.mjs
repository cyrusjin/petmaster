import sharp from 'sharp';
/**
 * 生成 Tab 栏 PNG 图标（需先安装 sharp：npm install sharp）
 * 用法：node scripts/generate-tab-icons.mjs [输出目录]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = process.argv[2] || join(process.cwd(), 'miniprogram/images/tab');
const SIZE = 81;
const STROKE = 2.6;
const GRAY = '#999999';
const NAVY = '#1D3D7A';

mkdirSync(OUT, { recursive: true });

/** @type {Record<string, { outline: (c: string) => string; filled: (c: string) => string }>} */
const icons = {
  'tab-home': {
    outline: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M40.5 17.5 16.5 37.5V64.5h15.5V47.5h16v17h15.5V37.5L40.5 17.5Z" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="round"/>
        <path d="M32.5 64.5V45.5h16v19" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    filled: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M40.5 17.5 16.5 37.5V64.5h15.5V47.5h16v17h15.5V37.5L40.5 17.5Z" fill="${color}"/>
        <path d="M32.5 64.5V45.5h16v19H32.5Z" fill="#FFFFFF" fill-opacity="0.92"/>
      </svg>`
  },
  'tab-order': {
    outline: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <rect x="22" y="22" width="37" height="44" rx="7" stroke="${color}" stroke-width="${STROKE}"/>
        <path d="M31 17.5h19a4.5 4.5 0 0 1 4.5 4.5V24H26.5v-2a4.5 4.5 0 0 1 4.5-4.5Z" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="round"/>
        <path d="M30 39h21M30 49h21M30 59h12" stroke="${color}" stroke-width="${STROKE - 0.5}" stroke-linecap="round"/>
        <circle cx="52.5" cy="59" r="5.5" stroke="${color}" stroke-width="${STROKE - 0.5}"/>
      </svg>`,
    filled: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M31 17.5h19a4.5 4.5 0 0 1 4.5 4.5V24H26.5v-2a4.5 4.5 0 0 1 4.5-4.5Z" fill="${color}"/>
        <rect x="22" y="22" width="37" height="44" rx="7" fill="${color}"/>
        <path d="M30 39h21M30 49h21M30 59h12" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.95"/>
        <circle cx="52.5" cy="59" r="4" fill="#FFFFFF" opacity="0.95"/>
      </svg>`
  },
  'tab-daily': {
    outline: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <rect x="17.5" y="24.5" width="46" height="36" rx="8" stroke="${color}" stroke-width="${STROKE}"/>
        <circle cx="32.5" cy="39.5" r="9.5" stroke="${color}" stroke-width="${STROKE}"/>
        <circle cx="32.5" cy="39.5" r="3.2" fill="${color}"/>
        <path d="M53 29.5h7.5v6.5" stroke="${color}" stroke-width="${STROKE - 0.5}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M43.5 51.5 50.5 44.5 58 52" stroke="${color}" stroke-width="${STROKE - 0.5}" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="58.5" cy="52" r="2.5" fill="${color}"/>
      </svg>`,
    filled: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <rect x="17.5" y="24.5" width="46" height="36" rx="8" fill="${color}"/>
        <circle cx="32.5" cy="39.5" r="9.5" fill="#FFFFFF" fill-opacity="0.95"/>
        <circle cx="32.5" cy="39.5" r="3.2" fill="${color}"/>
        <path d="M43.5 51.5 50.5 44.5 58 52" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="58.5" cy="52" r="2.5" fill="#FFFFFF"/>
        <path d="M53 29.5h7.5v6.5" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
  },
  'tab-shop': {
    outline: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M18 34.5 24 22.5h33l6 12" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="round"/>
        <path d="M20 34.5h41l-2.5 24.5a4 4 0 0 1-4 3.5H26.5a4 4 0 0 1-4-3.5L20 34.5Z" stroke="${color}" stroke-width="${STROKE}" stroke-linejoin="round"/>
        <path d="M30 34.5V28a10.5 10.5 0 0 1 21 0v6.5" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"/>
      </svg>`,
    filled: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M18 34.5 24 22.5h33l6 12H18Z" fill="${color}"/>
        <path d="M20 34.5h41l-2.5 24.5a4 4 0 0 1-4 3.5H26.5a4 4 0 0 1-4-3.5L20 34.5Z" fill="${color}"/>
        <path d="M30 34.5V28a10.5 10.5 0 0 1 21 0v6.5" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`
  },
  'tab-mine': {
    outline: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <circle cx="40.5" cy="30.5" r="11.5" stroke="${color}" stroke-width="${STROKE}"/>
        <path d="M21.5 64.5c0-11.2 8.5-20.3 19-20.3s19 9.1 19 20.3" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"/>
      </svg>`,
    filled: (color) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 81 81" fill="none">
        <path d="M21.5 64.5c0-11.2 8.5-20.3 19-20.3s19 9.1 19 20.3H21.5Z" fill="${color}"/>
        <circle cx="40.5" cy="30.5" r="11.5" fill="${color}"/>
      </svg>`
  }
};

for (const [name, { outline, filled }] of Object.entries(icons)) {
  for (const [suffix, builder, color] of [
    ['', outline, GRAY],
    ['-active', filled, NAVY]
  ]) {
    const buf = await sharp(Buffer.from(builder(color))).png().toBuffer();
    const path = join(OUT, `${name}${suffix}.png`);
    writeFileSync(path, buf);
    console.log('wrote', path);
  }
}

console.log('done');
