// The picture shown when a guest's page is shared (Open Graph / social cards): the portrait cut to the usual 1.91:1 wide
// shape. Portraits are tall, so which strip of the photo is used matters: see `socialCropY` in each guest file.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/** Social cards are 1.91:1. */
const RATIO = 1.91;

// The photo files are named after the guest (src/assets/guests/<slug>.jpg).
const file = (slug: string) => join(process.cwd(), 'src/assets/guests', `${slug}.jpg`);

export const getStaticPaths = (async () => {
  const guests = await getCollection('guests');
  return guests
    .filter((g) => !g.data.placeholder && g.data.photo && existsSync(file(g.id)))
    .map((g) => ({ params: { slug: g.id }, props: { y: g.data.socialCropY } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ y: number }> = async ({ params, props }) => {
  const source = sharp(file(params.slug!));
  const { width = 0, height = 0 } = await source.metadata();
  const cropHeight = Math.min(height, Math.round(width / RATIO));
  const top = Math.round((height - cropHeight) * props.y);
  const outWidth = Math.min(width, 1200);
  const body = await source
    .extract({ left: 0, top, width, height: cropHeight })
    .resize(outWidth, Math.round(outWidth / RATIO))
    .jpeg({ quality: 82 })
    .toBuffer();
  return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg' } });
};
