# ============================================================================
#  Shakeaholic - instalar el agente de PANTALLAS en la PC de la tienda
# ============================================================================
#  Deja las televisiones mostrando lo que gerencia les asigno en
#  Admin -> Pantallas (TV): baja el agente de `agente-pantallas/` del repo,
#  escribe el .env, busca las TVs en la red y lo deja como Servicio de
#  Windows (arranca solo al prender la PC, aunque nadie inicie sesion).
#
#  Es APARTE del agente de etiquetas y del de caja. Los tres conviven en la
#  misma PC con nombres de servicio distintos: si uno se cae, los otros
#  siguen.
#
#  DIFERENCIA IMPORTANTE con el instalador de caja: la llave del empujador
#  NO se puede sacar por API. Generarla es solo de gerencia (Admin ->
#  Pantallas -> "Generar llave del empujador") y se ve una sola vez. Este
#  instalador la reutiliza si ya esta en el .env de la PC; si no, la pide.
#
#  USO: no se baja este archivo. Se usa `instalar-agente-pantallas.bat`
#  (Admin -> Descargas), clic derecho -> ejecutar como administrador.
# ============================================================================

param(
  [string] $AnonKey,
  [string] $Token,
  [string] $Destino = 'C:\Shakeaholic\agente-pantallas',
  [string] $Rama    = 'main',
  [switch] $SoloProbar
)

$ErrorActionPreference = 'Stop'

$SupabaseUrl = 'https://zyjtnaystsporbuzcmqk.supabase.co'
$Crudo       = "https://raw.githubusercontent.com/EleevateMX/ventashake/$Rama/agente-pantallas"
$Archivos    = @('agente-pantallas.mjs', 'instalar-servicio.mjs', 'iniciar.bat',
                 'instalar-servicio.bat', 'buscar-tvs.bat', 'LEEME.txt', '.env.example')
$Servicio    = 'Shakeaholic Agente de Pantallas'

function Escribir($ruta, $texto) {
  [System.IO.File]::WriteAllText($ruta, $texto, (New-Object System.Text.UTF8Encoding $false))
}
function Paso  ($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Bien  ($m) { Write-Host "   OK  $m" -ForegroundColor Green }
function Aviso ($m) { Write-Host "   !   $m" -ForegroundColor Yellow }
function Malo  ($m) { Write-Host "   X   $m" -ForegroundColor Red }

function Leer-DelEnv($ruta, $clave) {
  if (-not (Test-Path $ruta)) { return $null }
  foreach ($linea in Get-Content $ruta) {
    if ($linea -match "^\s*$clave\s*=\s*(.+?)\s*$") { return $Matches[1] }
  }
  return $null
}

Write-Host ''
Write-Host '  SHAKEAHOLIC - agente de pantallas (TV)' -ForegroundColor White
Write-Host '  --------------------------------------'

if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) {
  Malo 'Este instalador es para la PC Windows de la tienda.'
  exit 1
}
if (-not $AnonKey) {
  Malo 'Falta -AnonKey (Supabase -> Project Settings -> API Keys).'
  exit 1
}

# ---------------------------------------------------------------------------
# 1. La llave del empujador
# ---------------------------------------------------------------------------
# No hay forma de sacarla: la base guarda solo su hash y generar otra
# invalida la anterior. Si esta PC ya la tiene, se reutiliza; si no, se pide
# una vez y se queda en el .env.
Paso 'Llave del empujador'
if (-not $Token) {
  $Token = Leer-DelEnv (Join-Path $Destino '.env') 'PANTALLAS_TOKEN'
  if ($Token) { Bien 'se reutiliza la que ya tiene esta PC' }
}
if (-not $Token) {
  Write-Host ''
  Write-Host '   Esta PC todavia no tiene llave.' -ForegroundColor Yellow
  Write-Host '   En Admin -> Pantallas (TV), boton "Generar llave del empujador".'
  Write-Host '   Se ve UNA SOLA VEZ: copiala y pegala aqui.'
  Write-Host ''
  $Token = (Read-Host '   Llave (tv_...)').Trim()
}
if (-not $Token) {
  Malo 'Sin llave el agente no puede pedir la asignacion.'
  exit 1
}
if (-not $Token.StartsWith('tv_')) {
  Aviso "la llave no empieza con 'tv_'; se usa igual, pero revisa que sea la correcta"
}

# ---------------------------------------------------------------------------
# 2. Node
# ---------------------------------------------------------------------------
Paso 'Revisando Node.js'
$node = Get-Command node -EA SilentlyContinue
$versionOk = $false
if ($node) {
  $v = (& node --version) -replace '^v', ''
  $versionOk = [int]($v.Split('.')[0]) -ge 20
  if ($versionOk) { Bien "Node $v" } else { Aviso "Node $v es viejo, hace falta 20 o mas" }
}
if (-not $versionOk) {
  if (Get-Command winget -EA SilentlyContinue) {
    Aviso 'Instalando Node.js LTS con winget (tarda un par de minutos)...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Get-Command node -EA SilentlyContinue)) {
      Malo 'Node quedo instalado pero esta ventana no lo ve. Cierra y vuelve a correr el .bat.'
      exit 1
    }
    Bien "Node $((& node --version))"
  } else {
    Malo 'No hay Node 20+ ni winget para instalarlo. Bajalo de https://nodejs.org (LTS).'
    exit 1
  }
}

