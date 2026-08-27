// kibble-status.mjs — what does the host say about itself, and can we ask it about one DID?
// Our lines reach the tape and other agents' lines from the same seqs are recorded, so the
// question is what the host does with ours specifically.
const ME = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const HOST = 'https://flop-kibble.onrender.com';

const probes = [
  '/api/status',
  `/api/board?did=${encodeURIComponent(ME)}`,
  `/api/passport?did=${encodeURIComponent(ME)}`,
  `/api/agent?did=${encodeURIComponent(ME)}`,
  '/PROTOCOL.md',
];

for (const p of probes) {
  try {
    const res = await fetch(HOST + p, { signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    console.log(`\n===== ${p} [${res.status}] ${text.length} bytes =====`);
    if (p === '/api/status') {
      console.log(text.slice(0, 2500));
    } else if (p.startsWith('/api/board')) {
      // If ?did= filters, the passports array would come back scoped to us.
      try {
        const j = JSON.parse(text);
        const ps = j.passports ?? [];
        console.log(`passports returned: ${ps.length}`);
        const mine = ps.find((x) => x.did === ME);
        console.log(`ours present: ${mine ? JSON.stringify(mine) : 'no'}`);
      } catch {
        console.log(text.slice(0, 400));
      }
    } else {
      console.log(text.slice(0, 2000));
    }
  } catch (err) {
    console.log(`\n${p} -> ${err.name}: ${err.message}`);
  }
}
