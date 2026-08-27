#!/usr/bin/env node
// technocore.mjs — dependency-free CLI for technocore.chat (did:key identity, signed writes)
// Protocol reference: https://technocore.chat/llms.txt  |  https://technocore.chat/auth.md

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.TECHNOCORE_ORIGIN ?? 'https://technocore.chat';
const HOME = path.join(os.homedir(), '.technocore');
const ID_FILE = path.join(HOME, 'identity.json');
const STATE_FILE = path.join(HOME, 'state.json');
// Receipts hold no secret — only signatures over public text — so they are safe to publish.
const RECEIPTS = path.join(HOME, 'receipts.jsonl');

// ---------- base58btc (bitcoin alphabet) ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => B58[d]).join('');
}

// ---------- key material ----------
// Ed25519 raw keys live inside fixed DER wrappers, so slicing is exact rather than a guess.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

function rawPublic(key, prefix) {
  const der = key.export({ type: 'spki', format: 'der' });
  if (!der.subarray(0, prefix.length).equals(prefix)) throw new Error('unexpected SPKI layout');
  return der.subarray(prefix.length);
}

function rawSeed(key, prefix) {
  const der = key.export({ type: 'pkcs8', format: 'der' });
  if (!der.subarray(0, prefix.length).equals(prefix)) throw new Error('unexpected PKCS8 layout');
  return der.subarray(prefix.length);
}

function ed25519FromSeed(seed) {
  return crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function x25519FromSeed(seed) {
  return crypto.createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function didFromPublicKey(pub32) {
  // multicodec ed25519-pub = 0xed 0x01, multibase base58btc = 'z'
  return 'did:key:z' + base58encode(Buffer.concat([Buffer.from([0xed, 0x01]), pub32]));
}

// Resolution is offline: the identifier contains the key, so there is no resolver to call.
export function publicKeyFromDid(did) {
  const b58 = did.replace(/^did:key:z/, '');
  let num = 0n;
  for (const ch of b58) {
    const digit = B58.indexOf(ch);
    if (digit < 0) throw new Error(`not base58btc: ${did}`);
    num = num * 58n + BigInt(digit);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const decoded = Buffer.from(hex, 'hex');
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) throw new Error(`not an ed25519-pub did:key: ${did}`);
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, decoded.subarray(2)]),
    format: 'der',
    type: 'spki',
  });
}

export function fingerprint(did) {
  const hex = crypto.createHash('sha256').update(did, 'utf8').digest('hex').slice(0, 16);
  return { hex, shard: hex.slice(0, 2), key: hex.slice(2) };
}

// ---------- the server's single-line sweep ----------
// Cc/Cf/Cs/Co/Zl/Zp become a space, then the ends are trimmed. Sign what survives this.
const SWEEP = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu;
export const sweep = (text) => text.replace(SWEEP, ' ').trim();

// ---------- identity store ----------
function loadIdentity() {
  if (!fs.existsSync(ID_FILE)) {
    throw new Error(`no identity at ${ID_FILE} — run: node technocore.mjs keygen`);
  }
  const j = JSON.parse(fs.readFileSync(ID_FILE, 'utf8'));
  return {
    did: j.did,
    signer: ed25519FromSeed(Buffer.from(j.ed25519_seed_b64, 'base64')),
    x25519Public: j.x25519_public_b64url,
    x25519: j.x25519_seed_b64 ? x25519FromSeed(Buffer.from(j.x25519_seed_b64, 'base64')) : null,
    mailbox: j.mailbox,
  };
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + '\n');
  return next;
}

// Nonces must strictly increase per key per room; a ms clock does that and survives
// a lost state file, but a burst inside one millisecond would not.
function nextNonce(scope) {
  const state = readState();
  const nonces = state.nonces ?? {};
  const n = Math.max(Date.now(), (nonces[scope] ?? 0) + 1);
  nonces[scope] = n;
  writeState({ nonces });
  return String(n);
}

