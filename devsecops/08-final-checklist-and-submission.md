# 08 — Final Checklist và Submission: Kiểm tra lần cuối, template PR, runbook, postmortem, cách nộp bài

> Liên kết: file này tổng hợp và kiểm tra lại toàn bộ file 01-threat-model.md, 02-architecture.md, 03-claude-code-guardrails.md, 04-cicd-workflow.md, 05-secrets-identity-data-protection.md, 06-monitoring-observability-incident-response.md, 07-rollout-migration-adoption-plan.md.
> Phạm vi: repo nộp bài Papaya DevSecOps Challenge, GitHub, file Logical, file log AI conversation.
> Cách đọc nhãn: [Đã thấy] là đã thấy trong đề Papaya hoặc file 01 đến 07. [Nguồn thứ cấp] là theo tài liệu chính thức của GitHub, AWS. [Cần đối chiếu] là tên file, tên nhánh, tên nút submit, link submit cụ thể chưa kiểm chứng trên hệ thống thật của Papaya, phải đối chiếu trên repo canary và trên trang nộp bài thật trước khi submit chính thức.
> Lưu ý trung thực: file này viết với Meta AI vì Claude Free hết lượt đến 12:30 AM. Không bịa tên cấu hình, tên nút, link submit. Chỗ nào chưa chắc chắn thì ghi rõ là cần đối chiếu. File này không thay thế đề bài gốc của Papaya, phải đối chiếu với đề bài gốc trước khi submit.

## Nguyên tắc kiểm tra lần cuối

1. Không submit khi chưa kiểm tra. Kiểm tra trên repo canary trước, rồi mới kiểm tra trên repo chính.
2. Không submit file có placeholder chưa thay. Mọi placeholder `<ARN-...>` , `<SHA-...>` , `<REGION-...>` đều phải được thay bằng giá trị thật hoặc ghi rõ là cần đối chiếu, không để placeholder giả làm giá trị thật.
3. Không submit khi file log AI thiếu. Papaya yêu cầu nộp kèm AI conversation, thiếu log là auto-fail theo mô tả đề [Đã thấy].
4. Không submit khi Logical thiếu câu bắt buộc. Logical cần ít nhất 5 câu, gồm Q1 và Q5 bắt buộc [Đã thấy].
5. Không submit khi repo còn ở chế độ private. Repo nộp bài phải là public để người chấm đọc được [Đã thấy].

## 1. Checklist từng file 01 đến 07

### 1.1 File 01 - Threat model [Đã thấy]

- [ ] Đã có 8 mối đe dọa T1 đến T8, mỗi mối đe dọa có kịch bản, impact, control [Đã thấy].
- [ ] Đã phân biệt agent được tự do ở vùng không rủi ro và agent không bao giờ tự apply vào production [Đã thấy].
- [ ] Đã ghi rõ giả định và giới hạn, không khẳng định đã có truy cập hệ thống thật khi chưa có [Đã thấy].

### 1.2 File 02 - Architecture [Đã thấy]

- [ ] Đã có kiến trúc tách tenant, tách môi trường dev, staging, prod [Đã thấy].
- [ ] Đã có luồng dữ liệu claim qua agent, không để agent đọc dữ liệu đa tenant [Đã thấy].
- [ ] Đã ghi rõ chỗ nào là thiết kế đề xuất, chỗ nào cần đối chiếu với kiến trúc thật [Cần đối chiếu].

### 1.3 File 03 - Claude Code guardrails [Đã thấy]

- [ ] Đã có deny rule cho lệnh nguy hiểm, ví dụ `aws s3 rm`, `pulumi destroy` [Đã thấy].
- [ ] Đã có allowlist MCP, sandbox, managed settings [Đã thấy].
- [ ] Đã ghi rõ tên cấu hình Claude Code nào cần đối chiếu với tài liệu chính thức của phiên bản đang dùng [Cần đối chiếu].

### 1.4 File 04 - CI/CD workflow [Đã thấy]

