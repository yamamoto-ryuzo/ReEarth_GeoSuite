# 新しいプラグインを作成するスクリプト
param(
    [Parameter(Mandatory = $true)]
    [string]$PluginName,
    
    [Parameter(Mandatory = $false)]
    [string]$Description = "A new RE:EARTH plugin"
)

$pluginId = $PluginName.ToLower() -replace '\s+', '-'
$pluginDir = "src/plugins/$pluginId"

Write-Host "Creating new plugin: $PluginName" -ForegroundColor Green

# プラグインディレクトリを作成
if (Test-Path $pluginDir) {
    Write-Host "Error: Plugin directory already exists: $pluginDir" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

# テンプレートからファイルをコピー
$indexContent = Get-Content "templates/plugin-template/index.ts" -Raw
$reearthContent = Get-Content "templates/plugin-template/reearth.yml" -Raw

# プレースホルダーを置換
$indexContent = $indexContent -replace '{{PLUGIN_NAME}}', $PluginName
$reearthContent = $reearthContent -replace '{{PLUGIN_ID}}', $pluginId
$reearthContent = $reearthContent -replace '{{PLUGIN_NAME}}', $PluginName
$reearthContent = $reearthContent -replace '{{PLUGIN_DESCRIPTION}}', $Description

# ファイルを作成
Set-Content -Path "$pluginDir/index.ts" -Value $indexContent
Set-Content -Path "$pluginDir/reearth.yml" -Value $reearthContent

Write-Host "Plugin created successfully!" -ForegroundColor Green
Write-Host "Location: $pluginDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit $pluginDir/index.ts to implement your plugin logic"
Write-Host "2. Edit $pluginDir/reearth.yml to configure your plugin"
Write-Host "3. Run 'npm run build' to build the plugin"
