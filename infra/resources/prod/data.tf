data "terraform_remote_state" "platform_data_platform" {
  backend = "azurerm"

  config = {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "iopitntfst001"
    container_name       = "terraform-state"
    key                  = "io-infra.platform.data-platform.prod.tfstate"
    use_azuread_auth     = true
  }
}

data "terraform_remote_state" "platform_observability" {
  backend = "azurerm"

  config = {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "iopitntfst001"
    container_name       = "terraform-state"
    key                  = "io-infra.platform.observability.prod.tfstate"
    use_azuread_auth     = true
  }
}
