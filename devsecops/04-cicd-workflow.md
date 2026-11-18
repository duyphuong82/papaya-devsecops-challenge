# 04 — CI/CD Workflow an toàn: OIDC, Environments, Branch Protection, Policy-as-Code

> Liên kết: file này triển khai các control đã nêu ở 01-threat-model.md (T5, T6, T8) và kiến trúc ở 02-architecture.md, và tuân thủ guardrails ở 03-claude-code-guardrails.md.
> Phạm vi: monorepo Papaya, GitHub Actions, Pulumi, AWS. Dữ liệu PHI/PII không đi qua log CI.
> Cách đọc nhãn: [Đã thấy] là đã thấy trong đề Papaya hoặc file 01, 02, 03. [Nguồn thứ cấp] là theo tài liệu chính thức của GitHub, AWS, Pulumi, OPA. [Cần đối chiếu] là tên cấu hình hoặc giá trị cụ thể chưa kiểm chứng trên repo thật của Papaya, phải test trên repo canary trước khi áp cho repo chính.
> Lưu ý trung thực: file này viết với Meta AI vì Claude Free hết lượt đến 12:30 AM. Không bịa tên cấu hình GitHub. Chỗ nào chưa chắc chắn thì ghi rõ là cần đối chiếu.

## Nguyên tắc xuyên suốt

1. Không có long-lived secret trong CI. Mọi quyền AWS đều qua OIDC federation với role ngắn hạn.
2. Không ai tự duyệt code của chính mình vào production. Người viết, người duyệt, người approve deploy là các vai trò khác nhau.
3. Mọi thay đổi production phải đi qua PR, CI xanh, policy-as-code xanh, preview diff đọc được, và approval của người có tên.
4. Control do hệ thống ép, không dựa vào kỷ luật. Nếu CI fail thì không deploy được, dù là admin.
5. Log CI không chứa secret, không chứa PHI/PII. Secret chỉ nằm trong GitHub Secrets hoặc Secrets Manager, không nằm trong log.

## 1. GitHub Actions workflow mẫu dùng OIDC thay cho long-lived secret

### 1.1 Vì sao dùng OIDC

Trong 01-threat-model.md T5, secret dài hạn bị lộ là rủi ro Critical [Đã thấy]. OIDC giải quyết bằng cách: GitHub Actions xin token OIDC ngắn hạn từ GitHub, AWS tin cậy token đó qua Identity Provider, rồi cấp role tạm thời. Không có AWS access key nào lưu trong repo.

Các tên cấu hình liên quan ở đây đều là tên thật của GitHub Actions:

- `permissions` [Nguồn thứ cấp]: khối quyền của workflow hoặc job trong file YAML.
- `id-token: write` [Nguồn thứ cấp]: quyền cần thiết để job xin token OIDC. Không có quyền này thì OIDC không chạy.
- `contents: read` [Nguồn thứ cấp]: quyền đọc code, mức tối thiểu cho job checkout.
- `pull-requests: write` [Nguồn thứ cấp]: quyền để job đăng comment preview diff lên PR. Chỉ cấp cho job cần đăng comment, không cấp cho toàn workflow.
- `aws-actions/configure-aws-credentials` [Nguồn thứ cấp]: action chính thức của AWS để đổi token OIDC lấy credential tạm thời.
- `role-to-assume` [Nguồn thứ cấp]: input của action trên, là ARN của IAM role AWS. Giá trị ARN cụ thể [Cần đối chiếu], phải lấy từ AWS account thật của Papaya, không bịa ARN trong file này.
- `aws-region` [Nguồn thứ cấp]: input vùng AWS. Giá trị cụ thể theo từng tenant VN, TH, HK [Cần đối chiếu].

