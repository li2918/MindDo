param(
  [int]$Port = 8123,
  [string]$Root = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ContentType {
  param([string]$Path)

  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".js"   { "application/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".gif"  { "image/gif" }
    ".svg"  { "image/svg+xml" }
    ".ico"  { "image/x-icon" }
    default { "application/octet-stream" }
  }
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Serving HTTP on 127.0.0.1 port $Port"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $resolvedPath = Join-Path -Path $Root -ChildPath $relativePath
      $fullPath = [IO.Path]::GetFullPath($resolvedPath)
      $rootPath = [IO.Path]::GetFullPath($Root)

      if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $bytes = [Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      elseif (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      else {
        $content = [IO.File]::ReadAllBytes($fullPath)
        $response.StatusCode = 200
        $response.ContentType = Get-ContentType -Path $fullPath
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
      }
    }
    catch {
      $response.StatusCode = 500
      $bytes = [Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    finally {
      $response.OutputStream.Close()
      $response.Close()
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
