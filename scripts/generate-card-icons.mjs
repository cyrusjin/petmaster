import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = process.argv[2] || join(process.cwd(), 'miniprogram/images/card');
const SIZE = 96;
const BG = '#FFF1E7';
const NAVY = '#E98657';
const STROKE = 2.8;

mkdirSync(OUT, { recursive: true });

function wrap(inner) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 96 96" fill="none">
      <rect x="8" y="8" width="80" height="80" rx="22" fill="${BG}"/>
      ${inner}
    </svg>`;
}

/** @type {Record<string, string>} */
const icons = {
  'card-reserve': wrap(`
    <rect x="28" y="30" width="40" height="36" rx="6" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M36 26h24a3 3 0 0 1 3 3v4H33v-4a3 3 0 0 1 3-3Z" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linejoin="round"/>
    <path d="M38 44h8M38 52h14M38 60h10" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="56" cy="56" r="9" fill="${NAVY}" fill-opacity="0.12"/>
    <circle cx="56" cy="56" r="4.5" fill="${NAVY}"/>
  `),
  'card-pets': wrap(`
    <ellipse cx="34" cy="40" rx="5.5" ry="6.5" fill="${NAVY}"/>
    <ellipse cx="48" cy="34" rx="5.5" ry="6.5" fill="${NAVY}"/>
    <ellipse cx="62" cy="40" rx="5.5" ry="6.5" fill="${NAVY}"/>
    <ellipse cx="41" cy="28" rx="4.5" ry="5.5" fill="${NAVY}"/>
    <ellipse cx="55" cy="28" rx="4.5" ry="5.5" fill="${NAVY}"/>
    <path d="M48 42c-10 0-16 7-16 15 0 8.5 7 13 16 13s16-4.5 16-13c0-8-6-15-16-15Z" fill="${NAVY}"/>
  `),
  'card-orders': wrap(`
    <rect x="30" y="28" width="36" height="44" rx="7" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M38 24h20a3.5 3.5 0 0 1 3.5 3.5V30H34.5v-2.5A3.5 3.5 0 0 1 38 24Z" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linejoin="round"/>
    <path d="M38 42h20M38 51h20M38 60h11" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="57" cy="60" r="4.5" stroke="${NAVY}" stroke-width="2.2"/>
  `),
  'card-check': wrap(`
    <circle cx="48" cy="48" r="22" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M36 48.5 44.5 57 61 39.5" stroke="${NAVY}" stroke-width="${STROKE + 0.4}" stroke-linecap="round" stroke-linejoin="round"/>
  `),
  'card-stats': wrap(`
    <path d="M30 64V46" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M42 64V38" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M54 64V50" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M66 64V32" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M26 64h44" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M58 36l6-6 6 6" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  `),
  'card-camera': wrap(`
    <rect x="27" y="34" width="42" height="30" rx="7" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M36 34l4-6h16l4 6" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linejoin="round"/>
    <circle cx="48" cy="49" r="9" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <circle cx="48" cy="49" r="4" fill="${NAVY}"/>
    <circle cx="61" cy="40" r="2.5" fill="${NAVY}"/>
  `),
  'card-share-guest': wrap(`
    <circle cx="48" cy="38" r="10" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M28 66c0-9.5 8-14.5 20-14.5s20 5 20 14.5" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <path d="M62 34h10v10" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M68 34 58 44" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
  `),
  'card-share-staff': wrap(`
    <circle cx="40" cy="40" r="8" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M24 64c0-7.5 6.5-11.5 16-11.5" stroke="${NAVY}" stroke-width="${STROKE}" stroke-linecap="round"/>
    <circle cx="60" cy="42" r="7" fill="${NAVY}" fill-opacity="0.15" stroke="${NAVY}" stroke-width="2.2"/>
    <path d="M52 64c0-6 5-9.5 12-9.5" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M58 30h12v12" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M64 30 54 40" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
  `),
  'card-settings': wrap(`
    <circle cx="48" cy="48" r="10" stroke="${NAVY}" stroke-width="${STROKE}"/>
    <path d="M48 34v4M48 58v4M34 48h4M58 48h4" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M38.5 38.5l2.8 2.8M54.7 54.7l2.8 2.8M57.5 38.5l-2.8 2.8M41.3 54.7l-2.8 2.8" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="48" cy="48" r="14" stroke="${NAVY}" stroke-width="${STROKE}" stroke-dasharray="3.5 5.5"/>
  `)
};

for (const [name, svg] of Object.entries(icons)) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const path = join(OUT, `${name}.png`);
  writeFileSync(path, buf);
  console.log('wrote', path);
}

console.log('done');
