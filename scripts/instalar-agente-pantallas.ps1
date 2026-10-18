# ============================================================================
#  Shakeaholic - instalar el agente de PANTALLAS en la PC de la tienda
# ============================================================================
#  Deja las televisiones mostrando lo que gerencia les asigno en
#  Admin -> Pantallas (TV): baja el agente de `agente-pantallas/` del repo,
#  escribe el .env, busca las TVs en la red y lo deja corriendo en su propia
#  ventana minimizada, que se levanta sola si se cae y arranca al prender la
#  PC. Igual que el agente de etiquetas y el de caja: node-windows daba
#  problemas en esa PC y se abandono.
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
$Archivos    = @('agente-pantallas.mjs', 'iniciar.bat', 'buscar-tvs.bat', 'LEEME.txt', '.env.example')
$Ventana     = 'Shakeaholic - agente de pantallas'
# Solo para QUITAR el servicio que dejaba la version anterior del instalador.
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
  $guardada = Leer-DelEnv (Join-Path $Destino '.env') 'PANTALLAS_TOKEN'
  if ($guardada) {
    # Se pregunta: si gerencia genero una llave nueva, la guardada ya no sirve
    # y reutilizarla en silencio deja el agente "corriendo" sin poder hablar.
    Write-Host ''
    Write-Host ("   Esta PC ya tiene una llave (termina en " + $guardada.Substring([Math]::Max(0, $guardada.Length - 4)) + ").") -ForegroundColor Yellow
    Write-Host '   Si generaste una NUEVA en Admin, pegala aqui. Si no, solo presiona Enter.'
    $otra = (Read-Host '   Llave nueva (o Enter)').Trim()
    if ($otra) { $Token = $otra; Bien 'se usa la llave nueva' }
    else { $Token = $guardada; Bien 'se reutiliza la que ya tiene esta PC' }
  }
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
$habia = $false
# El servicio que dejaba la version anterior de este instalador: se detiene
# y se QUITA. Si se quedara, al prender la PC arrancaria otra copia.
$svc = Get-CimInstance Win32_Service -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $Servicio }
foreach ($x in @($svc | Where-Object { $_ })) {
  if ($x.State -ne 'Stopped') { Stop-Service -Name $x.Name -Force -EA SilentlyContinue; Start-Sleep -Seconds 2 }
  & sc.exe delete $x.Name | Out-Null
  Bien "quitado el servicio de Windows anterior ($($x.Name))"
  $habia = $true
}
Remove-Item (Join-Path $Destino 'daemon') -Recurse -Force -EA SilentlyContinue

# Dos empujadores a la vez se pelean la misma TV: uno pone una imagen y el
# otro la quita medio segundo despues. Se mata la ventana que relanza ANTES
# que el node, o lo vuelve a levantar con el .env viejo.
$ventanas = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" -EA SilentlyContinue |
            Where-Object { $_.CommandLine -like '*arrancar-agente-pantallas*' }
$sueltos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -EA SilentlyContinue |
           Where-Object { $_.CommandLine -like '*agente-pantallas.mjs*' }
foreach ($x in (@($ventanas) + @($sueltos) | Where-Object { $_ })) {
  Stop-Process -Id $x.ProcessId -Force -EA SilentlyContinue
  $habia = $true
}
if ($ventanas -or $sueltos) { Start-Sleep -Seconds 2; Bien 'detenido el agente que estaba corriendo' }
if (-not $habia) { Bien 'no habia ninguno' }

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
# 7. Dejarlo corriendo (y que arranque solo al prender la PC)
# ---------------------------------------------------------------------------
# Una ventana que relanza el agente si se cae: es lo que hace un servicio,
# pero a la vista. Va minimizada; si alguien la cierra, las TV se quedan en
# lo ultimo que se les puso.
Paso 'Dejandolo corriendo'
$bat = Join-Path $Destino 'arrancar-agente-pantallas.bat'
$bat_txt = @"
@echo off
title $Ventana
cd /d "$Destino"
:otra
node agente-pantallas.mjs
echo.
echo El agente se detuvo. Se vuelve a arrancar en 10 segundos...
timeout /t 10 /nobreak >nul
goto otra
"@
[System.IO.File]::WriteAllText($bat, ($bat_txt -replace "`r?`n", "`r`n") + "`r`n", [System.Text.Encoding]::ASCII)

