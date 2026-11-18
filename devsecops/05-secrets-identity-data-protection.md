# 05 — Secrets, Identity và Bảo vệ dữ liệu: Quản lý secret, danh tính, mã hóa, tenant isolation

> Liên kết: file này triển khai các control đã nêu ở 01-threat-model.md (T1, T3, T5, T7, T8), kiến trúc ở 02-architecture.md, guardrails ở 03-claude-code-guardrails.md, và workflow ở 04-cicd-workflow.md.
> Phạm vi: monorepo Papaya, GitHub Actions, AWS, Pulumi, Aurora, S3, KMS, Secrets Manager.
> Cách đọc nhãn: [Đã thấy] là đã thấy trong đề Papaya hoặc file 01, 02, 03, 04. [Nguồn thứ cấp] là theo tài liệu chính thức của AWS, GitHub, Pulumi. [Cần đối chiếu] là tên cấu hình, ARN, tên key, tên role cụ thể chưa kiểm chứng trên hệ thống thật của Papaya, phải test trên repo canary và AWS account canary trước khi áp cho production.
> Lưu ý trung thực: file này viết với Meta AI vì Claude Free hết lượt đến 12:30 AM. Không bịa tên cấu hình, ARN, tên key. Chỗ nào chưa chắc chắn thì ghi rõ là cần đối chiếu.

## Nguyên tắc xuyên suốt

1. Không có secret dài hạn trên laptop engineer và trong code. Secret chỉ sống trong hệ thống quản lý secret và trong bộ nhớ tạm thời của CI.
2. Mọi danh tính đều có tên người. Không dùng tài khoản chung, không dùng profile SSO chung, không dùng role chung cho nhiều tenant.
3. Mọi truy cập dữ liệu đều gắn tenant. Không có truy vấn nào không có `tenant_id`.
4. Mã hóa là mặc định, không phải tùy chọn. Dữ liệu không mã hóa thì không được tạo.
5. Dữ liệu thật không về dev. Dev chỉ dùng dữ liệu tổng hợp hoặc ẩn danh.
6. Mọi hành động nhạy cảm đều có log bất biến và truy vết được tới người.

## 1. Phân biệt nơi chứa secret: GitHub Secrets, AWS Secrets Manager, SSM Parameter Store

Ba nơi này hay bị dùng lẫn nhau, nên phải phân biệt rõ.

### 1.1 GitHub Secrets

Tên cấu hình đều là tên thật của GitHub:

- `Secrets` [Nguồn thứ cấp]: mục chứa secret của repo trong Settings.
- `Repository secrets` [Nguồn thứ cấp]: secret dùng cho toàn repo. Chỉ dùng cho secret không nhạy cảm theo môi trường, ví dụ token đọc CI.
- `Environment secrets` [Đã thấy]: secret chỉ dùng cho một Environment. Tên này đã thấy ở file 04. ARN role prod chỉ nằm trong `Environment secrets` của prod, không nằm trong secret chung.
- `Organization secrets` [Nguồn thứ cấp]: secret dùng chung cho nhiều repo trong org. Chỉ dùng cho secret chung thật sự, ví dụ token quét bảo mật.
- `Dependabot secrets` [Nguồn thứ cấp]: secret riêng cho Dependabot. Không dùng lẫn với secret CI.

Quy tắc: GitHub Secrets chỉ chứa secret để CI chạy, ví dụ ARN role để assume qua OIDC, tên stack, tên vùng. Không chứa secret dữ liệu như mật khẩu DB, API key của insurer, token claim. Các secret dữ liệu đó nằm trong AWS Secrets Manager, xem Mục 1.2.

Giá trị ARN cụ thể trong GitHub Secrets [Cần đối chiếu], phải lấy từ AWS account thật, không bịa ARN trong file này.

### 1.2 AWS Secrets Manager

Tên cấu hình đều là tên thật của AWS:

