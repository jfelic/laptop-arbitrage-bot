# IAM Role for Lambda
resource "aws_iam_role" "lambda_exec" {
  name = "arbitrage_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Values specific to our app logic
resource "aws_iam_role_policy" "lambda_app_policy" {
  name = "arbitrage_lambda_app_policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.arbitrage_job_queue.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.arbitrage_deals.arn
      }
    ]
  })
}

# Scanner Function (Producer)
resource "aws_lambda_function" "scanner" {
  function_name = "arbitrage-scanner"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.arbitrage_repo.repository_url}:${var.image_tag}"

  image_config {
    command = ["dist/src/scanner/index.handler"]
  }

  environment {
    variables = {
      SQS_QUEUE_URL    = aws_sqs_queue.arbitrage_job_queue.id
      BEST_BUY_API_KEY = var.best_buy_api_key
    }
  }

  timeout = 60
}

# Valuator Function (Consumer)
resource "aws_lambda_function" "valuator" {
  function_name = "arbitrage-valuator"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.arbitrage_repo.repository_url}:${var.image_tag}"
  # Note: A real deployment needs to specify the CMD override or separate ECR images.
  # Our Dockerfile has stages, but ECR stores one image per tag usually, unless we push two tags.
  # We should configure the Image Config Command in Lambda to override the CMD.
  
  image_config {
    command = ["dist/src/valuator/index.handler"]
  }

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.arbitrage_deals.name
      DISCORD_WEBHOOK     = var.discord_webhook
      APIFY_API_TOKEN     = var.apify_api_token
    }
  }

  timeout = 60
}

# Scanner Schedule (CloudWatch Event)
resource "aws_cloudwatch_event_rule" "every_24_hours" {
  name                = "every-24-hours"
  description         = "Fires every 24 hours"
  schedule_expression = "rate(24 hours)"
}

resource "aws_cloudwatch_event_target" "scan_every_24_hours" {
  rule      = aws_cloudwatch_event_rule.every_24_hours.name
  target_id = "scanner"
  arn       = aws_lambda_function.scanner.arn
}

resource "aws_lambda_permission" "allow_cloudwatch" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scanner.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_24_hours.arn
}


# Valuator Trigger (SQS)
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.arbitrage_job_queue.arn
  function_name    = aws_lambda_function.valuator.arn
  batch_size       = 10
}
