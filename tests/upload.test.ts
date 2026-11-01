import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { signRequest } from '../scripts/sigv4.mjs';

test('SigV4 matches the example in the AWS documentation', () => {
  const h = signRequest({
    method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' },
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.ok(h.authorization.endsWith('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'), h.authorization);
});

test('the uploader writes all shards, then the pointer, and skips a list that is already there', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ncf-up-'));
  for (let n = 0; n < 1024; n++) await writeFile(join(dir, `${n}.json`), JSON.stringify({ u: '2027-02-28', p: {} }));
  await writeFile(join(dir, 'meta.json'), JSON.stringify({ updated: '2027-02-28', month: '2027-03', players: 5 }));
  const store = new Map<string, string>();
  const order: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const key = (req.url ?? '').replace('/bucket/', '');
      if (!req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 Credential=AK/')) { res.writeHead(403).end(); return; }
      if (req.method === 'PUT') { store.set(key, Buffer.concat(chunks).toString()); order.push(key); res.writeHead(200).end(); return; }
      const v = store.get(key);
      v === undefined ? res.writeHead(404).end() : res.writeHead(200).end(v);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const env = { ...process.env, FIDE_OUT_DIR: dir, R2_ENDPOINT: `http://127.0.0.1:${port}`, R2_ACCESS_KEY_ID: 'AK', R2_SECRET_ACCESS_KEY: 'SK', R2_BUCKET: 'bucket' };
  const run = () => promisify(execFile)('node', ['scripts/upload-fide.mjs'], { env });
  try {
    const first = await run();
    assert.match(first.stdout, /Uploaded the FIDE list 2027-03/);
    assert.equal(store.size, 1025);
    assert.equal(order.at(-1), 'current.json'); // the pointer goes last
    assert.deepEqual(JSON.parse(store.get('current.json')!), { prefix: '2027-03', month: '2027-03', updated: '2027-02-28', players: 5 });
    const writes = order.length;
    assert.match((await run()).stdout, /already holds/);
    assert.equal(order.length, writes);
  } finally {
    server.close();
  }
});
