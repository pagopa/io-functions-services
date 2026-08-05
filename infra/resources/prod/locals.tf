locals {
  prefix    = "io"
  env_short = "p"

  location       = "italynorth"
  location_short = "itn"

  common_project = "${local.prefix}-${local.env_short}"

  project        = "${local.prefix}-${local.env_short}-${local.location_short}"
  project_legacy = "${local.prefix}-${local.env_short}"

  tags = {
    CostCenter     = "TS310 - PAGAMENTI & SERVIZI"
    CreatedBy      = "Terraform"
    Environment    = "Prod"
    Owner          = "IO"
    ManagementTeam = "IO Platform"
    Source         = "https://github.com/pagopa/io-functions-services/blob/main/infra/resources/prod"
  }

  rg_common_name   = format("%s-rg-common", local.project_legacy)
  rg_internal_name = format("%s-rg-internal", local.project_legacy)

  # Switch limit date for email opt out mode. This value should be used by functions that need to discriminate
  # how to check isInboxEnabled property on IO profiles, since we have to disable email notifications for default
  # for all profiles that have been updated before this date. This date should coincide with new IO App's release date
  # 1625781600 value refers to 2021-07-09T00:00:00 GMT+02:00
  opt_out_email_switch_date = 1625781600

  # Feature flag used to enable email opt-in with logic exposed by the previous variable usage
  ff_opt_in_email_enabled = "true"

  apim_hostname_api_internal = "api-internal.io.italia.it"

  # MESSAGES
  message_content_container_name = "message-content"

  service_api_url = "https://api-app.internal.io.pagopa.it/"

  cidr_subnet                         = "10.20.34.0/26"
  function_services_autoscale_minimum = 3
  function_services_autoscale_maximum = 30
  function_services_autoscale_default = 10

  vnet_common_name_itn           = "${local.project}-common-vnet-01"
  common_resource_group_name_itn = "${local.project}-common-rg-01"

  apim_itn_name = "${local.project}-apim-01"

  instance_number = "02"

}
