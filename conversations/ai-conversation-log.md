# AI Conversation Log - Papaya DevSecOps Challenge 1

## Thông tin chung

- **Ứng viên:** Nguyen Duy Phuong
- **Repo nộp bài:** https://github.com/duyphuong82/papaya-devsecops-challenge
- **Challenge:** DevSecOps Challenge 1 - Papaya Insurtech
- **Link đề bài:** https://github.com/papaya-insurtech/pumpkin/blob/main/Hiring/DevSecOps_Challenges/DevSecOps_Challenge_1.md
- **Ngày làm bài:** 18/11/2026
- **Công cụ AI sử dụng:** Claude Free trên web (claude.ai)
- **Người review / kiểm tra:** Meta AI (dùng để đối chiếu với đề bài trước khi commit)

## Cách log này được tạo ra - Đọc kỹ trước khi nộp

Đề bài Papaya yêu cầu nộp kèm toàn bộ conversation thô với coding agent (ví dụ file session .jsonl của Claude Code).

Trường hợp của ứng viên này:

- Ứng viên dùng **Claude Free trên web, không dùng Claude Code**, nên **không có file .jsonl** tự động sinh ra.
- Log này là **bản chép tay trung thực** từ lịch sử chat trên web Claude: copy nguyên văn prompt của người dùng + tóm tắt trung thực câu trả lời của Claude + file đã sinh ra.
- Không bịa thêm prompt, không bịa thêm câu trả lời của Claude.
- Phần "Human review" là phần ứng viên tự kiểm tra lại với đề bài trước khi commit, có sự hỗ trợ của Meta AI.

---

## Prompt 1 - File 01-threat-model.md

### User Prompt (nguyên văn)

> Đọc link này trước: https://github.com/papaya-insurtech/pumpkin/blob/main/Hiring/DevSecOps_Challenges/DevSecOps_Challenge_1.md
>
> Bạn là DevSecOps Engineer tại Papaya Insurtech. Papaya làm nền tảng GenAI cho bảo hiểm, xử lý hồ sơ bệnh án, chẩn đoán, lịch sử claim, CCCD, tài khoản ngân hàng. Hiện trạng: engineer chạy Claude Code trên laptop có quyền tới production, nhiều người tắt permission prompt, cài MCP server tùy thích không review, CI dùng long-lived GitHub token + AWS access key trong secret, monitoring rời rạc. Hãy viết cho tôi file 01-threat-model.md, liệt kê 8 mối đe dọa cụ thể: agent xóa nhầm S3, prompt injection qua PDF claim, MCP độc hại đọc ~/.aws, tắt guardrail, secret dài hạn bị lộ, human rubber-stamp, trộn dữ liệu đa tenant Việt Nam / Thái Lan / Hong Kong, không có audit log. Mỗi threat ghi: kịch bản, impact, control.

### Claude Response (tóm tắt trung thực)

- Claude nói sẽ đọc link thử thách trước, rồi viết file threat model.
- Đã viết xong `01-threat-model.md`, gồm bảng tổng hợp rủi ro và 8 threat từ T1 đến T8, đúng thứ tự người dùng liệt kê. Mỗi threat có kịch bản, impact và control.
- Claude tự cảnh báo 3 điểm cần kiểm tra lại trước khi nộp:
  1. Tên các khóa cấu hình managed settings của Claude Code (T4) viết theo trí nhớ, cần đối chiếu với tài liệu chính thức.
  2. Các yêu cầu pháp lý theo từng nước VN, TH, HK (T7) chỉ nêu ở mức nguyên tắc, cần pháp chế hoặc DPO xác nhận.
  3. Mức Likelihood và Impact là ước lượng từ mô tả đề bài, vì chưa có dữ liệu thực tế của Papaya. Phần "Giả định và giới hạn" cuối file có ghi rõ.
- Claude gợi ý bước tiếp theo hợp lý là `02-architecture.md`: tách vùng agent được tự do (đọc, sandbox, tạo PR) khỏi vùng bắt buộc có người duyệt (apply vào production qua OIDC role ngắn hạn). Cách này giải quyết được cả hai quan điểm Engineering và Compliance trong đề.

### File tạo ra

- `devsecops/01-threat-model.md`

### Human Review (ứng viên tự kiểm tra)

