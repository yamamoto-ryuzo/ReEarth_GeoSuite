param(
    [Parameter(Mandatory = $false)] [string]$PluginId,
    [Parameter(Mandatory = $false)] [string]$PluginPath
)

# RE:EARTHにアップロードするZIPを作成するスクリプト
# 前提: プラグインは `src/plugins/$PluginId/` に配置され、
#  - 必須ファイル: `reearth.yml`, `index.js`（または `index.ts` をビルドして `index.js`）
#  - 静的アセットがあれば同フォルダへ配置

$ErrorActionPreference = 'Stop'

# 入力解釈:
# - PluginPath が指定されていればそれを使う（絶対/相対どちらも可）
# - そうでなければ、PluginId がパスとして存在すればそれを使う
# - どちらもなければ、PluginId を src/plugins/<id> とみなす
# - さらに未指定なら、カレントディレクトリ名を <id> とみなす

if ($PluginPath) {
    $pluginDir = Resolve-Path -LiteralPath $PluginPath -ErrorAction SilentlyContinue
    if (-not $pluginDir) {
        Write-Host "Invalid path: $PluginPath" -ForegroundColor Red
        exit 1
    }
    $pluginDir = $pluginDir.Path
    # フォルダ名からPluginIdを設定
    $PluginId = Split-Path -Leaf $pluginDir
}
elseif ($PluginId) {
    if (Test-Path -LiteralPath $PluginId) {
        $pluginDir = (Resolve-Path -LiteralPath $PluginId).Path
        $PluginId = Split-Path -Leaf $pluginDir
    }
    else {
        $pluginDir = Join-Path "src/plugins" $PluginId
    }
}
else {
    $PluginId = (Split-Path -Leaf (Get-Location))
    $PluginId = $PluginId.ToLower() -replace '\s+', '-'
    $pluginDir = Join-Path "src/plugins" $PluginId
}
if (-not (Test-Path -LiteralPath $pluginDir)) {
    Write-Host "Plugin directory not found: $pluginDir" -ForegroundColor Red
    exit 1
}

$zipName = "$(Split-Path -Leaf $pluginDir).zip"
$outDir = "artifacts"
$zipPath = Join-Path $outDir $zipName

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# 必須ファイル存在チェック
$required = @('reearth.yml')
$missing = @()
foreach ($f in $required) {
    if (-not (Test-Path (Join-Path $pluginDir $f))) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Write-Host "Missing required files in plugin: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

# reearth.yml の id とフォルダ名の整合性チェック
try {
    $reearthPath = Join-Path $pluginDir 'reearth.yml'
    $reearthText = Get-Content -LiteralPath $reearthPath -Raw
    $reearthJson = $null
    try { $reearthJson = $reearthText | ConvertFrom-Json } catch { $reearthJson = $null }
    if ($reearthJson -and $reearthJson.id) {
        $folderName = Split-Path -Leaf $pluginDir
        if ($reearthJson.id -ne $folderName) {
            Write-Host "[WARN] reearth.yml id ('$($reearthJson.id)') and folder name ('$folderName') differ." -ForegroundColor Yellow
            Write-Host "       It's recommended to match them to avoid upload issues."
        }
    }
    else {
        Write-Host "[WARN] Could not parse reearth.yml as JSON or missing 'id'. Ensure valid JSON structure." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "[WARN] Failed to validate reearth.yml id: $($_.Exception.Message)" -ForegroundColor Yellow
}

# JSエントリ確認（TS運用ならdistのJSでも可）
$entryCandidates = @('index.js', 'dist/index.js')
$entryFound = $false
foreach ($e in $entryCandidates) {
    if (Test-Path (Join-Path $pluginDir $e)) { $entryFound = $true; break }
}
if (-not $entryFound) {
    Write-Host "Entry JS not found. Place 'index.js' or 'dist/index.js' in $pluginDir" -ForegroundColor Yellow
}

Write-Host "Packaging plugin '$PluginId' to $zipPath" -ForegroundColor Cyan
<#
    Re:Earth 側はZIPのトップレベルに「プラグインフォルダ名/…」という
    階層があることを前提にしている可能性があります。
    これまでの実装（'*' で中身のみを圧縮）はフォルダを落としてしまうため、
    手動ZIPでは再現しないエラー（undefined.split など）につながり得ます。
    そのため、ディレクトリそのものを圧縮対象に指定して、
    ZIP内にプラグインフォルダを保持します。
#>
Compress-Archive -Path $pluginDir -DestinationPath $zipPath -Force
Write-Host "Done. Upload ZIP to RE:EARTH: $zipPath" -ForegroundColor Green
