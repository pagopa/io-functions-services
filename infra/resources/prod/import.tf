# Use this file to import the wanted resources inside the state file, 
# remember to cleanup the import code blocks with a separate PR once the import has been completed successfully.
# Here is the documentation which explains how to use the import code block: https://developer.hashicorp.com/terraform/language/block/import

import {
  to = azurerm_resource_group.function_services_rg
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02"
}

import {
  to = module.function_app_services_itn.azurerm_key_vault_access_policy.function_services_itn_kv_common
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-rg-common/providers/Microsoft.KeyVault/vaults/io-p-kv-common/objectId/c58f0476-d243-4555-9333-8eb745e1d070"
}

import {
  to = module.function_app_services_itn.azurerm_key_vault_access_policy.function_services_itn_slot_staging_kv_common
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-rg-common/providers/Microsoft.KeyVault/vaults/io-p-kv-common/objectId/1f064441-f1f1-4423-9c9b-0b1739fc819f"
}

import {
  to = module.function_app_services_itn.azurerm_storage_container.processing-messages-01
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesst02/blobServices/default/containers/processing-messages"
}

import {
  to = module.function_app_services_itn.azurerm_storage_management_policy.processing_messages_container_rule_01
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesst02/managementPolicies/default"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.message-created-01
  id = "https://iopitnservicesst02.queue.core.windows.net/message-created"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.message-created-poison-01
  id = "https://iopitnservicesst02.queue.core.windows.net/message-created-poison"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.message-processed-01
  id = "https://iopitnservicesst02.queue.core.windows.net/message-processed"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.message-processed-poison-01
  id = "https://iopitnservicesst02.queue.core.windows.net/message-processed-poison"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.notification-created-email-01
  id = "https://iopitnservicesst02.queue.core.windows.net/notification-created-email"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.notification-created-email-poison-01
  id = "https://iopitnservicesst02.queue.core.windows.net/notification-created-email-poison"
}

import {
  to = module.function_app_services_itn.azurerm_storage_queue.notification-created-webhook-poison-01
  id = "https://iopitnservicesst02.queue.core.windows.net/notification-created-webhook-poison"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_linux_function_app.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Web/sites/io-p-itn-services-func-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_linux_function_app_slot.this[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Web/sites/io-p-itn-services-func-02/slots/staging"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_monitor_metric_alert.function_app_health_check[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Insights/metricAlerts/[io-p-itn-services-func-02] Health Check Failed"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_monitor_metric_alert.storage_account_health_check[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Insights/metricAlerts/[iopitnservicesstfn02] Low Availability"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_private_endpoint.function_sites
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-func-pep-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_private_endpoint.st_blob
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-func-blob-pep-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_private_endpoint.st_file
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-func-file-pep-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_private_endpoint.st_queue
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-func-queue-pep-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_private_endpoint.staging_function_sites[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-staging-func-pep-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.function_storage_account_contributor
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/10dd5fe9-77d9-6f77-3b98-be783f52a35a"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.function_storage_blob_data_owner
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/afb02055-de46-5999-ee3d-968d14c03fa5"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.function_storage_queue_data_contributor
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/98fd7e3c-5c6d-f409-efe8-09c3658b755b"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.staging_function_storage_account_contributor[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/c7beb22b-82af-c508-ebdd-7990f4a9796b"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.staging_function_storage_blob_data_owner[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/986915cd-75ab-d96e-1c27-03f3c65a4319"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_role_assignment.staging_function_storage_queue_data_contributor[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02/providers/Microsoft.Authorization/roleAssignments/cc28cc42-8ae9-5cc0-fbe2-f37250740332"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_service_plan.this[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Web/serverFarms/io-p-itn-services-asp-02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_storage_account_network_rules.st_network_rules
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesstfn02"
}

import {
  to = module.function_app_services_itn.module.function_services.azurerm_subnet.this[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-common-rg-01/providers/Microsoft.Network/virtualNetworks/io-p-itn-common-vnet-01/subnets/io-p-itn-services-func-snet-02"
}

import {
  to = module.function_app_services_itn.module.function_services_autoscale.azurerm_monitor_autoscale_setting.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Insights/autoScaleSettings/io-p-itn-services-as-02"
}

import {
  to = module.function_app_services_itn.module.function_services_role_assignments.module.key_vault.azurerm_role_assignment.secrets["io-p-itn-com-rg-01|io-p-itn-com-kv-01|reader"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-com-rg-01/providers/Microsoft.KeyVault/vaults/io-p-itn-com-kv-01/providers/Microsoft.Authorization/roleAssignments/0a3b6355-37b3-736c-e85e-f3c0db5730e9"
}

import {
  to = module.function_app_services_itn.module.function_services_staging_slot_role_assignments.module.key_vault.azurerm_role_assignment.secrets["io-p-itn-com-rg-01|io-p-itn-com-kv-01|reader"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-com-rg-01/providers/Microsoft.KeyVault/vaults/io-p-itn-com-kv-01/providers/Microsoft.Authorization/roleAssignments/695cbf3b-f260-609a-b73e-233203aa7dc0"
}

import {
  to = module.function_app_services_itn.module.services_storage_account_01.azurerm_monitor_metric_alert.storage_account_health_check[0]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Insights/metricAlerts/[iopitnservicesst02] Low Availability"
}

import {
  to = module.function_app_services_itn.module.services_storage_account_01.azurerm_private_endpoint.this["blob"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-blob-pep-02"
}

import {
  to = module.function_app_services_itn.module.services_storage_account_01.azurerm_private_endpoint.this["queue"]
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Network/privateEndpoints/io-p-itn-services-queue-pep-02"
}

import {
  to = module.function_app_services_itn.module.services_storage_account_01.azurerm_storage_account.this
  id = "/subscriptions/ec285037-c673-4f58-b594-d7c480da4e8b/resourceGroups/io-p-itn-platform-services-rg-02/providers/Microsoft.Storage/storageAccounts/iopitnservicesst02"
}
