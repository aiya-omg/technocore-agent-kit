// kibble-liveness.mjs — which of the host's loops are still running?
// The parse counter is frozen while the room keeps moving, so the question is whether the
// whole host is down or only the tape ingest.
const s = await (await fetch('https://flop-kibble.onrender.com/api/status', {
  signal: AbortSignal.timeout(120_000),
})).json();

const now = new Date();
console.log(`local now: ${now.toISOString()}`);
console.log(`origin reachable per host: ${JSON.stringify(s.origin)}\n`);

for (const [name, sec] of Object.entries(s)) {
  if (!sec || typeof sec !== 'object') continue;
  if (!('last_ts' in sec) && !('age_sec' in sec)) continue;
  const age = sec.age_sec ?? (sec.last_ts ? Math.round((now - new Date(sec.last_ts)) / 1000) : null);
  console.log(
    `${name.padEnd(18)} last_ts ${String(sec.last_ts ?? '-').padEnd(22)} age ${String(age ?? '?').padStart(6)}s ` +
      `due=${sec.due ?? '-'} inflight=${sec.inflight ?? '-'} error=${sec.error ?? 'null'}`
  );
}

// Any explicit cursor or tape section the host publishes.
for (const key of Object.keys(s)) {
  if (/tape|parse|cursor|ingest|reader/i.test(key)) console.log(`\n${key}: ${JSON.stringify(s[key]).slice(0, 600)}`);
}

console.log('\nfull top-level keys:', Object.keys(s).join(', '));