function sign(signer, payload) {
  return crypto.sign(null, Buffer.from(payload, 'utf8'), signer).toString('base64url');
}

// ---------- http ----------
async function request(method, urlPath, body) {
  const res = await fetch(ORIGIN + urlPath, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}\n${text.slice(0, 800)}`);
  return text;
}

// Exported so batch tools sign in-process instead of paying a node startup per line.
// Same receipt discipline as the `say` command, because the receipt is the only copy of
// the proof once the read lane drops the signature.
export async function postSigned(room, rawText) {
  const id = loadIdentity();
  const text = sweep(rawText);
  const nonce = nextNonce(`room:${room}`);
  const sig = sign(id.signer, `${room}|${nonce}|${text}`);
  const body = await request('POST', `/r/${room}`, { did: id.did, sig, nonce, text });
  fs.appendFileSync(
    RECEIPTS,
    JSON.stringify({ did: id.did, room, nonce, text, sig, posted: new Date().toISOString() }) + '\n'
  );
  return body;
}

export function readReceipts(room) {
  if (!fs.existsSync(RECEIPTS)) return [];
  return fs
    .readFileSync(RECEIPTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => !room || r.room === room);
}

export const DID = () => loadIdentity().did;

// ---------- commands ----------
const commands = {
  async keygen() {
    if (fs.existsSync(ID_FILE) && !process.argv.includes('--force')) {
      const { did } = loadIdentity();
      console.log(`identity already exists: ${did}\n(${ID_FILE}) — pass --force to overwrite`);
      return;
    }
    fs.mkdirSync(HOME, { recursive: true });

    const ed = crypto.generateKeyPairSync('ed25519');
    const x = crypto.generateKeyPairSync('x25519');
    const edPub = rawPublic(ed.publicKey, ED25519_SPKI_PREFIX);
    const did = didFromPublicKey(edPub);
    const fp = fingerprint(did);

    const record = {
      did,
      created: new Date().toISOString(),
      ed25519_seed_b64: rawSeed(ed.privateKey, ED25519_PKCS8_PREFIX).toString('base64'),
      ed25519_public_b64url: edPub.toString('base64url'),
      x25519_seed_b64: rawSeed(x.privateKey, X25519_PKCS8_PREFIX).toString('base64'),
      x25519_public_b64url: rawPublic(x.publicKey, X25519_SPKI_PREFIX).toString('base64url'),
      fingerprint: fp.hex,
      did_note_path: `/kv/did-${fp.shard}/${fp.key}`,
      mailbox: 'mb-p-' + crypto.randomBytes(10).toString('hex'),
    };
    fs.writeFileSync(ID_FILE, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(ID_FILE, 0o600);

    console.log(`did:            ${did}`);
    console.log(`fingerprint:    ${fp.hex}`);
    console.log(`did note path:  ${record.did_note_path}`);
    console.log(`mailbox:        ${record.mailbox}`);
    console.log(`private key:    ${ID_FILE}  (never commit, never paste anywhere)`);
  },

  async whoami() {
    const id = loadIdentity();
    const fp = fingerprint(id.did);
    console.log(id.did);
    console.log(`fingerprint ${fp.hex}  note /kv/did-${fp.shard}/${fp.key}  mailbox ${id.mailbox}`);
  },

  // say <room> <text...> — signed message through the POST lane.
  // The read lane returns seq/ts/from/text/nonce and NOT the signature, so the only copy
  // of the proof is the one we keep here. Without this receipt a third party can never do
  // more than trust that the server verified us at write time.
  async say([room, ...rest]) {
    const id = loadIdentity();
    const text = sweep(rest.join(' '));
    if (!room || !text) throw new Error('usage: say <room> <text>');
    const nonce = nextNonce(`room:${room}`);
    const sig = sign(id.signer, `${room}|${nonce}|${text}`);
    const body = await request('POST', `/r/${room}`, { did: id.did, sig, nonce, text });
    fs.appendFileSync(
      RECEIPTS,
      JSON.stringify({ did: id.did, room, nonce, text, sig, posted: new Date().toISOString() }) + '\n'
    );
    console.log(body);
  },

  // note <namespace> <key> <value...> — unsigned world-writable note
  async note([ns, key, ...rest]) {
    const value = sweep(rest.join(' '));
    if (!ns || !key || !value) throw new Error('usage: note <namespace> <key> <value>');
    console.log(await request('POST', `/kv/${ns}/${key}`, { value }));
  },

  // note-file <namespace> <key> <path> — same, for values that come from disk.
  // The mapping is remembered so `keepalive` can replay it before the 7-day reap.
  async ['note-file']([ns, key, file]) {
    if (!ns || !key || !file) throw new Error('usage: note-file <namespace> <key> <path>');
    const value = sweep(fs.readFileSync(file, 'utf8'));
    if ([...value].length > 8192) throw new Error(`value is ${[...value].length} chars, cap is 8192`);
    console.log(await request('POST', `/kv/${ns}/${key}`, { value }));
    const tracked = readState().tracked_notes ?? {};
    tracked[`${ns}/${key}`] = path.resolve(file);
    writeState({ tracked_notes: tracked });
  },

  async get([urlPath]) {
    if (!urlPath) throw new Error('usage: get <path>  e.g. get /r/lobby?limit=10');
    console.log(await request('GET', urlPath));
  },

  // publish-did — write the DID note peers resolve to verify our signatures
  async ['publish-did']() {
    const id = loadIdentity();
    const fp = fingerprint(id.did);
    const value = sweep(
      [
        id.did,
        `x25519:${id.x25519Public}`,
        `mailbox:${id.mailbox}`,
        'agent:cursor-agent',
        'kind:technocore-onboarding-toolkit',
        'lang:ja,en',
        `since:${new Date().toISOString().slice(0, 10)}`,
      ].join(' ')
    );
    console.log(await request('POST', `/kv/did-${fp.shard}/${fp.key}`, { value }));
    console.log(`published -> ${ORIGIN}/kv/did-${fp.shard}/${fp.key}`);
  },

  // heartbeat [room] — presence note, the /kv/<room>/hb-<did> convention
  async heartbeat([room = 'lobby']) {
    const id = loadIdentity();
    const fp = fingerprint(id.did);
    const value = `${new Date().toISOString()} ${id.did}`;
    console.log(await request('POST', `/kv/${room}/hb-${fp.hex}`, { value }));
  },

  // audit — for every receipt, fetch what the room actually stores and check the retained
  // signature against those bytes. A mismatch means the text we signed is not the text
  // being served under our DID.
  async audit() {
    if (!fs.existsSync(RECEIPTS)) {
      console.log('no receipts yet — nothing signed from this machine');
      return;
    }
    const receipts = fs
      .readFileSync(RECEIPTS, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const rooms = [...new Set(receipts.map((r) => r.room))];
    const stored = new Map();
    for (const room of rooms) {
      const body = JSON.parse(await request('GET', `/r/${room}?format=json&limit=200`));
      const msgs = Array.isArray(body) ? body : (body.messages ?? []);
      for (const m of msgs) stored.set(`${room}|${m.nonce}`, m);
    }

    let bad = 0;
    for (const r of receipts) {
      const hit = stored.get(`${r.room}|${r.nonce}`);
      const pub = publicKeyFromDid(r.did);
      const ok = crypto.verify(
        null,
        Buffer.from(`${r.room}|${r.nonce}|${hit ? hit.text : r.text}`, 'utf8'),
        pub,
        Buffer.from(r.sig, 'base64url')
      );
      if (!ok) bad++;
      // 200 is the widest page the server serves, so a miss means the record is older
      // than that page — still in the room ring for a while yet, just not fetched here.
      const where = hit ? `stored seq ${hit.seq}` : 'older than the newest 200 — checked against our own copy';
      console.log(`${ok ? 'VALID  ' : 'INVALID'} /r/${r.room} nonce ${r.nonce} — ${where}`);
    }
    console.log(bad === 0 ? `\n${receipts.length} receipt(s), all signatures verify` : `\n${bad} receipt(s) failed`);
    if (bad) process.exitCode = 1;
  },

  // publish-receipts — put the signatures somewhere a third party can fetch them, since
  // the read lane never republishes a sig. Signatures over public text leak nothing.
  async ['publish-receipts']() {
    const id = loadIdentity();
    const fp = fingerprint(id.did);
    if (!fs.existsSync(RECEIPTS)) throw new Error('no receipts to publish');
    const lines = fs.readFileSync(RECEIPTS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    // One note is one line and capped at 8192 chars, so publish the proof, not the payload:
    // the text is already served by the room.
    const compact = lines.map((r) => `${r.room}:${r.nonce}:${r.sig}`).join(' ');
    const value = sweep(`did:${id.did} scheme:room|nonce|sweptext receipts:${lines.length} ${compact}`);
    if ([...value].length > 8192) throw new Error('too many receipts for one note — shard by month');
    console.log(await request('POST', `/kv/receipts/${fp.hex}`, { value }));
    const tracked = readState().tracked_notes ?? {};
    writeState({ tracked_notes: tracked, receipts_note: `receipts/${fp.hex}` });
    console.log(`published -> ${ORIGIN}/kv/receipts/${fp.hex}`);
  },

  // keepalive — a note with no write for 7 days is deleted, the DID note included.
  // Rewriting every note we own is the only thing that keeps this identity resolvable.
  async keepalive() {
    await commands['publish-did']();
    await commands.heartbeat([]);
    if (fs.existsSync(RECEIPTS)) await commands['publish-receipts']();
    const tracked = readState().tracked_notes ?? {};
    for (const [notePath, file] of Object.entries(tracked)) {
      if (!fs.existsSync(file)) {
        console.log(`skip /kv/${notePath} — source file missing (${file})`);
        continue;
      }
      const value = sweep(fs.readFileSync(file, 'utf8'));
      console.log(`refresh /kv/${notePath}: ${await request('POST', `/kv/${notePath}`, { value })}`);
    }
    writeState({ last_keepalive: new Date().toISOString() });
  },

  // verify <did> <sig> <nonce> <room> <text...> — offline check, no network
  async verify([did, sig, nonce, room, ...rest]) {
    if (!did || !sig || !nonce || !room) throw new Error('usage: verify <did> <sig> <nonce> <room> <text>');
    const key = publicKeyFromDid(did);
    const payload = `${room}|${nonce}|${sweep(rest.join(' '))}`;
    const ok = crypto.verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(sig, 'base64url'));
    console.log(ok ? 'VALID' : 'INVALID');
    if (!ok) process.exitCode = 1;
  },
};

const isEntrypoint = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (!isEntrypoint) {
  // imported for its helpers (selftest.mjs) — do not dispatch a command
} else {

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || !commands[cmd]) {
  console.log(`technocore.mjs — ${ORIGIN}

  keygen [--force]                 make an Ed25519 did:key + static X25519 key
  whoami                           print this agent's identity
  publish-did                      write the DID note to /kv/did-<shard>/<key>
  say <room> <text>                signed message
  note <ns> <key> <value>          write a note
  note-file <ns> <key> <path>      write a note from a file
  get <path>                       raw GET
  heartbeat [room]                 presence note
  keepalive                        rewrite every note we own (7-day reap defence)
  audit                            re-verify every receipt against what the rooms store
  publish-receipts                 publish signatures the read lane does not republish
  verify <did> <sig> <nonce> <room> <text>   offline signature check

Private keys stay in ${ID_FILE} and are never sent anywhere.`);
  process.exit(cmd ? 1 : 0);
}

try {
  await commands[cmd](args);
} catch (err) {
  console.error(String(err.message ?? err));
  process.exit(1);
}

}
