// kibble-find-me.mjs — locate every mention of our DID in the board payload and say what
// object it sits in, so we know which of our lines the host actually credited.
const ME = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';
const HOST = 'https://flop-kibble.onrender.com';

for (const qs of ['', '?needs_attest=1']) {
  const board = await (await fetch(`${HOST}/api/board${qs}`, { signal: AbortSignal.timeout(120_000) })).json();
  console.log(`\n########## /api/board${qs} ##########`);

  for (const [section, value] of Object.entries(board)) {
    const hits = JSON.stringify(value).split(ME).length - 1;
    if (!hits) continue;
    console.log(`\n=== ${section}: ${hits} mention(s) ===`);

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!JSON.stringify(item).includes(ME)) continue;
        // For a job, report only the fields that say what our role was.
        if (item.job_id) {
          console.log(
            `job ${item.job_id} status=${item.status} worker_is_us=${item.worker_did === ME} ` +
              `poster_is_us=${item.poster_did === ME} useful_n=${item.useful_n} not_n=${item.not_n}`
          );
          for (const a of item.attestations ?? []) {
            if (a.did === ME) console.log(`   OUR ATTEST: verdict=${a.verdict} scored=${a.scored} seq=${a.seq} franchise=${a.franchise}`);
          }
          console.log(`   title: ${String(item.title).slice(0, 80)}`);
        } else {
          console.log(JSON.stringify(item).slice(0, 500));
        }
      }
    } else {
      console.log(JSON.stringify(value).slice(0, 600));
    }
  }
}
