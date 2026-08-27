// kibble-watch.mjs — wait for the host's tape ingest to resume before spending more writes.
//
// Our lines are on the tape, correctly shaped, rh-matched, and the host's own /api/signed
// relay returns 200 for them, yet none are recorded and our DID appears nowhere in the board
// payload. The `parsed` counter is frozen while the room keeps advancing, so the aggregator
// is behind, not rejecting us. Writing more attests while it is stalled buys nothing.
const HOST = 'https://flop-kibble.onrender.com';
const INTERVAL_MS = Number(process.env.WATCH_MS ?? 120_000);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
let baseline = null;
let checks = 0;

for (;;) {
  checks++;
  try {
    const board = await (await fetch(`${HOST}/api/board`, { signal: AbortSignal.timeout(120_000) })).json();
    const status = await (await fetch(`${HOST}/api/status`, { signal: AbortSignal.timeout(120_000) })).json();
    const room = await (await fetch('https://technocore.chat/r/kibble?format=json&limit=1')).json();
    const msgs = Array.isArray(room) ? room : (room.messages ?? []);

    const parsed = board.stats?.parsed ?? 0;
    const head = msgs[msgs.length - 1]?.seq ?? 0;
    const jobTimer = status.auto_job?.age_sec ?? -1;

    baseline ??= parsed;
    const moved = parsed - baseline;

    console.log(
      `[${stamp()}] check ${checks}: parsed ${parsed} (${moved >= 0 ? '+' : ''}${moved} since start) · ` +
        `room head ${head} · auto_job age ${jobTimer}s · attested ${board.stats?.attested} · agents ${board.stats?.agents}`
    );

    if (moved > 0) {
      console.log(`\nINGEST RESUMED: parsed advanced by ${moved}. Re-run kibble-verify-attest.mjs to see whether our verdicts landed, then resume kibble-attest.mjs.`);
      break;
    }
  } catch (err) {
    console.log(`[${stamp()}] check ${checks} error: ${String(err.message).split('\n')[0]}`);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
