# 02 — Kiến trúc an toàn cho Coding Agent tại Papaya

> Tài liệu này biến các control trong `01-threat-model.md` (T1–T8) thành kiến trúc cụ thể.
> Phạm vi: Claude Code trên laptop, MCP server/plugin, GitHub Actions CI/CD, AWS / GCP / k0s, tenant VN / TH / HK.

## 0. Quy ước về độ tin cậy của tên cấu hình

Mọi tên khóa cấu hình, đường dẫn, tính năng trong tài liệu này được gắn một trong ba nhãn:

| Nhãn | Ý nghĩa |
|---|---|
| **[Đã thấy]** | Tên xuất hiện trong trang tài liệu chính thức về settings của Claude Code (`code.claude.com/docs/en/settings-example`) hoặc được nhiều nguồn khớp nhau. Vẫn nên chạy thử bằng `/status` trước khi triển khai diện rộng. |
| **[Nguồn thứ cấp]** | Chỉ thấy ở blog/bài viết bên thứ ba. **Cần đối chiếu tài liệu chính thức** trước khi dùng. |
| **[Cần đối chiếu]** | Tôi không chắc về tên, cú pháp hoặc hành vi. Không được copy nguyên văn vào production. |

Hai cảnh báo vận hành đã thấy trong tài liệu và nguồn tham khảo:
- Nếu file managed settings sai JSON thì Claude Code từ chối khởi động, và việc này xảy ra đồng loạt trên mọi máy được cấp file. Cần validate trong CI và rollout theo vòng (canary trước).
- Managed settings chỉ ràng buộc Claude Code; một người gọi API từ công cụ khác không nằm dưới chính sách này. Vì vậy phải kết hợp với kiểm soát ở tầng AWS/GitHub (mục 4–6), không chỉ dựa vào laptop.

---

## 1. Nguyên tắc kiến trúc

1. **Laptop là vùng không tin cậy.** Mọi thứ trên laptop (kể cả Claude Code, MCP, plugin) có thể bị chiếm. Vì vậy laptop **không giữ quyền ghi production** và không giữ credential dài hạn.
2. **Agent tự do ở nơi rủi ro thấp**: đọc, sandbox/dev, tạo PR, xem `preview`/`plan`.
3. **Mọi thay đổi production đi một cổng duy nhất**: PR → CI → GitHub Environment `prod` có named approver → OIDC role ngắn hạn → apply.
4. **Control do hệ thống ép, không do kỷ luật cá nhân.** Có phòng thủ nhiều lớp: managed settings, sandbox, IAM/SCP, GitHub protection, log.
5. **Cô lập theo tenant ngay từ hạ tầng**, không chỉ ở tầng ứng dụng.
6. **Mọi hành động truy được về một người có tên** (người hoặc agent hành động nhân danh ai).

---

## 2. Sơ đồ tổng thể (text)

