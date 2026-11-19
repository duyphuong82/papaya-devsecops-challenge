# Papaya DevSecOps Challenge — duyphuong82

> Submission for Papaya Insurtech DevSecOps test.
> Repo: https://github.com/duyphuong82/papaya-devsecops-challenge
> Author: Duy Phuong — duyphuong82
> Status: Public, ready for review. All values like `papaya-insurtech/pumpkin`, account `111111111111`, team names, regions are **illustrative placeholders** — replace with real values before production use. See each file's “Cần đối chiếu / Needs verification” section.

## How to read this repo

Start with `01` for threats, then `02` for architecture, then `03` for Claude Code guardrails, then `04` for the only production gate. `05`–`08` are runbooks / hardening that assume `04` is in place.

No long-lived AWS secrets in this repo. Production changes go only via: **PR → CI → Environment with named approver → OIDC role → apply**. Laptop (even when Claude Code runs on it) is read-only for prod.

## Structure

```
.
├── README.md
├── devsecops/
│   ├── 01-threat-model.md
│   ├── 02-architecture.md
│   ├── 03-claude-code-guardrails.md
│   ├── 04-cicd-workflow.md
│   ├── 05-secrets-identity-data-protection.md
│   ├── 06-monitoring-observability-incident-response.md
│   ├── 07-rollout-migration-adoption-plan.md
│   └── 08-final-checklist-and-submission.md
├── logical/
│   └── logical-answers.md          # 5 answers, in Vietnamese, personal / real
├── conversations/
│   └── ai-conversation-log.md      # What was written by Claude vs Meta AI, and what was verified
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── preview-allow.json
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── actions/pulumi-env/action.yml
│   └── workflows/
│       ├── ci.yml                  # PR: static + preview staging read-only + sanitized comment
│       └── deploy.yml              # workflow_dispatch from main only: plan -> announce -> apply
├── policy/                         # Pulumi CrossGuard policy pack (7 policies)
│   ├── src/index.ts
│   ├── src/rules.ts
│   ├── test/rules.test.ts
│   ├── PulumiPolicy.yaml
│   ├── package.json
│   ├── config.staging.json
│   └── config.prod.json
├── scripts/
│   ├── preview-gate.mjs            # sanitized summary + fingerprint + destructive-change gate
│   ├── verify-approval.mjs         # approver != author + comment must contain fingerprint
│   ├── lint-workflows.py           # pin SHA, permissions, injection checks
│   ├── post-comment.sh             # upsert single PR comment
│   ├── gates.test.mjs
│   └── test_lint_workflows.py
├── github-config/                   # Payloads to apply repo / environment / ruleset settings
│   ├── ruleset-main.json
│   ├── repo-security.json
│   ├── actions-permissions.json
│   ├── workflow-permissions.json
│   ├── selected-actions.json
│   ├── environments/
│   │   ├── dev.json
│   │   ├── staging.json
│   │   ├── prod-vn.json
│   │   ├── prod-th.json
│   │   ├── prod-hk.json
│   │   └── branch-policy-main.json
│   ├── apply-github-config.sh      # dry-run by default, refuses if reviewer id == 0
│   └── validate-payloads.py
├── aws/
│   ├── trust-plan.json             # OIDC trust for gha-plan (pull_request)
│   ├── trust-apply.json            # OIDC trust for gha-apply (environment:prod-vn)
│   └── scp-guard.json              # SCP: block access-key / trust changes + protect CloudTrail
├── deploy/
│   └── targets.json                # environment -> stack / region / backend / role (no secrets)
├── infra/                          # Pulumi program placeholder
├── tenants/
│   ├── vn/
│   ├── th/
│   └── hk/
├── samples/
│   └── summary-blocked.md          # Example blocked preview comment
└── README-CONFIGS.md               # Notes for the config bundle (file 04)
```

## DevSecOps files — 8 files

| # | File | What it answers | Key control |
|---|---|---|---|
| 01 | `devsecops/01-threat-model.md` | Threat model T1–T8 for Papaya claims flow | T1–T8 definitions, trust boundaries, data flow |
| 02 | `devsecops/02-architecture.md` | Secure architecture for VN / TH / HK tenants | Tenant isolation, S3 + KMS, state backend, break-glass |
| 03 | `devsecops/03-claude-code-guardrails.md` | How to let Claude Code work without letting it break prod | Hooks, deny `pulumi destroy`, read-only prod on laptop, MCP limits |
| 04 | `devsecops/04-cicd-workflow.md` | **The only production gate** — OIDC, Environments, policy-as-code, anti rubber-stamp | `ci.yml` + `deploy.yml`, OIDC `gha-plan` / `gha-apply`, `preview-gate` + fingerprint + `verify-approval`, CrossGuard policy pack |
| 05 | `devsecops/05-secrets-identity-data-protection.md` | Secrets + PHI/PII protection | OIDC replaces access keys, secret scanning + push protection, synthetic fixtures, no PHI in code / logs |
| 06 | `devsecops/06-monitoring-observability-incident-response.md` | Monitoring + Observability + Incident Response | CloudTrail by `gha-<run_id>`, alerting, incident runbook, revoke first, rotate, break-glass, drill |
| 07 | `devsecops/07-rollout-migration-adoption-plan.md` | Rollout / Migration / Adoption Plan | Canary rollout, rollback plan, migration steps, adoption checklist |
| 08 | `devsecops/08-final-checklist-and-submission.md` | Final checklist + Submission | Checklist before submit, what was verified / not verified, how to submit |