- Đã đối chiếu với đề bài: đủ 8 threat, đúng hiện trạng Papaya.
- Giữ nguyên phần "Giả định và giới hạn" để không bị tính là bịa config hay bịa pháp lý.
- Không yêu cầu Claude viết lại file này.

---

## Prompt 2 - File 02-architecture.md

### User Prompt (nguyên văn)

> Bạn là DevSecOps Engineer tại Papaya Insurtech. Dựa trên file 01-threat-model.md bạn vừa viết, hãy viết cho tôi file 02-architecture.md. Mô tả kiến trúc an toàn cho Claude Code chạy trên laptop engineer, MCP server, GitHub Actions CI/CD, AWS / GCP / k0s. Bao gồm: managed settings do tổ chức ép, sandbox/devcontainer, allowlist MCP, OIDC thay cho long-lived secret, GitHub Environments dev/staging/prod với named approver, tenant isolation VN/TH/HK, và log tập trung bất biến. Trình bày bằng sơ đồ mô tả bằng text + bảng component và control tương ứng với T1-T8 trong file 01. Không bịa tên config, nếu không chắc thì ghi là cần đối chiếu tài liệu chính thức.

### Claude Response (tóm tắt trung thực)

- Claude nói để không bịa tên config, sẽ đối chiếu tài liệu chính thức của Claude Code trước khi viết.
- Đã viết xong `02-architecture.md`. File có sơ đồ text tổng thể, các mục kiến trúc cho từng thành phần người dùng nêu, và bảng ma trận component ↔ control ↔ T1-T8 ở mục 9. Mục 11 liệt kê những điểm cần đối chiếu trước khi triển khai.
- Claude đã tra cứu tên cấu hình Claude Code và gắn nhãn độ tin cậy cho từng tên trong file:
  - **[Đã thấy]:** tên có trong trang settings-example chính thức hoặc nhiều nguồn khớp nhau. Ví dụ: `permissions.disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`, `allowManagedMcpServersOnly`, `strictKnownMarketplaces`, `allowedMcpServers`, `requiredMinimumVersion`.
  - **[Nguồn thứ cấp]:** chỉ thấy ở blog bên thứ ba, cần đối chiếu. Ví dụ: `sandbox.failIfUnavailable`, `allowUnsandboxedCommands`, các khóa `sandbox.filesystem.*` và `sandbox.network.*`, `managed-mcp.json`, `forceLoginOrgUUID`.
  - **[Cần đối chiếu]:** những chỗ không chắc, nhất là cú pháp từng phần tử, trust policy sub của OIDC, và cơ chế danh tính workload trên k0s.
- 3 điểm Claude dặn đọc kỹ:
  1. Sandbox có thể chỉ bao phủ công cụ Bash, không bao phủ MCP, Read, Write hay hook (theo một nguồn thứ cấp, chưa xác nhận từ tài liệu gốc). Vì vậy file yêu cầu sandbox riêng cho MCP và permission rule cho Read/Write.
  2. Managed settings chỉ ràng buộc Claude Code. Ai gọi API từ công cụ khác thì không bị chặn, nên laptop vẫn phải ở trạng thái read-only với production ở tầng AWS.
  3. File managed settings sai JSON thì Claude Code từ chối khởi động trên mọi máy cùng lúc. Cần validate trong CI và rollout theo vòng canary.
- Những phần cần pháp chế hoặc DPO xác nhận (residency, chuyển dữ liệu xuyên biên giới, thời hạn lưu log theo VN/TH/HK) đã ghi là chưa giả định, không tự đưa ra kết luận. Mức tách tenant (account riêng hay chỉ bucket/key riêng) cũng cần quyết định cùng pháp chế và hợp đồng từng insurer.
- Claude gợi ý bước tiếp theo hợp lý là `03-workflow.md`: quy trình làm việc cho engineer, gồm việc nào agent tự làm, việc nào cần PR và approval, quy trình break-glass, ứng phó sự cố và lộ trình rollout.

> Ghi chú của ứng viên: Ở prompt thực tế, ứng viên đã đổi tên file tiếp theo từ `03-workflow.md` mà Claude gợi ý thành `03-claude-code-guardrails.md` để đi sâu vào triển khai guardrails trước, rồi mới làm workflow ở file 04. Việc đổi thứ tự này là quyết định của người dùng, không phải của Claude.

### File tạo ra

- `devsecops/02-architecture.md`