Không dùng các biến sau trong CI: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` dạng long-lived [Nguồn thứ cấp]. Nếu repo cũ còn dùng thì phải xóa và thay bằng OIDC. Việc quét để tìm secret cũ xem Mục 5.

### 1.2 Workflow mẫu

File đặt tại `.github/workflows/deploy.yml` [Cần đối chiếu]. Tên file này chưa kiểm chứng trên repo thật của Papaya, cần đối chiếu xem Papaya đã dùng tên nào, nếu đã có tên khác thì giữ tên đó.

```yaml
name: deploy

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write
  pull-requests: write

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  preview:
    name: Pulumi preview
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      id-token: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@<FULL-COMMIT-SHA>
        with:
          fetch-depth: 0

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@<FULL-COMMIT-SHA>
        with:
          role-to-assume: <ARN-ROLE-PREVIEW-CAN-DOI-CHIEU>
          aws-region: <REGION-CAN-DOI-CHIEU>

      - name: Install Pulumi
        uses: pulumi/actions@<FULL-COMMIT-SHA>
        with:
          command: preview
          stack: dev
          work-dir: infra/pulumi

      - name: Post preview diff to PR
        uses: actions/github-script@<FULL-COMMIT-SHA>
        with:
          script: |
            const fs = require('fs');
            const diff = fs.readFileSync('preview.txt', 'utf8').slice(0, 60000);
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: '## Pulumi preview diff\n\n```\n' + diff + '\n```\n\nReviewer phải đọc diff này trước khi Approve.'
            });

  policy:
    name: Policy as code
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@<FULL-COMMIT-SHA>
      - name: Conftest policy check
        uses: open-policy-agent/setup-opa@<FULL-COMMIT-SHA>
        with:
          version: latest
      - name: Run conftest
        run: |
          conftest test --policy policy/ pulumi-plan.json

  apply-staging:
    name: Apply staging
    runs-on: ubuntu-latest
    needs: [preview, policy]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: staging
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@<FULL-COMMIT-SHA>
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@<FULL-COMMIT-SHA>
        with:
          role-to-assume: <ARN-ROLE-STAGING-CAN-DOI-CHIEU>
          aws-region: <REGION-CAN-DOI-CHIEU>
      - name: Pulumi up staging
        run: pulumi up --yes --stack staging --work-dir infra/pulumi

  apply-prod:
    name: Apply prod
    runs-on: ubuntu-latest
    needs: [apply-staging]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: prod
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@<FULL-COMMIT-SHA>
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@<FULL-COMMIT-SHA>
        with:
          role-to-assume: <ARN-ROLE-PROD-CAN-DOI-CHIEU>
          aws-region: <REGION-CAN-DOI-CHIEU>
      - name: Pulumi up prod
        run: pulumi up --yes --stack prod --work-dir infra/pulumi
