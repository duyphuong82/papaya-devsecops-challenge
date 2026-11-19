// Pure rule functions. They do not import the Pulumi engine so they can be unit-tested.
// Full version in 04-cicd-workflow.md Appendix A. This file is the tested version (24 tests).
export type Report = (message: string) => void;
export interface RuleArgs { type: string; props: Record<string, any>; opts?: { protect?: boolean }; }
type Stmt = { Effect?: string; Action?: string | string[]; NotAction?: string | string[]; Resource?: string | string[]; Principal?: any; Condition?: Record<string, Record<string, unknown>>; };
const arr = (v: unknown): string[] => v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
const globToRegex = (g: string): RegExp => new RegExp("^" + g.toLowerCase().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
const anyMatch = (patterns: string[], concrete: string[]): boolean => patterns.some((p) => { const re = globToRegex(p); return concrete.some((c) => re.test(c.toLowerCase())); });
function statements(doc: unknown): Stmt[] | "unknown" | Error {
  if (doc === undefined || doc === null || doc === "") return "unknown";
  let obj: any = doc;
  if (typeof doc === "string") { try { obj = JSON.parse(doc); } catch { return new Error("policy document is not valid JSON"); } }
  if (typeof obj !== "object" || obj === null) return new Error("policy document has unexpected shape");
  const s = obj.Statement;
  if (s === undefined) return new Error("policy document has no Statement");
  return Array.isArray(s) ? s : [s];
}
const isAllow = (s: Stmt) => (s.Effect ?? "Allow") === "Allow";
const ESCALATION = ["iam:createaccesskey","iam:createuser","iam:createloginprofile","iam:updateloginprofile","iam:attachuserpolicy","iam:attachrolepolicy","iam:attachgrouppolicy","iam:putuserpolicy","iam:putrolepolicy","iam:putgrouppolicy","iam:createpolicyversion","iam:setdefaultpolicyversion","iam:updateassumerolepolicy","iam:addusertogroup"];
const S3_DESTRUCTIVE = ["s3:deletebucket","s3:deleteobject","s3:deleteobjectversion","s3:putbucketpolicy","s3:putbucketpublicaccessblock","s3:putbucketacl","s3:putobjectacl"];
const AUDIT_TAMPER = ["cloudtrail:stoplogging","cloudtrail:deletetrail","cloudtrail:updatetrail","cloudtrail:puteventselectors","kms:schedulekeydeletion","kms:disablekey"];
export function checkIamDocument(doc: unknown, report: Report, label: string): void {
  const st = statements(doc);
  if (st === "unknown") return;
  if (st instanceof Error) return report(`${label}: ${st.message}; cannot verify, treated as violation`);
  for (const s of st) {
    if (!isAllow(s)) continue;
    if (s.NotAction !== undefined) report(`${label}: Allow with NotAction grants everything except the listed actions`);
    const actions = arr(s.Action).map((a) => a.toLowerCase());
    const resources = arr(s.Resource);
    const wildRes = resources.includes("*");
    if (actions.includes("*") || actions.includes("*:*")) report(`${label}: Action "*" is not allowed`);
    for (const a of actions) { if (/^(iam|sts|organizations|kms):\*$/.test(a)) report(`${label}: service-wide wildcard "${a}" is not allowed`); }
    if (anyMatch(actions, ESCALATION)) report(`${label}: grants an IAM privilege-escalation action`);
    if (anyMatch(actions, ["iam:passrole"]) && wildRes) report(`${label}: iam:PassRole on Resource "*"`);
    if (anyMatch(actions, S3_DESTRUCTIVE) && wildRes) report(`${label}: destructive/permission-changing S3 action on Resource "*"`);
    if (anyMatch(actions, AUDIT_TAMPER)) report(`${label}: can tamper with CloudTrail or disable/delete KMS keys`);
  }
}
const OIDC_HOST = "token.actions.githubusercontent.com";
const SUB_OK = /^repo:[^*:]+:(environment:[^*]+|ref:refs\/heads\/[^*]+|pull_request)$/;
export function checkTrustDocument(doc: unknown, report: Report, label: string, roleName?: string): void {
  const st = statements(doc);
  if (st === "unknown") return;
  if (st instanceof Error) return report(`${label}: ${st.message}; cannot verify, treated as violation`);
  for (const s of st) {
    if (!isAllow(s)) continue;
    const p = s.Principal;
    const awsPrincipals = typeof p === "object" && p !== null ? arr(p.AWS) : [];
    const star = p === "*" || awsPrincipals.includes("*");
    if (star) { const cond = JSON.stringify(s.Condition ?? {}); if (!cond.includes("aws:PrincipalOrgID")) report(`${label}: Principal "*" without an aws:PrincipalOrgID condition`); }
    const fed = typeof p === "object" && p !== null ? arr(p.Federated) : [];
    if (fed.some((f) => f.includes(OIDC_HOST))) {
      const subs: string[] = []; let hasAud = false;
      for (const [op, kv] of Object.entries(s.Condition ?? {})) {
        if (op.startsWith("ForAllValues")) report(`${label}: ForAllValues must not be used in an Allow statement`);
        for (const [k, v] of Object.entries(kv ?? {})) { if (k === `${OIDC_HOST}:sub`) subs.push(...arr(v)); if (k === `${OIDC_HOST}:aud`) hasAud = true; }
      }
      if (!hasAud) report(`${label}: GitHub OIDC trust has no :aud condition`);
      if (subs.length === 0) report(`${label}: GitHub OIDC trust has no :sub condition`);
      for (const sub of subs) { if (!SUB_OK.test(sub)) report(`${label}: OIDC sub "${sub}" is too broad`); if (roleName && /prod|apply/i.test(roleName) && !/:environment:/.test(sub)) report(`${label}: role "${roleName}" must be bound to a GitHub Environment subject`); }
    }
  }
}
export function checkPublicPolicyDocument(doc: unknown, report: Report, label: string): void {
  const st = statements(doc);
  if (st === "unknown") return;
  if (st instanceof Error) return report(`${label}: ${st.message}; cannot verify, treated as violation`);
  for (const s of st) { if (!isAllow(s)) continue; const p = s.Principal; const star = p === "*" || (typeof p === "object" && p !== null && arr(p.AWS).includes("*")); if (star && !s.Condition) report(`${label}: Allow to Principal "*" without any Condition makes the bucket public`); }
}
const IAM_DOC_TYPES = new Set(["aws:iam/policy:Policy","aws:iam/rolePolicy:RolePolicy","aws:iam/userPolicy:UserPolicy","aws:iam/groupPolicy:GroupPolicy"]);
const ATTACH_TYPES = new Set(["aws:iam/rolePolicyAttachment:RolePolicyAttachment","aws:iam/userPolicyAttachment:UserPolicyAttachment","aws:iam/groupPolicyAttachment:GroupPolicyAttachment","aws:iam/policyAttachment:PolicyAttachment"]);
const ADMIN_ARN = /:policy\/(AdministratorAccess|IAMFullAccess)$/;
export function iamPolicyRule(a: RuleArgs, report: Report): void {
  if (IAM_DOC_TYPES.has(a.type)) checkIamDocument(a.props.policy, report, `${a.type}`);
  if (a.type === "aws:iam/role:Role") { checkTrustDocument(a.props.assumeRolePolicy, report, `${a.type} trust`, a.props.name); for (const ip of arr(a.props.inlinePolicies).length ? (a.props.inlinePolicies as any[]) : []) { checkIamDocument(ip?.policy, report, `${a.type} inline "${ip?.name}"`); } for (const arn of arr(a.props.managedPolicyArns)) { if (ADMIN_ARN.test(arn)) report(`${a.type}: managed policy ${arn} is not allowed`); } }
  if (ATTACH_TYPES.has(a.type) && ADMIN_ARN.test(String(a.props.policyArn ?? ""))) report(`${a.type}: attaching ${a.props.policyArn} is not allowed`);
}
export function iamNoAccessKeysRule(a: RuleArgs, report: Report): void { if (a.type === "aws:iam/accessKey:AccessKey") report("IAM access keys are long-lived credentials; use roles + OIDC instead"); }
export function iamNoUsersRule(a: RuleArgs, report: Report): void { if (a.type === "aws:iam/user:User" || a.type === "aws:iam/userLoginProfile:UserLoginProfile") report("IAM users are discouraged; use SSO/roles"); }
const BUCKET_TYPES = new Set(["aws:s3/bucketV2:BucketV2","aws:s3/bucket:Bucket"]);
const PUBLIC_ACLS = new Set(["public-read","public-read-write","authenticated-read"]);
const PAB_TYPES = new Set(["aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock","aws:s3/accountPublicAccessBlock:AccountPublicAccessBlock"]);
export function s3NoPublicRule(a: RuleArgs, report: Report): void {
  if (BUCKET_TYPES.has(a.type)) { if (PUBLIC_ACLS.has(String(a.props.acl))) report(`${a.type}: acl "${a.props.acl}" is public`); checkPublicPolicyDocument(a.props.policy, report, `${a.type} policy`); }
  if (a.type === "aws:s3/bucketPolicy:BucketPolicy") checkPublicPolicyDocument(a.props.policy, report, a.type);
  if (PAB_TYPES.has(a.type)) { for (const k of ["blockPublicAcls","blockPublicPolicy","ignorePublicAcls","restrictPublicBuckets"]) { if (a.props[k] !== true) report(`${a.type}: ${k} must be explicitly true`); } }
}
const SSE_TYPES = new Set(["aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2","aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration"]);
const KMS_ALGOS = new Set(["aws:kms","aws:kms:dsse"]);
function sseDefaults(props: Record<string, any>): any[] { const rules: any[] = []; const direct = props.rules ?? props.rule; for (const r of Array.isArray(direct) ? direct : direct ? [direct] : []) rules.push(r); const inline = props.serverSideEncryptionConfiguration?.rule; for (const r of Array.isArray(inline) ? inline : inline ? [inline] : []) rules.push(r); return rules.map((r) => r?.applyServerSideEncryptionByDefault).filter(Boolean); }
export function encryptionRule(a: RuleArgs, report: Report): void {
  if (SSE_TYPES.has(a.type) || BUCKET_TYPES.has(a.type)) { for (const d of sseDefaults(a.props)) { if (!KMS_ALGOS.has(String(d.sseAlgorithm))) report(`${a.type}: sseAlgorithm "${d.sseAlgorithm}" - PHI/PII buckets must use aws:kms`); } }
  if (a.type === "aws:rds/cluster:Cluster" && a.props.storageEncrypted !== true) { if (!a.props.snapshotIdentifier && !a.props.replicationSourceIdentifier) report(`${a.type}: storageEncrypted must be true`); }
  if (a.type === "aws:rds/instance:Instance" && a.props.storageEncrypted !== true && !a.props.replicateSourceDb) report(`${a.type}: storageEncrypted must be true`);
  if (a.type === "aws:ebs/volume:Volume" && a.props.encrypted !== true) report(`${a.type}: encrypted must be true`);
  if (a.type === "aws:efs/fileSystem:FileSystem" && a.props.encrypted !== true) report(`${a.type}: encrypted must be true`);
}
export const STATEFUL_TYPES = new Set(["aws:s3/bucketV2:BucketV2","aws:s3/bucket:Bucket","aws:kms/key:Key","aws:rds/cluster:Cluster","aws:rds/instance:Instance","aws:dynamodb/table:Table","aws:efs/fileSystem:FileSystem"]);
export function statefulProtectedRule(a: RuleArgs, report: Report): void { if (STATEFUL_TYPES.has(a.type) && a.opts?.protect !== true) report(`${a.type}: stateful resource must be created with { protect: true }`); }
export function statefulDeletionGuardsRule(a: RuleArgs, report: Report): void { if (BUCKET_TYPES.has(a.type) && a.props.forceDestroy === true) report(`${a.type}: forceDestroy=true empties the bucket on delete`); if (a.type === "aws:rds/cluster:Cluster" || a.type === "aws:rds/instance:Instance") { if (a.props.deletionProtection !== true) report(`${a.type}: deletionProtection must be true`); if (a.props.skipFinalSnapshot === true) report(`${a.type}: skipFinalSnapshot=true loses data on delete`); } }