- `Secrets Manager` [Nguồn thứ cấp]: dịch vụ quản lý secret có rotation tự động của AWS.
- `Secret` [Nguồn thứ cấp]: một đối tượng secret trong Secrets Manager, ví dụ mật khẩu DB của một tenant.
- `Automatic rotation` [Nguồn thứ cấp]: tính năng tự động xoay secret. Phải bật cho mọi secret DB và API key có thể xoay.
- `Rotation interval` [Cần đối chiếu]: khoảng thời gian xoay. Đề xuất: 30 ngày cho DB prod, 90 ngày cho API key [Cần đối chiếu], cần team xác nhận có chấp nhận xoay thường xuyên hay không.
- `KMS key for encryption` [Nguồn thứ cấp]: key mã hóa secret đó. Mỗi tenant dùng KMS key riêng, xem Mục 4.
- `Resource policy` [Nguồn thứ cấp]: policy giới hạn ai được đọc secret đó. Chỉ role của tenant đó và role CI của tenant đó mới đọc được.

Dùng Secrets Manager cho: mật khẩu Aurora, API key insurer, token dịch vụ, private key. Không dùng Secrets Manager để chứa file lớn hoặc dữ liệu claim.

### 1.3 SSM Parameter Store

Tên cấu hình:

- `Parameter Store` [Nguồn thứ cấp]: dịch vụ lưu tham số của AWS Systems Manager.
- `SecureString` [Nguồn thứ cấp]: loại parameter đã mã hóa bằng KMS. Mọi secret trong Parameter Store phải là `SecureString`, không dùng `String` cho secret.
- `String` [Nguồn thứ cấp]: loại parameter không mã hóa. Chỉ dùng cho cấu hình không nhạy cảm, ví dụ tên vùng, tên stack.
- `Tier` [Nguồn thứ cấp]: `Standard` hoặc `Advanced`. Dùng `Standard` nếu đủ, dùng `Advanced` nếu cần lưu nhiều parameter hoặc policy phức tạp [Cần đối chiếu].

Dùng Parameter Store cho: cấu hình không nhạy cảm và secret ít xoay, ví dụ tên bucket, tên queue, feature flag. Dùng Secrets Manager cho secret cần rotation tự động. Không dùng cả hai nơi cho cùng một secret, sẽ gây lệch và khó rotate.

Bảng quyết định:

| Loại giá trị | Để ở đâu | Vì sao |
|---|---|---|
| ARN role OIDC cho CI | GitHub Environment secrets | CI cần để assume role, không phải secret dữ liệu |
| Mật khẩu DB prod | AWS Secrets Manager + Automatic rotation | Cần xoay tự động, cần KMS riêng |
| API key insurer | AWS Secrets Manager + Automatic rotation | Secret dữ liệu, cần giới hạn theo tenant |
| Tên bucket, tên stack | SSM Parameter Store String | Cấu hình, không nhạy cảm |
| Feature flag, tên vùng | SSM Parameter Store String | Cấu hình, không nhạy cảm |

Tên secret cụ thể, tên parameter cụ thể [Cần đối chiếu], phải đối chiếu với danh sách secret thật của Papaya.

## 2. Quy trình rotation và thu hồi khi lộ secret

### 2.1 Rotation định kỳ

- Secret DB: bật `Automatic rotation` [Nguồn thứ cấp] trong Secrets Manager. Lambda rotation do AWS cung cấp [Nguồn thứ cấp] sẽ tạo mật khẩu mới, cập nhật DB, cập nhật secret. Ứng dụng phải đọc secret từ Secrets Manager mỗi lần kết nối hoặc cache ngắn hạn, không hardcode mật khẩu cũ.
- API key: rotation bằng cách tạo key mới, deploy ứng dụng dùng key mới, sau đó revoke key cũ. Không revoke key cũ trước khi deploy xong, sẽ gây gián đoạn.
- GitHub Personal Access Token: không dùng PAT dài hạn cho CI. Nếu còn PAT cũ thì xóa và thay bằng OIDC như file 04 [Đã thấy]. Nếu bắt buộc phải dùng PAT cho công cụ ngoài CI thì đặt expiry ngắn nhất có thể và lưu trong `Environment secrets` [Đã thấy].

`Rotation interval` cụ thể [Cần đối chiếu], xem Mục 1.2.

### 2.2 Khi nghi lộ secret

Coi như secret đã lộ, dù chưa có bằng chứng bị dùng. Không chờ xác nhận mới rotate.

