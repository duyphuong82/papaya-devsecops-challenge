package main

deny[msg] {
  input.resourceChanges[_].type == "aws_iam_policy"
  contains(input.resourceChanges[_].change.after.policy, "iam:*")
  msg := "Chan IAM wildcard iam:* . Phai liet ke action cu the."
}

deny[msg] {
  input.resourceChanges[_].type == "aws_iam_policy"
  contains(input.resourceChanges[_].change.after.policy, "\"Action\": \"*\"")
  msg := "Chan IAM Action * . Phai liet ke action cu the."
}