- [ ] Workflow mẫu dùng OIDC, không dùng access key dài hạn [Đã thấy].
- [ ] Đã có Environment `dev`, `staging`, `prod` với `Required reviewers` [Cần đối chiếu].
- [ ] Đã giải thích GitHub không có toggle tên `Prevent self-review` [Cần đối chiếu], phải chống tự duyệt bằng tổ hợp cơ chế.
- [ ] Đã có branch protection với `Require a pull request before merging` [Nguồn thứ cấp], `Require approvals` [Nguồn thứ cấp], `Dismiss stale pull request approvals when new commits are pushed` [Nguồn thứ cấp], `Require review from Code Owners` [Đã thấy], `Require status checks to pass before merging` [Nguồn thứ cấp], `Do not allow bypassing the above settings` [Nguồn thứ cấp].
- [ ] Đã có file `.github/CODEOWNERS` [Đã thấy] với team thật [Cần đối chiếu].
- [ ] Đã có policy-as-code chặn IAM `*`, S3 public, tắt encryption, chặn `pulumi destroy` [Đã thấy].
- [ ] Đã có `Secret scanning` [Nguồn thứ cấp] và `Push protection` [Nguồn thứ cấp].
- [ ] Đã pin action theo commit SHA, không dùng tag nổi cho production [Đã thấy].
- [ ] Đã có `permissions` tối thiểu từng job [Nguồn thứ cấp].
- [ ] Đã có cách đăng `pulumi preview --diff` [Nguồn thứ cấp] lên PR để chống rubber-stamp [Đã thấy].

### 1.5 File 05 - Secrets, identity, data protection [Đã thấy]

- [ ] Đã phân biệt `Repository secrets` [Nguồn thứ cấp], `Environment secrets` [Đã thấy], `Secrets Manager` [Nguồn thứ cấp], `Parameter Store` [Nguồn thứ cấp] với `SecureString` [Nguồn thứ cấp].
- [ ] Đã có quy trình rotation với `Automatic rotation` [Nguồn thứ cấp] và thu hồi khi lộ [Đã thấy].
- [ ] Đã có OIDC với `Identity Provider` [Nguồn thứ cấp], `Trust policy` [Nguồn thứ cấp], `Session name` [Nguồn thứ cấp].
- [ ] Đã có SSO với `AWS IAM Identity Center` [Nguồn thứ cấp], `Permission Set` [Nguồn thứ cấp], `MFA` [Nguồn thứ cấp] và `Require MFA` [Nguồn thứ cấp].
- [ ] Đã có break-glass role với MFA và alert [Đã thấy].
- [ ] Đã có KMS `Customer managed key` [Nguồn thứ cấp], `Key policy` [Nguồn thứ cấp], `Automatic key rotation` [Nguồn thứ cấp], encryption với `Server-side encryption` [Nguồn thứ cấp], `Storage encrypted` [Nguồn thứ cấp].
- [ ] Đã có tenant isolation với `Row-Level Security` [Nguồn thứ cấp], `tenant_id` [Đã thấy], cấm copy dữ liệu thật về dev [Đã thấy].
- [ ] Đã có audit với `CloudTrail` [Đã thấy], `Management events` [Nguồn thứ cấp], `Data events` [Nguồn thứ cấp], `Log file validation` [Nguồn thứ cấp].

### 1.6 File 06 - Monitoring, observability, incident response [Đã thấy]

- [ ] Đã có log tập trung: `CloudTrail` [Đã thấy], `CloudWatch Logs` [Nguồn thứ cấp], `GCP Audit Logs` [Đã thấy], `k0s audit` [Đã thấy], `pgaudit` [Nguồn thứ cấp], `GitHub Audit Log` [Nguồn thứ cấp], `Claude Code telemetry` [Đã thấy], `SIEM` [Đã thấy].
- [ ] Đã có alert rule cho T1 đến T8, mỗi rule có trigger, severity, runbook [Đã thấy].
- [ ] Đã có on-call với `On-call schedule` [Nguồn thứ cấp], `Escalation policy` [Nguồn thứ cấp], severity Sev1 đến Sev4 [Cần đối chiếu].
- [ ] Đã có quy trình incident response 6 bước từ phát hiện đến postmortem [Đã thấy].
- [ ] Đã có dashboard và SLO với `MTTD` [Nguồn thứ cấp], `MTTR` [Nguồn thứ cấp].

### 1.7 File 07 - Rollout, migration, adoption plan [Đã thấy]