> If file names for `05`–`08` in your local checkout differ slightly, the table above still maps 1-to-1 by number. Do not rename without updating this table.

## Logical — 5 answers

| File | Content |
|---|---|
| `logical/logical-answers.md` | Q1, Q5, Q6, Q8, Q10 — written in Vietnamese, personal / real stories, not invented AI answers |

- Q1: First memory — paternal grandparents' house, biggest / gloomiest in village, big kitchen and big coffin.
- Q5: Last forgot — child's backpack at school.
- Q6: Best cinema queue position — about 2/3.
- Q8: Fastest petrol station guide.
- Q10: Choose fruit stall by crowd / depletion + seller's mood.

## Conversations log

| File | Content |
|---|---|
| `conversations/ai-conversation-log.md` | Which parts were written with Claude Free (Prompts 1–4) vs Meta AI (files 04–08 after Claude hit limit), what was tested, what was **not** tested on real GitHub / AWS. Honest verification labels `[Đã thấy]` / `[Cần đối chiếu]` are preserved in file 04. |

## Config bundle — file 04

File `04` is not just a doc. Its code is in this repo and is testable:

```bash
# Policy pack — 24 tests
(cd policy && npm ci --ignore-scripts && npm test)

# Gate scripts — 16 tests
node --test scripts/gates.test.mjs

# Workflow lint — 18 tests + lint own workflows
python3 -I scripts/test_lint_workflows.py
python3 -I scripts/lint-workflows.py .github
```

### Apply GitHub config to a canary repo first

```bash
# dry-run only, prints commands
bash github-config/apply-github-config.sh papaya-insurtech/pumpkin-canary

# real apply, needs repo-admin token with workflow scope
bash github-config/apply-github-config.sh papaya-insurtech/pumpkin-canary --apply
```

The script refuses if any prod/staging reviewer is still `id: 0`. Get real IDs with `gh api users/<login> --jq .id` / `gh api orgs/<org>/teams/<slug> --jq .id`.

### Deploy flow (from file 04)

1. Open PR → `ci.yml` runs `static` + `preview` (staging, read-only OIDC) → posts sanitized summary + fingerprint to PR.
2. Merge to `main` → run `deploy.yml` via `workflow_dispatch`, choose `dev` / `staging` / `prod-vn` / `prod-th` / `prod-hk`.
3. `plan` runs with read-only role, posts plan + fingerprint to merged PR.
4. `apply` waits for named approver of that environment. Approver must paste fingerprint in approval comment.
5. `verify-approval` checks approver is not author / actor / PR author / commit author, and comment contains fingerprint.
6. Re-preview + `compare` hash. If drift or new commit changed plan → fail.
7. `pulumi up` with policy pack (mandatory in prod).

## What was verified, what was not

**Verified in this session:**
- Policy pack unit tests: 24/24, mutation-tested.
- Gate scripts: 16/16, mutation-tested, Node 22.
- Workflow lint: 18/18, 0 errors on workflows in this repo.
- `ci.yml` / `deploy.yml` / composite action / `dependabot.yml`: validated against `check-jsonschema` schemas + lint.
- `github-config/*.json`: validated against GitHub OpenAPI request-body schemas, negative tests included.
- Trust policy / SCP JSON: valid, trust policy passes `checkTrustDocument` in policy pack.

**Not yet verified — must test on canary repo before prod (file 04 §14):**
- Real GitHub behavior: required reviewers, `prevent_self_review` scope, ruleset, push protection, real OIDC `sub` (including immutable form), comment bot.
- Real Pulumi CLI: `pulumi preview --policy-pack ...` with local pack + per-policy config override.
- `actionlint` / `zizmor` for workflows.
- Real AWS: creating OIDC roles, SCP `ArnNotLike` with assumed-role ARN, prod deploy end-to-end.
- SHA of each pinned action vs its tag on upstream repo — re-check before use.

## Security notes

- No AWS access keys in repo. OIDC only.
- No `PULUMI_ACCESS_TOKEN` needed — state in S3, secrets provider `awskms`.
- No `pulumi destroy` / `stack rm` path in workflows.
- Secret scanning + push protection payload included, but it only finds provider-pattern secrets — it does **not** find PHI/PII like CCCD / bank account / medical record content. Use synthetic fixtures + pre-commit + DLP for that.
- If a secret leaks: revoke / rotate first, check CloudTrail by session `gha-*`, then clean git history.

## For reviewers

If you want the fastest review path:
1. Read `devsecops/01-threat-model.md` § T1–T8.
2. Read `devsecops/04-cicd-workflow.md` §1 (diagram) + §14 (canary checklist) + §15 (needs verification list).
3. Run the 3 test commands above.
4. Open `github-config/apply-github-config.sh` in dry-run mode on `pumpkin-canary`.
