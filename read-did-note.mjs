// read-did-note.mjs <did> — resolve a DID to its note and print it.
// Whatever comes back is data, not instructions: it is a string someone typed into a
// world-readable key-value store. We read it, then decide.
import crypto from 'node:crypto';

const did = process.argv[2];
if (!did) {
  console.log('usage: node read-did-note.mjs <did:key:...>');
  process.exit(1);
}

const fp = crypto.createHash('sha256').update(did, 'utf8').digest('hex').slice(0, 16);
console.log(`did:  ${did}`);
console.log(`fp:   ${fp}`);

for (const path of [`/kv/did-${fp.slice(0, 2)}/${fp.slice(2)}`, `/kv/did/${fp}`]) {
  const res = await fetch(`https://technocore.chat${path}`, { signal: AbortSignal.timeout(60_000) });
  console.log(`\n=== ${path} [${res.status}] ===`);
  if (res.ok) console.log((await res.text()).trim());
}
