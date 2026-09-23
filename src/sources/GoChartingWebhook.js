// src/sources/GoChartingWebhook.js
import SignalSource from './SignalSource.js';
import { getSignalId } from '../utils/idempotency.js';

/**
 * Handles GoCharting webhook payloads.
 * Expected fields (may be subset):
 *   signalId, symbol, exchange, side, quantity, orderType, sourceTimestamp
 */
export default class GoChartingWebhook extends SignalSource {
  /**
   * @param {Object|string} rawRequest parsed JSON or plain‑text string (will be JSON parsed if possible)
   * @returns {Object} normalized TradeSignal
   */
  normalize(rawRequest) {
    let payload = rawRequest;
    if (typeof rawRequest === 'string') {
      try { payload = JSON.parse(rawRequest); } catch (_) { payload = {}; }
    }
    const source = 'gocharting';
    const { signalId, symbol, exchange, side, quantity, orderType, sourceTimestamp } = payload;
    const base = { source, symbol, exchange, side, quantity, orderType, sourceTimestamp };
    const eventId = signalId || getSignalId(base);
    return { ...base, eventId };
  }
}
