LƯU Ý VỀ THƯ MỤC github/ TRONG TAR NÀY:
Trong tar này thư mục .github được đóng gói dưới tên `github/` (không có dấu chấm) để tránh lỗi khi giải nén trên một số tool.
Sau khi giải nén, bạn PHẢI đổi tên nó thành `.github` bằng 1 trong 2 lệnh ở BƯỚC 2 bên dưới.

# Papaya Configs - File 04 CI/CD (Prompt 4 Claude - Updated)

File tar này đi kèm file `devsecops/04-cicd-workflow.md` (bản update từ Claude Prompt 4).
Nội dung:
- .github/workflows/ci.yml, deploy.yml : workflow mẫu OIDC, preview, policy, apply staging/prod
- .github/actions/pulumi-env/action.yml : composite action cài Pulumi + assume role OIDC
- .github/CODEOWNERS, dependabot.yml, preview-allow.json, PULL_REQUEST_TEMPLATE.md
- policy/ : Pulumi CrossGuard policy pack (7 policy, 24 test)
- scripts/ : preview-gate, verify-approval, lint-workflows, post-comment
- github-config/ : payload ruleset, environments, actions permissions, security, script áp dụng
- aws/ : trust-plan, trust-apply, scp-guard
- deploy/targets.json : environment -> stack/region/backend/role
- samples/summary-blocked.md : ví dụ comment bị BLOCKED

Lưu ý:
- Thay <FULL-COMMIT-SHA> bằng SHA thật, <ARN-ROLE-...>, <REGION-...>, id reviewer 0 bằng giá trị thật
- Thay account 111111111111, 222222222222, 333333333333, papaya-insurtech/pumpkin bằng giá trị thật
- Không dùng placeholder cho production khi chưa đối chiếu
- Test trên repo canary trước khi áp cho repo chính (mục 14 file 04)

====================================================================
CÁC BƯỚC ADD CONFIG VÀO REPO - LÀM THEO ĐÚNG THỨ TỰ NÀY
====================================================================

BƯỚC 0 - FIX TOKEN TRƯỚC KHI PUSH (BẮT BUỘC, LÀM 1 LẦN)
---------------------------------------------------------
Lý do: Trong tar có file .github/workflows/deploy.yml. GitHub bắt buộc token phải có scope `workflow` mới cho push file workflow.
Nếu dùng token cũ sẽ lỗi:
  [remote rejected] main -> main (refusing to allow a Personal Access Token to create or update workflow `.github/workflows/deploy.yml` without `workflow` scope)

Làm như sau:
1. Vào https://github.com/settings/tokens -> Generate new token -> Generate new token (classic)
   Tick 2 ô: [x] repo  +  [x] workflow  -> Copy token mới, đừng dán vào chat, đừng commit vào repo.
2. Xóa token cũ khỏi Keychain trên Mac (nếu không xóa nó sẽ cứ dùng token cũ):
   printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase
3. Nếu dùng gh thì thay bằng:
   gh auth refresh -s workflow

BƯỚC 1 - TẢI VÀ KIỂM TRA TAR TRƯỚC KHI GIẢI NÉN
--------------------------------------------------
1. Tải file papaya-configs-04.tar.gz + 04-cicd-workflow.md + README.md về máy (thường nằm ở ~/Downloads)
2. Kiểm tra trong tar có gì, KHÔNG giải nén vội:
   tar -tzf ~/Downloads/papaya-configs-04.tar.gz
   Phải thấy: .github/, policy/, scripts/, github-config/, aws/, deploy/, samples/, tenants/, infra/, README-CONFIGS.md

BƯỚC 2 - COPY TAR VÀO REPO + GIẢI NÉN
--------------------------------------
cd papaya-devsecops-challenge

# 1. Copy tar + file 04 + README vào repo
cp ~/Downloads/papaya-configs-04.tar.gz .
cp ~/Downloads/04-cicd-workflow.md devsecops/04-cicd-workflow.md
cp ~/Downloads/README.md .

# 2. Giải nén, ghi đè file cũ nếu có (ví dụ deploy.yml cũ)
tar -xzf papaya-configs-04.tar.gz