Bước 1: Revoke và rotate ngay. Trong Secrets Manager, chọn `Rotate secret immediately` [Nguồn thứ cấp]. Trong GitHub, xóa secret cũ trong `Repository secrets` hoặc `Environment secrets` [Nguồn thứ cấp] và tạo secret mới.
Bước 2: Kiểm tra `CloudTrail` [Nguồn thứ cấp] để xem secret đó đã bị dùng từ IP, thời gian, principal nào. Tên `CloudTrail` [Đã thấy] đã nhắc ở file 01 T8.
Bước 3: Xóa secret khỏi code và lịch sử git. Dùng `git filter-repo` [Nguồn thứ cấp] hoặc công cụ tương đương, không chỉ xóa ở commit mới nhất. Nếu secret đã push lên GitHub thì `Secret scanning` [Đã thấy] sẽ báo alert, phải xử lý alert đó.
Bước 4: Ghi sự cố vào log theo T8 trong file 01 [Đã thấy]: ai phát hiện, secret nào, khi nào rotate, phạm vi ảnh hưởng.
Bước 5: Rà soát vì sao secret lộ: do copy vào `.env`, do log CI in secret, do developer paste vào chat, do MCP server đọc file. Sửa nguyên nhân gốc, không chỉ rotate.

Không dùng `git push --force` để che secret mà không rotate. Secret đã từng xuất hiện trong commit thì coi như đã lộ.

## 3. Identity: OIDC, SSO, MFA, break-glass

### 3.1 OIDC federation

Đã chi tiết ở file 04 [Đã thấy]. Nhắc lại nguyên tắc: CI không có access key. CI xin token OIDC từ GitHub, AWS tin cậy token qua `Identity Provider` [Nguồn thứ cấp] và cấp role tạm thời.

Tên cấu hình AWS:

- `Identity Provider` [Nguồn thứ cấp]: đối tượng IAM tin cậy GitHub OIDC.
- `IAM Role` [Nguồn thứ cấp]: role mà CI assume.
- `Trust policy` [Nguồn thứ cấp]: policy tin cậy, giới hạn chỉ repo và nhánh cụ thể mới assume được. Ví dụ: chỉ repo `papaya-devsecops-challenge` [Cần đối chiếu] và nhánh `main` mới assume role prod.
- `Session name` [Nguồn thứ cấp]: tên phiên AWS. Phải gắn danh tính: `github-run-<run-id>-<actor>` cho CI, `claude-code-<username>` cho laptop, xem Mục 3.2. Tên session cụ thể [Cần đối chiếu], phải đối chiếu với chuẩn đặt tên thật của Papaya.

Không dùng `*` trong `Trust policy`. Chỉ cho đúng repo, đúng nhánh, đúng Environment.

### 3.2 SSO và session name gắn danh tính

Tên cấu hình:

- `AWS IAM Identity Center` [Nguồn thứ cấp]: dịch vụ SSO của AWS, tên mới của AWS SSO. Nếu Papaya đang dùng tên cũ `AWS SSO` thì đó là cùng một dịch vụ, cần đối chiếu tên hiển thị [Cần đối chiếu].
- `Permission Set` [Nguồn thứ cấp]: tập quyền gán cho user trong Identity Center. Ví dụ: `ReadOnly` cho laptop, `PlatformAdmin` cho platform team [Cần đối chiếu].
- `Session name` [Nguồn thứ cấp]: đã nhắc ở trên. Mục đích: CloudTrail ghi rõ ai đã làm gì, không chỉ ghi tên profile chung.

Quy tắc:

- Laptop engineer chỉ có `Permission Set` read-only tới production [Đã thấy]. Quyền ghi prod chỉ nằm ở CI.
- Mỗi engineer đăng nhập bằng tài khoản cá nhân, không dùng tài khoản chung `admin` hoặc `deploy`.
- Mọi phiên AWS phải có `Session name` gắn tên người và nguồn: `via=claude-code`, `via=ci`, `via=console` [Đã thấy]. Nếu session name là tên chung thì không truy vết được theo T8.

### 3.3 MFA bắt buộc

Tên cấu hình:

- `MFA` [Nguồn thứ cấp]: xác thực đa yếu tố.
- `Require MFA` [Nguồn thứ cấp]: điều kiện trong IAM policy yêu cầu MFA. Ví dụ: policy deny nếu `aws:MultiFactorAuthPresent` bằng `false` [Nguồn thứ cấp].
- `Virtual MFA device` [Nguồn thứ cấp] hoặc `Hardware MFA device` [Nguồn thứ cấp]: thiết bị MFA. Dùng authenticator app hoặc hardware key, không dùng SMS nếu có thể [Cần đối chiếu].

