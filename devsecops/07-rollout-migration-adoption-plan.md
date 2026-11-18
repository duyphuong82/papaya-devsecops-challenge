# 07 — Rollout, Migration và Adoption Plan: Triển khai từng phase, có rollback, có bằng chứng kiểm toán

> Liên kết: file này biến các control đã nêu ở 01-threat-model.md, 02-architecture.md, 03-claude-code-guardrails.md, 04-cicd-workflow.md, 05-secrets-identity-data-protection.md, 06-monitoring-observability-incident-response.md thành lộ trình triển khai thực tế.
> Phạm vi: monorepo Papaya, GitHub Actions, AWS, GCP, k0s, Aurora, S3, Claude Code, agent production.
> Cách đọc nhãn: [Đã thấy] là đã thấy trong đề Papaya hoặc file 01 đến 06. [Nguồn thứ cấp] là theo tài liệu chính thức của AWS, GitHub, ISO, HIPAA. [Cần đối chiếu] là tên cấu hình, thời gian, người chịu trách nhiệm cụ thể chưa kiểm chứng trên hệ thống thật của Papaya, phải test trên repo canary và AWS account canary trước khi áp cho production.
> Lưu ý trung thực: file này viết với Meta AI vì Claude Free hết lượt đến 12:30 AM. Không bịa tên cấu hình, tên tài liệu kiểm toán, tên tiêu chuẩn. Chỗ nào chưa chắc chắn thì ghi rõ là cần đối chiếu.

## Nguyên tắc rollout

1. Không triển khai tất cả cùng lúc. Triển khai từng phase, mỗi phase có tiêu chí pass mới sang phase tiếp theo.
2. Canary trước, production sau. Mọi thay đổi phá vỡ, ví dụ branch protection, policy-as-code, OIDC, đều test trên repo canary và AWS account canary trước.
3. Luôn có rollback. Mỗi phase phải ghi rõ cách quay lại trạng thái cũ nếu phase đó lỗi.
4. Không triển khai control mà không training người dùng. Control không được hiểu thì sẽ bị bypass.
5. Mọi phase đều phải để lại bằng chứng kiểm toán. Không có bằng chứng thì coi như chưa làm.

## 1. Tổng quan 5 phase

| Phase | Nội dung | Thời gian đề xuất | Tiêu chí pass |
|---|---|---|---|
| Phase 0 | Dọn dẹp và inventory | Tuần 1 | Có danh sách đầy đủ profile SSO, secret, MCP, repo, role |
| Phase 1 | Nền tảng: OIDC, secret, log | Tuần 2 đến 3 | CI chạy bằng OIDC, secret cũ đã xóa, log về SIEM |
| Phase 2 | Kiểm soát code: branch protection, CODEOWNERS, policy | Tuần 4 đến 5 | PR không merge được nếu thiếu approval, policy, preview |
| Phase 3 | Bảo vệ dữ liệu: KMS, RLS, tenant isolation | Tuần 6 đến 7 | Tenant A không đọc được dữ liệu tenant B trên canary |
| Phase 4 | Giám sát và ứng phó: alert, on-call, diễn tập | Tuần 8 | Diễn tập T1, T5, T7 pass, MTTD và MTTR đo được |

Thời gian từng phase [Cần đối chiếu], phải đối chiếu với lịch làm việc thật của team Papaya và deadline hợp đồng từng insurer. Bảng trên là đề xuất, không phải lịch đã chốt.

Tên repo canary và AWS account canary [Cần đối chiếu], phải đối chiếu với tên thật Papaya dùng.

## 2. Phase 0 - Dọn dẹp và inventory, Tuần 1

Mục đích: biết mình đang có gì trước khi khóa lại, nếu không sẽ khóa nhầm và làm kẹt team.

Công việc:

