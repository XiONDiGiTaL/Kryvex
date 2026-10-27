<#
  Draws the two images NSIS asks for, both at the size it wants:

    build/installerSidebar.bmp   164x314   finish/welcome page panel
    build/installerHeader.bmp    150x57    top-right banner on every other page

  NSIS reads 24-bit bitmaps, so both are painted at their own size rather than
  scaled down from the 512px tile: the mark is redrawn from the same stroke
  geometry as `brand/logo.svg` (a K and an X in 512-unit space), and the type is
  set in the brand's mono face with the brand's tracking. Nothing here depends on
  a design tool, so the files can be regenerated when the palette or the version
  line changes.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-art.ps1

  `-Preview <dir>` also writes PNG copies, because a bitmap is awkward to look at
  in a review and the committed files are the bitmaps NSIS actually consumes.
#>
param(
  [string]$Sidebar = (Join-Path $PSScriptRoot '..\build\installerSidebar.bmp'),
  [string]$Header = (Join-Path $PSScriptRoot '..\build\installerHeader.bmp'),
  [string]$Preview = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# --- brand tokens (brand/BRAND.md) -------------------------------------------
$plate  = [System.Drawing.ColorTranslator]::FromHtml('#0B0E12')
$hair   = [System.Drawing.ColorTranslator]::FromHtml('#232B35')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#38BDF8')
$teal   = [System.Drawing.ColorTranslator]::FromHtml('#2DD4BF')
$ink    = [System.Drawing.ColorTranslator]::FromHtml('#F0F3F7')
$muted  = [System.Drawing.ColorTranslator]::FromHtml('#9AA6B5')

$mono = 'Consolas'
$tight = [System.Drawing.StringFormat]::GenericTypographic
$tight.FormatFlags = $tight.FormatFlags -bor [System.Drawing.StringFormatFlags]::NoClip

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($plate)
  return @($bmp, $g)
}

<#
  The mark, from brand/logo.svg. Coordinates are in the file's 512-unit space and
  are mapped onto whatever canvas is being drawn, so both images use one shape.
#>
function Draw-Mark {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$CenterX,
    [double]$CenterY,
    [double]$Scale,
    [System.Drawing.Color]$Colour = $ink
  )
  $pen = New-Object System.Drawing.Pen($Colour, [single](26 * $Scale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $strokes = @(
    @(148, 164, 148, 328),
    @(240, 164, 168, 246),
    @(174, 246, 242, 328),
    @(286, 204, 362, 328),
    @(362, 204, 286, 328)
  )
  foreach ($s in $strokes) {
    $x1 = $CenterX + ($s[0] - 255.0) * $Scale
    $y1 = $CenterY + ($s[1] - 246.0) * $Scale
    $x2 = $CenterX + ($s[2] - 255.0) * $Scale
    $y2 = $CenterY + ($s[3] - 246.0) * $Scale
    $Graphics.DrawLine($pen, [single]$x1, [single]$y1, [single]$x2, [single]$y2)
  }
  $pen.Dispose()
}

# Consolas is monospaced, so one advance drives every letter. Measuring each
# character instead would collapse the spaces: GDI+ trims trailing whitespace,
# so the gap in "MODULAR TECHNOLOGY" disappears.
function Draw-Tracked {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [double]$CenterX,
    [double]$Top,
    [double]$Tracking
  )
  $advance = $Graphics.MeasureString('M', $Font, 1000, $script:tight).Width
  $total = ($advance * $Text.Length) + ($Tracking * ($Text.Length - 1))
  $x = $CenterX - ($total / 2)
  foreach ($ch in $Text.ToCharArray()) {
    $Graphics.DrawString([string]$ch, $Font, $Brush, [single]$x, [single]$Top, $script:tight)
    $x += $advance + $Tracking
  }
}