Quy tắc: mọi đăng nhập console AWS, mọi assume role prod, mọi hành động break-glass đều phải có MFA. Role CI không dùng MFA vì CI dùng OIDC, nhưng job prod phải có approval của người có MFA, xem file 04 [Đã thấy].

### 3.4 Break-glass role

Tên cấu hình:

- `Break-glass role` [Cần đối chiếu]: tên này là tên quy ước, không phải tên cấu hình có sẵn của AWS. Phải đối chiếu xem Papaya gọi role này là gì, ví dụ `EmergencyAccess` hoặc `BreakGlass` [Cần đối chiếu]. Trong file này dùng tên `Break-glass role` để chỉ khái niệm.

Đặc điểm:

- Role này là role duy nhất được phép xóa bucket, xóa KMS, tắt Object Lock trong trường hợp khẩn cấp. Bình thường không ai assume được.
- Muốn assume phải có MFA, phải có approval của 2 người security, phải có ticket sự cố, và phải có alert tự động gửi tới kênh on-call.
- Mọi hành động của break-glass role đều bị log vào `CloudTrail` [Nguồn thứ cấp] và gửi alert.
- Sau khi dùng xong phải rotate credential liên quan và review lại toàn bộ hành động đã làm.
- Không dùng break-glass role cho deploy thường ngày. Deploy thường ngày đi qua CI như file 04.

## 4. KMS, encryption at rest và in transit

### 4.1 KMS key riêng theo tenant

Tên cấu hình AWS:

- `AWS KMS` [Nguồn thứ cấp]: dịch vụ quản lý key mã hóa.
- `Customer managed key` [Nguồn thứ cấp]: key do Papaya tự quản lý, khác với `AWS managed key` [Nguồn thứ cấp] do AWS quản lý. Phải dùng `Customer managed key` cho dữ liệu PHI/PII, để kiểm soát được ai dùng key và khi nào revoke.
- `Key policy` [Nguồn thứ cấp]: policy của key, giới hạn ai được dùng key đó. Chỉ role của tenant đó mới dùng được key của tenant đó.
- `Automatic key rotation` [Nguồn thứ cấp]: tự động xoay key. Phải bật cho mọi customer managed key.
- `Key alias` [Nguồn thứ cấp]: tên dễ đọc của key, ví dụ `alias/papaya-vn-claims` [Cần đối chiếu]. Tên alias cụ thể phải đối chiếu với chuẩn đặt tên thật của Papaya.

Quy tắc:

- Mỗi tenant VN, TH, HK có KMS key riêng [Đã thấy]. Không dùng chung một key cho nhiều tenant, nếu không khi revoke key của một tenant sẽ ảnh hưởng tenant khác.
- Mỗi môi trường dev, staging, prod có key riêng. Key dev không dùng cho prod.
- Khi một tenant rời Papaya, chỉ cần disable key của tenant đó là dữ liệu của tenant đó không đọc được nữa, không ảnh hưởng tenant khác.

### 4.2 Encryption at rest

- S3: bật `Server-side encryption` [Nguồn thứ cấp] với KMS key của tenant. Chặn tạo bucket không có encryption bằng policy-as-code như file 04 [Đã thấy].
- Aurora: bật `Storage encrypted` [Nguồn thứ cấp]. Tên này là tên thật của RDS và Aurora. Nếu tắt thì policy-as-code phải chặn.
- EBS, EFS: bật encryption mặc định bằng `Default encryption` [Nguồn thứ cấp] trong account.
- Secrets Manager và Parameter Store: mã hóa bằng KMS key của tenant, xem Mục 1.

### 4.3 Encryption in transit

- Mọi API phải qua HTTPS, không dùng HTTP. Trong AWS, dùng `TLS 1.2` trở lên [Nguồn thứ cấp].
- Kết nối DB phải qua TLS. Trong Pulumi, cấu hình `require_secure_transport` hoặc tương đương [Cần đối chiếu], phải đối chiếu với tham số thật của Aurora.
- Không gửi PHI/PII qua Slack, email, log CI. Log phải che PII, xem Mục 6.

## 5. Data residency và tenant isolation

### 5.1 Data residency VN, TH, HK

