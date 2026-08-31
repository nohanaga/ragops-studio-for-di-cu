@description('The name of the Azure Developer CLI environment.')
param environmentName string

@description('The Azure region in which resources are deployed.')
param location string

@description('Tags applied to all resources that support tags.')
param tags object = {}

var resourceToken = uniqueString(subscription().id, resourceGroup().id, environmentName)
var containerAppName = 'ca-ragops-${resourceToken}'
var containerAppsEnvironmentName = 'cae-ragops-${resourceToken}'
var containerRegistryName = 'crragops${resourceToken}'
var contentUnderstandingName = 'cu-ragops-${resourceToken}'
var documentIntelligenceName = 'di-ragops-${resourceToken}'
var imagePullIdentityName = 'id-ragops-${resourceToken}'
var logAnalyticsName = 'log-ragops-${resourceToken}'
var storageAccountName = 'stragops${resourceToken}'
var storageContainerName = 'appstorage'

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var cognitiveServicesUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'a97b65f3-24c7-4388-baec-2e87135dc908'
)
var storageBlobDataContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    retentionInDays: 30
  }
  sku: {
    name: 'PerGB2018'
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource imagePullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: imagePullIdentityName
  location: location
  tags: tags
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, imagePullIdentity.id, acrPullRoleDefinitionId)
  scope: containerRegistry
  properties: {
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource documentIntelligenceAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligence.id, imagePullIdentity.id, cognitiveServicesUserRoleDefinitionId)
  scope: documentIntelligence
  properties: {
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleDefinitionId
  }
}

resource contentUnderstandingAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(contentUnderstanding.id, imagePullIdentity.id, cognitiveServicesUserRoleDefinitionId)
  scope: contentUnderstanding
  properties: {
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleDefinitionId
  }
}

resource storageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, imagePullIdentity.id, storageBlobDataContributorRoleDefinitionId)
  scope: storageAccount
  properties: {
    principalId: imagePullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource storageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: storageContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: documentIntelligenceName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: documentIntelligenceName
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource contentUnderstanding 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: contentUnderstandingName
  location: location
  tags: tags
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: contentUnderstandingName
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Allow'
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: containerAppName
  location: location
  tags: union(tags, {
    'azd-service-name': 'app'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${imagePullIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          identity: imagePullIdentity.id
          server: containerRegistry.properties.loginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: imagePullIdentity.properties.clientId
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_NAME'
              value: storageAccount.name
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: storageContainer.name
            }
            {
              name: 'CU_AUTH_MODE'
              value: 'identity'
            }
            {
              name: 'CU_ENDPOINT'
              value: contentUnderstanding.properties.endpoint
            }
            {
              name: 'DI_AUTH_MODE'
              value: 'identity'
            }
            {
              name: 'DI_ENDPOINT'
              value: documentIntelligence.properties.endpoint
            }
            {
              name: 'PORT'
              value: '8000'
            }
            {
              name: 'STORAGE_BACKEND'
              value: 'blob'
            }
            {
              name: 'UPLOADS_ENABLED'
              value: 'true'
            }
            {
              name: 'USER_TABS_ENABLED'
              value: 'false'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 3
        minReplicas: 0
      }
    }
  }
  dependsOn: [
    acrPull
    contentUnderstandingAccess
    documentIntelligenceAccess
    storageAccess
  ]
}

output containerAppName string = containerApp.name
output containerAppUri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerRegistryEndpoint string = containerRegistry.properties.loginServer
output containerRegistryName string = containerRegistry.name
output contentUnderstandingEndpoint string = contentUnderstanding.properties.endpoint
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
output storageAccountName string = storageAccount.name
output storageContainerName string = storageContainer.name