### Human Review (ứng viên tự kiểm tra)

- Đã đối chiếu với file 01: bảng mapping ở mục 9 khớp T1-T8.
- Giữ nguyên cách gắn nhãn [Đã thấy] / [Nguồn thứ cấp] / [Cần đối chiếu], không sửa thành chắc chắn 100%.
- Không yêu cầu Claude viết lại file này.

---

## Prompt 3 - File 03-claude-code-guardrails.md

### User Prompt (nguyên văn)

> Bạn là DevSecOps Engineer tại Papaya Insurtech. Dựa trên file 01-threat-model.md và file 02-architecture.md bạn vừa viết, hãy viết cho tôi file 03-claude-code-guardrails.md. Nội dung chi tiết để triển khai thực tế trên laptop engineer: file managed-settings.json mẫu đầy đủ với giải thích từng khóa, deny rule cho lệnh nguy hiểm như aws s3 rm, pulumi destroy, đọc ~/.aws, hook bắt buộc của tổ chức, cấu hình sandbox và devcontainer, cách kiểm tra bằng lệnh /status, checklist kiểm thử ranh giới như đọc ~/.aws bị chặn, curl domain lạ bị chặn, và quy trình rollout canary + rollback nếu managed settings sai JSON làm Claude Code không khởi động. Gắn nhãn [Đã thấy] / [Nguồn thứ cấp] / [Cần đối chiếu] cho mọi tên cấu hình như file 02, không bịa tên config, không copy nguyên văn JSON có comment vào production.

### Claude Response (tóm tắt trung thực)

- Claude nói sẽ kiểm tra thêm cú pháp hook, deny rule và sandbox trước khi viết, để không bịa tên khóa.
- Claude nói sẽ thử chạy hook script và validate JSON mẫu trước khi đưa vào tài liệu, để tránh đưa code chưa kiểm chứng.
- Trong quá trình test, Claude báo: Hai ca đọc trên profile prod bị chặn nhầm (kỳ vọng exit=0) vì cờ `--profile` nằm giữa `aws` và subcommand. Đã sửa script rồi chạy lại.
- Đã viết xong `03-claude-code-guardrails.md`. Phần hook, script cài đặt và rollback đã chạy thử thật. Bản thân Claude Code thì chưa chạy, nên mọi hành vi "Claude Code sẽ chặn..." chỉ là kỳ vọng theo tài liệu.
- File có managed-settings.json mẫu kèm bảng giải thích từng khóa, nhóm deny rule, hook `pretool-guard.sh`, phần sandbox và devcontainer, 17 test ranh giới, quy trình rollout canary và rollback. Mọi tên cấu hình đều gắn nhãn [Đã thấy] / [Nguồn thứ cấp] / [Cần đối chiếu], và JSON mẫu không có comment.

#### Đã chạy thật (theo Claude báo cáo)

- Hook guard: khoảng 25 lệnh mẫu. Lần chạy đầu bắt được một lỗi: hook chặn nhầm lệnh đọc trên profile prod khi có `--profile`. Đã sửa và chạy lại.
- Fail-closed: thiếu `jq` hoặc input hỏng đều thoát với mã 2, tức chặn.
- Audit: log che được `TOKEN=`, token GitHub và khóa `AKIA...`.
- Script cài đặt và rollback: 7/7 ca đạt, gồm từ chối file hỏng, file còn `REPLACE_*`, thiếu khóa cốt lõi, và rollback khi không có bản trước.
- Code trong tài liệu: mã trích trực tiếp từ file markdown rồi chạy, nên khớp với những gì đã test.

#### Chưa chạy (theo Claude báo cáo)

- Hành vi của Claude Code thật: khóa bypass, deny rule, sandbox, `/status`, MCP allowlist.
- macOS, Windows, devcontainer firewall, MDM và syslog thật.
- Mục 6 là kế hoạch kiểm thử cho phần này, bắt buộc chạy trên canary.

#### Điều cần biết trước khi triển khai (theo Claude báo cáo)