```

Giải thích các điểm quan trọng trong workflow trên:

- `environment: staging` và `environment: prod` [Nguồn thứ cấp]: trường gắn job với GitHub Environment. Job apply prod chỉ chạy khi Environment prod cho phép, xem Mục 2.
- `concurrency` [Nguồn thứ cấp]: chặn hai lần deploy cùng lúc đè nhau.
- Job `preview` chỉ chạy trên `pull_request` [Nguồn thứ cấp], không apply. Job `apply-prod` chỉ chạy trên `push` vào `main` [Nguồn thứ cấp], sau khi PR đã merge.
- Không có job nào chạy `pulumi destroy` trong CI. Xem Mục 4 để biết vì sao chặn hẳn lệnh này.
- Placeholder `<FULL-COMMIT-SHA>` và `<ARN-ROLE-...>` [Cần đối chiếu]: phải thay bằng SHA thật và ARN thật sau khi đối chiếu, không dùng SHA giả trong production.

## 2. GitHub Environments dev, staging, prod

### 2.1 Tạo Environment

Tên Environment đề xuất: `dev`, `staging`, `prod` [Cần đối chiếu]. Tên này chưa kiểm chứng trên repo thật của Papaya. Nếu Papaya đã dùng tên khác, ví dụ `development` hoặc `production`, thì giữ tên đã có, không tạo tên mới trùng ý nghĩa.

Vị trí cấu hình: trong repo, vào Settings, rồi Environments [Nguồn thứ cấp]. Mỗi Environment có các cài đặt sau, tất cả đều là tên thật của GitHub:

- `Required reviewers` [Cần đối chiếu]: danh sách người hoặc team bắt buộc phải approve trước khi job deploy chạy. Giá trị cụ thể là ai [Cần đối chiếu], vì Papaya chưa công bố danh sách approver. Nguyên tắc: prod cần ít nhất 2 approver có tên, staging cần ít nhất 1 approver, dev có thể không cần approver hoặc 1 approver.
- `Wait timer` [Nguồn thứ cấp]: thời gian chờ trước khi deploy chạy, để có cửa sổ hủy nếu phát hiện sai. Đề xuất: dev 0 phút, staging 0 phút, prod 5 đến 10 phút [Cần đối chiếu], cần team xác nhận có chấp nhận chờ hay không.
- `Deployment branches and tags` [Nguồn thứ cấp]: giới hạn Environment chỉ deploy từ nhánh hoặc tag nào. Đề xuất: `prod` chỉ từ `main`, `staging` chỉ từ `main`, `dev` cho phép từ `main` và các nhánh feature nếu cần [Cần đối chiếu].
- `Environment secrets` [Nguồn thứ cấp]: secret chỉ dùng cho Environment đó. Ví dụ: ARN role prod chỉ nằm trong `Environment secrets` của prod, không nằm trong secret chung của repo.
- `Environment variables` [Nguồn thứ cấp]: biến chỉ dùng cho Environment đó, ví dụ tên stack Pulumi.

### 2.2 Named approver và prevent self-review

GitHub không có toggle tên là `Prevent self-review` [Cần đối chiếu]. Đây là điểm hay bị bịa tên cấu hình, nên cần nói rõ: không có toggle đó, phải thực hiện prevent self-review bằng tổ hợp ba cơ chế sau:

1. `Required reviewers` [Cần đối chiếu] ở Environment: chọn đúng người approver cho prod, và đảm bảo người tạo PR không nằm trong danh sách approver duy nhất. Nếu chỉ có một approver và người đó cũng là tác giả PR thì GitHub vẫn cho họ approve, nên phải có ít nhất 2 approver cho prod và quy định bằng văn bản là tác giả không được approve chính mình.
2. Branch protection `Require a pull request before merging` [Nguồn thứ cấp] cộng với `Require approvals` [Nguồn thứ cấp] ở Mục 3: GitHub không tính approval của tác giả PR vào số approval yêu cầu. Đây là cơ chế ngăn tự duyệt ở tầng PR.
3. `CODEOWNERS` [Đã thấy]: file này ở Mục 3 bắt buộc reviewer đúng team phải duyệt. Tác giả không thể tự thay thế reviewer CODEOWNERS bằng chính mình.

Quy trình đúng cho prod: engineer tạo PR, CODEOWNERS reviewer duyệt PR, merge vào main, CI chạy staging, sau đó job prod chờ `Required reviewers` [Cần đối chiếu] approve. Người approve prod phải khác người tạo PR và khác người duyệt PR nếu có thể. Ghi rõ tên approver vào log deploy để truy vết theo T8 trong file 01 [Đã thấy].

### 2.3 Phân tách quyền theo Environment

- Role AWS cho dev chỉ có quyền ở account dev [Cần đối chiếu].
- Role AWS cho staging chỉ có quyền ở account staging [Cần đối chiếu].
- Role AWS cho prod chỉ có quyền ở account prod, và chỉ CI mới assume được role này [Cần đối chiếu].
- Laptop engineer không có quyền assume role prod. Quyền ghi prod chỉ nằm ở CI, giống nguyên tắc ở file 01 [Đã thấy].

## 3. Branch protection và CODEOWNERS cho monorepo

### 3.1 Branch protection cho nhánh main

GitHub có hai cách cấu hình: `Branch protection rules` cổ điển và `Rulesets` mới [Cần đối chiếu]. Tên `Rulesets` [Nguồn thứ cấp] là tên thật của GitHub. Chưa biết Papaya đang dùng cách nào [Cần đối chiếu], nên dưới đây ghi theo tên của `Branch protection rules` cổ điển, vì tên này ổn định hơn. Nếu Papaya đã chuyển sang `Rulesets` thì map các rule sau sang Rulesets tương đương và test lại trên repo canary.

Các cài đặt cần bật cho nhánh `main` [Cần đối chiếu], tên nhánh này cần đối chiếu vì Papaya có thể dùng `master` hoặc `main`:

- `Require a pull request before merging` [Nguồn thứ cấp]: cấm push trực tiếp vào main, mọi thay đổi phải qua PR.
- `Require approvals` [Nguồn thứ cấp]: số approval yêu cầu. Đề xuất: 1 cho thay đổi thường, 2 cho thay đổi chạm infra hoặc prod [Cần đối chiếu].
- `Dismiss stale pull request approvals when new commits are pushed` [Nguồn thứ cấp]: nếu code đổi sau khi đã approve thì approval cũ bị hủy, phải duyệt lại. Bắt buộc bật để chống approve xong rồi lén sửa code.
- `Require review from Code Owners` [Đã thấy]: bắt buộc reviewer trong CODEOWNERS phải duyệt. Tên này đã thấy trong file 01 T6.
- `Require status checks to pass before merging` [Nguồn thứ cấp]: PR chỉ merge được khi các check bắt buộc xanh. Các check bắt buộc đề xuất: `preview`, `policy`, `secret-scanning`, `test` [Cần đối chiếu], tên check cụ thể phải khớp với tên job trong workflow thật.
- `Require branches to be up to date before merging` [Nguồn thứ cấp]: PR phải rebase hoặc merge main mới nhất trước khi merge, để tránh merge code cũ.
- `Require signed commits` [Cần đối chiếu]: yêu cầu commit có chữ ký GPG hoặc SSH. Bật hay không [Cần đối chiếu], vì nếu bật mà team chưa setup signing thì sẽ kẹt toàn bộ PR.
- `Do not allow bypassing the above settings` [Nguồn thứ cấp]: không cho ai bypass, kể cả admin. Bắt buộc bật cho main. Nếu để admin bypass thì toàn bộ branch protection vô nghĩa.
- `Restrict who can push to matching branches` [Nguồn thứ cấp]: nếu bật thì chỉ liệt kê bot CI hoặc không ai được push trực tiếp. Đề xuất: không cho ai push trực tiếp, chỉ merge qua PR [Cần đối chiếu].
- `Allow force pushes` [Nguồn thứ cấp]: phải tắt. `Allow deletions` [Nguồn thứ cấp]: phải tắt.

Không bật `Require linear history` [Nguồn thứ cấp] nếu team chưa thống nhất dùng rebase, vì bật vội sẽ làm kẹt workflow merge hiện tại [Cần đối chiếu].

### 3.2 CODEOWNERS cho monorepo

File đặt tại `.github/CODEOWNERS` [Đã thấy]. File này đã nhắc trong file 01 T6.

Ví dụ cho monorepo, tên team và đường dẫn là placeholder, phải đối chiếu với cấu trúc repo thật:

```
# .github/CODEOWNERS
# Mỗi dòng: đường dẫn + team phải duyệt. Team cụ thể [Cần đối chiếu].

