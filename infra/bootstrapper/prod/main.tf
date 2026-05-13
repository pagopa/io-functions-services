module "bootstrapper" {
  source  = "pagopa-dx/azure-github-environment-bootstrap/azurerm"
  version = "~> 4.0"

  environment = {
    prefix          = local.prefix
    env_short       = local.env_short
    location        = local.location
    domain          = local.domain
    instance_number = local.instance_number
  }

  additional_resource_group_ids = [data.azurerm_resource_group.platform_services_fn_02.id]

  entraid_groups = {
    admins_object_id = data.azuread_group.admins.object_id
    devs_object_id   = data.azuread_group.developers.object_id
  }

  github_private_runner = {
    container_app_environment_id = data.azurerm_container_app_environment.runner.id
    use_github_app               = true
    key_vault = {
      name                = local.runner.secret.kv_name
      resource_group_name = local.runner.secret.kv_resource_group_name
    }
  }

  opex_resource_group_id = data.azurerm_resource_group.dashboards.id

  private_dns_zone_resource_group_id = data.azurerm_resource_group.common_weu.id

  repository = {
    name = local.repository.name
  }

  terraform_storage_account = {
    name                = local.tf_storage_account.name
    resource_group_name = local.tf_storage_account.resource_group_name
  }

  tags = local.tags
}
