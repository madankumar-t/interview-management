variable "aws_region" { type = string }
variable "application_name" { type = string }
variable "environment" { type = string }
variable "custom_domain" {
  type    = string
  default = ""
}
variable "certificate_arn" {
  type    = string
  default = ""
}
