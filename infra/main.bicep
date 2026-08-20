targetScope = 'subscription'

@description('The name of the Azure Developer CLI environment.')
@minLength(1)
param environmentName string

@description('The Azure region in which resources are deployed.')
param location string

@description('The resource group created for this environment.')
param resourceGroupName string = 'rg-ragops-${environmentName}'

var tags = {
  'azd-env-name': environmentName
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources './resources.bicep' = {
  name: 'ragops-resources'
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    tags: tags
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_APP_NAME string = resources.outputs.containerAppName
output AZURE_CONTAINER_APP_URI string = resources.outputs.containerAppUri
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryEndpoint
output DI_ENDPOINT string = resources.outputs.documentIntelligenceEndpoint
output CU_ENDPOINT string = resources.outputs.contentUnderstandingEndpoint
output AZURE_STORAGE_ACCOUNT_NAME string = resources.outputs.storageAccountName
output AZURE_STORAGE_CONTAINER_NAME string = resources.outputs.storageContainerName