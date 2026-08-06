resource "azurerm_resource_group" "function_services_rg" {
  name     = "${local.project}-platform-services-rg-${local.instance_number}"
  location = local.location
  tags     = local.tags
}

module "function_app_services_itn" {
  source                              = "../_modules/function_services/function-app"
  prefix                              = local.prefix
  env_short                           = local.env_short
  resource_group_name                 = azurerm_resource_group.function_services_rg.name
  function_services_autoscale_minimum = local.function_services_autoscale_minimum
  function_services_autoscale_maximum = local.function_services_autoscale_maximum
  function_services_autoscale_default = local.function_services_autoscale_default
  sku_size                            = "P1v3"
  vnet_common_name_itn                = local.vnet_common_name_itn
  instance_number                     = local.instance_number
  common_resource_group_name_itn      = local.common_resource_group_name_itn
  project_itn                         = local.project
  services_snet_cidr                  = local.cidr_subnet
  tags                                = local.tags
}

module "containers_services_itn" {
  source              = "../_modules/function_services/containers"
  cosmos_db_name      = module.function_app_services.db_name
  resource_group_name = local.rg_internal_name
  legacy_project      = local.project_legacy
}
