
# Low-Latency Copy-Trading POC

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