- [ ] Đã có 5 phase theo tuần, mỗi phase có tiêu chí pass và rollback [Đã thấy].
- [ ] Đã có training cho engineer, reviewer, security team [Đã thấy].
- [ ] Đã có mapping control sang `ISO 27001` [Đã thấy] và `HIPAA` [Đã thấy], với lưu ý số điều khoản cụ thể cần đối chiếu [Cần đối chiếu].
- [ ] Đã có bằng chứng kiểm toán cần thu thập và KPI [Đã thấy].

Nếu một mục nào chưa tick thì không submit, phải sửa file đó trước.

## 2. Checklist repo GitHub

Tên repo nộp bài trong ví dụ này là `papaya-devsecops-challenge` [Cần đối chiếu], phải đối chiếu với tên repo thật bạn đã tạo trên GitHub. Tên nhánh chính là `main` [Cần đối chiếu], phải đối chiếu với nhánh thật.

- [ ] Repo đã ở chế độ public. Kiểm tra: vào repo, mục Visibility hiện Public [Nguồn thứ cấp]. Tên mục `Visibility` [Nguồn thứ cấp] là tên thật của GitHub.
- [ ] Repo có đủ cấu trúc:
  - `README.md` [Cần đối chiếu]
  - `devsecops/01-threat-model.md` [Đã thấy]
  - `devsecops/02-architecture.md` [Đã thấy]
  - `devsecops/03-claude-code-guardrails.md` [Đã thấy]
  - `devsecops/04-cicd-workflow.md` [Đã thấy]
  - `devsecops/05-secrets-identity-data-protection.md` [Đã thấy]
  - `devsecops/06-monitoring-observability-incident-response.md` [Đã thấy]
  - `devsecops/07-rollout-migration-adoption-plan.md` [Đã thấy]
  - `devsecops/08-final-checklist-and-submission.md` [Cần đối chiếu], chính là file này
  - `logical/LOGICAL_ANSWERS.md` [Đã thấy]
  - `conversations/ai-conversation-log.md` [Đã thấy]
- [ ] Chạy lệnh kiểm tra file trong repo:
  - `git ls-files` [Nguồn thứ cấp]: lệnh git liệt kê file đã track. Phải thấy đủ các file trên.
  - `git log --oneline -5` [Nguồn thứ cấp]: lệnh git xem 5 commit gần nhất. Phải thấy commit cho từng file, không có commit thiếu.
- [ ] README đã liệt kê đủ file, không thiếu file Logical và file log AI. Nội dung README cụ thể [Cần đối chiếu], phải đối chiếu với README thật của bạn.
- [ ] Không có secret thật trong repo. Chạy kiểm tra: tìm `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `.pem`, `.env` trong repo. Nếu tìm thấy thì xóa và rotate theo file 05 [Đã thấy].
- [ ] Không có PHI/PII thật trong repo. Kiểm tra toàn bộ file, đảm bảo mọi ví dụ đều là dữ liệu giả.

## 3. Checklist file log AI conversation

Tên file log trong ví dụ này là `conversations/ai-conversation-log.md` [Đã thấy]. Tên file này đã thấy trong repo của bạn.

- [ ] Log ghi rõ phần nào làm với Claude Free, phần nào làm với Meta AI. Ví dụ: file 01 đến 03 làm với Claude Free, file 04 đến 08 làm với Meta AI vì Claude Free hết lượt đến 12:30 AM [Cần đối chiếu], phải ghi đúng sự thật.
- [ ] Log ghi rõ phần nào Claude hoặc Meta AI đã chạy thật, phần nào chưa chạy và cần đối chiếu. Không ghi là đã chạy thật khi chưa chạy.
- [ ] Log không bịa hội thoại. Chỉ ghi hội thoại đã xảy ra thật.
- [ ] Log có đủ Prompt 1 đến Prompt 8 và output tương ứng, hoặc ghi rõ prompt nào chưa chạy.
- [ ] Log không chứa secret, không chứa PII thật.

Nếu Papaya yêu cầu nộp kèm AI conversation mà repo thiếu log thì auto-fail theo mô tả đề [Đã thấy], nên không được bỏ log.

## 4. Checklist Logical 5 câu

File Logical trong ví dụ này là `logical/LOGICAL_ANSWERS.md` [Đã thấy].

- [ ] Đã có đủ 5 câu: Q1, Q5, Q6, Q8, Q10 [Đã thấy].
- [ ] Q1 là ký ức đầu tiên, Q5 là lần cuối quên đồ, cả hai là bắt buộc [Đã thấy].
- [ ] Q1 và Q5 là ký ức thật của bạn, không bịa [Đã thấy].
- [ ] Q6, Q8, Q10 là suy nghĩ thật của bạn, không lấy câu trả lời bịa của AI [Đã thấy].
- [ ] Toàn bộ 5 câu đều bằng tiếng Việt, như bạn đã chọn, và đã ghi rõ `Language: Vietnamese` [Đã thấy].
- [ ] Header file ghi `5 answers` khớp với nội dung bên dưới có đủ 5 câu, không để header ghi 5 mà nội dung chỉ có 2 [Đã thấy].

## 5. Checklist README

File `README.md` [Cần đối chiếu] phải có:

- [ ] Tiêu đề challenge, ví dụ `Papaya DevSecOps Challenge` [Cần đối chiếu].
- [ ] Cấu trúc repo liệt kê đủ file 01 đến 08, Logical, log AI.
- [ ] Cách làm bài: dùng AI nào, kiểm tra lại với đề bài trước khi commit.
- [ ] Ghi rõ phần nào chưa kiểm chứng và cần đối chiếu trên repo canary.
- [ ] Không ghi là đã triển khai thật trên hệ thống Papaya khi chưa triển khai.

## 6. Template PR

Dùng template này cho mọi PR vào `main` [Cần đối chiếu]. Đặt file template tại `.github/PULL_REQUEST_TEMPLATE.md` [Nguồn thứ cấp]. Tên file này là tên thật của GitHub, nhưng chưa biết repo Papaya có dùng template này hay không [Cần đối chiếu].

```markdown
## Mô tả
- Thay đổi gì, vì sao thay đổi.

