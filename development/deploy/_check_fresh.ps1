# Bootstrap fresco solo con migraciones y volcado de esquema de cotizaciones
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pbExe = Join-Path $repoRoot "backend\pocketbase.exe"
$hooksDir = Join-Path $repoRoot "backend\pb_hooks"
$migrationsDir = Join-Path $repoRoot "backend\pb_migrations"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cotizador-fresh-" + [guid]::NewGuid().ToString("N"))
$tempPbData = Join-Path $tempRoot "pb_data"
New-Item -ItemType Directory -Path $tempPbData -Force | Out-Null

& $pbExe superuser upsert "su@x.local" "SuperPass#12345" --dir "$tempPbData" --hooksDir "$hooksDir" --migrationsDir "$migrationsDir" | Out-Null
Write-Host "exit=$LASTEXITCODE"

python -c "
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
cur = con.cursor()
cols = [r[1] for r in cur.execute('PRAGMA table_info(cotizaciones)')]
print('cotizaciones cols:', cols)
print('flujo_estado in table:', 'flujo_estado' in cols)
apps = [r[0] for r in cur.execute('SELECT file FROM _migrations ORDER BY file')]
print('migrations applied:', len(apps))
print([a for a in apps if '1790000035' in a])
ucols = [r[1] for r in cur.execute('PRAGMA table_info(app_users)')]
print('app_users has is_admin:', 'is_admin' in ucols)
rcols = [r[1] for r in cur.execute('PRAGMA table_info(app_roles)')]
print('app_roles has grants_admin:', 'grants_admin' in rcols)
con.close()
" (Join-Path $tempPbData "data.db")

Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
