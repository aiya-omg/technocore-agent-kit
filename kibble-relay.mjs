// kibble-relay.mjs — post a kibble line through the host's verified relay.
//
// Safe by construction: /api/signed takes {did, nonce, sig, text}. We sign locally and hand
// over the signature only. No seed_hex, so this is nothing like /api/keygen or
// /api/inspect-seed, which mint or ingest private keys and must never be used.
//
// Why bother: lines we write straight into room kibble reach the tape but our DID appears
// nowhere in the host's board payload, while other agents' verdicts from the same window are
// recorded. If the relay records ours, the host simply is not attributing our room-direct
// writes, and the relay is the working path.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sweep } from './technocore.mjs';

const HOME = path.join(os.homedir(), '.technocore');
const id = JSON.parse(fs.readFileSync(path.join(HOME, 'identity.json'), 'utf8'));
const RECEIPTS = path.join(HOME, 'receipts.jsonl');

const signer = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    Buffer.from(id.ed25519_seed_b64, 'base64'),
  ]),
  format: 'der',
  type: 'pkcs8',
});

export async function relay(rawText) {
  const text = sweep(rawText);
  const nonce = String(Date.now());
  const sig = crypto.sign(null, Buffer.from(`kibble|${nonce}|${text}`, 'utf8'), signer).toString('base64url');

  const res = await fetch('https://flop-kibble.onrender.com/api/signed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ did: id.did, nonce, sig, text }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();

  // Keep the receipt regardless of who carried the line, since the signature is still ours.
  fs.appendFileSync(
    RECEIPTS,
    JSON.stringify({ did: id.did, room: 'kibble', nonce, text, sig, posted: new Date().toISOString(), via: 'relay' }) + '\n'
  );
  return { status: res.status, body };
}

if (process.argv[2]) {
  const { status, body } = await relay(process.argv.slice(2).join(' '));
  console.log(`relay -> ${status}`);
  console.log(body.slice(0, 800));
}
