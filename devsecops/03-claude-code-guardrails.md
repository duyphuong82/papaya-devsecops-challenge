# 03 — Claude Code Guardrails: triển khai thực tế trên laptop engineer

> Tiếp nối `01-threat-model.md` (T1–T8) và `02-architecture.md`. File này là hướng dẫn triển khai: managed settings mẫu, deny rule, hook bắt buộc, sandbox/devcontainer, kiểm thử ranh giới, rollout canary và rollback.

## 0. Quy ước và phạm vi đã kiểm chứng

Nhãn độ tin cậy của mọi tên cấu hình giống file 02:

| Nhãn | Ý nghĩa |
|---|---|
| **[Đã thấy]** | Tên/hành vi xuất hiện trong tài liệu chính thức của Claude Code (trang settings, permissions, hooks, devcontainer) hoặc nhiều nguồn khớp nhau. |
| **[Nguồn thứ cấp]** | Chỉ thấy ở blog/bài bên thứ ba. **Cần đối chiếu tài liệu chính thức** trước khi dùng. |
| **[Cần đối chiếu]** | Không chắc về tên, cú pháp, vị trí khóa hoặc hành vi. Không đưa vào production khi chưa tự thử trên canary. |

**Những gì tôi đã chạy thật để viết file này:**
- Script hook `pretool-guard.sh` (mục 4) đã được chạy với 25+ lệnh mẫu bằng `bash`/`jq` trên môi trường Linux. Lần chạy đầu bắt được một lỗi (chặn nhầm lệnh đọc trên profile prod khi có cờ `--profile`), đã sửa và chạy lại.
- Các khối JSON trong tài liệu được parse bằng Python; script cài đặt/rollback (mục 7) được chạy thử trên thư mục tạm.

**Những gì tôi CHƯA chạy:** bản thân Claude Code. Mọi hành vi "Claude Code sẽ chặn/từ chối/hiển thị ..." đều dựa trên tài liệu và nguồn tham khảo, không phải kết quả chạy thật. Vì vậy mục 6 (checklist kiểm thử) là bắt buộc trên canary trước khi tin vào bất kỳ dòng cấu hình nào ở đây.

**Nguyên tắc dùng tài liệu này:** một khóa cấu hình bị Claude Code bỏ qua (do sai tên hoặc sai vị trí) **không phải là control**. Có nguồn ghi nhận Claude Code cảnh báo khi gặp thuộc tính không nhận ra **[Nguồn thứ cấp]**; vẫn phải kiểm tra tác dụng thật bằng mục 6, không chỉ dựa vào việc không có lỗi.

---

## 1. Các lớp phòng thủ trên laptop và ranh giới của từng lớp

| Lớp | Cơ chế | Chặn được | Không chặn được |
|---|---|---|---|
| L1 Managed settings | `managed-settings.json` do MDM ép, ưu tiên cao nhất | Người dùng/repo ghi đè rule, bật bypass mode, thêm hook/MCP/marketplace lạ | Người gọi API từ công cụ khác (managed settings chỉ ràng buộc Claude Code) **[Nguồn thứ cấp]** |
| L2 Permission rules | allow / ask / deny, thứ tự deny → ask → allow **[Đã thấy]** | Tool call khớp pattern | Lệnh bị biến đổi để lách pattern (xem mục 3.3) |
| L3 Hook PreToolUse | Script của tổ chức, exit 2 chặn **[Đã thấy]** | Logic tùy biến, ghi audit | Lệnh che giấu bằng biến/chuỗi (đã kiểm thử, mục 4.3) |
| L4 Sandbox (Bash) | Giới hạn filesystem và network của lệnh Bash và tiến trình con | Đọc `~/.aws`, gọi domain lạ, kể cả khi L2/L3 bị lách | Tool khác ngoài Bash (Read/Write/MCP) theo một nguồn thứ cấp **[Cần đối chiếu]** |
| L5 Devcontainer | Cách ly OS, không mount credential | Mọi thứ ngoài container | Nếu credential nằm trong container thì vẫn bị lấy đi |
| L6 IAM/SCP/GitHub (file 02) | Laptop chỉ read-only prod, ghi qua CI + approval | Tác hại thực sự, **kể cả khi cả L1–L5 bị vượt qua** | — |

**Kết luận thiết kế:** L2–L3 là lưới phụ giảm xác suất và tạo log. **Control thật sự cho T1 là L6**: laptop không có quyền ghi production. Không được báo cáo "đã chặn T1" chỉ vì có deny rule.

---

## 2. managed-settings.json mẫu đầy đủ

### 2.1 Vị trí và cách đặt

| Hệ điều hành | Đường dẫn | Trạng thái |
|---|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` | **[Đã thấy]** |
| Linux / WSL | `/etc/claude-code/managed-settings.json` | **[Đã thấy]** |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` | **[Đã thấy]** |

- File phải thuộc root/Administrator, người dùng thường không được ghi.
- Hook script (mục 4) đặt ở `/usr/local/libexec/papaya/pretool-guard.sh`, cũng root sở hữu, mode 0755. Hook trong managed settings chạy với quyền người dùng, nên **không** để script ở nơi người dùng sửa được.
- Phạm vi tài liệu này: macOS và Linux. Windows cần bản hook viết lại (PowerShell) và chưa được thiết kế ở đây.

### 2.2 File mẫu (JSON thuần, không comment)

