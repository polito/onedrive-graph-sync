# onedrive-graph-sync

This simple program syncs a local folder with a remote OneDrive location.
Create a [.env](./.env.example) file following the example for configuration.

### App grants setup

The following will prompt user login:
login with a user with admin permissions on the sharepoint/onedrive drive you want to sync.

```pwsh
Install-Module -Name Az -Repository PSGallery -Force
Install-Module PnP.PowerShell -Scope CurrentUser

$siteUrl = "https://politoit.sharepoint.com/teams/SOME_TEAM"
$clientId = "deadbeef-abba-acca-adda-deadbeef1234"
$tenant = "politoit.onmicrosoft.com"
 
Connect-PnPOnline -Url $siteUrl -Interactive
$writeperm = Grant-PnPAzureADAppSitePermission -Permissions "Read" -Site $siteUrl -AppId $clientId -DisplayName "SOME_MEANINGFUL_NAME"
$PermissionId = Get-PnPAzureADAppSitePermission -AppIdentity $clientId
Set-PnPAzureADAppSitePermission -Site $siteurl -PermissionId $(($PermissionId).Id) -Permissions "FullControl"

```
