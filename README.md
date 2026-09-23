# Low-Latency Copy-Trading POC

## Environment Setup

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

The following variables are used by the webhook server:

| Variable | Description |
|---|---|
| `WEBHOOK_PORT` | Port the server listens on (default `3000`) |
| `WEBHOOK_ENABLED` | Set to `true` to enable the server |
| `GOCHARTING_WEBHOOK_SECRET` | Secret for the **header-based** GoCharting route (`X-Webhook-Secret` header) |
| `GOCHARTING_WEBHOOK_TOKEN` | Token for the **URL-based** GoCharting route (see below) |
| `TRADINGVIEW_WEBHOOK_SECRET` | Secret for TradingView webhook calls (`X-Webhook-Secret` header) |

**Do not commit `.env`** – it is already listed in `.gitignore`.

### GoCharting authentication modes

GoCharting's alert UI provides only a **Webhook URL** field — it cannot set custom HTTP headers.
Two routes are supported so both header-based and URL-based auth work:

| Route | Auth method | Use when |
|---|---|---|
| `POST /webhooks/gocharting` | `X-Webhook-Secret` header | Testing with `curl` / Postman |
| `POST /webhooks/gocharting/:token` | Token embedded in URL | GoCharting live alerts |

#### Setting up the URL-token route

1. Generate a secure random token:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Add it to `.env`:
   ```env
   GOCHARTING_WEBHOOK_TOKEN=<your-generated-token>
   ```
3. Set your GoCharting webhook URL to:
   ```
   https://<your-ngrok-host>/webhooks/gocharting/<your-generated-token>
   ```
4. Leave the payload body as JSON — no additional headers are needed.



## Purpose
This is a research POC for a low-latency copy-trading engine. It focuses on testing the internal application architecture and measuring processing speed using high-resolution timers.

## Current architecture
```text
Mock Broker
→ Trade Detector
→ Copy Engine
→ Dispatcher
→ Simulated Clients
```

## Why database is absent
Client configuration is deliberately preloaded into memory because database/network operations should not unnecessarily sit on the latency-sensitive trade execution path.

## What this POC does NOT prove
**This POC does NOT represent actual Kite/Groww/Alice Blue/Angel One latency.**
It only measures our application architecture and simulated broker behavior. Actual broker latency must be measured after real broker integration.

## Future architecture
```text
Real Broker
→ Broker Adapter
→ Trade Detector
→ Normalized TradeSignal
→ Copy Engine
→ Dispatcher
→ Client Broker Accounts
```

## Important Note
The `BrokerAdapter` abstract class is designed such that future implementations (like `KiteAdapter`, `GrowwAdapter`, etc.) can be seamlessly integrated without requiring changes to the `TradeDetector`, `CopyEngine`, `OrderDispatcher`, or `LatencyMetrics` classes.
