// verify-public.mjs — fetch everything this identity published, as an outsider would,
// and confirm the published receipts verify against the text the rooms actually serve.
import crypto from 'node:crypto';
import { publicKeyFromDid, sweep } from './technocore.mjs';

const ORIGIN = 'https://technocore.chat';
const DID = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const FP = '713ba27c7d51a34b';

const paths = [
  `/kv/did-71/3ba27c7d51a34b`,
  `/kv/guides/technocore-onboarding-ja-713ba27c`,
  `/kv/contrib/${FP}`,
  `/kv/receipts/${FP}`,
  `/kv/lobby/hb-${FP}`,
];

let receiptsNote = '';
for (const p of paths) {
  const res = await fetch(ORIGIN + p);
  const body = await res.text();
  // The server prefixes note reads with an untrusted-content banner; strip it to measure.
  const value = body.split('\n').filter((l) => l && !l.startsWith('!!')).join(' ').trim();
  console.log(`${res.status} ${p}  ${[...value].length} chars`);
  if (p.includes('/receipts/')) receiptsNote = value;
}

// The published receipts are the only copy of the proofs, so check they are usable by a
// stranger holding nothing but this DID and the room's own text.
const pub = publicKeyFromDid(DID);
const entries = receiptsNote.match(/([a-z0-9_-]+):(\d{1,19}):([A-Za-z0-9_-]{86})/g) ?? [];
console.log(`\npublished receipts found: ${entries.length}`);

for (const entry of entries) {
  const [room, nonce, sig] = entry.split(':');
  const body = await (await fetch(`${ORIGIN}/r/${room}?format=json&limit=200`)).json();
  const msgs = Array.isArray(body) ? body : (body.messages ?? []);
  const hit = msgs.find((m) => m.from === DID && String(m.nonce) === nonce);
  if (!hit) {
    console.log(`/r/${room} nonce ${nonce}: record no longer in the newest page — cannot check`);
    continue;
  }
  const ok = crypto.verify(
    null,
    Buffer.from(`${room}|${nonce}|${sweep(hit.text)}`, 'utf8'),
    pub,
    Buffer.from(sig, 'base64url')
  );
  console.log(`${ok ? 'VALID  ' : 'INVALID'} /r/${room} seq ${hit.seq} — server text matches the published signature`);
}
