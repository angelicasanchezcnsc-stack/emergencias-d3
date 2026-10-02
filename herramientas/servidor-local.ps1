# Servidor local de prueba (no necesita instalar nada).
# Uso: clic derecho -> "Ejecutar con PowerShell", o en una terminal:
#   powershell -ExecutionPolicy Bypass -File herramientas\servidor-local.ps1
# Luego abra http://localhost:8080/web/ en Edge o Chrome. Ctrl+C para detenerlo.
param(
  [int]$Puerto = 8080,
  [string]$Raiz = (Split-Path -Parent $PSScriptRoot)
)

$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gs' = 'text/plain; charset=utf-8'
  '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add("http://localhost:$Puerto/")
$oyente.Start()
Write-Host "Sirviendo $Raiz en http://localhost:$Puerto/web/  (Ctrl+C para detener)"

try {
  while ($oyente.IsListening) {
    $ctx = $oyente.GetContext()
    $resp = $ctx.Response
    try {
      $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($ruta -eq '') { $ruta = 'web/' }
      $archivo = Join-Path $Raiz $ruta
      if (Test-Path $archivo -PathType Container) { $archivo = Join-Path $archivo 'index.html' }
      $completo = [IO.Path]::GetFullPath($archivo)
      $resp.Headers.Add('Cache-Control', 'no-store')
      if ($completo.StartsWith([IO.Path]::GetFullPath($Raiz)) -and (Test-Path $completo -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($completo).ToLower()
        $resp.ContentType = if ($tipos[$ext]) { $tipos[$ext] } else { 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($completo)
        if ($ctx.Request.HttpMethod -eq 'HEAD') { $resp.ContentLength64 = $bytes.Length }
        else { $resp.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $resp.StatusCode = 404
      }
    } catch {
      Write-Host "Error en $($ctx.Request.Url): $_"
    } finally {
      try { $resp.Close() } catch {}
    }
  }
} finally {
  $oyente.Stop()
}
