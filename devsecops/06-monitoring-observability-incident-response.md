# 06 — Monitoring, Observability và Incident Response: Log tập trung, cảnh báo, on-call, runbook

> Liên kết: file này triển khai control phát hiện và phản ứng đã nêu ở 01-threat-model.md (T1 đến T8), kiến trúc ở 02-architecture.md, guardrails ở 03-claude-code-guardrails.md, workflow ở 04-cicd-workflow.md, và bảo vệ dữ liệu ở 05-secrets-identity-data-protection.md.
> Phạm vi: monorepo Papaya, AWS, GCP, k0s, Aurora, S3, GitHub Actions, Claude Code, agent production đọc tài liệu.
> Cách đọc nhãn: [Đã thấy] là đã thấy trong đề Papaya hoặc file 01, 02, 03, 04, 05. [Nguồn thứ cấp] là theo tài liệu chính thức của AWS, GCP, GitHub. [Cần đối chiếu] là tên cấu hình, tên log group, tên metric, tên kênh cảnh báo cụ thể chưa kiểm chứng trên hệ thống thật của Papaya, phải test trên repo canary và AWS account canary trước khi áp cho production.
> Lưu ý trung thực: file này viết với Meta AI vì Claude Free hết lượt đến 12:30 AM. Không bịa tên cấu hình, tên log group, tên metric. Chỗ nào chưa chắc chắn thì ghi rõ là cần đối chiếu.

## Nguyên tắc xuyên suốt

1. Không có log là không có sự cố để điều tra. Mọi hành động nhạy cảm đều phải có log bất biến và truy vết được tới người.
2. Một kênh cảnh báo duy nhất. Không để cảnh báo rời rạc giữa CloudWatch, GCP, Slack, email, làm on-call không biết xem ở đâu.
3. Cảnh báo phải có hành động. Cảnh báo không có runbook thì chỉ gây mệt mỏi và bị bỏ qua.
4. Log không chứa secret và không chứa PHI/PII. Log chứa PII thì log đó tự nó đã là sự cố.
5. Mọi sự cố đều có postmortem và hành động khắc phục, không chỉ sửa xong rồi thôi.

## 1. Log tập trung: cái gì phải log, log ở đâu

### 1.1 Các nguồn log bắt buộc

Tên cấu hình đều là tên thật, phải gắn nhãn:

- `CloudTrail` [Đã thấy]: log API AWS. Đã nhắc ở file 01 T8 và file 05. Phải bật `Management events` [Nguồn thứ cấp] và `Data events` [Nguồn thứ cấp] cho S3 claim bucket. Tên bucket cụ thể [Cần đối chiếu].
- `CloudWatch Logs` [Nguồn thứ cấp]: nơi lưu log ứng dụng và log Lambda trên AWS. Tên log group cụ thể, ví dụ `/aws/lambda/papaya-claim` [Cần đối chiếu], phải đối chiếu với tên log group thật, không dùng tên ví dụ này cho production.
- `GCP Audit Logs` [Đã thấy]: log audit của GCP. Tên này đã thấy ở file 01 T8. Nếu Papaya dùng GCP cho model AI thì phải gom log này về SIEM, không để riêng.
- `k0s audit` [Đã thấy]: log audit của cụm k0s. Tên này đã thấy ở file 01 T8. Tên file log và vị trí lưu [Cần đối chiếu].
- `Aurora` và `pgaudit` [Nguồn thứ cấp]: `pgaudit` là extension Postgres để log truy vấn DB. Tên này là tên thật của Postgres. Phải bật `pgaudit` trên Aurora để biết ai đã truy vấn bảng nào, với `tenant_id` nào. Cấu hình `pgaudit.log` [Nguồn thứ cấp] cụ thể [Cần đối chiếu].
- `GitHub Audit Log` [Nguồn thứ cấp]: log của GitHub org, ví dụ ai đã thay đổi branch protection, ai đã bypass, ai đã thêm secret. Vị trí: Organization Settings, rồi Audit Log [Nguồn thứ cấp].
- `Claude Code telemetry` [Đã thấy]: telemetry của Claude Code với OpenTelemetry, gồm prompt, tool call, lệnh Bash, MCP được gọi. Tên này đã nhắc ở file 01 T8. Cách đưa telemetry về SIEM cụ thể [Cần đối chiếu].

