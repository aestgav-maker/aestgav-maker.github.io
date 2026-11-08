# 사이트를 다시 만들고 GitHub에 올린다. GitHub Pages가 docs/ 를 몇 분 안에 반영한다.
param([string]$Message = "글 업데이트 $(Get-Date -Format 'yyyy-MM-dd HH:mm')")

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# 새로 설치한 git이 이전에 열린 창에서도 잡히도록 PATH를 다시 읽는다
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

node build.js
if ($LASTEXITCODE -ne 0) { throw '사이트 빌드에 실패했어요.' }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host '바뀐 내용이 없어서 올리지 않았어요.'
    return
}
git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw '커밋에 실패했어요.' }
git push
if ($LASTEXITCODE -ne 0) { throw 'GitHub에 올리지 못했어요. 로그인 상태를 확인해 주세요.' }
Write-Host '올렸어요. 몇 분 뒤 사이트에 반영돼요.'