## Preview diff
- Đã đính kèm Pulumi preview diff chưa.
- Có tài nguyên nào bị xóa hoặc thay thế không.

## Policy
- Conftest đã xanh chưa.
- Có thay đổi IAM, S3 policy, KMS, network không.

## Kiểm tra
- [ ] Đã đọc preview diff.
- [ ] Đã kiểm tra không có secret trong diff.
- [ ] Đã kiểm tra không có PHI/PII trong diff.
- [ ] Đã test trên repo canary nếu chạm infra.

## Reviewer
- Reviewer CODEOWNERS:
- Reviewer security nếu chạm IAM, S3, KMS:
```

Quy tắc: PR không có preview diff thì không merge. PR chạm infra mà không có reviewer security thì không merge.

## 7. Template runbook sự cố

Đặt runbook tại `docs/runbook/` [Cần đối chiếu]. Tên thư mục này chưa kiểm chứng, cần đối chiếu với cấu trúc repo thật.

```markdown
# Runbook: [Tên sự cố, ví dụ S3 bị xóa hàng loạt]

## Dấu hiệu
- Alert nào xuất hiện, log nào thấy.

## Severity
- Sev1, Sev2, Sev3, Sev4.

## Bước 1: Khoanh vùng
- Khóa principal, khóa role, dừng agent, dừng deploy.

## Bước 2: Đánh giá phạm vi
- Tenant nào, dữ liệu nào, thời gian nào.

## Bước 3: Khắc phục
- Restore từ đâu, rotate secret nào, deploy bản sửa nào.

## Bước 4: Thông báo
- Thông báo cho DPO, pháp chế, insurer nào, thời hạn nào.

## Bước 5: Postmortem
- Link postmortem.

## Người chịu trách nhiệm
- On-call chính:
- On-call phụ:
```

## 8. Template postmortem

```markdown
# Postmortem: [Tên sự cố] - [Ngày]

## Tóm tắt
- Chuyện gì xảy ra, ảnh hưởng ai.

## Dòng thời gian
- HH:MM phát hiện.
- HH:MM khoanh vùng.
- HH:MM khắc phục.
- HH:MM thông báo.

## Nguyên nhân gốc
- Vì sao xảy ra, không đổ lỗi cá nhân.

## Phạm vi ảnh hưởng
- Tenant nào, dữ liệu nào, bao nhiêu record.

## Hành động đã làm
- Đã làm gì để khắc phục.

## Hành động ngăn lặp lại
- Hành động 1, người chịu trách nhiệm, deadline.
- Hành động 2, người chịu trách nhiệm, deadline.