function Save-Image([System.Drawing.Bitmap]$Bitmap, [string]$Target) {
  $dir = Split-Path -Parent $Target
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $Bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Bmp)
  if ($Preview) {
    if (-not (Test-Path $Preview)) { New-Item -ItemType Directory -Path $Preview | Out-Null }
    $name = [IO.Path]::GetFileNameWithoutExtension($Target) + '.png'
    $Bitmap.Save((Join-Path $Preview $name), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  Write-Output ("wrote {0} ({1}x{2}, {3} bytes)" -f $Target, $Bitmap.Width, $Bitmap.Height, (Get-Item $Target).Length)
}

# --------------------------------------------------------------- sidebar ---
# The finish page: the full lockup, because there is room for the whole tile.
$W = 164
$H = 314
$canvas = New-Canvas $W $H
$bmp = $canvas[0]
$g = $canvas[1]

# A dim inset frame keeps the panel from bleeding into a light wizard page.
$g.DrawRectangle((New-Object System.Drawing.Pen($hair, 1)), 0, 0, $W - 1, $H - 1)
# Top accent rule: the one saturated line in the whole panel.
$g.FillRectangle((New-Object System.Drawing.SolidBrush($accent)), 0, 0, $W, 2)

$small = New-Object System.Drawing.Font($mono, 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('x529', $small, (New-Object System.Drawing.SolidBrush($accent)), 12, 10)

# Connected-systems signal, top right: three squares at rising presence.
$opacities = @(90, 150, 255)
for ($i = 0; $i -lt 3; $i++) {
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($opacities[$i], $teal))
  $g.FillRectangle($brush, (128 + ($i * 9)), 13, 5, 5)
}

Draw-Mark -Graphics $g -CenterX 82 -CenterY 106 -Scale (110.0 / 240.0)

$divider = New-Object System.Drawing.Pen($accent, 3)
$divider.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$divider.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($divider, 64, 173, 100, 173)

$wordmark = New-Object System.Drawing.Font($mono, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$label = New-Object System.Drawing.Font($mono, 7, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$tagline = New-Object System.Drawing.Font($mono, 8, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

Draw-Tracked -Graphics $g -Text 'KRYVEX' -Font $wordmark -Brush (New-Object System.Drawing.SolidBrush($accent)) -CenterX 82 -Top 190 -Tracking 2.4
Draw-Tracked -Graphics $g -Text 'MODULAR TECHNOLOGY' -Font $label -Brush (New-Object System.Drawing.SolidBrush($muted)) -CenterX 82 -Top 212 -Tracking 1.1

$g.DrawLine((New-Object System.Drawing.Pen($hair, 1)), 22, 250, 142, 250)
$tag = New-Object System.Drawing.SolidBrush($muted)
Draw-Tracked -Graphics $g -Text 'PRECISION IN' -Font $tagline -Brush $tag -CenterX 82 -Top 262 -Tracking 0.7
Draw-Tracked -Graphics $g -Text 'EVERY CONNECTION' -Font $tagline -Brush $tag -CenterX 82 -Top 278 -Tracking 0.4

$g.Dispose()
Save-Image -Bitmap $bmp -Target $Sidebar
$bmp.Dispose()

# ---------------------------------------------------------------- header ---
# The banner other pages wear in their top-right corner: mark and wordmark only,
# because 150x57 is a strip and a second line crowds it against the page rule.
$HW = 150
$HH = 57
$canvas = New-Canvas $HW $HH
$hbmp = $canvas[0]
$h = $canvas[1]

# Left accent bar, echoing the sidebar's top rule.
$h.FillRectangle((New-Object System.Drawing.SolidBrush($accent)), 0, 0, 2, $HH)
$h.DrawRectangle((New-Object System.Drawing.Pen($hair, 1)), 0, 0, $HW - 1, $HH - 1)

Draw-Mark -Graphics $h -CenterX 27 -CenterY 29 -Scale (32.0 / 190.0)

$h.DrawLine((New-Object System.Drawing.Pen($hair, 1)), 52, 14, 52, 43)

$headWordmark = New-Object System.Drawing.Font($mono, 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
Draw-Tracked -Graphics $h -Text 'KRYVEX' -Font $headWordmark -Brush (New-Object System.Drawing.SolidBrush($accent)) -CenterX 101 -Top 21 -Tracking 2.2

$h.Dispose()
Save-Image -Bitmap $hbmp -Target $Header
$hbmp.Dispose()
