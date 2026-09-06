variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used to tag/prefix resources for this problem."
  type        = string
  default     = "orders-api-uptime"
}

# Add further variables as your design needs them (instance type, ASG sizing, etc.) —
# this file is a stub, not a pre-filled answer.
