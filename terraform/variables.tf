variable "best_buy_api_key" {
  type        = string
  description = "Best Buy API Key"
}

variable "apify_api_token" {
  type        = string
  description = "Apify API Token"
}

variable "discord_webhook" {
  description = "Discord Webhook URL for alerts"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}
