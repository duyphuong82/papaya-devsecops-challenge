# Papaya Configs - File 04 CI/CD

File tar nay di kem file devsecops/04-cicd-workflow.md
Noi dung:
- .github/workflows/deploy.yml : workflow mau OIDC, preview, policy, apply staging/prod
- .github/CODEOWNERS : placeholder, can doi chieu ten team va duong dan that
- policy/*.rego : policy chan IAM wildcard, S3 public, tat encryption, pulumi destroy
- .github/PULL_REQUEST_TEMPLATE.md : template PR chong rubber-stamp

Luu y:
- Thay <FULL-COMMIT-SHA> bang SHA that lay tu repo cua action do.
- Thay <ARN-ROLE-...> va <REGION-...> bang ARN va region that cua Papaya.
- Khong dung placeholder nay cho production khi chua doi chieu.
- Test tren repo canary truoc khi ap cho repo chinh.
