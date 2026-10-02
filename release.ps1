param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Notes = "",
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$repo = "lynnnawe/nelyalauncher"
$root = $PSScriptRoot

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "version must look like 1.2.3" }

function Set-Version([string]$file, [string]$pattern, [string]$value) {
    $text = [IO.File]::ReadAllText($file)
    $next = [regex]::Replace($text, $pattern, $value)
    [IO.File]::WriteAllText($file, $next, (New-Object Text.UTF8Encoding $false))
}

Write-Host "setting version to $Version"
Set-Version "$root\Nelya.csproj" '<Version>[^<]*</Version>' "<Version>$Version</Version>"
Set-Version "$root\installer\Setup.csproj" '<Version>[^<]*</Version>' "<Version>$Version</Version>"
Set-Version "$root\web\splash.html" 'nelya \d+\.\d+\.\d+' "nelya $Version"

Get-Process Nelya -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "building Nelya.exe"
dotnet publish "$root\Nelya.csproj" -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "$root\dist" | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Nelya.exe failed to build" }

Write-Host "building Nelya-Setup.exe"
dotnet build "$root\installer\Setup.csproj" -c Release -o "$root\installer\out" | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Nelya-Setup.exe failed to build" }
Copy-Item "$root\installer\out\Nelya-Setup.exe" "$root\dist\Nelya-Setup.exe" -Force
dotnet build-server shutdown | Out-Null

if ($BuildOnly) {
    Write-Host "built $Version into $root\dist"
    return
}

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh -and (Test-Path "$env:ProgramFiles\GitHub CLI\gh.exe")) { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" }
if (-not $gh) { throw "install the github cli (winget install GitHub.cli) and run gh auth login" }

$text = $(if ($Notes) { $Notes } else { "nelya $Version" })
Write-Host "publishing v$Version to $repo"
& $gh release create "v$Version" "$root\dist\Nelya.exe" "$root\dist\Nelya-Setup.exe" --repo $repo --title "nelya $Version" --notes $text
if ($LASTEXITCODE -ne 0) { throw "github did not accept the release" }
Write-Host "released https://github.com/$repo/releases/tag/v$Version"
