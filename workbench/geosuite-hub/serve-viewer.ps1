# geosuite-hub viewer server — serves the GeoSuite viewer shell on 127.0.0.1:8515
# One file: any GET returns the same HTML; ?url=<scene> is handled client-side.
$port = 8515
$html = @'
<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>GeoSuite Viewer</title>
<style>html,body{margin:0;height:100%;font-family:sans-serif}iframe{border:0;width:100%;height:100vh;display:block}#empty{padding:3em 2em;color:#444;max-width:640px}</style>
</head><body><div id="app"></div>
<script>
var u=new URLSearchParams(location.search).get('url');
var a=document.getElementById('app');
if(u){var f=document.createElement('iframe');f.src=u;f.allow='clipboard-write; fullscreen; geolocation';document.body.appendChild(f);document.title='GeoSuite Viewer';}
else{a.innerHTML='<div id="empty"><h2>GeoSuite Viewer</h2><p><code>geosuite-hub://open?url=&lt;scene URL&gt;</code> でシーンを開いてください。</p><p>hub: <a href="http://127.0.0.1:8514/">127.0.0.1:8514 (status)</a></p></div>';}
</script></body></html>
'@
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
      $hb = [Text.Encoding]::UTF8.GetBytes($hdr)
      $s.Write($hb, 0, $hb.Length); $s.Write($body, 0, $body.Length); $s.Flush()
    }
  } catch {}
  try { $c.Close() } catch {}
}
