<#
  Draws the NSIS welcome/finish sidebar: build/installerSidebar.bmp, 164x314.

  NSIS asks for a 24-bit bitmap, so this paints at the brand's own size rather
  than scaling a 512px tile down: the mark is redrawn from the same stroke
  geometry as `brand/logo.svg` (a K and an X in 512-unit space), and the type is
  set in the brand's mono face with the brand's tracking. Nothing here depends on
  a design tool, so the file can be regenerated when the palette or the version
  line changes.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-art.ps1

  `-Preview <png>` also writes a PNG copy, because a bitmap is awkward to look at
  in a review and the committed one is the bitmap NSIS actually consumes.
#>
param(
  [string]$Out = (Join-Path $PSScriptRoot '..\build\installerSidebar.bmp'),
  [string]$Preview = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# --- brand tokens (brand/BRAND.md) -------------------------------------------
$plate  = [System.Drawing.ColorTranslator]::FromHtml('#0B0E12')
$edge   = [System.Drawing.ColorTranslator]::FromHtml('#394451')
$hair   = [System.Drawing.ColorTranslator]::FromHtml('#232B35')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#38BDF8')
$teal   = [System.Drawing.ColorTranslator]::FromHtml('#2DD4BF')
$ink    = [System.Drawing.ColorTranslator]::FromHtml('#F0F3F7')
$muted  = [System.Drawing.ColorTranslator]::FromHtml('#9AA6B5')

$mono = 'Consolas'
$W = 164
$H = 314

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear($plate)

# A dim inset frame keeps the panel from bleeding into a light wizard page.
$frame = New-Object System.Drawing.Pen($hair, 1)
$g.DrawRectangle($frame, 0, 0, $W - 1, $H - 1)

# Top accent rule: the one saturated line in the whole panel.
$g.FillRectangle((New-Object System.Drawing.SolidBrush($accent)), 0, 0, $W, 2)

# Element designation, top left.
$small = New-Object System.Drawing.Font($mono, 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('x529', $small, (New-Object System.Drawing.SolidBrush($accent)), 12, 10)

# Connected-systems signal, top right: three squares at rising presence.
$opacities = @(90, 150, 255)
for ($i = 0; $i -lt 3; $i++) {
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($opacities[$i], $teal))
  $g.FillRectangle($brush, (128 + ($i * 9)), 13, 5, 5)
}

# --- the mark, from brand/logo.svg's stroke geometry -------------------------
# 512-unit coordinates, scaled so the square mark is ~104px wide here.
$scale = 110.0 / 240.0
$cx = 82.0
$cy = 106.0
$sx = 255.0   # centre of the drawn strokes in the 512-unit space
$sy = 246.0

function Mark-Point([double]$x, [double]$y) {
  return @(($cx + ($x - $sx) * $script:scale), ($cy + ($y - $sy) * $script:scale))
}

$pen = New-Object System.Drawing.Pen($ink, [single](26 * $scale))
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
  $a = Mark-Point $s[0] $s[1]
  $b = Mark-Point $s[2] $s[3]
  $g.DrawLine($pen, [single]$a[0], [single]$a[1], [single]$b[0], [single]$b[1])
}

# Divider rule, as on the tile.
$divider = New-Object System.Drawing.Pen($accent, 3)
$divider.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$divider.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($divider, 64, 173, 100, 173)

# --- type, with the brand's tracking ----------------------------------------
$tight = [System.Drawing.StringFormat]::GenericTypographic
$tight.FormatFlags = $tight.FormatFlags -bor [System.Drawing.StringFormatFlags]::NoClip

function Draw-Tracked {
  param(
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [double]$CenterX,
    [double]$Top,
    [double]$Tracking
  )
  # Consolas is monospaced, so one advance drives every letter. Measuring each
  # character instead would collapse the spaces: GDI+ trims trailing whitespace,
  # so the gap in "MODULAR TECHNOLOGY" disappears.
  $advance = $script:g.MeasureString('M', $Font, 1000, $script:tight).Width
  $total = ($advance * $Text.Length) + ($Tracking * ($Text.Length - 1))
  $x = $CenterX - ($total / 2)
  foreach ($ch in $Text.ToCharArray()) {
    $script:g.DrawString([string]$ch, $Font, $Brush, [single]$x, [single]$Top, $script:tight)
    $x += $advance + $Tracking
  }
}

$wordmark = New-Object System.Drawing.Font($mono, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$label = New-Object System.Drawing.Font($mono, 7, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$tagline = New-Object System.Drawing.Font($mono, 8, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

Draw-Tracked -Text 'KRYVEX' -Font $wordmark -Brush (New-Object System.Drawing.SolidBrush($accent)) -CenterX 82 -Top 190 -Tracking 2.4
Draw-Tracked -Text 'MODULAR TECHNOLOGY' -Font $label -Brush (New-Object System.Drawing.SolidBrush($muted)) -CenterX 82 -Top 212 -Tracking 1.1

# Footer: the tagline, above nothing but the panel edge.
$g.DrawLine((New-Object System.Drawing.Pen($hair, 1)), 22, 250, 142, 250)
$tag = New-Object System.Drawing.SolidBrush($muted)
Draw-Tracked -Text 'PRECISION IN' -Font $tagline -Brush $tag -CenterX 82 -Top 262 -Tracking 0.7
Draw-Tracked -Text 'EVERY CONNECTION' -Font $tagline -Brush $tag -CenterX 82 -Top 278 -Tracking 0.4

$g.Dispose()

$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Bmp)

if ($Preview) {
  $bmp.Save($Preview, [System.Drawing.Imaging.ImageFormat]::Png)
}

Write-Output ("wrote {0} ({1}x{2}, {3})" -f $Out, $bmp.Width, $bmp.Height, (Get-Item $Out).Length)
$bmp.Dispose()
