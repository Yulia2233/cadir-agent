param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('up', 'down', 'health')]
  [string]$Action
)

$compose = Join-Path $PSScriptRoot '../infra/compose.yaml'
switch ($Action) {
  'up' { docker compose -f $compose up -d --build }
  'down' { docker compose -f $compose down }
  'health' { node (Join-Path $PSScriptRoot 'healthcheck.mjs') }
}