# Inicio de TODOS los usuarios, no el del usuario actual: el instalador corre
# elevado y Windows puede haber cambiado de perfil; el arranque quedaria en
# un perfil que nadie abre.
foreach ($carpeta in @([Environment]::GetFolderPath('CommonStartup'), [Environment]::GetFolderPath('CommonDesktopDirectory'))) {
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut((Join-Path $carpeta 'Agente de pantallas.lnk'))
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
# "Servicio corriendo" solo dice que Windows lo arranco, no que el agente
# hable con el servidor: si se cae al empezar, Windows lo reinicia en
# silencio y en Admin nunca aparece.
#
# A diferencia del de caja, aqui NO se le puede preguntar al servidor: las
# funciones que leen el latido son de gerencia y el instalador solo tiene
# la llave publica. Y llamar a fn_pantallas_tv_agente para comprobarlo
# escribiria el mismo latido que se quiere verificar: diria que si aunque
# el agente estuviera muerto. Por eso el agente deja constancia en
# estado.json cada vez que habla con el servidor, y eso es lo que se lee.
Paso 'Esperando a que el agente se reporte (hasta 60 s)'
$marca   = Join-Path $Destino 'estado.json'
$enLinea = $false
$detalle = $null
Remove-Item $marca -Force -EA SilentlyContinue
$inicio = Get-Date
while (((Get-Date) - $inicio).TotalSeconds -lt 60) {
  Start-Sleep -Seconds 5
  if (-not (Test-Path $marca)) { continue }
  try {
    $e = Get-Content $marca -Raw | ConvertFrom-Json
    # Las DOS en UTC: en Windows PowerShell 5.1 `[datetime]"...Z"` da hora
    # LOCAL, y comparada contra UTC una constancia recien escrita en Merida
    # (UTC-6) parecia de hace seis horas: nunca decia "en linea" (18/10/26).
    if (([datetime]$e.en).ToUniversalTime() -lt $inicio.ToUniversalTime()) { continue }   # constancia vieja
    if ($e.ok) {
      $enLinea = $true
      $detalle = "$($e.pantallas) pantalla(s) asignada(s)"
      break
    }
    $detalle = $e.error
  } catch { }
}
if ($enLinea) {
  Bien "en linea: hablo con el servidor ($detalle)"
  if ($detalle -like '0 pantalla*') {
    Aviso 'todavia no hay ninguna TV asignada: dalas de alta en Admin -> Pantallas (TV)'
  }
} else {
  Malo 'El agente arranco pero NO se ha reportado con el servidor.'
  if ($detalle) { Write-Host "    Lo ultimo que dijo: $detalle" -ForegroundColor Yellow }
  # Se detiene la ventana y se corre una vez a la vista para ensenar por que.
  Get-CimInstance Win32_Process -EA SilentlyContinue |
    Where-Object { $_.CommandLine -like '*arrancar-agente-pantallas*' -or $_.CommandLine -like '*agente-pantallas.mjs*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
  $salida  = Join-Path $env:TEMP 'agente-pantallas-salida.txt'
  $errores = Join-Path $env:TEMP 'agente-pantallas-errores.txt'
  $pr = Start-Process -FilePath 'node' -ArgumentList 'agente-pantallas.mjs' -WorkingDirectory $Destino `
          -RedirectStandardOutput $salida -RedirectStandardError $errores -NoNewWindow -PassThru
  Start-Sleep -Seconds 12
  Stop-Process -Id $pr.Id -Force -EA SilentlyContinue
  Write-Host ''
  Write-Host '    --- lo que dice el agente ---' -ForegroundColor Yellow
  foreach ($f in @($salida, $errores)) {
    Get-Content $f -Tail 20 -EA SilentlyContinue | ForEach-Object { Write-Host "    $_" }
  }
  Write-Host ''
  Write-Host '    Manda una foto de esta ventana.'
  Write-Host "    Se puede volver a arrancar con el acceso 'Agente de pantallas' del escritorio."
  exit 1
}

Write-Host ''
Write-Host '  LISTO' -ForegroundColor Green
Write-Host "  Instalado en: $Destino  (version $version)"
Write-Host ''
Write-Host "  Corre en la ventana minimizada '$Ventana'. No la cierres:"
Write-Host '  si se cierra, las TV se quedan en lo ultimo que se les puso.'
Write-Host '  En Admin -> Pantallas (TV) debe decir "Empujador - en linea" en menos'
Write-Host '  de un minuto, y cada TV con contenido asignado, "Mostrando".'
Write-Host ''
Write-Host '  Si una TV dice "sin respuesta": esta apagada o en standby. VIDAA apaga'
Write-Host '  su DLNA con la pantalla y vuelve sola al encenderla.'
Write-Host ''
