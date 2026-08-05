terraform {

  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "iopitntfst001"
    container_name       = "terraform-state"
    key                  = "io-functions-services.resources.prod.tfstate"
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "< 5.0.0"
    }
    dx = {
      source  = "pagopa-dx/azure"
      version = "~> 0.10"
    }
  }
}

provider "azurerm" {
  features {}
}