```
┌───────────────────────────── LAPTOP ENGINEER (vùng KHÔNG tin cậy) ─────────────────────────────┐
│                                                                                                 │
│  MDM (Intune/Jamf) ──ép──► managed-settings.json (+ managed-mcp.json)   [Mục 3]                 │
│                                                                                                 │
│  ┌───────────── Claude Code ─────────────┐     ┌──────── Devcontainer / Sandbox ────────┐      │
│  │ permission rules (deny/ask/allow)     │     │ FS: chặn ~/.aws ~/.ssh ~/.config/gh     │      │
│  │ bypass mode: BỊ KHÓA                  │────►│ Net: allowlist domain                   │      │
│  │ hooks: chỉ hook của tổ chức           │     │ Không mount credential production        │      │
│  └───────────────┬───────────────────────┘     └──────────────────────────────────────────┘      │
│                  │ MCP (chỉ allowlist)  [Mục 4]                                                  │
│                  ▼                                                                               │
│        MCP server đã review (pin version, sandbox, egress allowlist)                             │
│                                                                                                 │
│  AWS SSO profile: dev = PowerUser-giới-hạn │ staging = ReadOnly │ prod = ReadOnly (KHÔNG ghi)   │
└──────────────┬───────────────────────────────────────────────────────────────────────┬──────────┘
               │ git push / mở PR (không có quyền sửa prod)                            │ telemetry/log
               ▼                                                                       ▼
┌────────────────────────── GITHUB (monorepo) ───────────────────────────┐     ┌──────────────────┐
│ Rulesets/branch protection • CODEOWNERS • secret scanning + push prot.  │     │ SIEM / Log       │
│ PR ──► CI (plan/preview/policy-as-code/test)                            │     │ [Mục 8]          │
│                                                                         │     └────────▲─────────┘
│ Environments:  dev ──(auto)──► staging ──(named approver)──► prod       │              │
│                                       ▲ required reviewers + chặn tự duyệt│             │
└───────────────┬─────────────────────────────────────────────────────────┘              │
                │ OIDC token (sống vài phút, gắn repo/env/workflow)   [Mục 5]            │
                ▼                                                                         │
┌───────── AWS Organization ──────────┐  ┌──── GCP ────────────┐  ┌── k0s ───────────┐   │
│ SCP guardrails (org-wide)           │  │ Workload Identity   │  │ RBAC + namespace │   │
│ Account theo tenant×env:            │  │ Federation (OIDC)   │  │ per-tenant       │   │
│  vn-prod │ th-prod │ hk-prod        │  │ Project per tenant  │  │ NetworkPolicy    │   │
│  + staging/dev riêng                │  │ Vertex/Gemini theo  │  │ audit log        │   │
│ KMS key riêng / tenant              │  │ region tenant       │  └──────────────────┘   │
│ S3: Versioning + Object Lock        │  └─────────────────────┘                          │
│ CloudTrail (org trail) ─────────────┴──────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                ┌──────────── Log Archive Account (bất biến) ────────────┐
                │ S3 Object Lock • log file validation • quyền tách biệt │
                └─────────────────────────────────────────────────────────┘
```

**Luồng thay đổi production (duy nhất):**
`Engineer/agent → PR → CI (plan + policy) → review có tên → approve Environment prod → OIDC assume role prod → apply → CloudTrail → log bất biến`

---

## 3. Managed settings do tổ chức ép (chặn T4, hỗ trợ T1, T3)

### 3.1 Cách triển khai

- File hệ thống `managed-settings.json` **[Đã thấy]**: macOS `/Library/Application Support/ClaudeCode/managed-settings.json`; Linux/WSL `/etc/claude-code/managed-settings.json`; Windows `C:\Program Files\ClaudeCode\managed-settings.json`. Đẩy bằng MDM (Intune/Jamf).
- Phương án khác: managed settings phía server trong Organization settings của claude.ai (cần gói Team/Enterprise và quyền Owner) **[Nguồn thứ cấp]**; MDM plist/registry **[Nguồn thứ cấp]**. Papaya dùng Team Premium nên cần xác nhận phương án server-managed có sẵn không. **Cần đối chiếu tài liệu chính thức.**
- Kiểm tra trên mỗi máy: chạy `/status`, dòng Setting sources phải cho thấy managed settings được áp dụng **[Nguồn thứ cấp]**.
- Thứ tự ưu tiên: managed policy cao nhất, không bị user/project settings ghi đè **[Đã thấy]**.

### 3.2 Khung managed-settings.json đề xuất (minh họa, KHÔNG copy nguyên)