# ---------------------------------------------------------------------------
# 3. Detener el agente de pantallas que ya este corriendo
# ---------------------------------------------------------------------------
# Dos empujadores a la vez se pelean la misma TV: uno pone una imagen y el
# otro la quita medio segundo despues. Solo se tocan procesos de ESTE agente.
Paso 'Buscando un agente de pantallas anterior'
$svc = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
if ($svc) {
  if ($svc.State -ne 'Stopped') {
    Stop-Service -Name $svc.Name -Force -EA SilentlyContinue
    Start-Sleep -Seconds 2
  }
  Bien "servicio detenido ($($svc.Name))"
}
$sueltos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -EA SilentlyContinue |
           Where-Object { $_.CommandLine -like '*agente-pantallas.mjs*' }
foreach ($p in @($sueltos | Where-Object { $_ })) {
  Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue
  Bien "detenido el que corria en ventana (pid $($p.ProcessId))"
}
if (-not $svc -and -not $sueltos) { Bien 'no habia ninguno' }

$reusar = $false
if ($svc) {
  if ($svc.PathName -like "*$Destino*") {
    $reusar = $true
  } else {
    Aviso "el servicio anterior corria desde otra carpeta: $($svc.PathName)"
    & sc.exe delete $svc.Name | Out-Null
    Start-Sleep -Seconds 2
    Bien 'quitado; se registra de nuevo desde la carpeta de siempre'
  }
}

# ---------------------------------------------------------------------------
# 4. Bajar el agente
# ---------------------------------------------------------------------------
Paso "Bajando el agente de pantallas ($Rama)"
New-Item -ItemType Directory -Path $Destino -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($a in $Archivos) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Crudo/$a" -OutFile (Join-Path $Destino $a)
  } catch {
    Malo "No se pudo bajar $($a): $($_.Exception.Message)"
    exit 1
  }
}
Get-ChildItem $Destino -File | Unblock-File -EA SilentlyContinue
$version = (Select-String -Path (Join-Path $Destino 'agente-pantallas.mjs') -Pattern 'var VERSION = "([0-9.]+)"' |
            Select-Object -First 1).Matches.Groups[1].Value
Bien "$Destino (version $version)"

# ---------------------------------------------------------------------------
# 5. Las televisiones que hay en la red
# ---------------------------------------------------------------------------
# No es un adorno: sin esto hay que adivinar las IP para darlas de alta en
# Admin, y una TV en standby no aparece aunque este conectada.
Paso 'Buscando televisiones en la red'
Push-Location $Destino
try {
  & node agente-pantallas.mjs --buscar
} catch {
  Aviso "no se pudo buscar: $($_.Exception.Message)"
}
Pop-Location

if ($SoloProbar) {
  Write-Host ''
  Write-Host '  (-SoloProbar: no se instalo nada)' -ForegroundColor DarkGray
  exit 0
}

# ---------------------------------------------------------------------------
# 6. Configuracion
# ---------------------------------------------------------------------------
Paso 'Escribiendo la configuracion'
$env_txt = @"
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$AnonKey
PANTALLAS_TOKEN=$Token
RPC_ASIGNACIONES=fn_pantallas_tv_agente
RPC_REPORTE=fn_pantallas_tv_reportar
AGENTE_NOMBRE=$($env:COMPUTERNAME)
CICLO_SEGUNDOS=45
REPORTE_SEGUNDOS=90
REDESCUBRIR_SEGUNDOS=300
VERBOSO=
"@
Escribir (Join-Path $Destino '.env') $env_txt
Bien '.env escrito'

# ---------------------------------------------------------------------------
# 7. Servicio de Windows
# ---------------------------------------------------------------------------
Push-Location $Destino
try {
  if ($reusar) {
    Paso 'Arrancando el servicio con la version nueva'
    Start-Service -Name $svc.Name
    Bien 'servicio corriendo'
  } else {
    Paso 'Registrando el servicio de Windows (la primera vez tarda)'
    & npm install node-windows --no-save --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "npm install node-windows devolvio $LASTEXITCODE" }
    & node instalar-servicio.mjs
    if ($LASTEXITCODE -ne 0) { throw "instalar-servicio.mjs devolvio $LASTEXITCODE" }
    Start-Sleep -Seconds 5
    $nuevo = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
    if (-not $nuevo -and (Test-Path (Join-Path $Destino 'daemon'))) {
      Aviso 'habia restos de un servicio anterior; se limpian y se intenta otra vez'
      Remove-Item (Join-Path $Destino 'daemon') -Recurse -Force -EA SilentlyContinue
      & node instalar-servicio.mjs
      Start-Sleep -Seconds 5
      $nuevo = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
    }
    if (-not $nuevo) { throw 'el servicio no aparecio en Windows' }
    if ($nuevo.State -ne 'Running') { Start-Service -Name $nuevo.Name -EA SilentlyContinue }
    Bien 'servicio registrado y corriendo'
  }
} catch {
  Pop-Location
  Malo "No quedo como servicio: $($_.Exception.Message)"
  Write-Host '    Mientras se arregla, se puede correr a mano: doble clic en'
  Write-Host "    $Destino\iniciar.bat (y dejar esa ventana abierta)."
  exit 1
}
Pop-Location

Write-Host ''
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Instalado en: $Destino  (version $version)"
Write-Host ''
Write-Host '  Corre como servicio: arranca solo al prender la PC, sin ventana.'
Write-Host '  En Admin -> Pantallas (TV) debe decir "Empujador - en linea" en menos'
Write-Host '  de un minuto, y cada TV con contenido asignado, "Mostrando".'
Write-Host ''
Write-Host '  Si una TV dice "sin respuesta": esta apagada o en standby. VIDAA apaga'
Write-Host '  su DLNA con la pantalla y vuelve sola al encenderla.'
Write-Host ''
