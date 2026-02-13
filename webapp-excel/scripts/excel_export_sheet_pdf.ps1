param(
  [Parameter(Mandatory=$true)][string]$InputXlsx,
  [Parameter(Mandatory=$true)][string]$OutputPdf,
  [string]$SheetName,
  [switch]$AllSheets
)

$ErrorActionPreference = "Stop"

function Normalize-Name([string]$s) {
  if ($null -eq $s) { return "" }
  $x = $s -replace [char]0xA0, " "   # NBSP -> space
  $x = $x.Trim()
  $x = ($x -replace "\s+", " ")
  return $x
}

function Find-WorksheetByName($Workbook, [string]$Name) {
  $target = (Normalize-Name $Name).ToLowerInvariant()
  foreach ($ws in $Workbook.Worksheets) {
    $curr = (Normalize-Name $ws.Name).ToLowerInvariant()
    if ($curr -eq $target) { return $ws }
  }
  return $null
}

function Apply-PrintSetup($excel, $ws) {
  # --- Print setup para evitar PDFs "partidos" / cortados ---
  try {
    # Si hay "Zoom" fijo, Excel ignora FitToPages*. Así que lo anulamos.
    $ws.PageSetup.Zoom = $false

    # Opción recomendada:
    # - 1 página de ancho (no se corta horizontalmente)
    # - altura libre (si es muy largo, puede ir a 2+ páginas verticales)
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = 0  # 0 = sin límite (más compatible que $false)

    $ws.PageSetup.CenterHorizontally = $true
    $ws.PageSetup.CenterVertically = $false

    # Márgenes razonables (en pulgadas -> puntos)
    $ws.PageSetup.LeftMargin   = $excel.InchesToPoints(0.25)
    $ws.PageSetup.RightMargin  = $excel.InchesToPoints(0.25)
    $ws.PageSetup.TopMargin    = $excel.InchesToPoints(0.25)
    $ws.PageSetup.BottomMargin = $excel.InchesToPoints(0.25)

    # Asegurar PrintArea a UsedRange, por si el archivo trae un área rara guardada
    # Limpia áreas de impresión guardadas (a veces vienen mal)
    $ws.PageSetup.PrintArea = ""

    # Busca el último row/col con contenido REAL (no solo formato)
    try {
      $lastCell = $ws.Cells.Find(
        "*",
        $ws.Cells.Item(1,1),
        -4163,       # xlFormulas
        1,           # xlPart
        1,           # xlByRows
        2,           # xlPrevious
        $false
      )

      if ($lastCell -ne $null) {
        $lastRow = $lastCell.Row

        $lastCell2 = $ws.Cells.Find(
          "*",
          $ws.Cells.Item(1,1),
          -4163,
          1,
          2,         # xlByColumns
          2,         # xlPrevious
          $false
        )

        $lastCol = $lastCell2.Column

        $range = $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item($lastRow, $lastCol))
        $ws.PageSetup.PrintArea = $range.Address()
      }
    } catch {
      # si falla, no rompemos exportación
    }


    # Orientación automática: si hay muchas columnas, apaisado
    # 1 = xlPortrait, 2 = xlLandscape
    if ($used -and $used.Columns.Count -gt 12) {
      $ws.PageSetup.Orientation = 2
    } else {
      $ws.PageSetup.Orientation = 1
    }
  }
  catch {
    # No queremos romper exportación si Excel se pone tiquismiquis con PageSetup
    # Simplemente seguimos.
  }
}

$excel = $null
$wb = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  # Open(Filename, UpdateLinks, ReadOnly)
  $wb = $excel.Workbooks.Open($InputXlsx, $null, $true)

  $outDir = Split-Path -Parent $OutputPdf
  if (!(Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
  }

  if ($AllSheets) {
    # Aplicamos setup a todas las hojas para que el PDF completo salga coherente
    foreach ($wsItem in $wb.Worksheets) {
      $prevVisible = $wsItem.Visible
      try {
        if ($wsItem.Visible -ne -1) { $wsItem.Visible = -1 }
        Apply-PrintSetup $excel $wsItem
      }
      finally {
        $wsItem.Visible = $prevVisible
      }
    }

    # 0 = xlTypePDF
    $wb.ExportAsFixedFormat(0, $OutputPdf)
    return
  }

  if (-not $SheetName) {
    throw "SheetName is required when not using -AllSheets"
  }

  $ws = Find-WorksheetByName $wb $SheetName
  if ($null -eq $ws) {
    $avail = @()
    foreach ($w in $wb.Worksheets) { $avail += $w.Name }
    throw ("Sheet not found: '{0}'. Available: {1}" -f $SheetName, ($avail -join " | "))
  }

  # Si estuviera oculta, la mostramos temporalmente para exportar
  $prevVisible = $ws.Visible
  try {
    # -1 = xlSheetVisible
    if ($ws.Visible -ne -1) { $ws.Visible = -1 }

    Apply-PrintSetup $excel $ws

    # Exporta SOLO esa hoja
    $ws.ExportAsFixedFormat(0, $OutputPdf)
  }
  finally {
    $ws.Visible = $prevVisible
  }
}
finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }

  if ($wb) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null }
  if ($excel) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }

  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
