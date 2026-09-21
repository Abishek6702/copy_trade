import test from 'node:test';
import assert from 'node:assert';
import { calculateStats, LatencyMetrics } from '../src/metrics/LatencyMetrics.js';

test('calculateStats computes correct percentiles', () => {
  const values = [];
  for (let i = 1; i <= 100; i++) {
    values.push(i);
  }
  
  const stats = calculateStats(values);
  
  assert.strictEqual(stats.min, '1.00');
  assert.strictEqual(stats.max, '100.00');
  assert.strictEqual(stats.mean, '50.50');
  assert.strictEqual(stats.p50, '50.00');
  assert.strictEqual(stats.p95, '95.00');
  assert.strictEqual(stats.p99, '99.00');
});

test('LatencyMetrics records and calculates ms correctly', () => {
  const metrics = new LatencyMetrics();
  const eventId = 'EVT_1';
  
  const t0 = 1000000n; // 1ms
  const t1 = 2000000n; // 2ms
  const t2 = 3000000n; // 3ms
  const t3 = 4000000n; // 4ms
  const t4 = 5000000n; // 5ms
  const t5 = 6000000n; // 6ms
  const t6 = 7000000n; // 7ms
  
  metrics.recordMasterEvent(eventId, t0);
  metrics.recordDetection(eventId, t1, t2);
  metrics.recordFirstDispatch(eventId, t3);
  metrics.recordLastDispatch(eventId, t4);
  metrics.recordFirstAck(eventId, t5);
  metrics.recordLastAck(eventId, t6, 5, 0);
  
  const eventMetrics = metrics.getEventMetrics(eventId);
  
  assert.strictEqual(eventMetrics.detectionLatencyMs, 1);
  assert.strictEqual(eventMetrics.processingLatencyMs, 1);
  assert.strictEqual(eventMetrics.dispatchWindowMs, 1);
  assert.strictEqual(eventMetrics.e2eFirstMs, 5);
  assert.strictEqual(eventMetrics.e2eLastMs, 6);
});
