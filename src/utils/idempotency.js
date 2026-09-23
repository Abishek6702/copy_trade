// src/utils/idempotency.js
import crypto from 'crypto';
/**
 * Generate a deterministic eventId for a normalized signal when a signalId is not provided.
 * Uses SHA‑256 of a stable string composed of the fields:
 *   source, symbol, exchange, side, quantity, orderType, sourceTimestamp (if present).
 * The hash is hex‑encoded and truncated to first 12 characters for brevity.
 * @param {Object} normalizedSignal the signal object (already containing source, etc.)
 * @returns {string} deterministic eventId
 */
export function getSignalId(normalizedSignal) {
  const {
    source,
    symbol,
    exchange,
    side,
    quantity,
    orderType,
    sourceTimestamp,
  } = normalizedSignal;
  const parts = [source, symbol, exchange, side, quantity, orderType];
  if (sourceTimestamp !== undefined && sourceTimestamp !== null) parts.push(sourceTimestamp);
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash.slice(0, 12);
}
