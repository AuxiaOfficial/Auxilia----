# Auxilia 图标源图（1024×1024）：黑底 + 指针 A + 右下弧刻度
# 设计要点：
#   · 两根指针共用顶部顶点，左指针向左倾 15°、右指针（分针）较长向右倾 40°，末端收尖
#   · 两指针中下方一条白色横杆，两端略超出并收尖
#   · 背景是刻度组成的半圆弧，圆心略偏左上，沿右侧边缘向下再绕到底部
#   · 只用黑白
Add-Type -AssemblyName System.Drawing

$S = 1024
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Black)

$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

# ---------- 1) 背景刻度半圆弧 ----------
$cx = 470.0
$cy = 470.0
$radius = 520.0
$tickPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), 3
$tickPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$tickPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$majorPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 255, 255, 255)), 4
$majorPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$majorPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$i = 0
for ($deg = -38; $deg -le 158; $deg += 6) {
  $rad = $deg * [Math]::PI / 180
  $inner = if ($i % 5 -eq 0) { 468.0 } else { 484.0 }
  $pen = if ($i % 5 -eq 0) { $majorPen } else { $tickPen }
  $x1 = $cx + [Math]::Cos($rad) * $inner
  $y1 = $cy + [Math]::Sin($rad) * $inner
  $x2 = $cx + [Math]::Cos($rad) * $radius
  $y2 = $cy + [Math]::Sin($rad) * $radius
  $g.DrawLine($pen, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
  $i++
}

# ---------- 2) 指针 A ----------
$apexX = 512.0
$apexY = 292.0

# 左指针：向左 15°，长度 372
$lAngle = 15 * [Math]::PI / 180
$ldx = -[Math]::Sin($lAngle)
$ldy = [Math]::Cos($lAngle)
$lLen = 422.0
$ltipX = $apexX + $ldx * $lLen
$ltipY = $apexY + $ldy * $lLen

# 右指针（分针）：向右 40°，长度 470
$rAngle = 40 * [Math]::PI / 180
$rdx = [Math]::Sin($rAngle)
$rdy = [Math]::Cos($rAngle)
$rLen = 533.0
$rtipX = $apexX + $rdx * $rLen
$rtipY = $apexY + $rdy * $rLen

$brush = New-Object System.Drawing.SolidBrush $white

# 左指针三角：顶点两侧各 27，收在尖端
$lpx = -$ldy
$lpy = $ldx
$leftPoly = @(
  (New-Object System.Drawing.PointF ([float]($apexX + $lpx * 27), [float]($apexY + $lpy * 27))),
  (New-Object System.Drawing.PointF ([float]($apexX - $lpx * 27), [float]($apexY - $lpy * 27))),
  (New-Object System.Drawing.PointF ([float]$ltipX, [float]$ltipY))
)
$g.FillPolygon($brush, [System.Drawing.PointF[]]$leftPoly)

# 右指针三角
$rpx = -$rdy
$rpy = $rdx
$rightPoly = @(
  (New-Object System.Drawing.PointF ([float]($apexX + $rpx * 27), [float]($apexY + $rpy * 27))),
  (New-Object System.Drawing.PointF ([float]($apexX - $rpx * 27), [float]($apexY - $rpy * 27))),
  (New-Object System.Drawing.PointF ([float]$rtipX, [float]$rtipY))
)
$g.FillPolygon($brush, [System.Drawing.PointF[]]$rightPoly)

# 顶点补一个小圆，让两根指针真正"共用一个顶点"
$g.FillEllipse($brush, [float]($apexX - 30), [float]($apexY - 22), 60, 60)

# ---------- 3) A 的一横（两端收尖） ----------
$barY = 600.0
$barLeft = 415.0
$barRight = 786.0
$barHalf = 17.0
$barTip = 22.0
$barPoly = @(
  (New-Object System.Drawing.PointF ([float]($barLeft - $barTip), [float]$barY)),
  (New-Object System.Drawing.PointF ([float]$barLeft, [float]($barY - $barHalf))),
  (New-Object System.Drawing.PointF ([float]$barRight, [float]($barY - $barHalf))),
  (New-Object System.Drawing.PointF ([float]($barRight + $barTip), [float]$barY)),
  (New-Object System.Drawing.PointF ([float]$barRight, [float]($barY + $barHalf))),
  (New-Object System.Drawing.PointF ([float]$barLeft, [float]($barY + $barHalf)))
)
$g.FillPolygon($brush, [System.Drawing.PointF[]]$barPoly)

$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'icon-source.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "saved $out"
