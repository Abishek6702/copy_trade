// src/sources/TradingViewWebhook.js
import SignalSource from './SignalSource.js';
import { getSignalId } from '../utils/idempotency.js';

/**
 * Handles TradingView webhook payloads (JSON only).
 * Expected fields (may be subset):
 *   signalId, symbol, exchange, side, quantity, orderType, sourceTimestamp
 */
export default class TradingViewWebhook extends SignalSource {
  /**
   * @param {Object} rawRequest parsed JSON payload
   * @returns {Object} normalized TradeSignal
   */
  normalize(rawRequest) {
    const source = 'tradingview';
    const { signalId, symbol, exchange, side, quantity, orderType, sourceTimestamp } = rawRequest;
    const base = { source, symbol, exchange, side, quantity, orderType, sourceTimestamp };
    const eventId = signalId || getSignalId(base);
    return { ...base, eventId };
  }
}
