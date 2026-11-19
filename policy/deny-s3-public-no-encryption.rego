package main

deny[msg] {
  input.resourceChanges[_].type == "aws_s3_bucket_public_access_block"
  input.resourceChanges[_].change.after.block_public_acls == false
  msg := "Chan tat block_public_acls tren S3."
}

deny[msg] {
  input.resourceChanges[_].type == "aws_s3_bucket"
  not input.resourceChanges[_].change.after.server_side_encryption_configuration
  msg := "S3 bucket phai co encryption. Khong duoc tao bucket khong encryption."
}
