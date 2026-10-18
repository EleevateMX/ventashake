# ============================================================================
#  Shakeaholic - instalar el agente de TICKETS de caja en la PC de la tienda
# ============================================================================
#  Deja la impresora de tickets (la de caja, ESC/POS, sin estacion) lista:
#  baja el agente de `agente-caja/` del repo, saca el token de la impresora
#  "Caja - Tickets" dada de alta en Admin, escribe el .env, prueba que la
#  impresora conteste y lo deja como Servicio de Windows (arranca solo al
#  prender la PC, aunque nadie inicie sesion).
#
#  Es APARTE del agente de etiquetas (instalar-agente-impresion.ps1), y ese
#  instalador NO toca esta impresora: si la tomara, le rotaria el token y le
#  mandaria TSPL. Este, a la inversa, solo toca la impresora sin estacion.
#
#  USO: no se baja este archivo. Se usa `instalar-agente-caja.bat`
#  (Admin -> Descargas), clic derecho -> ejecutar como administrador.
#
#  Se puede correr las veces que haga falta: genera un token nuevo, reescribe
#  el .env y reinicia el servicio con la version nueva.
# ============================================================================

param(
  [string] $AnonKey,
  [string] $Destino = 'C:\Shakeaholic\agente-caja',
  [string] $Rama    = 'main',
  [switch] $SoloProbar
)

$ErrorActionPreference = 'Stop'

$SupabaseUrl = 'https://zyjtnaystsporbuzcmqk.supabase.co'
$Crudo       = "https://raw.githubusercontent.com/EleevateMX/ventashake/$Rama/agente-caja"
$Archivos    = @('agente-caja.mjs', 'instalar-servicio.mjs', 'iniciar.bat', 'instalar-servicio.bat', 'LEEME.txt', '.env.example')
$Servicio    = 'Shakeaholic Agente de Caja'

function Escribir($ruta, $texto) {
  [System.IO.File]::WriteAllText($ruta, $texto, (New-Object System.Text.UTF8Encoding $false))
}
function Paso  ($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Bien  ($m) { Write-Host "   OK  $m" -ForegroundColor Green }
function Aviso ($m) { Write-Host "   !   $m" -ForegroundColor Yellow }
function Malo  ($m) { Write-Host "   X   $m" -ForegroundColor Red }

function Cabeceras($anonKey) {
  $h = @{ apikey = $anonKey }
  if ($anonKey.StartsWith('eyJ')) { $h['Authorization'] = "Bearer $anonKey" }
  return $h
}

function Probar-Impresora($ip, $puerto) {
  $cliente = New-Object System.Net.Sockets.TcpClient
  try {
    $tarea = $cliente.ConnectAsync($ip, $puerto)
    if ($tarea.Wait(4000) -and $cliente.Connected) { return $true }
    return $false
  } catch {
    return $false
  } finally {
    $cliente.Dispose()
  }
}

Write-Host ''
Write-Host '  SHAKEAHOLIC - agente de tickets de caja' -ForegroundColor White
Write-Host '  ---------------------------------------'

if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) {
  Malo 'Este instalador es para la PC Windows de la tienda.'
  exit 1
}
if (-not $AnonKey) {
  Malo 'Falta -AnonKey (Supabase -> Project Settings -> API Keys).'
  exit 1
}

# ---------------------------------------------------------------------------
# 1. La impresora de tickets dada de alta en Admin
# ---------------------------------------------------------------------------
Paso 'Buscando la impresora de tickets en Admin'
try {
  $lista = @(Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_admin_impresoras" `
    -Headers (Cabeceras $AnonKey) -ContentType 'application/json' -Body '{}')
} catch {
  Malo "No se pudo hablar con Supabase: $($_.Exception.Message)"
  Write-Host '    Revisa la llave y que este equipo tenga internet.'
  exit 1
}
# Solo las que NO tienen estacion: las de estacion son etiquetadoras TSPL
# de barra y cocina, y esas son del otro agente.
$caja = @($lista | Where-Object { $_.activa -and -not $_.cocina_id -and $_.tipo_conexion -eq 'red' })
if ($caja.Count -eq 0) {
  Malo 'No hay impresora de tickets activa (de red y sin estacion).'
  Write-Host '    Admin -> Impresoras -> Nueva impresora, sin estacion, IP 192.168.1.50.'
  exit 1
}
if ($caja.Count -gt 1) {
  $preferida = @($caja | Where-Object { $_.nombre -like '*Caja*' })
  if ($preferida.Count -ge 1) { $caja = $preferida }
  Aviso "Hay $($caja.Count) sin estacion; se usa la primera: $($caja[0].nombre)"
}
$imp = $caja[0]
$puerto = if ($imp.puerto) { [int]$imp.puerto } else { 9100 }
Bien "$($imp.nombre) - $($imp.ip):$puerto"