- Inventory profile SSO: liệt kê toàn bộ `Permission Set` [Nguồn thứ cấp] trong `AWS IAM Identity Center` [Nguồn thứ cấp], ai có quyền gì tới prod. Tên `Permission Set` cụ thể [Cần đối chiếu].
- Inventory secret: liệt kê toàn bộ secret trong `Repository secrets` [Nguồn thứ cấp], `Environment secrets` [Đã thấy], `Secrets Manager` [Nguồn thứ cấp], `Parameter Store` [Nguồn thứ cấp]. Đánh dấu secret nào là long-lived, secret nào cần rotate, secret nào cần xóa.
- Inventory MCP: liệt kê toàn bộ MCP server và plugin Claude Code đang dùng, ai cài, từ nguồn nào. Tên MCP cụ thể [Cần đối chiếu].
- Inventory repo: liệt kê repo nào là monorepo chính, repo nào là canary, nhánh chính là `main` hay `master` [Cần đối chiếu].
- Inventory role: liệt kê toàn bộ `IAM Role` [Nguồn thứ cấp] có quyền tới prod, trust policy của từng role.

Bằng chứng cần thu thập ở Phase 0:

- File inventory dạng bảng, có tên, người sở hữu, quyền, ngày kiểm tra.
- Ảnh chụp hoặc export `CloudTrail` [Đã thấy] cho thấy ai đã dùng role nào trong 30 ngày qua [Cần đối chiếu].

Tiêu chí pass Phase 0: inventory đầy đủ, team đã xác nhận không còn profile SSO ẩn, không còn secret ẩn.

Rollback Phase 0: không cần rollback vì phase này chỉ đọc, không sửa.

## 3. Phase 1 - Nền tảng: OIDC, secret, log, Tuần 2 đến 3

Mục đích: bỏ secret dài hạn, đưa log về một chỗ.

### 3.1 OIDC

- Tạo `Identity Provider` [Nguồn thứ cấp] cho GitHub OIDC trên AWS account canary trước, test job CI assume role bằng OIDC.
- Sau khi test pass trên canary, tạo tương tự trên account dev, staging, prod thật.
- Xóa toàn bộ `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY` dạng long-lived [Nguồn thứ cấp] khỏi GitHub Secrets và khỏi laptop, sau khi đã xác nhận CI chạy được bằng OIDC.
- Đặt `Session name` [Nguồn thứ cấp] theo chuẩn `github-run-<run-id>-<actor>` cho CI, `claude-code-<username>` cho laptop [Cần đối chiếu].

### 3.2 Secret

- Chuyển mật khẩu DB và API key vào `Secrets Manager` [Nguồn thứ cấp], bật `Automatic rotation` [Nguồn thứ cấp].
- Chuyển cấu hình không nhạy cảm vào `Parameter Store` [Nguồn thứ cấp] dạng `String` [Nguồn thứ cấp], secret ít xoay vào dạng `SecureString` [Nguồn thứ cấp].
- Xóa secret khỏi code và lịch sử git bằng `git filter-repo` [Nguồn thứ cấp] nếu phát hiện secret đã push.
- Bật `Secret scanning` [Đã thấy] và `Push protection` [Đã thấy] trên repo canary trước, sau đó bật trên repo chính.

### 3.3 Log

- Bật `CloudTrail` [Đã thấy] với `Management events` [Nguồn thứ cấp] và `Data events` [Nguồn thứ cấp] cho S3 claim bucket trên account canary, gom về `Log account` [Cần đối chiếu].
- Bật `Log file validation` [Nguồn thứ cấp] và `S3 Object Lock` [Đã thấy] cho bucket log.
- Bật `pgaudit` [Nguồn thứ cấp] trên Aurora canary, kiểm tra log ghi được truy vấn kèm `tenant_id` [Đã thấy].
- Đưa log về `SIEM` [Đã thấy], kiểm tra SIEM nhận được log trong vài phút.

Tiêu chí pass Phase 1:

- 100% job CI trên repo canary chạy bằng OIDC, không còn job nào dùng access key dài hạn.
- 100% secret DB trên account canary đã bật rotation.
- Log từ canary về SIEM, test tái dựng sự cố từ log pass.

Rollback Phase 1:

