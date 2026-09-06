terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # backend "s3" {
  #   # fill in once you've decided on remote state — not required to get started
  # }
}

provider "aws" {
  region = var.aws_region
}
