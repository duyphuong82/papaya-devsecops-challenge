import { PolicyPack, ReportViolation, ResourceValidationArgs } from "@pulumi/policy";
import * as r from "./rules";
type Rule = (a: r.RuleArgs, report: r.Report) => void;
const wrap = (rule: Rule) => (args: ResourceValidationArgs, report: ReportViolation) =>
  rule({ type: args.type, props: args.props, opts: { protect: args.opts.protect } }, (m) => report(m));
new PolicyPack("papaya-guardrails", {
  enforcementLevel: "mandatory",
  policies: [
    { name: "iam-no-dangerous-statements", description: "No Action:*, service-wide wildcards, privilege escalation, wildcard OIDC trust (T1, T5).", enforcementLevel: "mandatory", validateResource: wrap(r.iamPolicyRule) },
    { name: "iam-no-access-keys", description: "IAM access keys are long-lived secrets (T5).", enforcementLevel: "mandatory", validateResource: wrap(r.iamNoAccessKeysRule) },
    { name: "iam-no-users", description: "Prefer SSO/roles over IAM users (T5).", enforcementLevel: "advisory", validateResource: wrap(r.iamNoUsersRule) },
    { name: "s3-no-public-access", description: "No public ACLs/policies; Block Public Access must be fully enabled (T1, T7).", enforcementLevel: "mandatory", validateResource: wrap(r.s3NoPublicRule) },
    { name: "encryption-required", description: "S3 must use aws:kms; RDS/EBS/EFS storage must be encrypted (T7).", enforcementLevel: "mandatory", validateResource: wrap(r.encryptionRule) },
    { name: "stateful-resources-protected", description: "Stateful resources must set protect:true.", enforcementLevel: "advisory", validateResource: wrap(r.statefulProtectedRule) },
    { name: "stateful-deletion-guards", description: "No forceDestroy / skipFinalSnapshot; deletionProtection on databases.", enforcementLevel: "advisory", validateResource: wrap(r.statefulDeletionGuardsRule) },
  ],
});
