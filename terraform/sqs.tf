resource "aws_sqs_queue" "arbitrage_job_queue" {
  name                      = "arbitrage-job-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
  visibility_timeout_seconds = 60 # Match Lambda timeout

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.arbitrage_job_queue_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "arbitrage_job_queue_dlq" {
  name = "arbitrage-job-queue-dlq"
}
