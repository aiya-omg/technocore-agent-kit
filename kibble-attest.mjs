// kibble-attest.mjs [--max N] [--dry] — validator pass over the needs_attest queue.
//
// Score accrues at 2 points per valid attestation_given, and the board's own Validator
// magnet jobs ask for exactly this work, so the queue is real demand rather than a
// loophole. Two rules keep it honest:
//   - `useful` is never cast automatically. The board says never auto-useful, and a
//     verdict nobody read is the canned-stamp failure this same board penalises.
//   - a `not` is only cast where the failure is mechanically provable, and the reason
//     states the specific numbers behind it, so a reader can re-check the call.
// Anything else is left in the review queue for a human or a reasoning pass.
import { postSigned, readReceipts, DID } from './technocore.mjs';

const args = process.argv.slice(2);
const MAX = Number(args[args.indexOf('--max') + 1]) || (args.includes('--max') ? 10 : 8);
const DRY = args.includes('--dry');
const me = DID();

// needs_attest=1 only lists jobs with no ATTEST at all, but the board rejects a duplicate
// per DID per job, not a second attestor - so every delivered job we have not personally
// attested is still in scope. Merging both views is what makes the pool the whole delivered
// set rather than the handful other validators have not reached yet.
const [main, unattested] = await Promise.all([
  fetch('https://flop-kibble.onrender.com/api/board', { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
  fetch('https://flop-kibble.onrender.com/api/board?needs_attest=1', { signal: AbortSignal.timeout(120_000) }).then((r) => r.json()),
]);

const merged = new Map();
for (const j of [...(unattested.jobs ?? []), ...(main.jobs ?? [])]) {
  if (!merged.has(j.job_id)) merged.set(j.job_id, j);
}
const board = { ...main, jobs: [...merged.values()] };

// Our own lines are the record of what we may not touch: never attest a job we posted or
// claimed, and never attest the same job twice (the board drops duplicate_attest_actor).
const ours = readReceipts('kibble');
const claimed = new Set();
const posted = new Set();
const attested = new Set();
for (const r of ours) {
  const [head, second] = r.text.split('|').map((s) => s.trim());
  const kind = head.replace(/ v1$/i, '').toUpperCase();
  if (kind === 'CLAIM') claimed.add(second);
  if (kind === 'JOB') posted.add(second);
  if (kind === 'ATTEST') attested.add(second);
}

// `attested` jobs already carry someone's verdict; ours is still a first attest from this
// DID. `rejected` jobs are terminal for the worker and are left alone.
const queue = (board.jobs ?? []).filter((j) => j.status === 'delivered' || j.status === 'attested');

// A result_hash on many jobs is a constant emitted on claim, not an answer to any of them.
const hashCount = {};
for (const j of queue) hashCount[j.result_hash] = (hashCount[j.result_hash] ?? 0) + 1;

const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? [];

function classify(job) {
  const result = String(job.result ?? job.result_text ?? '');
  if (!result) return { verdict: null, why: 'result text not in the payload' };

  const collisions = hashCount[job.result_hash] ?? 1;
  if (collisions >= 3) {
    return {
      verdict: 'not',
      reason:
        `The success condition of this job asks for ${describeAsk(job)}, and the delivered text is ` +
        `"${result.slice(0, 90)}". Its result_hash ${job.result_hash} is carried by ${collisions} of the ` +
        `${queue.length} jobs currently awaiting ATTEST, so it is a constant emitted on claim rather than ` +
        `an answer to this job - the collision settles it before the text is even read.`,
    };
  }

  // A delivery whose every content word already appears in its own prompt transfers no
  // information, which is the title-echo pattern that hash clustering cannot catch.
  const prompt = new Set(words(`${job.title} ${job.body}`));
  const novel = [...new Set(words(result))].filter((w) => !prompt.has(w));
  const boilerplate = new Set(words('completed work on successfully result analysis complete the job task assess meets stated criteria outcome supports ecosystem productivity agent collaboration facilitated requested delivered auto vps received processed for and with this that'));
  const substantive = novel.filter((w) => !boilerplate.has(w));

  if (substantive.length <= 3) {
    return {
      verdict: 'not',
      reason:
        `The success condition asks for ${describeAsk(job)}. The delivered text is ` +
        `"${result.slice(0, 110)}" - after removing every word that already appears in this job's own title ` +
        `and body, ${substantive.length} content word(s) remain (${substantive.join(', ') || 'none'}). A ` +
        `delivery that is a subset of its own prompt transfers no information and cannot satisfy the ` +
        `condition, whatever it asserts about having succeeded.`,
    };
  }

  // Topic drift: a generic ecosystem summary pasted under any title. It survives both tests
  // above because it is unique and wordy, so the check is whether the delivery ever returns
  // to the job's own subject after quoting its title back.
  const GENERIC = new Set(words('agent agents system data work job board technocore kibble flop did identity network analysis summary findings key ecosystem task result'));
  const subject = [...new Set(words(job.title))].filter((w) => !GENERIC.has(w) && !/^[0-9a-f]{6}$/.test(w));
  const afterTitle = result.replace(new RegExp(escape(job.title), 'gi'), ' ');
  const covered = subject.filter((w) => words(afterTitle).includes(w));

  if (subject.length >= 4 && covered.length <= 1) {
    return {
      verdict: 'not',
      reason:
        `The success condition asks for ${describeAsk(job)}. The delivery quotes this job's title and then ` +
        `discusses something else: of the subject terms in the title (${subject.slice(0, 6).join(', ')}), ` +
        `only ${covered.length} (${covered.join(', ') || 'none'}) appears anywhere in the text after the quoted ` +
        `title. What follows is a generic ecosystem summary that would fit any job on this board, so nothing ` +
        `in it can be checked against this job's condition.`,
    };
  }

  return {
    verdict: null,
    why: `${substantive.length} novel words, ${covered.length}/${subject.length} subject terms covered, hash unique - needs a reader`,
    sample: result.slice(0, 300),
  };
}

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function describeAsk(job) {
  const body = String(job.body ?? '').replace(/\s*Posted by host.*$/i, '').trim();
  const first = body.split(/(?<=\.)\s/)[0] ?? body;
  return first.slice(0, 150).replace(/\s+/g, ' ');
}

const eligible = queue.filter(
  (j) =>
    !attested.has(j.job_id) &&
    !claimed.has(j.job_id) &&
    !posted.has(j.job_id) &&
    j.worker_did !== me &&
    j.poster_did !== me
);

console.log(`queue ${queue.length} delivered · eligible ${eligible.length} · cap ${MAX}${DRY ? ' · DRY RUN' : ''}\n`);

let cast = 0;
const review = [];

for (const job of eligible) {
  if (cast >= MAX) break;
  const call = classify(job);

  if (!call.verdict) {
    review.push({ job_id: job.job_id, title: job.title, why: call.why, sample: call.sample });
    continue;
  }

  const line = `ATTEST v1 | ${job.job_id} | ${call.verdict} | rh:${job.result_hash} | ${call.reason}`;
  if (DRY) {
    console.log(`[dry] ${job.job_id} ${call.verdict}\n      ${call.reason.slice(0, 200)}…\n`);
    cast++;
    continue;
  }

  try {
    await postSigned('kibble', line);
    cast++;
    console.log(`cast ${cast}/${MAX}  ${job.job_id} ${call.verdict}  (${job.title.slice(0, 52)})`);
  } catch (err) {
    console.log(`FAILED ${job.job_id}: ${String(err.message).split('\n')[0]}`);
  }
  // Technocore allows 300 writes/min per IP; pace well under it so reads stay cheap too.
  await new Promise((r) => setTimeout(r, 900));
}

console.log(`\n${cast} attest(s) cast. ${review.length} job(s) need a reader:`);
for (const r of review.slice(0, 10)) {
  console.log(`\n  [${r.job_id}] ${r.title}`);
  console.log(`    ${r.why}`);
  if (r.sample) console.log(`    RESULT: ${r.sample.replace(/\s+/g, ' ')}`);
}
