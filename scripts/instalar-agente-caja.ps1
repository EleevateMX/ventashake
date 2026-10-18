# ============================================================================
#  Shakeaholic - instalar el agente de TICKETS de caja en la PC de la tienda
# ============================================================================
#  Deja la impresora de tickets (la de caja, ESC/POS, sin estacion) lista:
#  baja el agente de `agente-caja/` del repo, saca el token de la impresora
#  "Caja - Tickets" dada de alta en Admin, escribe el .env, prueba que la
#  impresora conteste, imprime una prueba directa y lo deja corriendo en su
#  propia ventana minimizada, que se levanta sola si se cae y arranca al
#  prender la PC -- igual que el agente de etiquetas, que es el camino que ya
#  funciona en esa PC todos los dias.
#
#  Sin Servicio de Windows a proposito (18/10/26): la primera version usaba
#  node-windows, que necesitaba bajar paquetes al instalar, corria como otra
#  cuenta y, cuando el agente se caia al arrancar, Windows lo reiniciaba en
#  silencio. Dos instalaciones quedaron "corriendo" sin imprimir nada.
#
#  Es APARTE del agente de etiquetas (instalar-agente-impresion.ps1), y ese
#  instalador NO toca esta impresora: si la tomara, le rotaria el token y le
#  mandaria TSPL. Este, a la inversa, solo toca la impresora sin estacion.
#
#  USO: no se baja este archivo. Se usa `instalar-agente-caja.bat`
#  (Admin -> Descargas), clic derecho -> ejecutar como administrador.
#
#  Se puede correr las veces que haga falta: genera un token nuevo, reescribe
#  el .env y vuelve a arrancar el agente con la version nueva.
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
$Archivos    = @('agente-caja.mjs', 'iniciar.bat', 'LEEME.txt', '.env.example')
$Ventana     = 'Shakeaholic - agente de tickets de caja'
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
$habia = $false
# El servicio de la version anterior del instalador: se detiene y se QUITA.
# Si se quedara, al prender la PC arrancaria otra copia con el token viejo.
$svc = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
foreach ($x in @($svc | Where-Object { $_ })) {
  if ($x.State -ne 'Stopped') { Stop-Service -Name $x.Name -Force -EA SilentlyContinue; Start-Sleep -Seconds 2 }
  & sc.exe delete $x.Name | Out-Null
  Bien "quitado el servicio de Windows anterior ($($x.Name))"
  $habia = $true
}
Remove-Item (Join-Path $Destino 'daemon') -Recurse -Force -EA SilentlyContinue
# La ventana que lo relanza (si no se cierra primero, lo vuelve a arrancar
# con el .env viejo en cuanto se mata el node) y el node mismo.
$ventanas = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -EA SilentlyContinue |
            Where-Object { $_.CommandLine -like '*arrancar-agente-caja*' }
$sueltos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -EA SilentlyContinue |
           Where-Object { $_.CommandLine -like '*agente-caja.mjs*' }
foreach ($p in (@($ventanas) + @($sueltos) | Where-Object { $_ })) {
  Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue
  $habia = $true
}
if ($ventanas -or $sueltos) { Start-Sleep -Seconds 2; Bien 'detenido el agente que estaba corriendo' }
if (-not $habia) { Bien 'no habia ninguno' }

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
# 6. Prueba directa en papel
# ---------------------------------------------------------------------------
# Antes de arrancar el agente: si esto no sale, el problema es la impresora
# o la red, no el agente ni el servidor. Es un papelito con la hora.
if ($responde) {
  Paso 'Imprimiendo una prueba directa'
  $cliente = New-Object System.Net.Sockets.TcpClient
  try {
    $cliente.Connect($imp.ip, $puerto)
    $flujo = $cliente.GetStream()
    $hora = (Get-Date).ToString('dd/MM/yyyy HH:mm')
    $texto = "SHAKEAHOLIC`nPrueba del agente de caja`n$hora`n$($env:COMPUTERNAME)`n`n`n`n"
    # [byte[]] delante: sumar arreglos en PowerShell da object[], y Write lo rechaza.
    [byte[]]$bytes = @(0x1B, 0x40, 0x1B, 0x61, 0x01) + [System.Text.Encoding]::ASCII.GetBytes($texto) + @(0x1D, 0x56, 0x42, 0x00)
    $flujo.Write($bytes, 0, $bytes.Length)
    $flujo.Flush()
    Start-Sleep -Milliseconds 500
    Bien 'mandada: debe salir un papelito "Prueba del agente de caja"'
  } catch {
    Malo "No se pudo mandar la prueba: $($_.Exception.Message)"
  } finally {
    $cliente.Dispose()
  }
}

