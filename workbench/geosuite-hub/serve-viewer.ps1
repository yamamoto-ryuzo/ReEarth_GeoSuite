# geosuite-hub viewer server — serves viewer.html on 127.0.0.1:8515
# ASCII-only source so PowerShell never misreads the encoding.
# viewer.html is read explicitly as UTF-8 (it contains non-ASCII text).
$port = 8515
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = [IO.File]::ReadAllText((Join-Path $dir 'viewer.html'), [Text.Encoding]::UTF8)
$l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$l.Start()
while ($true) {
  $c = $l.AcceptTcpClient()
  try {
    $s = $c.GetStream()
    $buf = New-Object byte[] 8192
    $n = $s.Read($buf, 0, 8192)
    if ($n -gt 0) {
      $body = [Text.Encoding]::UTF8.GetBytes($html)
      $hdr = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $hb = [Text.Encoding]::ASCII.GetBytes($hdr)
      $s.Write($hb, 0, $hb.Length); $s.Write($body, 0, $body.Length); $s.Flush()
    }
  } catch {}
  try { $c.Close() } catch {}
}
