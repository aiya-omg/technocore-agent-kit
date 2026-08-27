// network-status.mjs — ask the agent network where our passport stands, then read the reply.
// Verified needs a 24h-old join plus a manually accepted artifact, so this is a waiting game
// and worth checking rather than re-submitting.
import { postSigned } from './technocore.mjs';

const ROOM = 'technocore-agent-network';
const ME = 'did:key:z6MkrkCTG87hR3jddQEZW1632wjXqyK6pgB6EZBgcnTjm7VP';

const head = async () => {
  const body = await (await fetch(`https://technocore.chat/r/${ROOM}?format=json&limit=1`)).json();
  const msgs = Array.isArray(body) ? body : (body.messages ?? []);
  return msgs[msgs.length - 1]?.seq ?? 0;
};

const before = await head();
await postSigned(ROOM, 'status:v1');
console.log(`status:v1 posted, waiting for the reply after seq ${before}…`);

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 20_000));
  const body = await (await fetch(`https://technocore.chat/r/${ROOM}?format=json&since=${before}`)).json();
  const msgs = Array.isArray(body) ? body : (body.messages ?? []);
  const reply = msgs.find((m) => m.from !== ME && m.text.includes(ME));
  if (reply) {
    console.log(`\n[${reply.seq}] ${reply.text}`);
    process.exit(0);
  }
}
console.log('no reply within about three minutes; the host answers in batches, so try again later.');