### 1.2 SIEM tập trung

Tên cấu hình:

- `SIEM` [Đã thấy]: hệ thống quản lý sự kiện và thông tin bảo mật. Tên này đã thấy ở file 01 T8. Tên SIEM cụ thể Papaya dùng [Cần đối chiếu], ví dụ dùng SIEM tự build hay vendor, chưa kiểm chứng.
- `Log account` [Cần đối chiếu]: account log riêng, tách khỏi account production. Tên account cụ thể [Cần đối chiếu]. CloudTrail của mọi account đều gửi về account này.
- `S3 Object Lock` [Đã thấy]: khóa log không cho xóa. Đã nhắc ở file 01 và 05.
- `Log file validation` [Nguồn thứ cấp]: tính năng xác thực file log CloudTrail không bị sửa.

Quy tắc:

- Mọi log đều có các trường bắt buộc: `timestamp`, `actor`, `session name`, `tenant_id`, `action`, `resource`, `result`, `run_id` nếu từ CI, `sha` nếu từ CI [Đã thấy]. Thiếu `tenant_id` thì log đó không đủ để điều tra sự cố đa tenant.
- Log được gom về SIEM trong vòng vài phút, không để log nằm rời rạc cả ngày mới gom.
- Người vận hành không có quyền xóa log. Quyền xóa log chỉ nằm ở break-glass role có MFA và alert, xem file 05 [Đã thấy].
- Thời hạn lưu log theo yêu cầu pháp lý và hợp đồng từng insurer [Cần đối chiếu], cần pháp chế xác nhận. Đề xuất tối thiểu: log CloudTrail lưu 1 năm, log ứng dụng lưu 90 ngày [Cần đối chiếu], cần team xác nhận.

## 2. Dashboard và SLO: nhìn thấy hệ thống đang khỏe hay đang lỗi

### 2.1 Dashboard bắt buộc

Tên dashboard cụ thể [Cần đối chiếu], phải đối chiếu với tên dashboard thật của Papaya. Dưới đây là nội dung dashboard phải có, không phải tên dashboard:

- Dashboard deploy: số deploy thành công, thất bại, thời gian deploy, ai deploy, Environment nào. Lấy từ GitHub Actions và Pulumi.
- Dashboard secret: số secret sắp hết hạn, số secret đã rotate, số alert `Secret scanning` [Đã thấy].
- Dashboard tenant: số request theo tenant VN, TH, HK, số lỗi theo tenant, số truy cập chéo tenant.
- Dashboard agent: số claim agent xử lý, tỷ lệ auto-approve, số output lệch schema, số prompt injection bị chặn.
- Dashboard bảo mật: số lần `Push protection` [Đã thấy] chặn push, số lần policy-as-code chặn, số lần break-glass role được assume.

### 2.2 SLO và MTTD, MTTR

Tên cấu hình:

- `SLO` [Nguồn thứ cấp]: mục tiêu mức dịch vụ. Ví dụ: 99.9% request claim xử lý trong 2 giây [Cần đối chiếu], con số cụ thể phải đối chiếu với hợp đồng từng insurer.
- `MTTD` [Nguồn thứ cấp]: thời gian phát hiện trung bình. Mục tiêu: phát hiện xóa hàng loạt trong 5 phút [Cần đối chiếu].
- `MTTR` [Nguồn thứ cấp]: thời gian phản ứng trung bình. Mục tiêu: thu hồi secret lộ trong 30 phút [Cần đối chiếu].

Đo MTTD và MTTR bằng cách diễn tập sự cố định kỳ, không đo bằng cảm giác. Mỗi lần diễn tập ghi lại thời gian thực tế và so với mục tiêu.

