#!/usr/bin/env node
// verify-approval.mjs - after GitHub's environment approval, make "reviewed" mean something.
import { readFileSync } from "node:fs";
const o = {}; const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
const die = (m, c = 1) => { console.error(`verify-approval: ${m}`); process.exit(c); };
for (const k of ["approvals", "environment", "hash"]) if (!o[k]) die(`missing --${k}`, 2);
if (!/^[0-9a-f]{12}$/.test(o.hash)) die("hash must be 12 hex chars", 2);
let approvals; try { approvals = JSON.parse(readFileSync(o.approvals, "utf8")); } catch (e) { die(`cannot read approvals: ${e.message}`, 2); }
if (!Array.isArray(approvals)) die("approvals JSON must be an array", 2);
const forbid = new Set((o.forbid ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const good = [], notes = [];
for (const a of approvals) {
  if (a.state !== "approved") continue;
  if (!(a.environments ?? []).some((e) => e.name === o.environment)) continue;
  const login = String(a.user?.login ?? "").toLowerCase();
  if (!login) { notes.push("approval without a user login ignored"); continue; }
  if (forbid.has(login)) { notes.push(`approval by ${login} ignored: author/actor of this change`); continue; }
  if (!String(a.comment ?? "").toLowerCase().includes(o.hash.toLowerCase())) { notes.push(`approval by ${login} ignored: comment does not contain review fingerprint ${o.hash}`); continue; }
  good.push(login);
}
for (const n of notes) console.error(`verify-approval: ${n}`);
if (good.length === 0) die(`no valid approval for ${o.environment}: need an approver who is not the author and whose comment contains ${o.hash}`);
console.log(`verify-approval: ok - approved by ${[...new Set(good)].join(", ")} for ${o.environment}`);
