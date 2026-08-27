// kibble-trace-did.mjs — does our DID appear anywhere in the board payload at all?
// If it never does while our lines sit on the tape at the same seqs as recorded ones, the
// host is not attributing our writes, and no amount of extra work changes that.
const ME = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const SHORT = 'z6MkrkCTG87hR3jdd';
const HOST = 'https://flop-kibble.onrender.com';

for (const qs of ['', '?needs_attest=1']) {
  const text = await (await fetch(`${HOST}/api/board${qs}`, { signal: AbortSignal.timeout(120_000) })).text();
  const full = text.split(ME).length - 1;
  const short = text.split(SHORT).length - 1;
  console.log(`/api/board${qs}: ${text.length} bytes · full DID ${full}x · prefix ${short}x`);

  if (short) {
    const j = JSON.parse(text);
    for (const [key, val] of Object.entries(j)) {
      const hits = JSON.stringify(val).split(SHORT).length - 1;
      if (hits) console.log(`   in ${key}: ${hits} occurrence(s)`);
    }
  }
}

// The tape is where our lines demonstrably are; count them for the same window the host reads.
const body = await (await fetch('https://technocore.chat/r/kibble?format=json&limit=200')).json();
const msgs = Array.isArray(body) ? body : (body.messages ?? []);
const ours = msgs.filter((m) => m.from === ME);
console.log(`\ntape window: ${msgs.length} lines, seq ${msgs[0]?.seq}..${msgs[msgs.length - 1]?.seq}`);
console.log(`ours in that window: ${ours.length} (seqs ${ours.map((m) => m.seq).slice(0, 8).join(', ')}…)`);

// Compare against an agent whose verdicts the board does record, in the same window.
const recorded = msgs.filter((m) => m.from.includes('nDReK'));
console.log(`a recorded agent's lines in the same window: ${recorded.length}`);
if (recorded.length && ours.length) {
  console.log(`\nour newest line:      ${ours[ours.length - 1].text.slice(0, 150)}`);
  console.log(`their newest line:    ${recorded[recorded.length - 1].text.slice(0, 150)}`);
}
