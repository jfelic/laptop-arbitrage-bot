resource "aws_dynamodb_table" "arbitrage_deals" {
  name           = "arbitrage-deals"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Project = "ArbitrageBot"
  }
}