/apps/claim/                  @papaya/claim-team
/apps/fwa/                    @papaya/fwa-team
/infra/pulumi/                @papaya/platform-team
/infra/policies/              @papaya/security-team
/.github/workflows/           @papaya/platform-team @papaya/security-team
/policy/                      @papaya/security-team
*.md                          @papaya/docs-team
```

Quy tắc:

- Thay đổi ở `/infra/pulumi/` bắt buộc `@papaya/platform-team` duyệt, không chỉ engineer thường [Cần đối chiếu].
- Thay đổi ở `/infra/policies/` và `/.github/workflows/` bắt buộc `@papaya/security-team` duyệt thêm [Cần đối chiếu], vì đây là nơi định nghĩa quyền và control.
- Thay đổi chạm IAM, S3 policy, KMS, network phải có thêm reviewer security, dù CODEOWNERS đã có platform team.
- Tên team `@papaya/...` trong ví dụ trên [Cần đối chiếu], không phải tên team thật của Papaya. Phải lấy tên team thật từ GitHub org của Papaya.
- Đường dẫn `/apps/claim/` [Cần đối chiếu], phải đối chiếu với cây thư mục thật của monorepo. Nếu monorepo dùng cấu trúc khác thì sửa đường dẫn cho khớp, không giữ nguyên ví dụ này.

## 4. Policy-as-code: chặn IAM nguy hiểm, S3 public, tắt encryption, pulumi destroy

### 4.1 Công cụ

Dùng `Conftest` với `OPA` [Nguồn thứ cấp] hoặc `Checkov` [Nguồn thứ cấp] để kiểm tra Pulumi plan JSON. Tên `Conftest` [Nguồn thứ cấp] là công cụ chạy policy Rego. Tên `OPA` [Nguồn thứ cấp] là Open Policy Agent. Tên `CrossGuard` [Nguồn thứ cấp] là policy framework của Pulumi. Papaya chưa xác nhận dùng công cụ nào [Cần đối chiếu], nên file này dùng Conftest làm ví dụ, vì nó dễ chạy trong CI. Nếu Papaya đã dùng CrossGuard thì map các rule sau sang CrossGuard và test lại.

Vị trí policy: thư mục `policy/` [Cần đối chiếu] trong repo. Tên thư mục này chưa kiểm chứng, cần đối chiếu.

### 4.2 Các rule bắt buộc chặn

Mỗi rule dưới đây phải fail CI nếu vi phạm, không chỉ warn. Danh sách chặn:

1. Chặn IAM nguy hiểm: chặn policy có `Action: iam:*` hoặc `Action: *` hoặc `Resource: *` kèm quyền ghi [Nguồn thứ cấp]. Ví dụ Rego:

```rego
package main