- Nếu OIDC lỗi, tạm thời quay lại dùng secret cũ đã lưu trong `Environment secrets` [Đã thấy] trong thời gian sửa, nhưng phải có ticket và deadline xóa secret cũ, không để secret cũ tồn tại lâu.
- Nếu log lỗi, không tắt log cũ cho đến khi log mới chạy ổn.

## 4. Phase 2 - Kiểm soát code: branch protection, CODEOWNERS, policy, Tuần 4 đến 5

Mục đích: không ai tự push vào main, không ai tự duyệt chính mình, code vi phạm policy không merge được.

### 4.1 Branch protection và CODEOWNERS

- Trên repo canary, bật các cài đặt sau, tên đều là tên thật của GitHub [Nguồn thứ cấp]:
  - `Require a pull request before merging` [Nguồn thứ cấp]
  - `Require approvals` [Nguồn thứ cấp]
  - `Dismiss stale pull request approvals when new commits are pushed` [Nguồn thứ cấp]
  - `Require review from Code Owners` [Đã thấy]
  - `Require status checks to pass before merging` [Nguồn thứ cấp]
  - `Require branches to be up to date before merging` [Nguồn thứ cấp]
  - `Do not allow bypassing the above settings` [Nguồn thứ cấp]
- Tạo file `.github/CODEOWNERS` [Đã thấy] trên repo canary với team giả, test PR chạm infra phải có reviewer platform và security.
- Sau khi test pass, áp tương tự cho repo chính với team thật. Tên team thật [Cần đối chiếu].
- `Require signed commits` [Cần đối chiếu]: chưa bật ở phase này nếu team chưa setup signing, để phase sau khi team đã training signing.

### 4.2 Policy-as-code và preview diff

- Trên repo canary, bật job `policy` với `Conftest` [Nguồn thứ cấp] và `OPA` [Nguồn thứ cấp]. Test PR có IAM `*`, S3 public, tắt encryption phải fail.
- Trên repo canary, test job `preview` đăng `pulumi preview --diff` [Nguồn thứ cấp] lên PR qua `actions/github-script` [Nguồn thứ cấp]. Kiểm tra comment diff đọc được.
- Trên repo canary, test pin action theo commit SHA: thay tag `v4` bằng SHA thật, xác nhận workflow vẫn chạy.
- Sau khi test pass, áp cho repo chính.

### 4.3 Training ở Phase 2

- Training engineer: cách tạo PR nhỏ, một PR một mục đích, cách đọc preview diff, cách sửa khi policy fail.
- Training reviewer: cách review diff IAM, S3, KMS, không chỉ bấm Approve. Reviewer phải comment vào diff rủi ro cao.
- Training security team: cách viết thêm rule policy, cách review CODEOWNERS.

Tiêu chí pass Phase 2:

- Thử push trực tiếp vào `main` trên repo canary bị chặn.
- Thử tự approve PR của chính mình không được tính.
- Thử PR vi phạm policy bị chặn merge.
- 100% PR trên repo canary có preview diff comment.

Rollback Phase 2:

- Nếu branch protection làm kẹt team, tạm thời giảm số approval yêu cầu, nhưng không tắt `Do not allow bypassing the above settings` [Nguồn thứ cấp]. Ghi rõ lý do giảm và deadline khôi phục.
- Nếu policy fail sai, sửa rule policy đó, không tắt toàn bộ job policy.

## 5. Phase 3 - Bảo vệ dữ liệu: KMS, RLS, tenant isolation, Tuần 6 đến 7

Mục đích: tenant A không đọc được dữ liệu tenant B, dữ liệu luôn mã hóa.

Công việc:

- Tạo `Customer managed key` [Nguồn thứ cấp] riêng cho từng tenant VN, TH, HK trên account canary, bật `Automatic key rotation` [Nguồn thứ cấp]. Tên key alias cụ thể [Cần đối chiếu].
- Bật `Server-side encryption` [Nguồn thứ cấp] cho S3 canary với KMS key của tenant, bật `Storage encrypted` [Nguồn thứ cấp] cho Aurora canary.
- Bật `Row-Level Security` [Nguồn thứ cấp] trên Postgres canary, ép mọi truy vấn có `tenant_id` [Đã thấy].
- Tạo test cô lập tự động: tạo dữ liệu tenant A và B, xác nhận tenant A không đọc được dữ liệu tenant B.
- Kiểm tra `Service Control Policy` viết tắt `SCP` [Đã thấy] chặn tạo tài nguyên ngoài `AWS Region` [Nguồn thứ cấp] được phép. Tên region cụ thể [Cần đối chiếu].
- Kiểm tra không có dữ liệu thật trong dev canary. Dữ liệu dev chỉ là dữ liệu tổng hợp hoặc ẩn danh [Đã thấy].

Tiêu chí pass Phase 3:

- Test cô lập tenant pass trên canary.
- Test tạo bucket không encryption bị policy chặn.
- Test truy vấn không có `tenant_id` bị RLS chặn.

Rollback Phase 3:

- Nếu KMS key mới lỗi, quay lại dùng key cũ trong thời gian sửa, nhưng phải ghi ticket và không để key cũ tồn tại lâu.
- Nếu RLS làm kẹt ứng dụng, tạm thời cho phép ứng dụng cũ chạy với role cũ trong cửa sổ migration, nhưng phải có deadline tắt role cũ.

## 6. Phase 4 - Giám sát và ứng phó: alert, on-call, diễn tập, Tuần 8

Mục đích: phát hiện sự cố nhanh, phản ứng có quy trình.

Công việc:

- Cấu hình alert cho T1 đến T8 như file 06 [Đã thấy] trên SIEM canary trước, test từng alert bằng sự cố giả.
- Cấu hình `On-call schedule` [Nguồn thứ cấp] và `Escalation policy` [Nguồn thứ cấp] với tên công cụ cụ thể [Cần đối chiếu].
- Diễn tập tabletop T1, T5, T7 trên canary, đo `MTTD` [Nguồn thứ cấp] và `MTTR` [Nguồn thứ cấp] thực tế.
- Diễn tập restore S3 từ `S3 Versioning` [Đã thấy] và Aurora từ snapshot, đo RTO và RPO thực tế [Cần đối chiếu].
- Diễn tập tái dựng sự cố chỉ từ log.

Tiêu chí pass Phase 4:

- 100% alert T1 đến T8 đã test và có runbook.
- Diễn tập tabletop pass, MTTD và MTTR đo được và dưới mục tiêu đề ra.
- On-call đã trực thật 1 tuần trên canary mà không bị quá tải alert.

Rollback Phase 4:

- Nếu alert quá nhiều gây mệt mỏi, giảm độ nhạy của alert Sev3 và Sev4, nhưng không tắt alert Sev1 và Sev2.
- Nếu on-call quá tải, thêm người trực phụ, không để một người trực liên tục.

## 7. Mapping control sang ISO 27001 và HIPAA

Tên tiêu chuẩn đều là tên thật:

- `ISO 27001` [Đã thấy]: tiêu chuẩn quản lý an toàn thông tin. Tên này đã thấy ở file 01. Papaya đang triển khai ISO 27001 [Đã thấy], chưa đạt chứng nhận [Cần đối chiếu].
- `HIPAA` [Đã thấy]: luật bảo vệ thông tin sức khỏe của Mỹ. Tên này đã thấy ở file 01. Áp dụng cho dữ liệu PHI nếu Papaya xử lý dữ liệu liên quan HIPAA [Cần đối chiếu].

Bảng mapping là đề xuất, chưa phải mapping đã được auditor xác nhận [Cần đối chiếu]:

| Control ở file 01 đến 06 | ISO 27001 - ví dụ | HIPAA - ví dụ |
|---|---|---|
| OIDC, MFA, break-glass | Kiểm soát truy cập, xác thực | Kiểm soát truy cập, xác thực người dùng |
| KMS, encryption | Mã hóa | Mã hóa dữ liệu khi lưu và khi truyền |
| Tenant isolation, RLS | Phân tách dữ liệu | Bảo vệ PHI theo từng thực thể |
| Log tập trung, SIEM | Ghi log và giám sát | Audit controls |
| Branch protection, CODEOWNERS | Kiểm soát thay đổi | Kiểm soát toàn vẹn |
| Incident response, postmortem | Quản lý sự cố | Quy trình ứng phó sự cố |