## Bài học
- Điều gì cần cải thiện trong control, alert, training.
```

## 9. Cách đối chiếu trên repo canary trước khi submit

Repo canary là repo test riêng, không phải repo nộp bài [Cần đối chiếu]. Tên repo canary cụ thể [Cần đối chiếu].

Bước đối chiếu:

1. Tạo repo canary, copy toàn bộ file 01 đến 08 sang repo canary.
2. Bật branch protection, CODEOWNERS, Environment trên repo canary với 2 người test.
3. Tạo PR test trên repo canary với thay đổi infra giả, xác nhận preview diff xuất hiện, policy chặn đúng, reviewer không tự approve được.
4. Thử push secret giả, xác nhận `Push protection` [Đã thấy] chặn.
5. Thử merge PR thiếu approval, xác nhận bị chặn.
6. Kiểm tra `git ls-files` trên repo canary thấy đủ file, `git log` thấy đủ commit.
7. Chỉ khi repo canary pass toàn bộ thì mới áp cấu hình đó cho repo chính và submit.

## 10. Cách submit link GitHub qua Papaya Submit test result

Tên nút submit trong ví dụ này là `Submit test result` [Đã thấy]. Tên này đã thấy trong mô tả đề Papaya. Vị trí nút và form submit cụ thể [Cần đối chiếu], phải đối chiếu trên trang nộp bài thật của Papaya, vì giao diện có thể thay đổi.

Bước submit đề xuất, phải đối chiếu với trang thật:

1. Mở trang nộp bài của Papaya, tìm nút `Submit test result` [Đã thấy].
2. Dán link repo public, ví dụ `https://github.com/duyphuong82/papaya-devsecops-challenge` [Cần đối chiếu]. Link này phải đối chiếu với link repo thật của bạn, không dùng link ví dụ nếu tên repo khác.
3. Kiểm tra link repo mở được ở chế độ ẩn danh, không cần đăng nhập GitHub. Nếu link yêu cầu đăng nhập thì repo đang ở chế độ private, phải chuyển sang public trước khi submit.
4. Kiểm tra file Logical và file log AI đã có trong repo, không chỉ có file DevSecOps.
5. Bấm submit, chụp màn hình xác nhận đã submit thành công, lưu lại để làm bằng chứng.
6. Sau khi submit, không sửa repo nữa trừ khi Papaya cho phép sửa. Nếu phải sửa thì ghi rõ lý do sửa và thông báo cho người chấm nếu có thể.

Deadline nộp bài là 5 ngày từ email mời test [Đã thấy]. Ngày deadline cụ thể [Cần đối chiếu], phải đối chiếu với email gốc của Papaya. Không để đến ngày cuối mới submit, nên submit sớm ít nhất 1 ngày để có thời gian sửa nếu link lỗi.

## 11. Những lỗi hay bị loại cần tránh

- Nộp repo private, người chấm không mở được.
- Nộp thiếu file log AI conversation.
- Nộp Logical thiếu Q1 hoặc Q5, hoặc header ghi 5 câu mà nội dung chỉ có 2 câu.
- Bịa tên cấu hình GitHub, ARN, SHA, tên team, tên region.
- Ghi là đã triển khai thật trên hệ thống Papaya khi chưa triển khai.
- Để secret thật hoặc PII thật trong repo.
- Để placeholder `<ARN-...>` chưa thay mà vẫn submit, người chấm sẽ tưởng bạn bịa.
- Tự duyệt PR của chính mình, hoặc để admin bypass branch protection.

## Giả định và giới hạn

- Chưa có truy cập vào trang nộp bài thật của Papaya và GitHub org thật của Papaya nên tên nút submit, link submit, tên repo, tên nhánh đều ghi là [Cần đối chiếu], không bịa giá trị thật.
- Tên cấu hình GitHub, AWS trong file này lấy từ tài liệu chính thức [Nguồn thứ cấp]. Nếu vendor đổi tên hiển thị thì phải map lại và test lại trên canary.
- Yêu cầu pháp lý VN, TH, HK và hợp đồng từng insurer cần pháp chế và DPO xác nhận, file này không thay thế tư vấn pháp lý.
- File này không chứa secret thật, không chứa PII thật, không chứa log thật. Mọi ví dụ đều là dữ liệu giả.