deny[msg] {
  input.resourceChanges[_].type == "aws_iam_policy"
  contains(input.resourceChanges[_].change.after.policy, "iam:*")
  msg := "Chặn IAM wildcard iam:* . Phải liệt kê action cụ thể."
}

deny[msg] {
  input.resourceChanges[_].type == "aws_iam_policy"
  contains(input.resourceChanges[_].change.after.policy, "\"Action\": \"*\"")
  msg := "Chặn IAM Action * . Phải liệt kê action cụ thể."
}
```

2. Chặn S3 public: chặn `aws_s3_bucket_public_access_block` bị tắt, chặn `acl = public-read`, chặn bucket policy cho `Principal: *` [Nguồn thứ cấp]. Ví dụ:

```rego
deny[msg] {
  input.resourceChanges[_].type == "aws_s3_bucket_public_access_block"
  input.resourceChanges[_].change.after.block_public_acls == false
  msg := "Chặn tắt block_public_acls trên S3."
}
```

3. Chặn tắt encryption: chặn bucket không có `server_side_encryption_configuration`, chặn KMS key bị xóa, chặn RDS hoặc Aurora tắt `storage_encrypted` [Nguồn thứ cấp]. Ví dụ:

```rego
deny[msg] {
  input.resourceChanges[_].type == "aws_s3_bucket"
  not input.resourceChanges[_].change.after.server_side_encryption_configuration
  msg := "S3 bucket phải có encryption. Không được tạo bucket không encryption."
}
```

4. Chặn `pulumi destroy`: không cho job CI nào chạy `pulumi destroy` [Nguồn thứ cấp]. Cách chặn: không có job destroy trong workflow ở Mục 1, cộng thêm policy chặn string `pulumi destroy` trong file workflow, cộng thêm IAM role CI không có quyền `cloudformation:DeleteStack` hoặc quyền xóa tương đương [Cần đối chiếu]. Nếu cần destroy thật thì phải làm thủ công với break-glass role có MFA và approval riêng, không qua CI tự động.

5. Chặn thay đổi nguy hiểm khác: chặn security group mở `0.0.0.0/0` vào port nhạy cảm, chặn tắt `versioning` trên bucket claim, chặn xóa `Object Lock` [Nguồn thứ cấp]. Các rule này [Cần đối chiếu] với danh sách tài nguyên thật của Papaya.

### 4.3 Cách chạy policy trong CI

Job `policy` trong workflow ở Mục 1 chạy `conftest test` [Nguồn thứ cấp]. Lệnh cụ thể: `conftest test --policy policy/ pulumi-plan.json` [Nguồn thứ cấp]. File `pulumi-plan.json` là output của `pulumi preview --json` [Nguồn thứ cấp]. Nếu preview JSON không có đủ thông tin thì phải dùng `pulumi preview --diff` kết hợp với policy kiểm tra code Pulumi, không chỉ kiểm tra plan.

Policy fail thì job `apply-staging` và `apply-prod` không được chạy, vì chúng có `needs: [preview, policy]` [Nguồn thứ cấp] trong YAML.

## 5. Secret scanning và push protection

Tên cấu hình đều là tên thật của GitHub:

- `Secret scanning` [Nguồn thứ cấp]: tính năng quét secret trong repo. Vị trí: Settings, rồi Code security and analysis, rồi Secret scanning [Nguồn thứ cấp]. Phải bật cho repo monorepo.
- `Push protection` [Nguồn thứ cấp]: tính năng chặn push khi phát hiện secret trong commit. Vị trí: cùng màn hình Code security and analysis, mục Push protection [Nguồn thứ cấp]. Phải bật. Khi bật, developer push secret sẽ bị chặn ngay, không đợi đến CI.
- `Validity checks` [Cần đối chiếu]: tính năng kiểm tra secret có còn hiệu lực hay không. Tên này là tên thật của GitHub, nhưng chưa biết Papaya có bật hay không [Cần đối chiếu].
- `Bypass list` [Cần đối chiếu]: danh sách người được bypass push protection. Đề xuất: không cho ai bypass, hoặc chỉ cho security team bypass trong trường hợp khẩn cấp có ghi log [Cần đối chiếu].
- `Secret scanning alerts` [Nguồn thứ cấp]: alert khi phát hiện secret đã push lên. Phải có người xử lý alert, không để alert tồn đọng.

Quy trình khi push protection chặn:

1. Developer nhận thông báo push bị chặn vì có secret.
2. Không dùng `git push --force` để vượt qua, không xóa secret bằng cách sửa commit rồi push lại mà không rotate.
3. Rotate secret đó ngay, vì secret đã từng xuất hiện trong commit thì coi như đã lộ, dù chưa push thành công.
4. Xóa secret khỏi code, thay bằng tham chiếu tới GitHub Secrets hoặc Secrets Manager.
5. Push lại sau khi đã rotate.

Quy trình khi secret scanning phát hiện secret đã push:

1. Revoke và rotate secret đó ngay.
2. Xóa secret khỏi lịch sử git bằng `git filter-repo` hoặc công cụ tương đương [Nguồn thứ cấp], không chỉ xóa ở commit mới nhất.
3. Kiểm tra CloudTrail để xem secret đó đã bị dùng chưa [Nguồn thứ cấp].
4. Ghi sự cố vào log theo T8 trong file 01 [Đã thấy].

Không lưu secret trong các nơi sau: file `.env`, file `*.pem`, file `*.json` chứa key, comment trong code, file preview diff. Preview diff đăng lên PR ở Mục 7 phải được lọc secret trước khi đăng.

## 6. Pin action theo commit SHA và permissions tối thiểu

### 6.1 Pin action theo commit SHA

Không dùng tag nổi như `actions/checkout@v4` [Nguồn thứ cấp] trong production, vì tag có thể bị di chuyển hoặc bị compromise. Phải pin theo commit SHA đầy đủ.

Cú pháp đúng:

```yaml
- uses: actions/checkout@<FULL-COMMIT-SHA>
```

Trong đó `<FULL-COMMIT-SHA>` [Cần đối chiếu] là SHA thật lấy từ repo của action đó trên GitHub. Không bịa SHA trong file này. Cách lấy SHA thật: mở repo của action, chọn commit đã review, copy full SHA 40 ký tự. Ví dụ: để pin `actions/checkout`, vào repo `actions/checkout` trên GitHub, lấy SHA của release đã audit [Nguồn thứ cấp].

Các action cần pin trong workflow ở Mục 1:

- `actions/checkout` [Nguồn thứ cấp]
- `aws-actions/configure-aws-credentials` [Nguồn thứ cấp]
- `pulumi/actions` [Nguồn thứ cấp]
- `actions/github-script` [Nguồn thứ cấp]
- `open-policy-agent/setup-opa` [Nguồn thứ cấp]

Nếu dùng Dependabot để cập nhật action thì phải cấu hình Dependabot chỉ đề xuất SHA mới, và mỗi lần update phải có người review diff của action, không auto-merge [Cần đối chiếu].

### 6.2 Permissions tối thiểu

Nguyên tắc: workflow không có quyền thừa. Cấu hình `permissions` [Nguồn thứ cấp] ở hai tầng:

- Tầng workflow: đặt `permissions` chung ở mức tối thiểu nhất, ví dụ `contents: read` [Nguồn thứ cấp].
- Tầng job: mỗi job chỉ xin thêm quyền nó cần. Job preview cần `pull-requests: write` [Nguồn thứ cấp] để đăng comment. Job apply chỉ cần `contents: read` và `id-token: write` [Nguồn thứ cấp], không cần `pull-requests: write`.

Không dùng `permissions: write-all` [Nguồn thứ cấp] hoặc `permissions: contents: write` cho toàn workflow nếu không cần thiết. Nếu action nào yêu cầu quyền rộng thì phải ghi rõ lý do trong file workflow và kiểm tra lại action đó có đáng tin hay không.

Bảng quyền đề xuất:

| Job | permissions cần | Lý do |
|---|---|---|
| preview | contents: read, id-token: write, pull-requests: write | Đọc code, xin OIDC, đăng diff |
| policy | contents: read | Chỉ đọc code để kiểm tra policy |
| apply-staging | contents: read, id-token: write | Đọc code, xin OIDC để deploy staging |
| apply-prod | contents: read, id-token: write | Đọc code, xin OIDC để deploy prod |

Tên quyền trong bảng trên đều là tên thật của GitHub Actions [Nguồn thứ cấp]. Giá trị cụ thể có thể cần thêm `security-events: write` [Nguồn thứ cấp] nếu job cần upload kết quả code scanning, nhưng workflow mẫu ở Mục 1 chưa cần, nên không thêm [Cần đối chiếu].

## 7. Đăng Pulumi preview diff vào PR để chống rubber-stamp

Vấn đề rubber-stamp đã nêu ở file 01 T6 [Đã thấy]: reviewer thấy CI xanh là bấm Approve trong vài giây mà không đọc diff. Cách chống là làm cho diff bắt buộc phải đọc được ngay trên PR, và chặn merge nếu diff chưa được đăng.

### 7.1 Cách đăng diff

Trong job `preview` ở Mục 1, sau khi chạy `pulumi preview` [Nguồn thứ cấp], job chạy `pulumi preview --diff` [Nguồn thứ cấp] hoặc `pulumi preview --json` [Nguồn thứ cấp] để lấy diff, rồi dùng `actions/github-script` [Nguồn thứ cấp] để đăng comment lên PR qua API `issues.createComment` [Nguồn thứ cấp].

Nội dung comment phải có:

- Danh sách tài nguyên tạo mới, cập nhật, xóa, thay thế. Đặc biệt highlight tài nguyên xóa hoặc replace, vì đây là thay đổi nguy hiểm nhất.
- Diff IAM: policy nào thay đổi, action nào thêm, resource nào thêm.
- Diff network: security group, VPC, ingress nào thay đổi.
- Diff encryption và S3 policy: có tắt encryption hay mở public hay không.
- Link tới run CI để reviewer kiểm tra lại.

Không đăng toàn bộ log Pulumi nếu log chứa secret hoặc PHI. Phải lọc secret trước khi đăng. Nếu diff dài quá giới hạn comment của GitHub thì đăng file diff dưới dạng artifact và đăng tóm tắt lên PR, kèm link artifact [Cần đối chiếu].

### 7.2 Quy tắc chống rubber-stamp

- `Require status checks to pass before merging` [Nguồn thứ cấp] phải bao gồm check `preview` và `policy`. Nếu preview chưa đăng comment thì check fail, không merge được.
- Reviewer phải comment vào diff, không chỉ bấm Approve. Quy định team: approval không kèm comment vào diff rủi ro cao thì không tính là review thực sự [Cần đối chiếu], cần team xác nhận.
- Nếu PR có thay đổi rủi ro cao (IAM, S3 policy, KMS, security group, xóa tài nguyên) thì bắt buộc có thêm reviewer security qua `CODEOWNERS` [Đã thấy] và `Require review from Code Owners` [Đã thấy].
- Đo thời gian từ lúc mở PR đến lúc approve. Nếu approve trong vài giây mà PR có diff lớn thì coi là tín hiệu rubber-stamp, cần review lại quy trình [Cần đối chiếu].

Ví dụ comment PR đạt chuẩn:

```
## Pulumi preview diff

