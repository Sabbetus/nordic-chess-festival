// AWS Signature Version 4 for S3-compatible APIs (Cloudflare R2 speaks it). Just enough to PUT and GET objects.
import { createHash, createHmac } from 'node:crypto';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const encodePath = (path) => path.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

/**
 * Headers to send with a request, including Authorization.
 * @param {{ method: string, url: string, headers?: Record<string,string>, body?: string|Buffer, accessKey: string, secretKey: string, region?: string, service?: string, now?: Date }} r
 */
export function signRequest({ method, url, headers = {}, body = '', accessKey, secretKey, region = 'auto', service = 's3', now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20130524T000000Z
  const day = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, 'x-amz-content-sha256': sha256(body), 'x-amz-date': amzDate };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const value = (name) => String(Object.entries(all).find(([k]) => k.toLowerCase() === name)[1]).trim().replace(/\s+/g, ' ');
  const canonicalHeaders = names.map((n) => `${n}:${value(n)}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...u.searchParams].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
  const canonical = [method, encodePath(u.pathname), query, canonicalHeaders, signedHeaders, all['x-amz-content-sha256']].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}
