// src/sources/SignalSource.js
/**
 * Abstract class for a generic signal source.
 * Concrete implementations must implement:
 *   start() – begin listening (if applicable)
 *   stop()  – stop listening
 *   normalize(rawRequest) – convert the raw request payload into the internal TradeSignal shape
 */
export default class SignalSource {
  start() {
    throw new Error('start() not implemented');
  }
  stop() {
    throw new Error('stop() not implemented');
  }
  /**
   * @param {*} rawRequest the raw request body (already parsed)
   * @returns {Object} normalized signal matching the CopyEngine expectations
   */
  normalize(rawRequest) {
    throw new Error('normalize() not implemented');
  }
}
