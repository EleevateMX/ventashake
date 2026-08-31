# ============================================================================
#  Que agente de impresion esta corriendo, y desde donde  (Shakeaholic)
# ============================================================================
#  Existe por una averia real (31/08/26): Admin decia 1.1.0, el agente latia
#  cada 3 segundos, y reinstalar no cambiaba nada. La causa es siempre la
#  misma familia de problema -hay MAS DE UNA copia del agente en la PC, y la
#  que esta viva no es la que se acaba de actualizar-, pero desde fuera no
#  hay forma de saber cual.
#
#  Es de SOLO LECTURA. No detiene, no borra, no instala. Al terminar deja un
#  .txt en el Escritorio para copiar y pegar.
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'
$salida = @()
function Seccion($t) { $script:salida += ''; $script:salida += "=== $t ==="; }
function Linea($t)   { $script:salida += $t }

Seccion 'EQUIPO'
Linea "PC:      $env:COMPUTERNAME"
Linea "Usuario: $env:USERNAME"
Linea "Fecha:   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# ---------------------------------------------------------------------------
Seccion 'PROCESOS NODE CORRIENDO (el que late es uno de estos)'
$nodos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
if (-not $nodos) {
  Linea 'NINGUNO. El agente no esta corriendo en esta sesion de Windows.'
  Linea 'Si Admin lo ve en linea, esta corriendo en OTRO usuario o como servicio.'
} else {
  foreach ($p in $nodos) {
    Linea ''
    Linea "  PID $($p.ProcessId)"
    Linea "  Comando: $($p.CommandLine)"
    $duenio = (Invoke-CimMethod -InputObject $p -MethodName GetOwner).User
    Linea "  Usuario: $duenio"
  }
}

# ---------------------------------------------------------------------------
Seccion 'SERVICIOS DE WINDOWS QUE HUELEN A AGENTE'
$servicios = Get-CimInstance Win32_Service |
  Where-Object { "$($_.Name) $($_.DisplayName) $($_.PathName)" -match 'shake|agente|impresion|printer' }
if (-not $servicios) {
  Linea 'Ninguno. (Bien: el agente deberia correr en una ventana, no como servicio.)'
} else {
  foreach ($s in $servicios) {
    Linea ''
    Linea "  $($s.Name)  [$($s.State)]  inicio: $($s.StartMode)"
    Linea "  $($s.DisplayName)"
    Linea "  $($s.PathName)"
  }
  Linea ''
  Linea '  OJO: un servicio se levanta solo. Si hay uno con el agente viejo,'
  Linea '  reinstalar no sirve de nada: hay que detenerlo y quitarlo.'
}

# ---------------------------------------------------------------------------
Seccion 'COPIAS DEL AGENTE EN EL DISCO'
$raices = @(
  'C:\Shakeaholic', 'C:\shakeaholic', 'C:\ventashake', 'C:\agente-impresion',
  "$env:USERPROFILE", "$env:LOCALAPPDATA", "$env:ProgramData", 'C:\Users\Public'
) | Select-Object -Unique

$vistos = @{}
foreach ($raiz in $raices) {
  if (-not (Test-Path $raiz)) { continue }
  Get-ChildItem -Path $raiz -Filter 'package.json' -Recurse -Depth 4 -File |
    Where-Object { $_.DirectoryName -match 'agente-impresion' } |
    ForEach-Object {
      if ($vistos.ContainsKey($_.DirectoryName)) { return }
      $vistos[$_.DirectoryName] = $true
      $v = ''
      try { $v = (Get-Content $_.FullName -Raw | ConvertFrom-Json).version } catch {}
      Linea ''
      Linea "  $($_.DirectoryName)"
      Linea "     package.json dice: $v"
      # Lo que de verdad corre es el codigo, no el package.json. Si estos dos
      # no coinciden, la copia quedo a medias.
      $w = Join-Path $_.DirectoryName 'src\worker.ts'
      if (Test-Path $w) {
        $m = Select-String -Path $w -Pattern "VERSION_AGENTE\s*=\s*'([^']+)'"
        if ($m) { Linea "     el codigo dice:    $($m.Matches[0].Groups[1].Value)" }
      } else {
        Linea '     el codigo dice:    (no hay src\worker.ts)'
      }
      $d = Join-Path $_.DirectoryName 'dist'
      if (Test-Path $d) {
        Linea '     TIENE carpeta dist: puede estar corriendo compilado y viejo.'
      }
      $env_f = Join-Path $_.DirectoryName '.env'
      if (Test-Path $env_f) { Linea '     tiene .env' }
      $cfg = Join-Path $_.DirectoryName 'printers.config.json'
      if (Test-Path $cfg) { Linea '     tiene printers.config.json' }
    }
}
if ($vistos.Count -eq 0) { Linea 'Ninguna copia encontrada en las rutas conocidas.' }
if ($vistos.Count -gt 1) {
  Linea ''
  Linea "  HAY $($vistos.Count) COPIAS. Esa es la averia: se actualiza una y late otra."
}

# ---------------------------------------------------------------------------
Seccion 'QUE ARRANCA SOLO AL PRENDER'
foreach ($c in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) {
  if (Test-Path $c) {
    Linea ''
    Linea "  $c"
    Get-ChildItem $c | ForEach-Object { Linea "     $($_.Name)" }
  }
}
foreach ($k in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
               'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run') {
  $p = Get-ItemProperty -Path $k
  if ($p) {
    foreach ($n in $p.PSObject.Properties) {
      if ($n.Name -match '^PS' ) { continue }
      if ("$($n.Name) $($n.Value)" -match 'shake|agente') { Linea ''; Linea "  $k"; Linea "     $($n.Name) = $($n.Value)" }
    }
  }
}

# ---------------------------------------------------------------------------
Seccion 'QUE HACER CON ESTO'
Linea 'Si arriba aparece MAS DE UNA copia, o un SERVICIO, esa es la causa:'
Linea 'la copia que se actualizo no es la que esta viva.'
Linea ''
Linea 'Mandale este archivo a quien lleva el sistema. No borres nada por tu'
Linea 'cuenta: el agente equivocado apagado deja la tienda sin comandas.'

$txt = $salida -join [Environment]::NewLine
Write-Host $txt
$destino = Join-Path ([Environment]::GetFolderPath('Desktop')) 'shakeaholic-diagnostico-agente.txt'
[System.IO.File]::WriteAllText($destino, $txt, [System.Text.Encoding]::UTF8)
Write-Host ''
Write-Host "  Guardado en: $destino" -ForegroundColor Green