Tên Annex và điều khoản cụ thể của ISO 27001 và HIPAA [Cần đối chiếu], phải đối chiếu với tài liệu chính thức của ISO và HIPAA và với auditor của Papaya, không bịa số điều khoản trong file này.

Bằng chứng kiểm toán cần thu thập cho mỗi control:

- Export cấu hình: branch protection, Environment, policy, KMS key policy, trust policy.
- Log: CloudTrail, SIEM, GitHub Audit Log, preview diff comment trên PR.
- Kết quả test canary: file test, ảnh chụp alert, đo MTTD và MTTR.
- Training record: ai đã học, khi nào, nội dung gì.
- Postmortem: cho mỗi sự cố đã diễn tập hoặc đã xảy ra thật.

## 8. Tiêu chí thành công và KPI

KPI đề xuất, con số cụ thể [Cần đối chiếu], cần team xác nhận:

- 100% deploy prod qua CI, 0% deploy bằng tay.
- 100% PR prod có preview diff comment và policy xanh.
- 0 secret dài hạn trong repo và trên laptop.
- 100% secret DB đã bật rotation.
- 0 lần truy cập chéo tenant trong 30 ngày.
- MTTD dưới 5 phút cho Sev1, MTTR dưới 30 phút cho secret lộ [Cần đối chiếu].
- 100% engineer và reviewer đã training về branch protection, CODEOWNERS, preview diff.

Nếu KPI không đạt thì không coi là rollout xong, phải ghi rõ lý do và kế hoạch khắc phục.

## 9. Kiểm chứng trên repo canary và AWS account canary

### 9.1 Đã kiểm chứng từ file 01 đến 06

- Nguyên tắc rollout từng phase, canary trước, production sau [Đã thấy].
- Nguyên tắc luôn có rollback và bằng chứng kiểm toán [Đã thấy].
- Nguyên tắc training trước khi khóa control [Đã thấy].

### 9.2 Cần test trên canary

Checklist test cho toàn bộ rollout:

1. Chạy Phase 0 trên canary, xác nhận inventory đầy đủ.
2. Chạy Phase 1 trên canary, xác nhận CI chạy bằng OIDC và log về SIEM.
3. Chạy Phase 2 trên canary, xác nhận branch protection và policy chặn đúng.
4. Chạy Phase 3 trên canary, xác nhận tenant isolation pass.
5. Chạy Phase 4 trên canary, xác nhận alert và diễn tập pass.
6. Thu thập bằng chứng kiểm toán cho mỗi phase trên canary, xác nhận auditor đọc được.
7. Training 2 engineer và 1 reviewer trên canary, xác nhận họ tạo được PR đúng quy trình.
8. Diễn tập rollback từng phase trên canary, xác nhận quay lại được trạng thái cũ.

Chỉ khi 8 test trên đều pass trên canary thì mới áp rollout này cho production. Ghi kết quả test vào PR canary để làm bằng chứng.

## Giả định và giới hạn

- Chưa có truy cập vào GitHub org, AWS account, GCP project thật của Papaya nên mọi tên team, tên repo canary, tên account canary, thời gian phase, tên SIEM, tên công cụ on-call đều ghi là [Cần đối chiếu], không bịa giá trị thật.
- Tên cấu hình AWS, GitHub, ISO, HIPAA trong file này lấy từ tài liệu chính thức [Nguồn thứ cấp]. Nếu vendor đổi tên hiển thị thì phải map lại và test lại trên canary.
- Yêu cầu pháp lý VN, TH, HK và hợp đồng từng insurer cần pháp chế và DPO xác nhận, file này không thay thế tư vấn pháp lý.
- File này không chứa secret thật, không chứa PII thật, không chứa log thật. Mọi ví dụ đều là dữ liệu giả.
