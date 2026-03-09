# Lê versão atual
$json = Get-Content version.json -Raw | ConvertFrom-Json
$parts = $json.version -split '\.'
$parts[2] = [int]$parts[2] + 1
$newVersion = $parts -join '.'

# Atualiza version.json
"{`"version`":`"$newVersion`"}" | Set-Content version.json

# Atualiza APP_VERSION no index.html
$index = Get-Content index.html -Raw
$index = $index -replace "const APP_VERSION = '[^']*';", "const APP_VERSION = '$newVersion';"
Set-Content index.html $index

Write-Host "OK Versao: $($json.version) -> $newVersion"

# Copia index para www
Copy-Item index.html www\index.html

# Git push
git add index.html www\index.html version.json
git commit -m "deploy: v$newVersion"
git push origin main

Write-Host "Deploy feito! v$newVersion no ar em ~1 minuto"