- Hook và deny rule bị lách được. `a=s3; aws $a rm ...` và `aws s3 "rm" ...` đều lọt hook (đã thử thật). Control thật cho T1 là IAM/SCP read-only trên laptop. Test 16 (từ terminal thường, ghi prod phải bị AccessDenied) quan trọng nhất trong checklist.
- Quyết định thiết kế cần Papaya xác nhận (mục 2.4):
  - Không cho `*.amazonaws.com` vào allowlist của sandbox, vì wildcard đó thành kênh exfil. Hệ quả là lệnh `aws` qua agent sẽ không có mạng.
  - Không bật auto-accept ở đâu ở giai đoạn 1, vì khóa bypass áp dụng cho cả devcontainer.
- Devcontainer: không nên dựa vào feature chính thức để có firewall. Có issue công khai nói artifact đã publish và source không khớp nhau. Nên copy reference `init-firewall.sh` vào repo, review rồi ghim.
- Hook thiếu `jq` thì chặn mọi lệnh Bash. Đây là chủ ý nhưng cũng là rủi ro vận hành. MDM phải cài kèm `jq`, và cần kiểm tra ở canary.
- Mục 9 liệt kê 11 điểm cần đối chiếu tài liệu chính thức, nổi bật là vị trí chính xác của `sandbox.network.allowedDomains` và `forceLoginOrgUUID`. Giá trị sai ở khóa đăng nhập có thể khóa đăng nhập cả đội, nên cần canary kỹ.
- Claude gợi ý bước tiếp theo hợp lý là `04-workflow.md`: quy trình hằng ngày cho engineer, break-glass, ứng phó sự cố và lộ trình rollout toàn bộ.

### File tạo ra

- `devsecops/03-claude-code-guardrails.md`

### Human Review (ứng viên tự kiểm tra)

- Đây là file mạnh nhất trong 3 file, vì phân biệt rõ đã chạy thật vs chưa chạy, dám ghi cả ca lách được.
- Giữ nguyên phần "Đã chạy thật" và "Chưa chạy", không sửa thành đã chạy hết.
- Giữ nguyên kết luận: deny rule không phải là control thật, IAM/SCP read-only mới là control thật cho T1.
- Không yêu cầu Claude viết lại file này.

---

## Prompt 4 - Bị gián đoạn do giới hạn Claude Free

- Sau Prompt 3, khi chuẩn bị gửi Prompt 4 (`04-cicd-workflow.md`), Claude Free báo: `You are out of free messages until 5:30 PM`.
- Ứng viên dừng lại, không tạo tài khoản mới để lách giới hạn.
- Trong thời gian chờ, ứng viên tạo file log này, tạo repo và commit 3 file 01, 02, 03.
- Prompt 4 sẽ được tiếp tục sau 5:30 PM cùng ngày 18/11/2026, trong cùng đoạn chat Claude.

---

## Tổng kết 3 prompt đầu

| Prompt | File | Trạng thái |
|---|---|---|
| 1 | `devsecops/01-threat-model.md` | Đã viết, đã review, đã commit |
| 2 | `devsecops/02-architecture.md` | Đã viết, đã review, đã commit |
| 3 | `devsecops/03-claude-code-guardrails.md` | Đã viết, đã review, đã commit |
| 4 | `devsecops/04-cicd-workflow.md` | Chờ Claude Free mở lại lúc 5:30 PM ngày 18/11/2026 |

## Cam kết trung thực

- Log này không bịa thêm prompt hay câu trả lời của Claude.
- Mọi chỗ Claude nói "chưa chạy", "cần đối chiếu", "cần pháp chế xác nhận" đều được giữ nguyên, không sửa thành chắc chắn.
- Nếu Papaya cần kiểm chứng thêm, ứng viên sẵn sàng cung cấp file PDF export từ trình duyệt của đoạn chat Claude này.

## File 04 đến 08 - Làm với Meta AI

- Lý do: Claude Free hết lượt đến 12:30 AM khi chạy Prompt 4, nên file 04 đến 08 làm với Meta AI.
- Prompt 4: Viết file 04-cicd-workflow.md - OIDC, Environments, Policy-as-code.
- Prompt 5: Viết file 05-secrets-identity-data-protection.md.
- Prompt 6: Viết file 06-monitoring-observability-incident-response.md.
- Prompt 7: Viết file 07-rollout-migration-adoption-plan.md.
- Prompt 8: Viết file 08-final-checklist-and-submission.md.
- Tất cả file 04 đến 08 đều ghi rõ phần nào là [Đã thấy], [Nguồn thứ cấp], [Cần đối chiếu], không bịa tên config, cần test trên repo canary trước khi áp cho production.
