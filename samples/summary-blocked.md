### Pulumi preview: `vn-prod`

Review fingerprint: `682c408cb33a`  |  steps: 4  |  generated 2026-11-19

> :no_entry: **BLOCKED** - 1 destructive change(s) on stateful resources without an approved exception:
> - `replace` aws:s3/bucketV2:BucketV2 `claim-documents`

| op | count |
|---|---|
| update | 2 |
| replace | 1 |
| create | 1 |

| risk | op | type | name | changed properties |
|---|---|---|---|---|
| security-sensitive | update | aws:iam/rolePolicy:RolePolicy | ingest-policy | policy |
| - | update | aws:lambda/function:Function | claim-ingest | environment, timeout |
| DESTRUCTIVE, stateful | replace | aws:s3/bucketV2:BucketV2 | claim-documents | bucket |
| - | create | aws:sqs/queue:Queue | claim-dlq | - |

_Property values are intentionally omitted; open the job log for full detail._
