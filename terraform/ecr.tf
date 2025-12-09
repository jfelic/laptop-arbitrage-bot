resource "aws_ecr_repository" "arbitrage_repo" {
  name                 = "arbitrage-bot"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