## 3. Alert rule cho từng mối đe dọa T1 đến T8

Mỗi rule dưới đây phải có: điều kiện trigger, kênh gửi, severity, runbook tương ứng. Tên metric và tên log group cụ thể [Cần đối chiếu], phải đối chiếu với tên thật trong CloudWatch hoặc SIEM.

### 3.1 T1 - Agent xóa nhầm dữ liệu S3 [Đã thấy]

- Trigger: `CloudTrail` [Đã thấy] ghi `DeleteObject` hàng loạt trên S3 claim bucket, hoặc `DeleteBucket`, hoặc `PutBucketPolicy` trên bucket production.
- Tên metric ví dụ: `S3DeleteObjectCount` [Cần đối chiếu], phải đối chiếu với tên metric thật.
- Severity: Critical.
- Runbook: khóa ngay role đang xóa, kiểm tra `S3 Versioning` [Đã thấy] và `Object Lock` [Đã thấy], restore từ versioning, ghi sự cố.

### 3.2 T2 - Prompt injection qua PDF claim [Đã thấy]

- Trigger: log agent ghi output lệch schema, hoặc tỷ lệ auto-approve tăng đột biến, hoặc phát hiện pattern injection trong PDF.
- Severity: High.
- Runbook: dừng agent xử lý tài liệu đó, cô lập file PDF, kiểm tra các claim đã bị agent duyệt tự động trong khoảng thời gian đó, review lại bằng người.

### 3.3 T3 - MCP server độc hại đọc file credential [Đã thấy]

- Trigger: log Claude Code ghi MCP server lạ được gọi, hoặc log truy cập `~/.aws/credentials`, `~/.aws/sso/cache`, `~/.config/gh/hosts.yml` [Đã thấy].
- Severity: Critical.
- Runbook: thu hồi toàn bộ token SSO của engineer đó, rotate secret liên quan, gỡ MCP server đó, kiểm tra CloudTrail xem token đã bị dùng từ IP lạ hay không.

### 3.4 T4 - Tắt guardrail, permission prompt [Đã thấy]

- Trigger: telemetry Claude Code ghi chế độ bypass được bật, hoặc managed settings bị sửa.
- Severity: High.
- Runbook: khóa laptop đó khỏi quyền prod, kiểm tra các lệnh đã chạy trong thời gian bypass, khôi phục managed settings.

### 3.5 T5 - Secret dài hạn bị lộ [Đã thấy]

- Trigger: `Secret scanning alerts` [Nguồn thứ cấp] trong GitHub, hoặc `Push protection` [Đã thấy] chặn push, hoặc CloudTrail ghi credential dùng từ IP lạ.
- Severity: Critical.
- Runbook: rotate secret ngay theo file 05 [Đã thấy], kiểm tra phạm vi dùng, xóa secret khỏi git bằng `git filter-repo` [Nguồn thứ cấp].

### 3.6 T6 - Human rubber-stamp [Đã thấy]

- Trigger: thời gian từ mở PR đến approve quá ngắn, ví dụ dưới 60 giây cho PR có diff lớn [Cần đối chiếu], hoặc tỷ lệ approve không comment quá cao.
- Severity: Medium, nhưng nếu PR đó chạm IAM hoặc S3 policy thì nâng lên High.
- Runbook: lấy mẫu PR đó review lại bằng security team, nhắc reviewer, nếu phát hiện thay đổi nguy hiểm đã merge thì rollback.

### 3.7 T7 - Trộn dữ liệu đa tenant [Đã thấy]

- Trigger: log ghi một principal chạm nhiều `tenant_id` trong thời gian ngắn, hoặc truy cập khác region, hoặc truy vấn không có `tenant_id`.
- Severity: Critical.
- Runbook: khóa ngay principal đó, xác định phạm vi tenant bị ảnh hưởng, thông báo cho DPO và pháp chế, không tự ý thông báo cho insurer nếu chưa có xác nhận pháp chế.

