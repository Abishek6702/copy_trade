// src/brokers/xtsUtils.js
/**
 * Normalizes a raw XTS order event into the internal TradeSignal format.
 * Returns null if required fields are missing.
 */
export function normalizeOrderEvent(raw) {
  const required = ["orderId", "symbol", "exchange", "side", "quantity", "orderType", "timestamp"];
  for (const field of required) {
    if (raw[field] === undefined || raw[field] === null) {
      console.warn(`[XTS] Order event missing required field ${field}`);
      return null;
    }
  }
  return {
    eventId: raw.orderId,
    broker: "aetram",
    adapter: "xts",
    masterAccountId: process.env.XTS_MASTER_USER_ID || "UNKNOWN_MASTER",
    symbol: raw.symbol,
    exchange: raw.exchange,
    side: raw.side,
    quantity: raw.quantity,
    orderType: raw.orderType,
    brokerOrderId: raw.orderId,
    brokerEventTimestamp: raw.timestamp,
    // detectorReceivedAt will be added by adapter
  };
}

/**
 * Normalizes a raw XTS trade event.
 * Returns null if required fields are missing.
 */
export function normalizeTradeEvent(raw) {
  const required = ["tradeId", "symbol", "exchange", "side", "quantity", "price", "timestamp"];
  for (const field of required) {
    if (raw[field] === undefined || raw[field] === null) {
      console.warn(`[XTS] Trade event missing required field ${field}`);
      return null;
    }
  }
  return {
    eventId: raw.tradeId,
    broker: "aetram",
    adapter: "xts",
    masterAccountId: process.env.XTS_MASTER_USER_ID || "UNKNOWN_MASTER",
    symbol: raw.symbol,
    exchange: raw.exchange,
    side: raw.side,
    quantity: raw.quantity,
    orderType: "TRADE",
    brokerOrderId: raw.tradeId,
    brokerEventTimestamp: raw.timestamp,
  };
}