# ---------------------------------------------------------------------------
# 7. Dejarlo corriendo (y que arranque solo al prender la PC)
# ---------------------------------------------------------------------------
# Una ventana que relanza el agente si se cae: es lo que hace un servicio,
# pero a la vista. Va minimizada; si alguien la cierra, no salen tickets.
Paso 'Dejandolo corriendo'
$bat = Join-Path $Destino 'arrancar-agente-caja.bat'
$bat_txt = @"
@echo off
title $Ventana
cd /d "$Destino"
:otra
node agente-caja.mjs
echo.
echo El agente se detuvo. Se vuelve a arrancar en 10 segundos...
timeout /t 10 /nobreak >nul
goto otra
"@
[System.IO.File]::WriteAllText($bat, ($bat_txt -replace "`r?`n", "`r`n") + "`r`n", [System.Text.Encoding]::ASCII)

# Inicio de TODOS los usuarios, no el del usuario actual: el instalador corre
# elevado y Windows puede haber cambiado de perfil (CLAUDE.md 2.6); el
# arranque quedaria en un perfil que nadie abre.
foreach ($carpeta in @([Environment]::GetFolderPath('CommonStartup'), [Environment]::GetFolderPath('CommonDesktopDirectory'))) {
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut((Join-Path $carpeta 'Agente de tickets de caja.lnk'))
    $lnk.TargetPath = $bat
    $lnk.WorkingDirectory = $Destino
    $lnk.WindowStyle = 7
    $lnk.Save()
  } catch {
    Aviso "no se pudo dejar el acceso en $($carpeta): $($_.Exception.Message)"
  }
}
Bien 'arranca solo al prender la PC (y hay acceso en el escritorio)'

$arranque = Get-Date
Start-Process -FilePath $bat -WorkingDirectory $Destino -WindowStyle Minimized
Bien "corriendo en su ventana minimizada: '$Ventana'"

# ---------------------------------------------------------------------------
# 8. Comprobar que de verdad quedo en linea
# ---------------------------------------------------------------------------
# Que la ventana este abierta no dice que el agente hable con el servidor:
# si se cae al empezar, la ventana lo relanza cada 10 s y Admin nunca lo ve
# en linea. Se le pregunta al servidor si ya latio con el token nuevo, y si
# no, se ensena aqui mismo lo que dice el agente en vez de decir LISTO.
Paso 'Esperando a que el agente se reporte con el servidor (hasta 45 s)'
$enLinea = $false
$inicio = Get-Date
while (((Get-Date) - $inicio).TotalSeconds -lt 45) {
  Start-Sleep -Seconds 5
  try {
    $yo = @(Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/fn_admin_impresoras" `
      -Headers (Cabeceras $AnonKey) -ContentType 'application/json' -Body '{}') |
      Where-Object { $_.id -eq $imp.id } | Select-Object -First 1
    if ($yo -and $yo.ultima_conexion -and ([datetime]$yo.ultima_conexion).ToUniversalTime() -gt $arranque.ToUniversalTime().AddSeconds(-5)) {
      $enLinea = $true
      break
    }
  } catch { }
}
if ($enLinea) {
  Bien 'en linea: Admin ya lo ve'
} else {
  Malo 'El agente arranco pero NO se ha reportado con el servidor.'
  # Se detiene la ventana y se corre una vez a la vista para ensenar por que.
  Get-CimInstance Win32_Process -EA SilentlyContinue |
    Where-Object { $_.CommandLine -like '*arrancar-agente-caja*' -or $_.CommandLine -like '*agente-caja.mjs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
  $salida = Join-Path $env:TEMP 'agente-caja-salida.txt'
  $errores = Join-Path $env:TEMP 'agente-caja-errores.txt'
  $p = Start-Process -FilePath 'node' -ArgumentList 'agente-caja.mjs' -WorkingDirectory $Destino `
         -RedirectStandardOutput $salida -RedirectStandardError $errores -NoNewWindow -PassThru
  Start-Sleep -Seconds 12
  Stop-Process -Id $p.Id -Force -EA SilentlyContinue
  Write-Host ''
  Write-Host '    --- lo que dice el agente ---' -ForegroundColor Yellow
  foreach ($f in @($salida, $errores)) {
    Get-Content $f -Tail 20 -EA SilentlyContinue | ForEach-Object { Write-Host "    $_" }
  }
  Write-Host ''
  Write-Host '    Manda una foto de esta ventana.'
  Write-Host "    Se puede volver a arrancar con el acceso 'Agente de tickets de caja' del escritorio."
  exit 1
}

Write-Host ''
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Instalado en: $Destino  (version $version)"
Write-Host ''
Write-Host "  Corre en la ventana minimizada '$Ventana'. No la cierres:"
Write-Host '  si se cierra, no salen tickets (al prender la PC vuelve sola).'
Write-Host '  Si habia tickets pedidos desde el kiosko, ya van a salir.'
Write-Host "  En Admin -> Impresoras, '$($imp.nombre)' debe verse en linea en menos de un minuto."
Write-Host ''
Write-Host '  Para probar: en el kiosko, al terminar una venta, "Imprimir ticket".'
Write-Host '  La impresion automatica en cada cobro sigue APAGADA (Admin -> Ticket).'
Write-Host ''