Paso 'Probando que responda'
$responde = Probar-Impresora $imp.ip $puerto
if ($responde) {
  Bien 'responde'
} else {
  Malo "$($imp.ip):$puerto NO responde"
  Write-Host '        Revisa: encendida, con papel, cable de red puesto.'
  Write-Host '        Se instala IGUAL: en cuanto la prendan, el agente la usa solo.'
}
if ($SoloProbar) {
  Write-Host ''
  Write-Host '  (-SoloProbar: no se instalo nada)' -ForegroundColor DarkGray
  exit 0
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
# 3. Detener el agente de caja que ya este corriendo
# ---------------------------------------------------------------------------
# Hay que hacerlo ANTES de rotar el token: con el token nuevo, un agente
# viejo que siga vivo late y no puede reclamar trabajos -- y desde Admin se
# ve "conectado" sin imprimir nada. Solo se tocan procesos del agente de
# CAJA (agente-caja.mjs), nunca el de etiquetas.
Paso 'Buscando un agente de caja anterior'
$svc = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
if ($svc) {
  if ($svc.State -ne 'Stopped') {
    Stop-Service -Name $svc.Name -Force -EA SilentlyContinue
    Start-Sleep -Seconds 2
  }
  Bien "servicio detenido ($($svc.Name))"
}
$sueltos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -EA SilentlyContinue |
           Where-Object { $_.CommandLine -like '*agente-caja.mjs*' }
foreach ($p in @($sueltos | Where-Object { $_ })) {
  Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue
  Bien "detenido el que corria en ventana (pid $($p.ProcessId))"
}
if (-not $svc -and -not $sueltos) { Bien 'no habia ninguno' }

# Un servicio registrado desde OTRA carpeta (por ejemplo Descargas) se
# quita: si no, al prender la PC arrancaria esa copia con el token viejo.
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
Paso "Bajando el agente de caja ($Rama)"
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
$version = (Select-String -Path (Join-Path $Destino 'agente-caja.mjs') -Pattern 'var VERSION = "([0-9.]+)"' |
            Select-Object -First 1).Matches.Groups[1].Value
Bien "$Destino (version $version)"

# ---------------------------------------------------------------------------
# 5. Token y configuracion
# ---------------------------------------------------------------------------
# El token no se puede leer, solo generar uno nuevo; el anterior deja de
# servir en ese momento. Por eso se detuvo arriba cualquier agente viejo.
Paso 'Generando la configuracion'
try {
  $token = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_rotar_token_impresora" `
    -Headers (Cabeceras $AnonKey) -ContentType 'application/json' `
    -Body (@{ p_id = $imp.id } | ConvertTo-Json)
} catch {
  Malo "No se pudo sacar el token: $($_.Exception.Message)"
  exit 1
}
$env_txt = @"
SUPABASE_URL=$SupabaseUrl
SUPABASE_ANON_KEY=$AnonKey
IMPRESORA_TOKEN=$token
IMPRESORA_HOST=$($imp.ip)
IMPRESORA_PUERTO=$puerto
AGENTE_ID=caja-$($env:COMPUTERNAME)
POLL_INTERVALO_SEGUNDOS=5
LATIDO_INTERVALO_SEGUNDOS=30
"@
Escribir (Join-Path $Destino '.env') $env_txt
Bien '.env escrito con token nuevo'

# ---------------------------------------------------------------------------
# 6. Servicio de Windows
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
    # node-windows dice "ya estaba instalado" si encuentra su carpeta daemon
    # de un intento anterior, aunque Windows ya no tenga el servicio. Se
    # borra esa carpeta y se intenta una vez mas.
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

# ---------------------------------------------------------------------------
# 7. Comprobar que de verdad quedo en linea
# ---------------------------------------------------------------------------
# "Servicio corriendo" solo dice que Windows lo arranco, no que el agente
# hable con el servidor: si se cae al empezar, Windows lo reinicia en
# silencio y Admin nunca lo ve en linea. Se le pregunta al servidor si ya
# latio con el token nuevo, y si no, se ensena el error del servicio aqui
# mismo en vez de decir LISTO.
Paso 'Esperando a que el agente se reporte (hasta 45 s)'
$enLinea = $false
$inicio = Get-Date
while (((Get-Date) - $inicio).TotalSeconds -lt 45) {
  Start-Sleep -Seconds 5
  try {
    $yo = @(Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_admin_impresoras" `
      -Headers (Cabeceras $AnonKey) -ContentType 'application/json' -Body '{}') |
      Where-Object { $_.id -eq $imp.id } | Select-Object -First 1
    if ($yo -and $yo.ultima_conexion -and ([datetime]$yo.ultima_conexion).ToUniversalTime() -gt $inicio.ToUniversalTime().AddSeconds(-5)) {
      $enLinea = $true
      break
    }
  } catch { }
}
if ($enLinea) {
  Bien 'en linea: Admin ya lo ve'
} else {
  Malo 'El servicio arranco pero el agente NO se ha reportado.'
  $logs = Get-ChildItem (Join-Path $Destino 'daemon') -Filter '*.log' -EA SilentlyContinue |
          Sort-Object LastWriteTime -Descending
  foreach ($l in $logs) {
    Write-Host ''
    Write-Host "    --- $($l.Name) (ultimas lineas) ---" -ForegroundColor Yellow
    Get-Content $l.FullName -Tail 15 -EA SilentlyContinue | ForEach-Object { Write-Host "    $_" }
  }
  if (-not $logs) { Write-Host '    No hay bitacora del servicio en la carpeta daemon.' }
  Write-Host ''
  Write-Host '    Manda una foto de esta ventana. Mientras, se puede correr a mano:'
  Write-Host "    doble clic en $Destino\iniciar.bat (y dejar esa ventana abierta)."
  exit 1
}

Write-Host ''
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Instalado en: $Destino  (version $version)"
Write-Host ''
Write-Host '  Corre como servicio: arranca solo al prender la PC, sin ventana.'
Write-Host "  En Admin -> Impresoras, '$($imp.nombre)' debe verse en linea en menos de un minuto."
Write-Host ''
Write-Host '  Para probar: en el kiosko, al terminar una venta, "Imprimir ticket".'
Write-Host '  La impresion automatica en cada cobro sigue APAGADA (Admin -> Ticket).'
Write-Host ''