Tên cấu hình:

- `AWS Region` [Nguồn thứ cấp]: vùng AWS. Dữ liệu tenant VN ở region theo hợp đồng VN, tenant TH ở region TH, tenant HK ở region HK [Cần đối chiếu]. Tên region cụ thể phải đối chiếu với hợp đồng từng insurer, không bịa region trong file này.
- `Service Control Policy` viết tắt `SCP` [Đã thấy]: policy ở tầng Organization chặn tạo tài nguyên ngoài region được phép. Tên này đã thấy ở file 01 T1.
- `Cross-border transfer` [Cần đối chiếu]: khái niệm chuyển dữ liệu qua biên giới. Yêu cầu pháp lý cụ thể theo từng nước cần pháp chế xác nhận, file này không thay thế tư vấn pháp lý.

Quy tắc:

- Không copy dữ liệu tenant VN sang region của tenant TH, dù để debug.
- Không gửi dữ liệu tenant sang model AI ở vùng khác nếu hợp đồng cấm. Nếu dùng model AI thì phải kiểm tra vùng của model đó và ghi rõ trong hồ sơ tenant [Cần đối chiếu].
- SCP chặn `s3:CreateBucket`, `rds:CreateDBInstance`, `s3:CopyObject` ngoài region được phép [Nguồn thứ cấp].

### 5.2 Tenant isolation với Row-Level Security

Tên cấu hình:

- `Row-Level Security` viết tắt `RLS` [Nguồn thứ cấp]: tính năng của Postgres giới hạn mỗi user chỉ thấy row của tenant mình.
- `Postgres RLS policy` [Nguồn thứ cấp]: policy RLS trong Postgres.
- `tenant_id` [Đã thấy]: cột bắt buộc trong mọi bảng chứa dữ liệu tenant. Tên này đã thấy ở file 01 T7.

Quy tắc:

- Mọi bảng claim, member, policy đều có cột `tenant_id` [Đã thấy]. Mọi truy vấn đều phải có `WHERE tenant_id = ...`, không có truy vấn nào không có tenant.
- Ứng dụng không chạy SQL tự do. Truy vấn đi qua tầng truy cập dữ liệu ép `tenant_id` từ token đăng nhập, không lấy `tenant_id` từ input của người dùng.
- Agent AI không được chạy SQL tự do. Agent chỉ gọi API đã ép `tenant_id`.
- Vector store, RAG, prompt cache tách theo tenant. Không dùng chung vector store cho nhiều tenant, vì ngữ cảnh của tenant này có thể lọt vào câu trả lời cho tenant khác.
- Test cô lập tự động trong CI: tạo dữ liệu tenant A và tenant B, xác nhận tenant A không đọc được dữ liệu tenant B. Test này phải chạy trong job `policy` hoặc `test` [Cần đối chiếu].

Cô lập vật lý mạnh hơn nếu hợp đồng yêu cầu: mỗi tenant có AWS account riêng, hoặc tối thiểu bucket, KMS key, DB schema riêng [Đã thấy]. Quyết định dùng account riêng hay schema riêng [Cần đối chiếu], phải đối chiếu với hợp đồng từng insurer.

## 6. Masking và cấm copy dữ liệu thật về dev

- Dữ liệu dev và test phải là dữ liệu tổng hợp hoặc ẩn danh [Đã thấy]. Không copy snapshot DB prod về dev.
- Nếu cần dữ liệu gần thật để debug thì dùng dữ liệu đã masking: CCCD thay bằng số giả, tên thay bằng tên giả, số tài khoản thay bằng số giả, bệnh án thay bằng text giả. Masking phải làm ở tầng pipeline, không làm bằng tay.
- Agent trên laptop không có đường vào dữ liệu tenant thật [Đã thấy]. Debug bằng dữ liệu giả.
- Log không chứa PHI/PII. Không ghi nội dung bệnh án, CCCD, số tài khoản vào log CI, log ứng dụng, log Slack. Nếu log vô tình chứa PII thì phải xóa log đó và sửa code ghi log.
- Khi gửi log cho vendor hoặc AI ngoài, phải che PII trước khi gửi.

## 7. Audit log CloudTrail và truy vết

Tên cấu hình:

- `CloudTrail` [Đã thấy]: dịch vụ log API AWS. Đã nhắc ở file 01 T8.
- `Management events` [Nguồn thứ cấp]: log các hành động quản lý, ví dụ tạo bucket, tạo role.
- `Data events` [Nguồn thứ cấp]: log các hành động dữ liệu, ví dụ `GetObject`, `PutObject` trên S3 claim bucket. Phải bật `Data events` cho S3 claim bucket, nếu không sẽ không biết ai đã đọc file claim nào.
- `Log file validation` [Nguồn thứ cấp]: tính năng xác thực file log không bị sửa.
- `S3 Object Lock` [Đã thấy]: khóa log không cho xóa, đã nhắc ở file 01 T1.
- `CloudWatch Logs` [Nguồn thứ cấp] hoặc `SIEM` [Nguồn thứ cấp]: nơi tập trung log để cảnh báo.

Quy tắc:

- CloudTrail tổng hợp về một account log riêng, bật `Log file validation`, bật `S3 Object Lock`, tách quyền: người vận hành không xóa được log.
- Mọi log đều có `tenant_id`, `actor`, `session name`, `run_id`, `sha` nếu từ CI.
- Alert khi: một principal chạm nhiều tenant, truy cập khác region, xóa hàng loạt, assume break-glass role, tắt `Secret scanning` hoặc `Push protection`.
- Diễn tập tái dựng sự cố từ log định kỳ để chứng minh log đủ dùng.

## 8. Kiểm chứng trên repo canary và AWS account canary

### 8.1 Đã kiểm chứng từ file 01, 02, 03, 04

- Nguyên tắc không có secret dài hạn, OIDC thay access key [Đã thấy].
- Nguyên tắc tenant isolation với `tenant_id` và KMS riêng [Đã thấy].
- Nguyên tắc cấm copy dữ liệu thật về dev [Đã thấy].
- Nguyên tắc audit log bất biến [Đã thấy].

### 8.2 Cần test trên canary

Repo canary và AWS account canary là môi trường test riêng, không phải production [Cần đối chiếu]. Tên cụ thể [Cần đối chiếu].

Checklist test:

1. Tạo secret trong Secrets Manager trên account canary, bật `Automatic rotation` [Nguồn thứ cấp], xác nhận rotation chạy và ứng dụng vẫn kết nối được bằng secret mới.
2. Tạo KMS key riêng cho 2 tenant giả trên account canary, xác nhận tenant A không giải mã được dữ liệu của tenant B.
3. Tạo S3 bucket không có encryption trên account canary, xác nhận policy-as-code chặn.
4. Tạo `Permission Set` read-only trong `AWS IAM Identity Center` [Nguồn thứ cấp] trên account canary, xác nhận laptop chỉ đọc được, không ghi được prod canary.
5. Thử assume break-glass role trên account canary mà không có MFA, xác nhận bị chặn do `Require MFA` [Nguồn thứ cấp].
6. Thử truy vấn DB canary không có `WHERE tenant_id`, xác nhận RLS chặn hoặc tầng truy cập dữ liệu chặn.
7. Thử copy dữ liệu tenant A sang bucket tenant B trên account canary, xác nhận SCP hoặc bucket policy chặn.
8. Thử bật `Data events` cho S3 canary, đọc file, xác nhận CloudTrail ghi được `GetObject` kèm `tenant_id` và `session name`.

Chỉ khi 8 test trên đều pass trên canary thì mới áp cấu hình này cho production. Ghi kết quả test vào PR canary để làm bằng chứng.

## Giả định và giới hạn

- Chưa có truy cập vào AWS account và GitHub org thật của Papaya nên mọi ARN, tên key, tên secret, tên role, tên region, tên team đều ghi là [Cần đối chiếu], không bịa giá trị thật.
- Tên cấu hình AWS và GitHub trong file này lấy từ tài liệu chính thức [Nguồn thứ cấp]. Nếu AWS hoặc GitHub đổi tên hiển thị trong console mới thì phải map lại tên mới và test lại trên canary.
- Yêu cầu pháp lý VN, TH, HK và hợp đồng từng insurer cần pháp chế và DPO xác nhận, file này không thay thế tư vấn pháp lý.
- File này không chứa secret thật, không chứa ARN thật, không chứa key thật. Mọi placeholder phải được thay bằng giá trị thật sau khi đối chiếu.