> Mỗi khóa được ghi chú trạng thái bên dưới. Giá trị cụ thể (domain, đường dẫn, deny rule) là ví dụ cần Papaya điều chỉnh. JSON thật không được có comment.

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "deny": [
      "Read(./.env)",
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Bash(aws s3 rm *)",
      "Bash(aws s3 rb *)",
      "Bash(pulumi destroy *)"
    ]
  },
  "allowManagedPermissionRulesOnly": true,
  "allowManagedHooksOnly": true,
  "allowManagedMcpServersOnly": true,
  "strictKnownMarketplaces": [ { "source": "github", "repo": "papaya-insurtech/<marketplace-repo>" } ],
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false
  },
  "requiredMinimumVersion": "<phiên bản tối thiểu>"
}
```

| Khóa | Tác dụng | Trạng thái |
|---|---|---|
| `permissions.disableBypassPermissionsMode: "disable"` | Gỡ chế độ bypass permission (chặn `--dangerously-skip-permissions`) | **[Đã thấy]** |
| `permissions.deny` | Chặn đọc file/chạy lệnh theo pattern | **[Đã thấy]**. Cú pháp pattern từng rule **cần đối chiếu**, vì deny theo chuỗi lệnh Bash có thể bị lách (đổi cờ, dùng biến, shell khác). Không xem deny rule là rào chắn duy nhất. |
| `allowManagedPermissionRulesOnly` | Chỉ rule từ managed settings có hiệu lực | **[Đã thấy]** |
| `allowManagedHooksOnly` | Chỉ hook do tổ chức/SDK được chạy; chặn hook trong repo/user | **[Đã thấy]** (nhiều nguồn khớp) |
| `allowManagedMcpServersOnly` | Chỉ allowlist MCP từ managed settings áp dụng | **[Đã thấy]** |
| `strictKnownMarketplaces` | Chỉ cho phép marketplace plugin đã liệt kê; `[]` = chặn tất cả | **[Đã thấy]**. Cú pháp phần tử (`source`, `repo`) **cần đối chiếu**. |
| `sandbox.enabled`, `sandbox.failIfUnavailable` | Bật sandbox cho Bash; fail đóng nếu sandbox không chạy được | `enabled` **[Đã thấy]**; `failIfUnavailable` **[Nguồn thứ cấp]** |
| `sandbox.allowUnsandboxedCommands: false` | Tắt đường thoát chạy lệnh ngoài sandbox | **[Nguồn thứ cấp]** |
| `requiredMinimumVersion` | Phiên bản Claude Code tối thiểu | **[Đã thấy]** |
| `cleanupPeriodDays` | Rút ngắn thời gian giữ transcript cục bộ | **[Đã thấy]** (xem ghi chú ở mục 8 về xung đột với yêu cầu lưu log) |
| `forceLoginMethod`, `forceLoginOrgUUID` | Ép đăng nhập bằng tài khoản tổ chức | **[Nguồn thứ cấp]**: tránh dùng tài khoản cá nhân ngoài kiểm soát |
| `blockedMarketplaces` | Chặn marketplace cụ thể | **[Nguồn thứ cấp]** |

### 3.3 Giảm lý do để người ta tắt prompt (T4, T6)

Người ta tắt prompt vì prompt quá nhiều. Giải pháp là **giảm ma sát hợp pháp**, không chỉ cấm:
- Dùng sandbox (mục 3.4) để lệnh trong biên an toàn không phải hỏi; tài liệu bên thứ ba nêu giảm ~84% prompt khi dùng sandbox **[Nguồn thứ cấp, cần đối chiếu bài gốc của Anthropic]**.
- Cung cấp allow rule an toàn mặc định (đọc file trong repo, `git status/diff`, chạy test/lint cục bộ) trong managed settings.
- Auto-accept (nếu cần) chỉ trong devcontainer **không có credential production**.

### 3.4 Sandbox (xem mục 3.2 và 3.5 về giới hạn)

- Sandbox ràng buộc **lệnh Bash và tiến trình con** bằng cách giới hạn filesystem và network; permission rule quyết định tool call nào được thử. Dùng cả hai lớp **[Nguồn thứ cấp]**.
- Khóa cấu hình thấy ở nguồn thứ cấp: `sandbox.filesystem.denyRead / allowRead / allowWrite / denyWrite`, `sandbox.network.allowedDomains`, `allowManagedDomainsOnly` (chỉ lấy domain từ managed settings). **Tên và hành vi chính xác cần đối chiếu.**
- **Giới hạn quan trọng:** theo một nguồn thứ cấp, thuộc tính `sandbox` chỉ áp dụng cho công cụ Bash, **không** bao phủ Read, Write, WebFetch, MCP, hook. Vì vậy MCP phải được sandbox riêng (mục 4) và Read/Write phải được kiểm soát bằng permission rule. **Cần đối chiếu tài liệu chính thức.**

### 3.5 Devcontainer (lớp cách ly thứ hai)

- Chuẩn hóa devcontainer cho repo: user không phải root, chỉ mount thư mục dự án, **không mount** `~/.aws`, `~/.ssh`, `~/.config/gh`; mạng đi qua proxy/egress allowlist.
- Trong devcontainer chỉ có profile dev (hoặc không có credential, dùng role đăng nhập khi cần). Đây là nơi duy nhất có thể cân nhắc chế độ tự động chấp nhận.
- Kiểm thử ranh giới như checklist: tạo file trong dự án (được), đọc `~/.aws` (bị chặn), `curl` tới domain lạ (bị chặn), lệnh con cũng bị chặn, sandbox không chạy thì fail đóng **[Nguồn thứ cấp]**.

---

## 4. Allowlist MCP và plugin (chặn T3)

| Thành phần | Thiết kế | Trạng thái cấu hình |
|---|---|---|
| Allowlist MCP | `allowedMcpServers` trong managed settings, khớp theo `serverName` hoặc `serverUrl` (có wildcard); `[]` = khóa hoàn toàn; mặc định để trống rồi thêm từng server đã duyệt | `allowedMcpServers` **[Đã thấy]**; dạng phần tử `{serverName}`/`{serverUrl}` **[Nguồn thứ cấp]** |
| Denylist MCP | `deniedMcpServers` luôn ưu tiên hơn allowlist | **[Nguồn thứ cấp]** |
| Chỉ dùng allowlist của tổ chức | `allowManagedMcpServersOnly` | **[Đã thấy]** |
| MCP do tổ chức phân phối | file `managed-mcp.json` đặt cạnh managed settings; theo nguồn thứ cấp nó chiếm quyền kiểm soát độc quyền và chặn connector claude.ai trừ khi bật `allowAllClaudeAiMcps` | **[Nguồn thứ cấp, cần đối chiếu]** |
| Marketplace plugin nội bộ | Một marketplace duy nhất (repo `papaya-insurtech`), `strictKnownMarketplaces` | **[Đã thấy]** |

**Quy trình duyệt MCP/plugin mới (kiểm soát con người, không chỉ cấu hình):**
1. Engineer mở yêu cầu (Linear/issue): mục đích, nguồn, chủ sở hữu, quyền cần.
2. Security review: đọc mã nguồn, phụ thuộc, tool description (tránh tool poisoning), quyền filesystem, network egress, biến môi trường nhận vào.
3. Pin phiên bản/commit hash; không dùng `npx -y` hay `@latest`; mirror vào kho nội bộ khi có thể.
4. Chạy MCP trong sandbox riêng với env tối thiểu (không truyền credential AWS/GitHub). Một cách đã thấy ở nguồn thứ cấp: bọc lệnh bằng công cụ sandbox runtime (`srt`) trong `.mcp.json` **[Nguồn thứ cấp, cần đối chiếu và đánh giá độ trưởng thành]**.
5. Thêm vào `allowedMcpServers` qua PR vào repo quản lý managed settings (CODEOWNERS = security).
6. Rà soát định kỳ (quý) và gỡ khi không dùng.

---

## 5. OIDC thay cho long-lived secret (chặn T5, hỗ trợ T1, T8)

### 5.1 GitHub Actions → AWS

- Dùng GitHub OIDC provider trong IAM; workflow gọi `sts:AssumeRoleWithWebIdentity` và nhận credential ngắn hạn. Workflow cần `permissions: id-token: write`.
- **Trust policy** của role ràng buộc claim `sub` (repo + environment, ví dụ `repo:<org>/<monorepo>:environment:prod`) và `aud`. Định dạng chính xác của `sub` và các claim tùy chỉnh **cần đối chiếu tài liệu GitHub**.
- Mỗi **tenant × environment** có role riêng; role `prod` chỉ assume được từ environment `prod` (đã qua approval).
- Role CI có permission boundary; không cấp `*:*`. Deploy dùng role tối thiểu cho từng stack (Pulumi, Serverless).
- **Xóa toàn bộ** `AWS_ACCESS_KEY_ID/SECRET` khỏi repository/organization secrets; chạy credential report/Access Analyzer để tìm key IAM user còn sót, rồi vô hiệu hóa và xóa.

### 5.2 GitHub token

- Thay PAT dài hạn bằng **GitHub App** (installation token ngắn hạn, quyền tối thiểu theo repo) hoặc `GITHUB_TOKEN` với `permissions:` khai báo tối thiểu (mặc định `contents: read`).
- Không dùng `pull_request_target` với mã không tin cậy; pin third-party action theo commit SHA; CODEOWNERS cho `.github/workflows/**`.

### 5.3 GCP và k0s

- GCP: Workload Identity Federation cho GitHub Actions (không dùng service account key JSON); service account riêng cho từng tenant/dịch vụ.
- k0s: ServiceAccount theo workload, RBAC tối thiểu; pod truy cập AWS/GCP qua federation/OIDC thay cho key trong Secret. Cơ chế cụ thể trên k0s (IRSA-tương-đương) **cần thiết kế riêng và đối chiếu**.
- Secret còn lại bắt buộc (ví dụ khóa của bên thứ ba): lưu AWS Secrets Manager/GCP Secret Manager, rotation tự động, không nằm trong repo secrets.

### 5.4 Phát hiện và phản ứng

- Bật GitHub secret scanning + push protection; gitleaks/trufflehog trong CI và pre-commit.
- Runbook thu hồi/rotate trong thời gian cam kết khi nghi lộ.

---

## 6. GitHub Environments dev / staging / prod với named approver (chặn T6, T5, T1)

| Environment | Trigger | Approval | Role OIDC | Ghi chú |
|---|---|---|---|---|
| `dev` | tự động sau merge/PR | không | role dev (PowerUser giới hạn, trong account dev) | agent/engineer thoải mái thử |
| `staging` | tự động sau merge `main` + test pass | không hoặc 1 người | role staging, dữ liệu tổng hợp/ẩn danh | kiểm thử cô lập tenant (mục 7) |
| `prod` (theo tenant) | thủ công / sau staging | **bắt buộc ≥1 named approver** (≥2 cho thay đổi rủi ro cao) | role prod của đúng tenant | tác giả không được tự duyệt |

**Cấu hình GitHub cần có** (tên tính năng thấy trong GitHub; thao tác chính xác và giới hạn theo gói **cần đối chiếu tài liệu GitHub**, đặc biệt Required reviewers cho repo private có thể phụ thuộc gói Team/Enterprise):
- Environment protection rules: *required reviewers* (danh sách người/nhóm có tên), tùy chọn *prevent self-review*, giới hạn *deployment branches* (chỉ `main`).
- Branch protection/rulesets cho `main`: bắt buộc PR, ≥1 approving review (≥2 cho `prod`), dismiss stale approvals, bắt buộc status checks, cấm bypass cho admin, yêu cầu review từ CODEOWNERS.
- CODEOWNERS: `infra/**` và Pulumi/IAM/network/KMS/S3-policy → nhóm security + platform; `.github/workflows/**` và thư mục chứa managed settings/MCP allowlist → security.

**Làm cho việc duyệt có ý nghĩa (chống rubber-stamp, T6):**
- PR chạy `pulumi preview` / diff Serverless / IAM diff và đăng kết quả vào PR; thiếu diff thì không merge được.
- Policy-as-code chặn tự động vi phạm rõ ràng (security group mở `0.0.0.0/0`, bucket public, tắt encryption, nới IAM `*`, xóa/replace bucket claim). Công cụ cụ thể (Pulumi CrossGuard, OPA/Conftest, Checkov) cần đánh giá lựa chọn.
- PR do agent tạo: nhỏ, một mục đích, gắn nhãn `agent-authored`; thay đổi rủi ro cao tự động gắn nhãn và yêu cầu reviewer chuyên trách.
- Đo lường: thời gian từ mở đến approve, tỷ lệ approve không comment; lấy mẫu kiểm tra hằng tháng.

---

## 7. Tenant isolation VN / TH / HK (chặn T7, hỗ trợ T1, T2)

| Lớp | Thiết kế |
|---|---|
| AWS account | Mỗi tenant-region một account production (`vn-prod`, `th-prod`, `hk-prod`) trong AWS Organization; staging/dev tách riêng và **chỉ dùng dữ liệu tổng hợp/ẩn danh**. Mức tách (account hay chỉ bucket/key) quyết định cùng pháp chế và theo hợp đồng từng insurer. |
| Region / residency | SCP giới hạn region được phép theo account; chặn sao chép dữ liệu ra ngoài region/account. Region cụ thể phụ thuộc yêu cầu pháp lý và hợp đồng, **cần pháp chế/DPO xác nhận** (không giả định ở đây). |
| Mã hóa | KMS key riêng cho mỗi tenant; key policy chỉ cho role của tenant đó. |
| Dữ liệu | S3 bucket riêng/tenant; Aurora cluster hoặc schema riêng; Row-Level Security / Hasura permission bắt buộc `tenant_id`; không cho agent chạy SQL tự do. |
| IAM | Không có role dùng chung đọc nhiều tenant; condition theo tag `tenant`/`region`. |
| AI workloads | Agent trích xuất tài liệu chạy theo từng tenant, chỉ thấy dữ liệu của một claim (T2). Vector store/RAG/prompt cache tách theo tenant. Gọi model (Vertex/Gemini/OpenAI/Claude) đi theo region/endpoint được phép của tenant đó; cần xác nhận hợp đồng và luật chuyển dữ liệu xuyên biên giới. |
| GCP | Project riêng/tenant; Workload Identity theo tenant. |
| k0s | Namespace per tenant, RBAC theo namespace, NetworkPolicy deny-by-default giữa namespace, secret không dùng chung. |
| Kiểm thử | Test cô lập trong CI/staging: principal của tenant A không đọc được tài nguyên tenant B; chạy định kỳ cùng pentest. |
| Con người | Truy cập production theo tenant qua SSO permission set riêng, có thời hạn, có lý do (just-in-time) và ghi log. |

---

## 8. Log tập trung bất biến (chặn T8, hỗ trợ mọi threat)

**Kiến trúc:**
- **AWS:** CloudTrail ở cấp Organization (management events + data events cho bucket claim) ghi vào bucket trong **Log Archive account** riêng; bật log file validation; S3 Object Lock; quyền ghi chỉ cho dịch vụ CloudTrail, không ai xóa được kể cả người vận hành workload.
- **GCP:** Cloud Audit Logs (Admin Activity + Data Access cho dịch vụ chứa PHI) export sang sink bất biến.
- **k0s/Aurora:** bật Kubernetes audit policy; `pgaudit` cho Aurora; chuyển về cùng nơi lưu.
- **GitHub:** audit log của tổ chức (cần kiểm tra gói/streaming) + log Actions.
- **Claude Code:** thu thập telemetry/log phiên để biết agent chạy gì. Khả năng và khóa cấu hình xuất telemetry (ví dụ OpenTelemetry) **cần đối chiếu tài liệu chính thức**; nếu không đủ chi tiết, bổ sung hook của tổ chức ghi lại lệnh/tool call (hook cấp managed, `allowManagedHooksOnly`) và/hoặc dựa vào CloudTrail làm nguồn sự thật.
- **Tập trung:** một SIEM/kho log duy nhất, một kênh cảnh báo và lịch on-call chính thức thay cho Slack rời rạc.

**Truy vết agent → người → thay đổi:**
- AWS SSO: session gắn danh tính cá nhân; role CI: session name chứa `run_id`/`sha`/`actor`; tag `via=claude-code|ci` khi khả thi (**cần kiểm tra cơ chế gắn tag nguồn cho từng loại phiên**).
- Chuỗi chứng cứ: PR → tác giả → reviewer → run CI → environment approval → apply → CloudTrail event.

**Cảnh báo cốt lõi (ánh xạ threat):** xóa object/bucket hàng loạt (T1); đầu ra agent lệch schema, tỷ lệ auto-approve bất thường (T2); credential dùng từ IP/ASN lạ, EDR phát hiện đọc `~/.aws` (T3); máy thiếu managed settings / chạy bypass (T4); phát hiện secret, key IAM cũ còn hoạt động (T5); approve quá nhanh không comment (T6); principal truy cập nhiều tenant/region (T7); CloudTrail bị tắt/sửa (T8).

**Lưu ý xung đột chính sách:** `cleanupPeriodDays` rút ngắn lưu transcript cục bộ (giảm PHI nằm trên laptop) nhưng làm mất bằng chứng cục bộ. Vì vậy cần nguồn log tập trung (CloudTrail/SIEM/hook) làm bản chính, và log không được chứa nội dung PHI (che/ẩn trước khi ghi). Thời hạn lưu log theo yêu cầu pháp lý/hợp đồng, **cần pháp chế xác nhận**.

---

## 9. Bảng component ↔ control ↔ threat (T1–T8 trong file 01)

Ký hiệu: ● = control chính, ○ = hỗ trợ.

| Component | Control cụ thể | T1 S3 | T2 Inject PDF | T3 MCP | T4 Guardrail | T5 Secret | T6 Rubber-stamp | T7 Tenant | T8 Audit |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Managed settings (MDM) | `disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, `requiredMinimumVersion` | ○ | | ○ | ● | | ○ | | ○ |
| Permission deny rules | chặn đọc `~/.aws`, `.env`; chặn lệnh phá hủy | ● | | ○ | ○ | ○ | | | |
| Sandbox + Devcontainer | chặn FS `~/.aws`/`~/.ssh`, egress allowlist, không mount credential | ○ | | ● | ● | ○ | | | |
| Allowlist MCP/plugin | `allowedMcpServers`, `allowManagedMcpServersOnly`, `strictKnownMarketplaces`, quy trình review | | ○ | ● | ○ | ○ | | | |
| Laptop chỉ read-only prod | SSO permission set read-only | ● | | ○ | ○ | ● | | ○ | ○ |
| OIDC (GitHub→AWS/GCP) | bỏ access key/PAT, trust policy theo repo+env | ○ | | ○ | | ● | | ○ | ● |
| GitHub Environments + named approver | required reviewers, branch protection, CODEOWNERS, preview diff | ● | | | ○ | ○ | ● | ○ | ● |
| Policy-as-code trong CI | chặn IAM/network/S3 nguy hiểm, destroy/replace | ● | | | | ○ | ● | ○ | |
| AWS SCP + S3 Versioning/Object Lock/MFA Delete | chặn `DeleteBucket`/`DeleteObject*` ở prod, khôi phục dữ liệu | ● | | | | | | ○ | |
| Agent xử lý tài liệu cách ly | không tool ghi/không egress, schema output, tách tầng trích xuất/quyết định, sanitize PDF | ○ | ● | | | | ○ | ● | ○ |
| Tenant isolation | account/KMS/bucket/DB/namespace theo tenant, RLS, SCP region | ○ | ○ | | | | | ● | ○ |
| Log bất biến + SIEM + on-call | org CloudTrail, Log Archive, truy vết agent→người, alert | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |

---

## 10. Phạm vi triển khai theo giai đoạn (gợi ý, chi tiết ở file sau)

1. **Tuần đầu (nhanh, rủi ro thấp):** kiểm kê profile SSO prod, access key, MCP/plugin đang dùng; bật secret scanning + push protection; đưa laptop về read-only prod; khóa bypass mode qua managed settings (canary).
2. **Tiếp theo:** OIDC thay key; Environments + named approver; CODEOWNERS; allowlist MCP; sandbox/devcontainer chuẩn.
3. **Sau đó:** SCP/Object Lock; log bất biến + SIEM; tách tenant theo account; test cô lập tenant.
4. Mỗi bước có tiêu chí nghiệm thu và đường lùi (rollback), đặc biệt với managed settings vì sai JSON làm Claude Code không khởi động.

---

## 11. Danh sách cần đối chiếu tài liệu chính thức trước khi triển khai

- Toàn bộ tên khóa gắn **[Nguồn thứ cấp]** / **[Cần đối chiếu]** ở trên, đặc biệt: `sandbox.failIfUnavailable`, `sandbox.allowUnsandboxedCommands`, `sandbox.filesystem.*`, `sandbox.network.*` (gồm `allowManagedDomainsOnly`), `managed-mcp.json`, `allowAllClaudeAiMcps`, `forceLoginMethod`/`forceLoginOrgUUID`, `blockedMarketplaces`.
- Phạm vi chính xác của sandbox (chỉ Bash hay cả tool khác) và cách deny rule khớp lệnh Bash.
- Server-managed settings có sẵn cho gói Team Premium không; telemetry/OpenTelemetry của Claude Code và nội dung log có thể xuất.
- Cú pháp phần tử `strictKnownMarketplaces`, `allowedMcpServers`.
- GitHub: giới hạn Required reviewers/Environments theo gói, claim `sub` của OIDC, tùy chọn prevent self-review.
- AWS: cách gắn danh tính cá nhân/tag nguồn vào phiên SSO và phiên OIDC.
- Pháp lý (pháp chế/DPO): residency, chuyển dữ liệu xuyên biên giới, thời hạn lưu log cho VN/TH/HK và từng insurer.
- Cơ chế danh tính workload trên k0s (tương đương IRSA).