### 3.8 T8 - Không có audit log [Đã thấy]

- Trigger: log không về SIEM quá 15 phút, hoặc `CloudTrail` bị tắt, hoặc log bị xóa.
- Severity: High.
- Runbook: kiểm tra `Log file validation` [Nguồn thứ cấp] và `S3 Object Lock` [Đã thấy], khôi phục log từ backup, xác định ai đã tắt log.

Tên kênh cảnh báo cụ thể, ví dụ tên kênh Slack `#papaya-security-alerts` [Cần đối chiếu], phải đối chiếu với tên kênh thật. Không dùng tên kênh ví dụ này cho production nếu chưa đối chiếu.

## 4. On-call, severity và quy trình incident response

### 4.1 On-call

Tên cấu hình:

- `On-call schedule` [Nguồn thứ cấp]: lịch trực. Tên công cụ on-call cụ thể Papaya dùng [Cần đối chiếu], ví dụ PagerDuty, Opsgenie, hoặc lịch thủ công, chưa kiểm chứng.
- `Escalation policy` [Nguồn thứ cấp]: chính sách leo thang khi người trực không phản hồi. Thời gian leo thang cụ thể [Cần đối chiếu].

Quy tắc:

- Luôn có một người trực chính và một người trực phụ. Không để on-call không chính thức như hiện trạng ở file 01 T8 [Đã thấy].
- Cảnh báo Critical phải gọi điện hoặc nhắn trực tiếp, không chỉ gửi email.
- Người trực phải có quyền assume break-glass role có MFA, nhưng phải có approval của người thứ hai.

### 4.2 Severity

- `Sev1 - Critical` [Cần đối chiếu]: dữ liệu PHI/PII bị lộ, S3 claim bị xóa hàng loạt, secret prod bị lộ. Phản hồi trong 15 phút.
- `Sev2 - High` [Cần đối chiếu]: guardrail bị tắt, agent bị injection, log bị tắt. Phản hồi trong 30 phút.
- `Sev3 - Medium` [Cần đối chiếu]: rubber-stamp, policy fail lặp lại, cảnh báo không có hành động. Phản hồi trong 4 giờ.
- `Sev4 - Low` [Cần đối chiếu]: cảnh báo thông tin, dashboard lỗi hiển thị. Phản hồi trong 1 ngày.

Con số thời gian phản hồi trên [Cần đối chiếu], cần team xác nhận có đáp ứng được hay không.

### 4.3 Quy trình incident response 6 bước

1. Phát hiện: SIEM hoặc on-call phát hiện alert. Ghi thời gian phát hiện để tính MTTD.
2. Khoanh vùng: khóa principal, khóa role, dừng agent, dừng deploy liên quan. Không xóa log, không tắt máy trước khi lấy log.
3. Đánh giá phạm vi: xác định tenant nào, dữ liệu nào, thời gian nào bị ảnh hưởng. Dùng CloudTrail, log ứng dụng, log DB.
4. Khắc phục: restore từ versioning hoặc backup, rotate secret, sửa policy, deploy bản sửa qua CI như file 04 [Đã thấy]. Không sửa trực tiếp trên production bằng tay, trừ khi dùng break-glass role có ghi log.
5. Thông báo: thông báo cho DPO, pháp chế, insurer theo hợp đồng và luật từng nước. Thời hạn thông báo cụ thể [Cần đối chiếu], cần pháp chế xác nhận. Không tự ý thông báo cho báo chí hoặc mạng xã hội.
6. Postmortem: viết postmortem trong vòng 5 ngày làm việc [Cần đối chiếu]. Nội dung postmortem: dòng thời gian, nguyên nhân gốc, phạm vi ảnh hưởng, hành động đã làm, hành động ngăn lặp lại, người chịu trách nhiệm từng hành động, deadline.

### 4.4 Runbook break-glass

Break-glass role đã định nghĩa ở file 05 [Đã thấy]. Runbook dùng break-glass:

