// Renders the favicon artwork (public/favicon.svg) into the PNG / ICO files browsers, phones and search engines ask for.
// Run it after changing the artwork: node scripts/generate-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
// Home-screen icons (Apple, Android) are shown with the system's own rounded corners, so they are full-bleed squares.
const square = Buffer.from(svg.toString().replace(' rx="12"', ''));
const png = (source, size) => sharp(source, { density: 600 }).resize(size, size).png().toBuffer();
const out = (name) => new URL(`../public/${name}`, import.meta.url);

await writeFile(out('apple-touch-icon.png'), await png(square, 180));
await writeFile(out('icon-192.png'), await png(square, 192));
await writeFile(out('icon-512.png'), await png(square, 512));
await writeFile(out('favicon-48.png'), await png(svg, 48));

// favicon.ico: a container holding PNG images (16, 32 and 48 px).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(svg, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const at = 6 + 16 * i;
  header[at] = s; header[at + 1] = s; // width, height
  header.writeUInt16LE(1, at + 4); // colour planes
  header.writeUInt16LE(32, at + 6); // bits per pixel
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
await writeFile(out('favicon.ico'), Buffer.concat([header, ...images]));
console.log('icons written to public/');
