param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $ArgsFromCaller
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeScript = Join-Path $ScriptDir "run-phase-loop.mjs"

node $NodeScript @ArgsFromCaller
exit $LASTEXITCODE