- Chỉ dùng khi sự cố Sev1 và CI không deploy được, hoặc cần xóa tài nguyên khẩn cấp.
- Phải có ticket sự cố, phải có 2 người security approve, phải có MFA.
- Mọi lệnh chạy bằng break-glass role phải ghi lại vào ticket, kèm `session name`, thời gian, lý do.
- Sau khi dùng xong, rotate credential liên quan, review toàn bộ CloudTrail của phiên break-glass đó, và viết postmortem.

Không dùng break-glass role cho deploy thường ngày. Deploy thường ngày đi qua CI.

## 5. Diễn tập và kiểm tra

- Diễn tập tái dựng sự cố từ log: chọn một sự cố giả, yêu cầu team tái dựng toàn bộ dòng thời gian chỉ từ log, không hỏi người đã làm. Nếu không tái dựng được thì log chưa đủ.
- Diễn tập tabletop: giả lập T1, T2, T5, T7, yêu cầu team đi qua 6 bước incident response, đo MTTD và MTTR thực tế.
- Diễn tập restore: restore S3 bucket từ versioning, restore Aurora từ snapshot, đo RTO và RPO thực tế [Cần đối chiếu].
- Tần suất diễn tập: mỗi quý 1 lần [Cần đối chiếu], cần team xác nhận.

## 6. Kiểm chứng trên repo canary và AWS account canary

### 6.1 Đã kiểm chứng từ file 01, 02, 03, 04, 05

- Nguyên tắc log tập trung bất biến và truy vết agent tới người [Đã thấy].
- Nguyên tắc một kênh cảnh báo duy nhất và alert phải có runbook [Đã thấy].
- Nguyên tắc break-glass role có MFA và alert [Đã thấy].

### 6.2 Cần test trên canary

Repo canary và AWS account canary là môi trường test riêng, không phải production [Cần đối chiếu]. Tên cụ thể [Cần đối chiếu].

Checklist test:

1. Tạo alert giả cho T1 trên account canary, xác nhận SIEM nhận được alert trong vài phút và on-call nhận được thông báo.
2. Tắt `CloudTrail` trên account canary, xác nhận alert T8 xuất hiện.
3. Thử đọc file S3 canary với `Data events` bật, xác nhận CloudTrail ghi được `GetObject` kèm `tenant_id` và `session name`.
4. Thử bật `pgaudit` trên Aurora canary, chạy truy vấn không có `tenant_id`, xác nhận log ghi được và RLS chặn nếu đã bật RLS.
5. Thử assume break-glass role canary mà không có MFA, xác nhận bị chặn.
6. Thử diễn tập restore S3 canary từ versioning, đo thời gian restore thực tế.
7. Thử tạo PR canary approve trong 10 giây với diff lớn, xác nhận alert rubber-stamp xuất hiện.
8. Thử gửi log chứa PII giả vào SIEM canary, xác nhận pipeline che PII trước khi lưu.

Chỉ khi 8 test trên đều pass trên canary thì mới áp cấu hình này cho production. Ghi kết quả test vào PR canary để làm bằng chứng.

## Giả định và giới hạn

- Chưa có truy cập vào AWS account, GCP project, GitHub org thật của Papaya nên mọi tên log group, tên metric, tên kênh cảnh báo, tên SIEM, tên công cụ on-call đều ghi là [Cần đối chiếu], không bịa giá trị thật.
- Tên cấu hình AWS, GCP, GitHub trong file này lấy từ tài liệu chính thức [Nguồn thứ cấp]. Nếu vendor đổi tên hiển thị trong console mới thì phải map lại tên mới và test lại trên canary.
- Yêu cầu thông báo vi phạm theo từng nước VN, TH, HK và hợp đồng từng insurer cần pháp chế và DPO xác nhận, file này không thay thế tư vấn pháp lý.
- File này không chứa secret thật, không chứa PII thật, không chứa log thật. Mọi ví dụ đều là dữ liệu giả.
