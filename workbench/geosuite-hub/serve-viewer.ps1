# geosuite-hub viewer server — serves viewer.html on 127.0.0.1:8515
# ASCII-only source so PowerShell never misreads the encoding.
# viewer.html is read explicitly as UTF-8 (it contains non-ASCII text).
# Routes:
#   GET /scene            -> text/plain: last opened scene URL (empty if none)
#   GET /scene?set=<enc>  -> stores the URL-decoded value in scene.txt
#   anything else         -> viewer.html
$port = 8515
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = [IO.File]::ReadAllText((Join-Path $dir 'viewer.html'), [Text.Encoding]::UTF8)
$sceneFile = Join-Path $dir 'scene.txt'
$utf8 = New-Object Text.UTF8Encoding($false)
$l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$l.Start()
while ($true) {
  $c = $l.AcceptTcpClient()
  try {
    $s = $c.GetStream()
    $buf = New-Object byte[] 8192
    $n = $s.Read($buf, 0, 8192)
    if ($n -gt 0) {
      $req = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
      $path = ''
      if ($req -match '^\w+ ([^ ]+)') { $path = $Matches[1] }
      $ctype = 'text/html; charset=utf-8'
      $body = $html
      if ($path.StartsWith('/scene')) {
        if ($path -match '[?&]set=([^&]+)') {
          [IO.File]::WriteAllText($sceneFile, [Uri]::UnescapeDataString($Matches[1]), $utf8)
        }
        $body = ''
        if ([IO.File]::Exists($sceneFile)) { $body = [IO.File]::ReadAllText($sceneFile, [Text.Encoding]::UTF8) }
        $ctype = 'text/plain; charset=utf-8'
      }
      $bytes = [Text.Encoding]::UTF8.GetBytes($body)
      $hdr = "HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      $hb = [Text.Encoding]::ASCII.GetBytes($hdr)
      $s.Write($hb, 0, $hb.Length); $s.Write($bytes, 0, $bytes.Length); $s.Flush()
    }
  } catch {}
  try { $c.Close() } catch {}
}
