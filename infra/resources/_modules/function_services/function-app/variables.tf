################################
# General variables
################################

variable "prefix" {
  type    = string
  default = "io"
  validation {
    condition = (
      length(var.prefix) < 6
    )
    error_message = "Max length is 5 chars."
  }
}

variable "env_short" {
  type = string
  validation {
    condition = (
      length(var.env_short) <= 1
    )
    error_message = "Max length is 1 chars."
  }
}

variable "location" {
  type    = string
  default = "westeurope"
}

variable "location_itn" {
  type    = string
  default = "italynorth"
}

variable "project_itn" {
  type = string
}

variable "tags" {
  type = map(any)
  default = {
    CreatedBy = "Terraform"
  }
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group that will contain all the created resources"
}

variable "function_services_autoscale_minimum" {
  type        = number
  description = "The minimum number of instances for this resource."
  default     = 1
}

variable "function_services_autoscale_maximum" {
  type        = number
  description = "The maximum number of instances for this resource."
  default     = 30
}

variable "function_services_autoscale_default" {
  type        = number
  description = "The number of instances that are available for scaling if metrics are not available for evaluation."
  default     = 1
}

variable "pn_service_id" {
  type        = string
  description = "The Service ID of PN service"
  default     = "01G40DWQGKY5GRWSNM4303VNRP"
}

variable "vnet_common_name_itn" {
  type        = string
  description = "name of the common itn vnet"
}

variable "common_resource_group_name_itn" {
  type        = string
  description = "name of the common itn resource group"
}

variable "opt_out_email_switch_date" {
  type        = number
  description = "Switch limit date for email opt out mode. This value should be used by functions that need to discriminate how to check isInboxEnabled property on IO profiles, since we have to disable email notifications for default for all profiles that have been updated before this date. This date should coincide with new IO App's release date 1625781600 value refers to 2021-07-09T00:00:00 GMT+02:00"
  default     = 1625781600
}

variable "ff_opt_in_email_enabled" {
  type        = string
  description = "Feature flag used to enable email opt-in with logic exposed by the previous variable usage"
  default     = "true"
}

variable "services_snet_cidr" {
  type        = string
  description = "Services Subnet CIDR"
}

variable "instance_number" {
  type        = string
  description = "Instance number of the function app"
  default     = "01"
}

variable "sku_size" {
  type        = string
  description = "Function App SKU Size"
  default     = "P1v3"
}

variable "cosmos_db_attributes" {
  type        = map(any)
  sensitive   = true
  description = "Informations about the Cosmos DB, such as primary key and endpoint"
}

variable "application_insights_error_action_group_id" {
  type        = string
  description = "Application Insights error action group id"
}

variable "application_insights_instrumentation_key" {
  type        = string
  sensitive   = true
  description = "Application Insight instrumentation key"
}