# 3. Xóa file tar sau khi giải nén, KHÔNG commit file .tar.gz
rm papaya-configs-04.tar.gz

# 4. Kiểm tra file đã vào đúng chỗ chưa
ls -R .github/workflows
ls policy/ scripts/ github-config/ aws/ deploy/
git status

Bạn phải thấy:
- .github/workflows/ci.yml + deploy.yml mới
- .github/CODEOWNERS, .github/dependabot.yml, .github/preview-allow.json
- policy/, scripts/, github-config/, aws/, deploy/targets.json
- devsecops/04-cicd-workflow.md đã thay bằng bản Claude Prompt 4 mới
- README.md đã update

BƯỚC 3 - ADD + COMMIT (CHIA 2 LỆNH ĐỂ DỄ KIỂM TRA)
----------------------------------------------------
# Xem kỹ file nào sẽ commit, đừng add bừa file rác
git status

# Add đúng các thư mục config + file 04 + README
git add .github/ devsecops/04-cicd-workflow.md README.md README-CONFIGS.md policy/ scripts/ github-config/ aws/ deploy/ samples/ tenants/ infra/

# Kiểm tra lại lần nữa trước khi commit
git status
git diff --cached --stat

# Commit
git commit -m "Update 04 CI/CD - OIDC, environments, policy-as-code, anti rubber-stamp + configs"

BƯỚC 4 - PUSH
--------------
git push origin main

Lúc này nó sẽ hỏi username + password:
- Username: duyphuong82
- Password: dán token mới đã có scope workflow (Bước 0)

Kiểm tra sau khi push:
git log --oneline -3
git status
# Phải thấy: Your branch is up to date with 'origin/main', nothing to commit

BƯỚC 5 - KIỂM TRA TRÊN GITHUB WEB
----------------------------------
Vào https://github.com/duyphuong82/papaya-devsecops-challenge
Kiểm tra:
- [ ] devsecops/04-cicd-workflow.md đã là bản mới
- [ ] .github/workflows/ci.yml + deploy.yml đã có
- [ ] README.md đã liệt kê đủ 8 file DevSecOps + Logical + conversation log
- [ ] policy/, scripts/, github-config/, aws/ đã có
- [ ] Không có file papaya-configs-04.tar.gz bị commit nhầm

====================================================================
XỬ LÝ LỖI THƯỜNG GẶP
====================================================================

1. Lỗi workflow scope khi push:
   [remote rejected] ... without `workflow` scope
   -> Làm lại BƯỚC 0: tạo token mới có tick workflow + xóa token cũ khỏi Keychain rồi push lại.
   -> Commit cũ vẫn còn ở local, không mất: git log --oneline -3 sẽ thấy commit đó.

2. Lỗi push bị reject do remote có commit mới hơn (nếu bạn đã push từ máy khác / web):
   ! [rejected] main -> main (fetch first)
   -> Chạy:
      git pull --rebase origin main
      git push origin main

3. Giải nén bị ghi đè file deploy.yml bạn vừa sửa tay:
   -> Trước khi giải nén, backup file bạn đã sửa:
      cp .github/workflows/deploy.yml /tmp/deploy.yml.backup
      Sau khi giải nén, so sánh: diff /tmp/deploy.yml.backup .github/workflows/deploy.yml

4. Lỡ commit nhầm file tar:
   git rm --cached papaya-configs-04.tar.gz
   rm papaya-configs-04.tar.gz
   git commit --amend --no-edit
   git push origin main --force-with-lease  (chỉ dùng khi chắc chắn chưa ai khác pull)

5. Muốn xem lại tar mà không giải nén:
   tar -tzf papaya-configs-04.tar.gz

====================================================================
CHẠY TEST SAU KHI ADD XONG (KHÔNG BẮT BUỘC NHƯNG NÊN CHẠY)
====================================================================

(cd policy && npm ci --ignore-scripts && npm test)      # 24 test
node --test scripts/gates.test.mjs                       # 16 test
python3 -I scripts/test_lint_workflows.py                # 18 test
python3 -I scripts/lint-workflows.py .github
