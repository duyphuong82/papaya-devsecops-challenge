package main

# Chan pulumi destroy trong CI: khong co job destroy trong workflow
# Rule nay kiem tra file workflow khong chua chuoi pulumi destroy

deny[msg] {
  contains(input.workflow_content, "pulumi destroy")
  msg := "Chan pulumi destroy trong CI. Destroy chi lam thu cong voi break-glass role co MFA."
}
