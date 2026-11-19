#!/usr/bin/env node
// preview-gate.mjs - turns `pulumi preview --json` into a sanitized summary and blocks destructive changes.
// Full version in 04 file section 8.1. This file is the tested version (16 tests with gates.test.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const DESTRUCTIVE = new Set(["delete", "replace", "delete-replaced", "create-replacement"]);
const IGNORED = new Set(["same", "read", "refresh"]);
const STATEFUL = [/^aws:s3\/(bucket|bucketV2):/, /^aws:kms\/key:/, /^aws:rds\/(cluster|instance):/, /^aws:dynamodb\/table:/, /^aws:efs\/fileSystem:/, /^aws:ebs\/volume:/, /^aws:cognito\/userPool:/];
const SENSITIVE = [/^aws:(iam|kms|cloudtrail|organizations)\//, /^aws:ec2\/(securityGroup|securityGroupRule|vpcSecurityGroup\w*Rule|networkAcl\w*)/, /^aws:s3\/(bucketPolicy|bucketPublicAccessBlock|bucketAcl\w*|accountPublicAccessBlock):/, /^aws:(sqs|sns)\/\w*[pP]olicy:/, /^aws:lambda\/(permission|functionUrl):/];
const args = (() => { const [cmd, ...rest] = process.argv.slice(2); const o = { cmd }; for (let i = 0; i < rest.length; i += 2) o[rest[i].replace(/^--/, "")] = rest[i + 1]; return o; })();
const die = (msg, code = 2) => { console.error(`preview-gate: ${msg}`); process.exit(code); };
const readJson = (p, what) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { return die(`cannot read ${what} (${p}): ${e.message}`); } };
export function parseUrn(urn) { const parts = String(urn).split("::"); const typeChain = parts.length >= 4 ? parts[2] : "unknown"; return { type: typeChain.split("$").pop(), name: parts.length >= 4 ? parts.slice(3).join("::") : String(urn) }; }
const redact = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "").replace(/AKIA[0-9A-Z]{16}/g, "AKIA_REDACTED").replace(/(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]+/g, "$1_REDACTED").replace(/(bearer|token|secret|password)([ =:]+)[^\s"']+/gi, "$1$2REDACTED");
export const md = (s) => String(s).replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 120).replace(/[\\`|<>\[\]]/g, (c) => ({ "|": "\\|", "<": "&lt;", ">": "&gt;" }[c] ?? "'")).replace(/@/g, "@\u200b").replace(/!/g, "\\!");
export function canonicalSteps(preview) { return (preview.steps ?? []).filter((s) => !IGNORED.has(s.op)).map((s) => ({ op: s.op, urn: s.urn })).sort((a, b) => (a.urn + a.op).localeCompare(b.urn + b.op)); }
export const hashSteps = (steps) => createHash("sha256").update(steps.map((s) => `${s.op} ${s.urn}`).join("\n")).digest("hex").slice(0, 12);
function allowed(allow, now, step) { return allow.find((e) => e.urn === step.urn && e.op === step.op && e.reason && String(e.reason).trim() && e.approved_by && e.expires && String(e.expires) >= now); }
function gate() {
  if (!args.preview || !args.out || !args["steps-out"] || !args.stack) die("need --preview --stack --out --steps-out");
  const preview = readJson(args.preview, "preview JSON");
  if (typeof preview !== "object" || preview === null) die("preview JSON has unexpected shape");
  const now = args.now ?? new Date().toISOString().slice(0, 10);
  const allow = args.allow ? readJson(args.allow, "allow file") : [];
  if (!Array.isArray(allow)) die("allow file must be a JSON array");
  const steps = canonicalSteps(preview);
  const hash = hashSteps(steps);
  const rows = steps.map((s) => { const { type, name } = parseUrn(s.urn); const full = (preview.steps ?? []).find((x) => x.urn === s.urn && x.op === s.op) ?? {}; return { ...s, type, name, stateful: STATEFUL.some((r) => r.test(type)), sensitive: SENSITIVE.some((r) => r.test(type)), destructive: DESTRUCTIVE.has(s.op), props: [...new Set([...(full.diffReasons ?? []), ...(full.replaceReasons ?? [])])].slice(0, 8) }; });
  const blocked = [], excepted = [];
  for (const r of rows) { if (r.destructive && r.stateful) { const e = allowed(allow, now, r); (e ? excepted : blocked).push({ ...r, exception: e }); } }
  const counts = {}; for (const r of rows) counts[r.op] = (counts[r.op] ?? 0) + 1;
  const errs = (preview.diagnostics ?? []).filter((d) => String(d.severity) === "error").slice(0, 10);
  const L = []; L.push(`### Pulumi preview: \`${args.stack}\``, ""); L.push(`Review fingerprint: \`${hash}\`  |  steps: ${rows.length}  |  generated ${now}`, "");
  if (preview.maybeCorrupt) L.push("> :warning: preview reports `maybeCorrupt` - state may be inconsistent. Do not approve.", "");
  if (blocked.length) { L.push(`> :no_entry: **BLOCKED** - ${blocked.length} destructive change(s) on stateful resources without an approved exception:`); for (const b of blocked) L.push(`> - \`${b.op}\` ${md(b.type)} \`${md(b.name)}\``); L.push(""); }
  if (excepted.length) { L.push("> :information_source: destructive changes allowed by exception:"); for (const b of excepted) L.push(`> - \`${b.op}\` ${md(b.type)} \`${md(b.name)}\` - ${md(redact(b.exception.reason))}`); L.push(""); }
  if (errs.length) { L.push("**Errors reported by Pulumi (first 10, truncated):**"); for (const d of errs) L.push(`- ${md(redact(d.message ?? ""))}`); L.push(""); }
  L.push("| op | count |", "|---|---|", ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`), "");
  const shown = rows.slice(0, 200);
  if (rows.length) { L.push("| risk | op | type | name | changed properties |", "|---|---|---|---|---|"); for (const r of shown) { const risk = [r.destructive ? "DESTRUCTIVE" : "", r.stateful ? "stateful" : "", r.sensitive ? "security-sensitive" : ""].filter(Boolean).join(", "); L.push(`| ${risk || "-"} | ${md(r.op)} | ${md(r.type)} | ${md(r.name)} | ${md(r.props.join(", ") || "-")} |`); } if (rows.length > shown.length) L.push("", `_${rows.length - shown.length} more rows not shown; see the job log._`); } else { L.push("_No changes._"); }
  L.push("", "_Property values are intentionally omitted; open the job log for full detail._");
  writeFileSync(args.out, L.join("\n") + "\n"); writeFileSync(args["steps-out"], JSON.stringify({ stack: args.stack, hash, steps }, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT) { writeFileSync(process.env.GITHUB_OUTPUT, `hash=${hash}\nblocked=${blocked.length}\nsensitive=${rows.some((r) => r.sensitive)}\n`, { flag: "a" }); }
  console.log(`preview-gate: stack=${args.stack} steps=${rows.length} hash=${hash} blocked=${blocked.length} excepted=${excepted.length}`);
  process.exit(blocked.length || preview.maybeCorrupt ? 1 : 0);
}
function compare() { if (!args.approved || !args.current) die("need --approved --current"); const a = readJson(args.approved, "approved steps"), c = readJson(args.current, "current steps"); if (a.hash === c.hash) { console.log(`preview-gate: plan unchanged since approval (hash ${a.hash})`); process.exit(0); } const key = (s) => `${s.op} ${s.urn}`; const A = new Set(a.steps.map(key)), C = new Set(c.steps.map(key)); console.error(`preview-gate: PLAN CHANGED since approval (approved ${a.hash}, now ${c.hash})`); for (const k of C) if (!A.has(k)) console.error(`  + ${k}`); for (const k of A) if (!C.has(k)) console.error(`  - ${k}`); process.exit(1); }
if (args.cmd === "gate") gate(); else if (args.cmd === "compare") compare(); else die("usage: preview-gate.mjs gate|compare ...");
