data "azurerm_container_app_environment" "runner" {
  name                = local.runner.cae_name
  resource_group_name = local.runner.cae_resource_group_name
}

data "azurerm_resource_group" "common" {
  name = local.common.itn_resource_group_name
}

data "azurerm_resource_group" "common_weu" {
  name = local.common.weu_resource_group_name
}

data "azurerm_resource_group" "dashboards" {
  name = "dashboards"
}

data "azurerm_resource_group" "platform_services_fn_02" {
  name = local.functions.itn_platform_services_02_rg_name
}

data "azuread_group" "admins" {
  display_name = local.adgroups.admins_name
}

data "azuread_group" "developers" {
  display_name = local.adgroups.devs_name
}