- Tạo mới: 2 tài nguyên (aws_s3_bucket.claims, aws_kms_key.claims)
- Cập nhật: 1 tài nguyên (aws_iam_policy.claim-reader)
- Xóa: 0 tài nguyên
- Thay thế: 0 tài nguyên

IAM diff: thêm s3:GetObject cho bucket claims, không thêm iam:* .
S3 diff: không mở public, encryption vẫn bật.

Reviewer phải đọc diff này trước khi Approve.
```

Nội dung ví dụ trên là minh họa, không phải diff thật của Papaya [Cần đối chiếu].

## 8. Kiểm chứng trên repo canary: cái gì đã kiểm chứng, cái gì cần test

### 8.1 Đã kiểm chứng từ file 01, 02, 03

- Nguyên tắc OIDC thay long-lived secret, tách quyền CI và laptop [Đã thấy].
- Nguyên tắc prevent self-review bằng CODEOWNERS và approval có tên [Đã thấy].
- Nguyên tắc policy-as-code chặn IAM, S3 public, tắt encryption [Đã thấy].
- Nguyên tắc preview diff bắt buộc vào PR [Đã thấy].

### 8.2 Cần test trên repo canary trước khi áp cho repo chính

Repo canary là repo test riêng, không phải repo production của Papaya [Cần đối chiếu]. Tên repo canary cụ thể [Cần đối chiếu].

Checklist test:

1. Tạo Environment `dev`, `staging`, `prod` trên repo canary, cấu hình `Required reviewers` [Cần đối chiếu] với 2 người test, thử deploy và xác nhận người không có tên không deploy được.
2. Thử tạo PR với tài khoản tác giả tự approve, xác nhận GitHub không tính approval đó vào `Require approvals` [Nguồn thứ cấp].
3. Thử push secret giả vào repo canary, xác nhận `Push protection` [Nguồn thứ cấp] chặn push.
4. Thử tạo PR có policy vi phạm (IAM `*`, S3 public), xác nhận job `policy` fail và PR không merge được do `Require status checks to pass before merging` [Nguồn thứ cấp].
5. Thử thay action tag `v4` bằng SHA, xác nhận workflow vẫn chạy.
6. Thử chạy `pulumi preview` trên PR canary, xác nhận comment diff xuất hiện trên PR và reviewer đọc được.
7. Thử push trực tiếp vào `main` trên repo canary, xác nhận bị chặn do `Require a pull request before merging` [Nguồn thứ cấp].
8. Thử cho admin bypass branch protection, xác nhận bị chặn do `Do not allow bypassing the above settings` [Nguồn thứ cấp].

Chỉ khi 8 test trên đều pass trên repo canary thì mới áp cấu hình này cho repo chính. Ghi kết quả test vào file log hoặc PR canary để làm bằng chứng.

## Giả định và giới hạn

- Chưa có truy cập vào GitHub org và AWS account thật của Papaya nên mọi ARN, tên team, tên Environment, tên nhánh, tên check cụ thể đều ghi là [Cần đối chiếu], không bịa giá trị thật.
- Tên cấu hình GitHub trong file này lấy từ tài liệu chính thức của GitHub [Nguồn thứ cấp]. Nếu GitHub đổi tên cấu hình trong giao diện mới (ví dụ chuyển từ Branch protection sang Rulesets) thì phải map lại tên mới và test lại trên repo canary.
- Yêu cầu pháp lý VN, TH, HK và hợp đồng từng insurer cần pháp chế xác nhận, file này không thay thế tư vấn pháp lý.
- File này không chứa secret thật, không chứa ARN thật, không chứa SHA thật. Mọi placeholder phải được thay bằng giá trị thật sau khi đối chiếu.