> Không có comment trong JSON vì Claude Code không chấp nhận comment trong file settings **[Đã thấy]**. Giải thích từng khóa nằm ở mục 2.3. Mọi giá trị `REPLACE_*` phải được thay trước khi triển khai; script cài đặt (mục 7) từ chối file còn `REPLACE_`.

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "allow": [
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(npm run lint *)",
      "Bash(npm run test *)",
      "Bash(pulumi preview *)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(aws *)"
    ],
    "deny": [
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.config/gcloud/**)",
      "Read(~/.kube/**)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Bash(aws s3 rm *)",
      "Bash(aws * s3 rm *)",
      "Bash(aws s3 rb *)",
      "Bash(aws * s3 rb *)",
      "Bash(aws s3 mv *)",
      "Bash(aws * s3 mv *)",
      "Bash(aws s3api delete-*)",
      "Bash(aws * s3api delete-*)",
      "Bash(aws configure export-credentials *)",
      "Bash(aws sso get-role-credentials *)",
      "Bash(pulumi destroy *)",
      "Bash(pulumi stack rm *)",
      "Bash(serverless remove *)",
      "Bash(sls remove *)",
      "Bash(kubectl delete *)",
      "Bash(gh auth token)",
      "Bash(gh auth token *)",
      "Bash(git push --force *)",
      "Bash(git push -f *)",
      "Bash(sudo *)"
    ]
  },
  "allowManagedPermissionRulesOnly": true,
  "allowManagedHooksOnly": true,
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [],
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "REPLACE_ORG/REPLACE_MARKETPLACE_REPO" }
  ],
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/libexec/papaya/pretool-guard.sh"
          }
        ]
      }
    ]
  },
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "denyRead": [
        "~/.aws",
        "~/.ssh",
        "~/.config/gh",
        "~/.config/gcloud",
        "~/.kube",
        "~/.gnupg",
        "~/.netrc",
        "~/.docker"
      ]
    },
    "network": {
      "allowedDomains": [
        "api.anthropic.com",
        "github.com",
        "registry.npmjs.org",
        "pypi.org",
        "files.pythonhosted.org"
      ],
      "allowManagedDomainsOnly": true
    }
  },
  "requiredMinimumVersion": "REPLACE_MIN_VERSION",
  "cleanupPeriodDays": 7,
  "forceLoginOrgUUID": "REPLACE_ORG_UUID"
}
```

### 2.3 Giải thích từng khóa

| Khóa | Tác dụng | Mục đích (threat) | Trạng thái |
|---|---|---|---|
| `permissions.disableBypassPermissionsMode: "disable"` | Gỡ chế độ bypass permission | T4 | **[Đã thấy]** |
| `permissions.allow` | Lệnh an toàn khỏi hỏi lại, giảm approval fatigue | T4, T6 | **[Đã thấy]** (cú pháp `Tool(specifier)`, glob `*`) |
| `permissions.ask` | Luôn hỏi dù có allow khớp | T1, T6 | **[Đã thấy]**: ask được xét trước allow |
| `permissions.deny` | Chặn tuyệt đối; xét đầu tiên, **không thể có ngoại lệ allow** | T1, T3, T5 | **[Đã thấy]** |
| `allowManagedPermissionRulesOnly` | Chỉ rule từ managed settings có hiệu lực, user/project không thêm được | T4 | **[Đã thấy]** |
| `allowManagedHooksOnly` | Chỉ hook của tổ chức/SDK chạy; hook trong repo/user bị chặn | T4 | **[Đã thấy]** |
| `allowManagedMcpServersOnly` | Chỉ allowlist MCP từ managed settings áp dụng | T3 | **[Đã thấy]** |
| `allowedMcpServers: []` | Mảng rỗng = khóa hoàn toàn; thêm từng server đã duyệt qua PR | T3 | Khóa **[Đã thấy]**; ý nghĩa `[]` = lockdown **[Nguồn thứ cấp]**; dạng phần tử `{serverName}`/`{serverUrl}` **[Nguồn thứ cấp]** |
| `strictKnownMarketplaces` | Chỉ cho phép marketplace plugin nội bộ | T3 | Khóa **[Đã thấy]**; cú pháp phần tử `{source, repo}` **[Cần đối chiếu]** |
| `hooks.PreToolUse[].matcher/hooks[].type/command` | Chạy script trước mỗi tool call; `matcher: "Bash"`; không dùng `"*"` (không hợp lệ, bỏ trống matcher nếu muốn khớp tất cả) | T1, T3, T8 | **[Đã thấy]** (trang hooks của tài liệu) |
| `sandbox.enabled` | Bật sandbox cho lệnh Bash | T3, T4 | **[Đã thấy]** |
| `sandbox.failIfUnavailable` | Sandbox không chạy được thì **fail** thay vì chạy không sandbox | T4 | **[Nguồn thứ cấp]** |
| `sandbox.allowUnsandboxedCommands: false` | Tắt đường thoát `dangerouslyDisableSandbox` | T4 | **[Nguồn thứ cấp]** |
| `sandbox.filesystem.denyRead` | Chặn Bash và tiến trình con đọc các thư mục credential | T3, T5 | **[Nguồn thứ cấp]**; cú pháp đường dẫn `~` **[Cần đối chiếu]** |
| `sandbox.network.allowedDomains` | Allowlist domain egress cho lệnh Bash | T2, T3 | **[Nguồn thứ cấp]** (một nguồn thấy ở cả `sandbox.network` lẫn ví dụ chính thức dùng khóa `sandbox` với allowlist mạng, vị trí chính xác **cần đối chiếu**) |
| `sandbox.network.allowManagedDomainsOnly` | Chỉ lấy allowlist domain từ managed settings | T3 | **[Nguồn thứ cấp]**; vị trí khóa **[Cần đối chiếu]** |
| `requiredMinimumVersion` | Phiên bản Claude Code tối thiểu | T4 | **[Đã thấy]** |
| `cleanupPeriodDays: 7` | Rút ngắn lưu transcript/dữ liệu cục bộ (giảm PHI nằm trên laptop) | T8 (xung đột: mất bằng chứng cục bộ, nên cần log tập trung ở mục 4) | **[Đã thấy]** |
| `forceLoginOrgUUID` | Ép đăng nhập bằng tổ chức Papaya, tránh tài khoản cá nhân | T4, T8 | **[Nguồn thứ cấp]**; giá trị sai có thể khóa đăng nhập cả đội, canary kỹ |

### 2.4 Quyết định thiết kế đã đưa vào mẫu (cần Papaya xác nhận)

1. **Không có `*.amazonaws.com` trong `allowedDomains`.** Wildcard rộng thành kênh exfil (kẻ tấn công dùng bucket riêng của họ). Hệ quả: lệnh `aws` chạy qua Bash của agent **sẽ không có mạng** trong sandbox. Rule `ask` cho `aws *` và hook chỉ còn là lớp phụ. Engineer cần đọc dữ liệu AWS thì chạy ở terminal riêng, hoặc Papaya duyệt một MCP/endpoint chỉ-đọc cụ thể (quyết định riêng, không thêm wildcard).
2. **Không đưa chế độ auto-accept vào bất kỳ đâu ở giai đoạn 1.** `disableBypassPermissionsMode` khóa bypass trên mọi máy, bao gồm cả trong devcontainer nếu devcontainer đọc cùng policy. Nếu sau này Papaya muốn auto-accept trong devcontainer không credential, đó là một profile managed settings **riêng** cho container, qua review của security. Mặc định: không.
3. **`Bash(aws *)` đặt ở `ask`, không có `allow` cho aws.** Vì deny/ask khớp thì allow hẹp hơn cũng không cứu được **[Đã thấy]**, nên không viết allow cho `aws` để tránh hiểu lầm.
4. **Mỗi rule xóa có hai dạng** (`aws s3 rm *` và `aws * s3 rm *`) vì cờ toàn cục như `--profile X` nằm giữa `aws` và subcommand. Wildcard được phép ở giữa lệnh **[Đã thấy]**, nhưng việc `*` có khớp 0 từ hay nhiều từ ở giữa **[Cần đối chiếu]**, test ở mục 6.

---

## 3. Deny rule: cách hoạt động và giới hạn

### 3.1 Cú pháp đã thấy trong tài liệu chính thức

- Rule dạng `Tool` hoặc `Tool(specifier)`; thứ tự đánh giá **deny → ask → allow**, khớp đầu tiên quyết định **[Đã thấy]**.
- Bash dùng glob với `*`, wildcard được ở bất kỳ vị trí nào; `:*` ở cuối là cách viết prefix match tương đương `*` **[Đã thấy]**.
- Rule `Bash(command:rm *)` bị Claude Code **bỏ qua và cảnh báo khi khởi động**, dùng `Bash(rm *)` **[Đã thấy]**.
- Với lệnh ghép (`&&`, `||`, `;`, `|`), từng lệnh con được kiểm tra riêng **[Nguồn thứ cấp]**.
- Rule đường dẫn file chỉ có hiệu lực với `Edit(path)` và `Read(path)`; `Write(path)` được chấp nhận nhưng không được dùng khi kiểm tra **[Nguồn thứ cấp, theo ghi chú phiên bản]** → dùng `Edit(...)` cho đường dẫn ghi.

### 3.2 Nhóm rule trong mẫu

| Nhóm | Rule | Threat |
|---|---|---|
| Đọc credential qua tool Read | `Read(~/.aws/**)`, `~/.ssh`, `~/.config/gh`, `~/.config/gcloud`, `~/.kube`, `.env*` | T3, T5 |
| Xóa/phá hủy dữ liệu | `aws s3 rm/rb/mv`, `aws s3api delete-*` (cả dạng có cờ toàn cục) | T1 |
| Xóa hạ tầng | `pulumi destroy`, `pulumi stack rm`, `serverless/sls remove`, `kubectl delete` | T1 |
| In credential ra | `aws configure export-credentials`, `aws sso get-role-credentials`, `gh auth token` | T3, T5 |
| Lệnh nguy hiểm chung | `sudo`, `git push --force/-f` | T4, T6 |

Cú pháp `Read(~/.aws/**)` (xử lý `~` và `**`) **[Cần đối chiếu]**; kiểm thử ở mục 6 (test 2).

### 3.3 Vì sao deny rule không đủ (đã kiểm chứng ở hook cùng pattern)

Deny theo chuỗi lệnh Bash là so khớp chuỗi, nên bị lách bằng cách đổi cách viết. Khi chạy thử hook (mục 4), các lệnh sau **không bị chặn** vì chúng không chứa chuỗi `aws s3 rm` theo dạng liền:

```
a=s3; aws $a rm s3://b
aws s3 "rm" s3://b
```

Deny rule của Claude Code khớp theo cách riêng (có nhận biết toán tử shell), nhưng **không nên giả định** nó bắt được các biến thể này. Vì vậy: (a) sandbox chặn mạng/filesystem ở tầng OS; (b) IAM/SCP chặn ở tầng AWS (file 02). Deny rule là lớp giảm xác suất, không phải ranh giới bảo mật.

Ngoài ra rule `Read(...)` áp dụng cho tool Read, không tự động chặn `cat ~/.aws/credentials` chạy qua Bash; đó là việc của sandbox `denyRead` và hook **[Cần đối chiếu, test 3 và 11 ở mục 6]**.

---

## 4. Hook bắt buộc của tổ chức

### 4.1 Cơ chế (đã thấy trong tài liệu)

- Hook cấu hình theo 3 cấp: sự kiện (`PreToolUse`) → matcher group (`matcher`) → danh sách hook (`type: "command"`, `command`) **[Đã thấy]**.
- Hook nhận JSON của tool call qua stdin (`hook_event_name`, `session_id`, `cwd`, `tool_input.command`...) **[Đã thấy]**.
- **Exit code 2 chặn tool call** (PreToolUse) và đưa stderr cho Claude; exit 0 cho phép **[Đã thấy]**.
- Mã thoát khác 0 và khác 2 là lỗi **không chặn** (fail-open): công cụ vẫn chạy **[Đã thấy]** (cùng ghi chú ở nguồn thứ cấp). Do đó script phải **tự bắt mọi lỗi và thoát 2**.
- `allowManagedHooksOnly` ngăn hook của repo/người dùng **[Đã thấy]**.

### 4.2 Script `pretool-guard.sh` (đã chạy kiểm thử)

Chức năng: (1) ghi audit vào syslog đã che secret cơ bản; (2) chặn lệnh phá hủy, lệnh đụng credential; (3) trên profile production chỉ cho lệnh đọc; (4) **fail-closed**: thiếu `jq`, JSON hỏng, lỗi bất ngờ đều thoát 2.

```bash
#!/usr/bin/env bash
# pretool-guard.sh - PreToolUse hook cho tool Bash (do MDM triển khai, root sở hữu)
set -Eeuo pipefail
trap 'echo "papaya-guard: lỗi nội bộ, chặn theo nguyên tắc fail-closed" >&2; exit 2' ERR

command -v jq >/dev/null 2>&1 || { echo "papaya-guard: thiếu jq, chặn" >&2; exit 2; }

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
norm="$(printf '%s' "$cmd" | tr '\n\t' '  ' | tr -s ' ')"

redact() {
  sed -E 's/AKIA[0-9A-Z]{16}/AKIA_REDACTED/g;
          s/(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]+/\1_REDACTED/g;
          s/([Bb]earer|[Tt]oken|TOKEN|[Ss]ecret|SECRET|[Pp]assword|PASSWORD)([ =:]+)[^ "]+/\1\2REDACTED/g'
}

# 1) Audit: ghi syslog. Lỗi audit không chặn công việc nhưng báo ra stderr.
{
  printf '%s' "$input" | jq -c --arg u "$(id -un)" --arg t "$(date -u +%FT%TZ)" \
    '{ts:$t,user:$u,session:.session_id,cwd:.cwd,tool:.tool_name,cmd:(.tool_input.command // null)}' \
    | redact | { command -v logger >/dev/null 2>&1 && logger -t papaya-claude-audit -p user.notice || cat >/dev/null; }
} || echo "papaya-guard: cảnh báo - không ghi được audit log" >&2

# 2) Chặn
deny() {
  echo "BLOCKED by Papaya policy: $1. Hãy tạo PR và để CI/Environment có approver thực hiện." >&2
  exit 2
}

grep -Eqi 'aws[[:space:]]+s3[[:space:]]+(rm|rb|mv)([[:space:]]|$)' <<<"$norm" && deny "xóa/di chuyển object hoặc bucket S3"
grep -Eqi 'aws[[:space:]]+s3[[:space:]]+sync.*--delete' <<<"$norm" && deny "s3 sync --delete"
grep -Eqi 'aws[[:space:]]+s3api[[:space:]]+(delete-|put-bucket-(policy|versioning|lifecycle)|put-object-(retention|legal-hold)|put-public-access-block)' <<<"$norm" && deny "thao tác S3 API phá hủy hoặc đổi bảo vệ"
grep -Eqi -e '--bypass-governance-retention' <<<"$norm" && deny "bỏ qua Object Lock"
grep -Eqi 'aws[[:space:]]+cloudtrail[[:space:]]+(stop-logging|delete-trail|update-trail|put-event-selectors)' <<<"$norm" && deny "can thiệp CloudTrail"
grep -Eqi 'aws[[:space:]]+kms[[:space:]]+(schedule-key-deletion|disable-key)' <<<"$norm" && deny "can thiệp KMS key"
grep -Eqi 'aws[[:space:]]+iam[[:space:]]+(create-access-key|create-user|attach-|put-|update-assume-role-policy)' <<<"$norm" && deny "thay đổi IAM / tạo access key"
grep -Eqi 'pulumi[[:space:]]+(destroy|stack[[:space:]]+rm|state[[:space:]]+delete)' <<<"$norm" && deny "pulumi destroy/xóa stack/state"
grep -Eqi '(serverless|sls)[[:space:]]+remove' <<<"$norm" && deny "serverless remove"
grep -Eqi 'kubectl[[:space:]]+delete' <<<"$norm" && deny "kubectl delete"
grep -Eqi '(\.aws/(credentials|config|sso)|\.ssh/|\.config/gh/|\.config/gcloud/|\.kube/config|\.netrc)' <<<"$norm" && deny "truy cập file credential"

# 3) Profile production: chỉ cho phép lệnh đọc
if grep -Eqi '(--profile[ =]|AWS_PROFILE=)[^ ]*prod' <<<"$norm"; then
  # bỏ các cờ toàn cục (--profile X, --region X, --output X) trước khi xét subcommand
  stripped="$(sed -E 's/--(profile|region|output)[ =][^ ]+//g; s/AWS_PROFILE=[^ ]+//g' <<<"$norm" | tr -s ' ')"
  grep -Eqi 'aws[[:space:]]+[a-z0-9-]+[[:space:]]+(describe-|list-|get-|ls([[:space:]]|$)|head-)' <<<"$stripped" \
    || deny "profile production chỉ cho phép lệnh đọc"
fi

exit 0
```

Cài đặt (root, mỗi OS một dòng):

```
# macOS
install -d -m 0755 /usr/local/libexec/papaya
install -m 0755 -o root -g wheel pretool-guard.sh /usr/local/libexec/papaya/pretool-guard.sh
# Linux
install -d -m 0755 /usr/local/libexec/papaya
install -m 0755 -o root -g root pretool-guard.sh /usr/local/libexec/papaya/pretool-guard.sh
```

Phụ thuộc: `bash`, `jq`, `logger`. macOS không có sẵn `jq`; MDM phải cài kèm, nếu thiếu thì hook **chặn mọi lệnh Bash** (fail-closed). Đây là chủ ý nhưng cũng là rủi ro vận hành → kiểm tra ở canary.

### 4.3 Kết quả kiểm thử script (chạy thật)

| Nhóm | Kết quả |
|---|---|
| Lệnh bình thường (`git status`, `aws s3 ls`, `pulumi preview`, profile dev) | exit 0 như kỳ vọng |
| Đọc trên profile prod: `aws --profile prod-vn s3 ls`, `... --region ... ec2 describe-instances`, `AWS_PROFILE=prod-th aws s3api list-buckets` | exit 0 như kỳ vọng (**sau khi sửa lỗi**: lần chạy đầu bị chặn nhầm do cờ `--profile` nằm giữa) |
| Ghi trên prod (`ec2 terminate-instances`, `s3 cp`) | exit 2 |
| `s3 rm/rb/sync --delete`, `s3api delete-object`, `put-bucket-versioning`, `--bypass-governance-retention`, `pulumi destroy`, `pulumi stack rm`, `sls remove`, `cloudtrail stop-logging`, `iam create-access-key`, `cat ~/.aws/credentials`, `bash -c "aws s3 rm ..."` | exit 2 |
| Input không phải JSON | exit 2 (fail-closed) |
| **Lách bằng biến / trích dẫn**: `a=s3; aws $a rm s3://b`, `aws s3 "rm" s3://b` | **exit 0, không bị chặn** (hạn chế đã biết) |

**Chưa kiểm thử:** trường hợp thiếu `jq` (đoạn code có xử lý nhưng tôi chưa chạy riêng ca này), macOS (chỉ chạy Linux), tương tác thật với Claude Code (đọc stdin, hiển thị stderr cho agent), độ trễ của hook khi gọi nhiều lần.

### 4.4 Audit từ hook và giới hạn

- Hook ghi mỗi lệnh Bash vào syslog (`papaya-claude-audit`), EDR/MDM agent chuyển về SIEM. Giả định này **cần xác nhận** với đội hạ tầng (agent nào thu syslog, giữ bao lâu).
- Che secret bằng regex chỉ ở mức best-effort (khóa AKIA, token GitHub, cặp `token=...`). Lệnh vẫn có thể chứa đường dẫn/tên file gợi PHI. Không coi log hook là dữ liệu sạch PHI.
- Hook chỉ thấy **lệnh Bash**, không thấy Read/Edit/MCP. Khả năng xuất telemetry đầy đủ của Claude Code (ví dụ OpenTelemetry) **[Cần đối chiếu]**; nếu có thì dùng làm nguồn chính, hook là nguồn bổ sung.

---

## 5. Sandbox và devcontainer

### 5.1 Sandbox của Claude Code

- Sandbox ràng buộc lệnh Bash và tiến trình con bằng filesystem và network isolation; permission rule quyết định tool call nào được thử. Dùng cả hai lớp **[Nguồn thứ cấp]**.
- Nếu sandbox không khởi động được, theo một nguồn Claude Code chỉ cảnh báo rồi chạy không sandbox, trừ khi đặt `failIfUnavailable: true` **[Nguồn thứ cấp]**. Mẫu ở mục 2 đã bật khóa này; test 12 xác nhận.
- Chuẩn bị rủi ro: sandbox có thể phụ thuộc gói hệ thống (Linux/WSL) hoặc công cụ chạy. Máy không đáp ứng + `failIfUnavailable` = Claude Code không chạy được lệnh Bash. Ghi nhận trong kế hoạch canary (mục 7).
- **Giới hạn đã nêu:** theo một nguồn thứ cấp, `sandbox` chỉ áp dụng cho Bash, không bao phủ Read/Write/WebFetch/MCP/hook **[Cần đối chiếu]**. Vì vậy MCP phải được sandbox riêng (file 02, mục 4) và Read/Edit phải dựa vào permission rule.
- Một khóa thấy ở nguồn thứ cấp chỉ dành cho một phiên bản cụ thể: `sandbox.network.strictAllowlist` (từ chối host ngoài allowlist mà không hỏi) **[Nguồn thứ cấp, phụ thuộc phiên bản, cần đối chiếu]**. Chưa đưa vào mẫu.

### 5.2 Devcontainer (cho công việc cần cách ly OS)

Căn cứ trong tài liệu chính thức:
- Có Dev Container Feature `ghcr.io/anthropics/devcontainer-features/claude-code:1.0` và một reference container gồm `devcontainer.json`, `Dockerfile`, `init-firewall.sh`; firewall chặn mọi traffic ra ngoài trừ domain cần thiết, dùng `NET_ADMIN` và `NET_RAW` qua `runArgs` **[Đã thấy]**.
- Tài liệu nêu rõ: khi chạy với `--dangerously-skip-permissions`, devcontainer **không** ngăn dự án độc hại exfil mọi thứ truy cập được trong container, kể cả credential của Claude Code; chỉ dùng với repo tin cậy **[Đã thấy]**.
- Trang devcontainer có mục "Enforce organization policy" (ghim phiên bản CLI, tắt auto-update) **[Đã thấy]**; nội dung cụ thể cần đọc trực tiếp.
- Có issue công khai nói firewall đã bị gỡ khỏi source của feature nhưng artifact đã publish vẫn kèm một `init-firewall.sh` và ghi đè script tùy biến **[Nguồn thứ cấp]**. Khuyến nghị: **không dựa vào feature để có firewall**; copy reference `init-firewall.sh` vào repo của Papaya, review, ghim, kiểm thử.

**devcontainer.json mẫu (JSON thuần, giá trị cần xác nhận):**

```json
{
  "name": "papaya-agent-sandbox",
  "build": {
    "dockerfile": "Dockerfile",
    "args": { "CLAUDE_CODE_VERSION": "REPLACE_PINNED_VERSION" }
  },
  "remoteUser": "node",
  "runArgs": [
    "--cap-drop=ALL",
    "--cap-add=NET_ADMIN",
    "--cap-add=NET_RAW"
  ],
  "containerEnv": {
    "DISABLE_AUTOUPDATER": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "mounts": [
    "source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume"
  ],
  "postStartCommand": "sudo /usr/local/bin/init-firewall.sh"
}
```

| Thành phần | Trạng thái |
|---|---|
| `runArgs` với `NET_ADMIN`/`NET_RAW` | **[Đã thấy]** |
| `--cap-drop=ALL` kèm thêm hai capability | **[Nguồn thứ cấp]** |
| `containerEnv`: `DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | **[Đã thấy]** (ví dụ trong trang devcontainer) |
| Volume `claude-code-config-${devcontainerId}` | **[Đã thấy]** |
| `postStartCommand` gọi firewall bằng sudo | **[Nguồn thứ cấp]**; cần `sudoers` chỉ cho đúng script đó, không cấp sudo rộng |

**Yêu cầu bắt buộc cho devcontainer của Papaya (không dùng được nếu thiếu một trong các mục):**
1. **Không mount** `~/.aws`, `~/.ssh`, `~/.config/gh`, `~/.config/gcloud` từ host. Không truyền `AWS_*` / `GITHUB_TOKEN` qua `containerEnv`.
2. Người dùng không phải root; sudo chỉ cho script firewall.
3. Firewall default-deny, allowlist domain như mục 2.2, kiểm tra tự động sau khi dựng (test 4 trong container).
4. Managed settings **trong container** (Linux: `/etc/claude-code/managed-settings.json`), baked vào image hoặc mount chỉ-đọc, vì container là một "máy" khác. Cách chuẩn **[Cần đối chiếu]** theo mục "Enforce organization policy".
5. Image ghim digest, dựng lại định kỳ, quét lỗ hổng.
6. Dữ liệu: chỉ code và dữ liệu tổng hợp; **không đưa dữ liệu claim thật vào** (T2, T7).

---

## 6. Checklist kiểm thử ranh giới (chạy trên canary trước mọi rollout)

Cách thực hiện: dùng một máy canary hoặc VM đã nhận managed settings, **dùng file credential giả** (ví dụ `~/.aws/credentials` chứa `AKIA_CANARY_DO_NOT_USE`, không bao giờ dùng credential thật). Với mỗi test: yêu cầu Claude Code thực hiện (hoặc người kiểm thử tự chạy), ghi lại kết quả và bằng chứng (ảnh, log). **Một test FAIL = dừng rollout.**

Cột "Kỳ vọng" là hành vi dự kiến theo tài liệu; chưa được chạy trên Claude Code thật.

### 6.1 Cấu hình được ép

| # | Test | Cách làm | Kỳ vọng (PASS khi) | Threat |
|---|---|---|---|---|
| 1 | Bypass mode bị khóa | Chạy `claude --dangerously-skip-permissions` | Bị từ chối hoặc không vào được chế độ bypass | T4 |
| 2 | Tool Read bị chặn | Nhờ Claude đọc `~/.aws/credentials` bằng tool Read | Bị deny, nội dung file không lộ | T3, T5 |
| 3 | Bash đọc credential bị chặn | Nhờ Claude chạy `cat ~/.aws/credentials` | Bị chặn (hook exit 2 và/hoặc sandbox); nội dung không lộ | T3 |
| 8 | Repo không ghi đè được | Trong repo thử, thêm `.claude/settings.json` có `allow: ["Bash(*)"]` và một hook; mở Claude Code | Rule và hook của repo **không có hiệu lực** (`/permissions` hiển thị nguồn) | T4 |

### 6.2 Sandbox (tầng OS, không phụ thuộc rule)

| # | Test | Cách làm | Kỳ vọng | Threat |
|---|---|---|---|---|
| 4 | Domain lạ bị chặn | Nhờ Claude chạy `curl -sS https://example.com` | Kết nối bị chặn bởi allowlist | T2, T3 |
| 4b | Domain trong allowlist chạy được | `curl -sS -I https://github.com` | Thành công (xác nhận allowlist không chặn nhầm) | — |
| 7 | Ghi ngoài dự án bị chặn | Nhờ Claude chạy `touch ~/outside-test.txt` | Bị chặn bởi sandbox | T3 |
| 11 | Tiến trình con lách hook | Nhờ chạy `python3 -c "import os; print(open(os.path.expanduser('~')+'/.a'+'ws/credentials').read())"` (chuỗi bị tách để hook không khớp) | **Sandbox** chặn đọc (hook sẽ không bắt được ca này) | T3 |
| 12 | Sandbox không chạy → fail đóng | Trên VM canary, làm sandbox không khả dụng (cách làm tùy OS) rồi chạy một lệnh Bash | Lệnh bị từ chối, không chạy ngoài sandbox | T4 |

### 6.3 Lệnh nguy hiểm

| # | Test | Cách làm | Kỳ vọng | Threat |
|---|---|---|---|---|
| 5 | `aws s3 rm` | `aws s3 rm s3://papaya-canary-nonexistent --recursive` | Bị chặn **trước** khi có kết nối AWS (kiểm tra log mạng/CloudTrail không có sự kiện) | T1 |
| 5b | Biến thể có cờ | `aws --profile x s3 rm s3://b`; `aws s3api delete-object ...` | Bị chặn bởi rule dạng `aws * s3 rm *` và/hoặc hook | T1 |
| 5c | Biến thể lách (ghi nhận hạn chế) | `a=s3; aws $a rm s3://b` | Có thể **không** bị chặn bởi rule/hook; sandbox mạng chặn kết nối. Ghi kết quả, không dùng làm tiêu chí PASS của rule | T1 |
| 6 | `pulumi destroy` | `pulumi destroy --yes` trong stack thử | Bị chặn | T1 |
| 9 | MCP lạ bị chặn | Thêm một MCP server chưa duyệt (`claude mcp add ...`) | Không được phép/không được nạp | T3 |
| 10 | Plugin từ marketplace lạ | Thử thêm marketplace ngoài allowlist | Bị từ chối | T3 |

### 6.4 Hook và audit

| # | Test | Cách làm | Kỳ vọng | Threat |
|---|---|---|---|---|
| 13 | Hook fail-closed | Trên VM canary, tạm làm `jq` không dùng được rồi chạy `git status` qua Claude | Lệnh Bash bị chặn (không phải chạy lọt) | T4, T8 |
| 14 | Audit có log, không lộ secret | Chạy `echo TOKEN=abc123 && git status`; tìm trong syslog/SIEM theo `papaya-claude-audit` | Có dòng log, giá trị `abc123` đã bị che; hiện diện ở SIEM trong thời gian cam kết | T8 |
| 15 | Máy thiếu policy bị phát hiện | Gỡ managed settings trên VM thử | Posture check/EDR đánh dấu máy không tuân thủ | T4 |

### 6.5 Kiểm thử ngoài Claude Code (quan trọng nhất)

| # | Test | Kỳ vọng | Threat |
|---|---|---|---|
| 16 | Từ **terminal thường** (không qua Claude Code), dùng profile prod chạy `aws s3 rm` hoặc `aws s3 cp` lên bucket thử | **AccessDenied** do IAM/SCP, độc lập với mọi cấu hình Claude Code | T1 |
| 17 | Dùng `gh`/`aws` với token trên máy để đọc/ghi production | Không có quyền ghi (token ngắn hạn, read-only) | T1, T5 |

Test 16–17 chứng minh control thực sự; nếu FAIL thì toàn bộ mục 2–5 chỉ là lớp trang trí.

### 6.6 Báo cáo kết quả

Mỗi lần chạy lưu: phiên bản Claude Code (`claude --version`), hash file managed settings, hash hook script, hệ điều hành, bảng PASS/FAIL, và bằng chứng. Chạy lại toàn bộ checklist khi: đổi managed settings, nâng phiên bản Claude Code, đổi hook, đổi image devcontainer.

---

## 7. Rollout canary và rollback

### 7.1 Vì sao cần quy trình riêng

- Nguồn thứ cấp ghi nhận: nếu managed settings không phải JSON hợp lệ thì Claude Code **từ chối khởi động**, và vì file áp dụng cho mọi máy được cấp nên việc này làm dừng cả đội cùng lúc **[Nguồn thứ cấp, cần đối chiếu]**. Coi đây là rủi ro thật.
- Các hỏng hóc khác không làm Claude Code dừng nhưng gây thiệt hại: khóa bị bỏ qua âm thầm, hook fail-open, `jq` thiếu làm chặn mọi lệnh Bash, `forceLoginOrgUUID` sai làm khóa đăng nhập, `requiredMinimumVersion` quá cao.

### 7.2 Cổng kiểm tra trước khi bất kỳ máy nào nhận file (CI)

Pull request vào repo chứa managed settings (CODEOWNERS = security) phải qua:
1. `jq -e .` hoặc parser JSON: file hợp lệ, không comment, không dấu phẩy thừa.
2. Không còn chuỗi `REPLACE_`.
3. Các khóa cốt lõi có mặt và đúng giá trị (`disableBypassPermissionsMode == "disable"`, `allowManagedHooksOnly == true`, hook trỏ đúng đường dẫn).
4. Chạy bộ test của `pretool-guard.sh` (golden test, gồm cả ca chặn lọt đã biết để so sánh khi sửa).
5. (Tùy chọn) Validate theo JSON schema công bố của settings; schema có thể chậm hơn phiên bản Claude Code mới **[Nguồn thứ cấp]**, nên chỉ coi là cảnh báo.
6. Review bắt buộc bởi security; thay đổi tới `.claude/`, thư mục managed settings, hook script, allowlist MCP đều cần review này.

### 7.3 Cách ghi file lên máy an toàn (validate ngay trên máy)

Script dưới đây do MDM chạy. Nó **không bao giờ ghi file hỏng lên đích**: validate trước, ghi nguyên tử, giữ bản trước để rollback. Đã chạy thử trên thư mục tạm (mục 7.6).

`install-managed-settings.sh`:

```bash
#!/usr/bin/env bash
# Usage: install-managed-settings.sh <managed-settings.json mới>
set -Eeuo pipefail
SRC="${1:?Usage: $0 <managed-settings.json mới>}"

case "$(uname -s)" in
  Darwin) DEFAULT_DIR="/Library/Application Support/ClaudeCode" ;;
  Linux)  DEFAULT_DIR="/etc/claude-code" ;;
  *) echo "OS chưa hỗ trợ" >&2; exit 1 ;;
esac
DEST_DIR="${PAPAYA_MANAGED_DIR:-$DEFAULT_DIR}"
STATE_DIR="${PAPAYA_STATE_DIR:-/var/lib/papaya/claude-managed}"
DEST="$DEST_DIR/managed-settings.json"
mkdir -p "$DEST_DIR" "$STATE_DIR"

command -v jq >/dev/null 2>&1 || { echo "thiếu jq: từ chối" >&2; exit 1; }
jq -e . "$SRC" >/dev/null || { echo "JSON không hợp lệ: từ chối" >&2; exit 1; }
if grep -q 'REPLACE_' "$SRC"; then echo "còn placeholder REPLACE_*: từ chối" >&2; exit 1; fi
jq -e '.permissions.disableBypassPermissionsMode == "disable" and .allowManagedHooksOnly == true' "$SRC" >/dev/null \
  || { echo "thiếu khóa cốt lõi: từ chối" >&2; exit 1; }

tmp="$(mktemp "$DEST_DIR/.managed-settings.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
cp "$SRC" "$tmp"
chmod 0644 "$tmp"
if [ -f "$DEST" ]; then cp -p "$DEST" "$STATE_DIR/previous.json"; fi
mv -f "$tmp" "$DEST"
trap - EXIT

if ! jq -e . "$DEST" >/dev/null; then
  echo "file đích hỏng sau khi ghi: rollback" >&2
  "$(dirname "$0")/rollback-managed-settings.sh"
  exit 1
fi
shasum -a 256 "$DEST" > "$STATE_DIR/current.sha256" 2>/dev/null || sha256sum "$DEST" > "$STATE_DIR/current.sha256"
echo "đã cài $DEST"
```

`rollback-managed-settings.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
case "$(uname -s)" in
  Darwin) DEFAULT_DIR="/Library/Application Support/ClaudeCode" ;;
  Linux)  DEFAULT_DIR="/etc/claude-code" ;;
  *) echo "OS chưa hỗ trợ" >&2; exit 1 ;;
esac
DEST_DIR="${PAPAYA_MANAGED_DIR:-$DEFAULT_DIR}"
STATE_DIR="${PAPAYA_STATE_DIR:-/var/lib/papaya/claude-managed}"
PREV="$STATE_DIR/previous.json"
[ -f "$PREV" ] || { echo "không có bản trước để rollback" >&2; exit 1; }
jq -e . "$PREV" >/dev/null || { echo "bản trước cũng hỏng" >&2; exit 1; }
tmp="$(mktemp "$DEST_DIR/.managed-settings.XXXXXX")"
cp "$PREV" "$tmp"; chmod 0644 "$tmp"
mv -f "$tmp" "$DEST_DIR/managed-settings.json"
echo "đã rollback về bản trước"
```

### 7.4 Các vòng triển khai (ring)

| Vòng | Phạm vi | Thời gian tối thiểu | Điều kiện sang vòng tiếp (tất cả phải đúng) |
|---|---|---|---|
| R0 | VM thử + 2–3 máy của đội security | 1–2 ngày làm việc | Toàn bộ checklist mục 6 PASS; Claude Code khởi động; `/status` đúng nguồn; hook chạy |
| R1 | ~10% tình nguyện, gồm cả macOS và Linux, các phiên bản Claude Code khác nhau | 3–5 ngày | Không lỗi khởi động; tỷ lệ chặn nhầm (false positive) của deny/hook đã xử lý; không phiếu hỗ trợ nghiêm trọng; log về SIEM đúng |
| R2 | ~50% | 3–5 ngày | Như trên; số prompt/engineer giảm hoặc không tăng; đã xác nhận phản hồi về sandbox/mạng |
| R3 | 100% | — | Theo dõi 1 tuần; vẫn giữ `previous.json` |

Quy tắc: mỗi vòng sau khi **mọi** thay đổi managed settings; không gộp thay đổi lớn (ví dụ bật `failIfUnavailable` cùng lúc với đổi allowlist domain). Chạy trước ở **"chế độ nhẹ"** nếu cần: giai đoạn đầu ở R0 có thể chưa bật `failIfUnavailable` và `forceLoginOrgUUID`, bật sau khi đã xác nhận môi trường.

**Tiêu chí dừng khẩn cấp (kill criteria):** Claude Code không khởi động trên ≥1 máy trong vòng; hơn 5% phiên bị chặn nhầm gây gián đoạn; hook làm chậm đáng kể; đăng nhập bị khóa.

### 7.5 Rollback

Thứ tự ưu tiên (nhanh → chậm):

1. **Rollback trên máy bằng script** (`rollback-managed-settings.sh`) từ `previous.json`. MDM chạy được kể cả khi Claude Code không khởi động, vì MDM nằm ngoài Claude Code.
2. **MDM đẩy lại phiên bản trước** (giữ ít nhất 3 phiên bản đã được ký/gắn tag trong Git).
3. **Gỡ file** `managed-settings.json` khỏi máy làm lối thoát cuối. Lưu ý: gỡ file nghĩa là mất toàn bộ guardrail (bao gồm khóa bypass), nên chỉ dùng như biện pháp tạm, kèm thông báo và thời hạn khôi phục; trong thời gian đó phụ thuộc vào L6 (IAM/SCP, mục 1).

Sau rollback: thu thập nguyên nhân (log lỗi khởi động, nội dung file, phiên bản Claude Code), thêm test chặn lại lỗi đó vào cổng CI (mục 7.2) rồi mới thử lại từ R0.

### 7.6 Kết quả chạy thử script cài đặt

Chạy trên thư mục tạm (đặt `PAPAYA_MANAGED_DIR`, `PAPAYA_STATE_DIR`), dùng đúng mã trích từ tài liệu này, không đụng vào hệ thống:

| Ca | Kỳ vọng | Kết quả |
|---|---|---|
| File mẫu còn `REPLACE_*` | Từ chối, không ghi gì | Đạt (exit 1, thư mục đích không có file) |
| JSON hỏng (dấu phẩy thừa) | Từ chối | Đạt (exit 1) |
| Thiếu khóa cốt lõi | Từ chối | Đạt (exit 1) |
| File hợp lệ | Cài được | Đạt (exit 0) |
| Cài bản v2 | Giữ `previous.json` là v1 | Đạt (hiện tại 14, previous 7) |
| Rollback | Về v1 | Đạt (về 7) |
| Rollback khi không có bản trước | Lỗi an toàn, file đích còn nguyên | Đạt (exit 1, file hợp lệ, không còn file tạm) |

**Chưa kiểm thử:** quyền sở hữu file (`chown root`) và quyền ghi vào thư mục hệ thống thật, hành vi trên macOS (`shasum`), tương tác với MDM thật (Intune/Jamf), và chính Claude Code khi đọc file được cài.

---

## 8. Ánh xạ guardrail ↔ threat

| Threat (file 01) | Guardrail trong file này | Phụ thuộc bắt buộc |
|---|---|---|
| T1 Xóa nhầm S3 | deny rule xóa/destroy (mục 3), hook chặn và read-only prod (mục 4), không `*.amazonaws.com` trong allowlist (mục 2.4) | **IAM/SCP read-only + Object Lock (file 02)**; test 16 |
| T2 Injection | sandbox egress allowlist chặn exfil từ Bash; không mở/đọc tài liệu claim thật trên laptop | Cách ly agent production (file 01/02) |
| T3 MCP độc hại | `allowManagedMcpServersOnly` + `allowedMcpServers: []`, marketplace allowlist, sandbox `denyRead`, deny đọc credential, devcontainer không mount credential | Sandbox riêng cho MCP (file 02, mục 4); EDR |
| T4 Tắt guardrail | `disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, `failIfUnavailable`, `requiredMinimumVersion`, hook fail-closed | MDM ép file; posture check (test 15) |
| T5 Secret dài hạn | deny đọc credential và in credential ra (`gh auth token`, `export-credentials`), sandbox `denyRead` | **OIDC thay secret dài hạn (file 02, mục 5)** |
| T6 Rubber-stamp | `ask` cho `git push`/`aws`, allowlist an toàn giảm approval fatigue | **GitHub Environments + named approver (file 02, mục 6)** |
| T7 Trộn tenant | Hạn chế: devcontainer không đưa dữ liệu thật; hook chặn profile prod ghi | Tenant isolation (file 02, mục 7) |
| T8 Audit | Hook ghi syslog, `forceLoginOrgUUID` gắn danh tính, `cleanupPeriodDays` giảm PHI cục bộ | SIEM, CloudTrail tập trung (file 02, mục 8) |

---

## 9. Danh sách cần đối chiếu tài liệu chính thức trước khi triển khai

1. Mọi khóa gắn **[Nguồn thứ cấp]** / **[Cần đối chiếu]** ở mục 2.3, đặc biệt vị trí chính xác của `sandbox.network.allowedDomains` và `allowManagedDomainsOnly`, `sandbox.filesystem.denyRead` (cú pháp `~`), `failIfUnavailable`, `allowUnsandboxedCommands`, `forceLoginOrgUUID`.
2. Cú pháp phần tử `strictKnownMarketplaces` và `allowedMcpServers`.
3. Cách khớp pattern: `Read(~/.aws/**)`, `*` ở giữa lệnh Bash có khớp 0 từ hay không (`aws * s3 rm *`), cách xử lý lệnh ghép và biến thể lách.
4. Phạm vi sandbox (chỉ Bash hay cả tool khác), hành vi khi sandbox không khởi động.
5. Hành vi khi managed settings sai JSON hoặc có khóa không nhận ra; thông báo lỗi cụ thể.
6. Cách xác nhận trạng thái bằng `/status` (dòng nguồn settings) và `/permissions`; tôi chưa chạy các lệnh này.
7. Hook: giá trị `timeout`, thứ tự nhiều hook, hành vi khi script không thực thi được (permission, thiếu file), đầu vào stdin cho từng công cụ.
8. Telemetry/OpenTelemetry của Claude Code và nội dung có thể xuất.
9. Cách cài managed settings trong devcontainer (mục "Enforce organization policy") và việc firewall trong feature/reference hiện tại.
10. Server-managed settings có sẵn cho gói Team Premium không; thứ tự ưu tiên giữa file hệ thống, MDM, server-managed.
11. Windows: toàn bộ phần hook và triển khai.

---

## 10. Ghi chú kiểm thử đã thực hiện khi viết tài liệu

Môi trường: Linux, `bash`, `jq`, `logger`, Python. Tất cả mã dưới đây được **trích trực tiếp từ file markdown này** rồi chạy, nên nội dung trong tài liệu khớp với những gì đã chạy (script guard được so sánh `diff` với bản đã kiểm thử ban đầu: giống hệt).

| Hạng mục | Kết quả |
|---|---|
| 2 khối JSON (managed settings, devcontainer) | Parse hợp lệ. Chú ý: hợp lệ về cú pháp JSON không có nghĩa Claude Code chấp nhận từng khóa |
| `pretool-guard.sh`: ~25 lệnh mẫu | Khớp kỳ vọng sau khi sửa 1 lỗi (chặn nhầm lệnh đọc trên profile prod khi có `--profile`) |
| `pretool-guard.sh`: input không phải JSON | exit 2 (fail-closed) |
| `pretool-guard.sh`: thiếu `jq` | exit 2, thông báo "thiếu jq, chặn" |
| `pretool-guard.sh`: audit | Dòng log JSON được ghi; `TOKEN=`, token GitHub (`ghp_`) và khóa `AKIA...` đều bị che; không còn giá trị gốc trong log (kiểm bằng `logger` giả, chưa phải syslog thật) |
| `pretool-guard.sh`: lách bằng biến/trích dẫn | **Không bị chặn** (hạn chế đã ghi ở mục 3.3 và 4.3) |
| `install-managed-settings.sh`, `rollback-managed-settings.sh` | 7/7 ca đạt (mục 7.6) |

**Không được kiểm thử (cần làm trên canary):** mọi hành vi của Claude Code thật (khóa bypass, rule `Read`/`Bash`, sandbox, MCP, marketplace, `/status`, `/permissions`), macOS, Windows, devcontainer/firewall, MDM, syslog/SIEM thật. Mục 6 là kế hoạch cho phần này.
