<#
.SYNOPSIS
  Sends an HMAC-signed Shopify webhook to workflow 01 or 04, once or as a burst.

.DESCRIPTION
  Shopify signs the RAW request body with the webhook signing secret and sends the
  base64 digest in X-Shopify-Hmac-Sha256. This script does exactly that, so a test
  delivery is indistinguishable from a real one at the HMAC layer.

  Two properties matter and are easy to get wrong:

  * The bytes signed must be the bytes sent. The script serialises the payload
    ONCE, signs those bytes, and posts those same bytes. Re-serialising parsed
    JSON changes key order and whitespace, which breaks the digest — the classic
    Shopify HMAC bug (docs/decisions.md 2026-08-02).

  * -Count > 1 fires the deliveries CONCURRENTLY, not in a loop. Sequential
    deliveries prove nothing about idempotency: the point of chaos test 5.6 is
    that five simultaneous writes for one checkout_token collapse into one cart
    row with an unmoved schedule, which is a property of the atomic
    INSERT ... ON CONFLICT in case2_upsert_cart.

  The secret is NEVER stored in this repo. Get it from the Shopify admin
  (Settings -> Notifications -> Webhooks -> signing secret) and pass it in, or
  set $env:SHOPIFY_WEBHOOK_SECRET_C2 for the shell session.

.EXAMPLE
  # Chaos test 5.6 — five concurrent deliveries of the same checkout
  .\send-signed-shopify-webhook.ps1 -Url https://<tunnel>/webhook/shopify-checkout `
      -PayloadFile .\fixtures\shopify-checkout-create.json -Token m5chaos-burst-01 -Count 5

.EXAMPLE
  # Negative control — a forged signature must be dropped and logged
  .\send-signed-shopify-webhook.ps1 -Url http://localhost:5678/webhook/shopify-checkout `
      -PayloadFile .\fixtures\shopify-checkout-create.json -Token m5chaos-forged-01 -Forge
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$PayloadFile,

  # Replaces REPLACE_CHECKOUT_TOKEN / REPLACE_CART_TOKEN in the fixture, so each
  # test run gets its own cart without editing the file.
  [string]$Token,

  [int]$Count = 1,
  [string]$Secret = $env:SHOPIFY_WEBHOOK_SECRET_C2,

  # Send a deliberately wrong signature to prove the HMAC gate rejects it.
  [switch]$Forge,

  [string]$Topic = 'checkouts/create'
)

if (-not $Secret) {
  throw "No signing secret. Pass -Secret or set `$env:SHOPIFY_WEBHOOK_SECRET_C2 (Shopify admin -> Settings -> Notifications -> Webhooks)."
}
if (-not (Test-Path $PayloadFile)) { throw "Payload file not found: $PayloadFile" }

$body = Get-Content -Raw -Encoding UTF8 $PayloadFile
if ($Token) {
  $body = $body.Replace('REPLACE_CHECKOUT_TOKEN', $Token).Replace('REPLACE_CART_TOKEN', "cart-$Token")
}

# Sign the exact bytes that will be sent.
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$hmac  = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
$signature = [Convert]::ToBase64String($hmac.ComputeHash($bytes))
if ($Forge) { $signature = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('not-a-valid-signature')) }

$headers = @{
  'X-Shopify-Hmac-Sha256'    = $signature
  'X-Shopify-Topic'          = $Topic
  'X-Shopify-Shop-Domain'    = 'layla-boutique-5lw7e3c9.myshopify.com'
  'X-Shopify-API-Version'    = '2026-07'
  'X-Shopify-Webhook-Id'     = [guid]::NewGuid().ToString()
}

Write-Host "POST $Url"
Write-Host "  topic=$Topic token=$Token count=$Count forged=$($Forge.IsPresent) bodyBytes=$($bytes.Length)"

if ($Count -eq 1) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -Uri $Url -Method POST -Body $bytes -ContentType 'application/json' -Headers $headers -TimeoutSec 30 -UseBasicParsing
    $sw.Stop()
    Write-Host ("  HTTP {0} in {1} ms" -f $r.StatusCode, $sw.ElapsedMilliseconds)
  } catch {
    $sw.Stop()
    Write-Host ("  FAILED after {0} ms :: {1}" -f $sw.ElapsedMilliseconds, $_.Exception.Message)
  }
  return
}

# Concurrent burst. Each job re-creates the request from the same signed bytes.
$jobs = 1..$Count | ForEach-Object {
  Start-Job -ScriptBlock {
    param($u, $b, $h, $i)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
      $r = Invoke-WebRequest -Uri $u -Method POST -Body $b -ContentType 'application/json' -Headers $h -TimeoutSec 30 -UseBasicParsing
      "delivery ${i}: HTTP $($r.StatusCode) in $($sw.ElapsedMilliseconds) ms"
    } catch {
      "delivery ${i}: FAILED in $($sw.ElapsedMilliseconds) ms :: $($_.Exception.Message)"
    }
  } -ArgumentList $Url, $bytes, $headers, $_
}

$jobs | Wait-Job | Receive-Job | ForEach-Object { Write-Host "  $_" }
$jobs | Remove-Job
