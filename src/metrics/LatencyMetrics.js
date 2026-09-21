export function processHrtimeBigint() {
  return process.hrtime.bigint();
}

export class LatencyMetrics {
  constructor() {
    this.events = new Map();
  }

  recordMasterEvent(eventId, t0) {
    this.events.set(eventId, {
      t0: t0 || processHrtimeBigint()
    });
  }

  recordDetection(eventId, t1, t2) {
    const event = this.events.get(eventId) || {};
    event.t1 = t1;
    event.t2 = t2;
    this.events.set(eventId, event);
  }

  recordProcessing(eventId, start, end) {
    const event = this.events.get(eventId) || {};
    event.processingStart = start;
    event.processingEnd = end;
    this.events.set(eventId, event);
  }

  recordFirstDispatch(eventId, t3) {
    const event = this.events.get(eventId) || {};
    event.t3 = t3;
    this.events.set(eventId, event);
  }

  recordLastDispatch(eventId, t4) {
    const event = this.events.get(eventId) || {};
    event.t4 = t4;
    this.events.set(eventId, event);
  }

  recordFirstAck(eventId, t5) {
    const event = this.events.get(eventId) || {};
    event.t5 = t5;
    this.events.set(eventId, event);
  }

  recordLastAck(eventId, t6, successCount, failCount) {
    const event = this.events.get(eventId) || {};
    event.t6 = t6;
    event.successCount = successCount;
    event.failCount = failCount;
    
    // Convert to ms
    const nsToMs = 1_000_000.0;
    if (event.t1 && event.t0) {
      event.detectionLatencyMs = Number(event.t1 - event.t0) / nsToMs;
    } else {
      event.detectionLatencyMs = 0;
    }
    
    if (event.t2 && event.t1) {
      event.processingLatencyMs = Number(event.t2 - event.t1) / nsToMs;
    } else {
      event.processingLatencyMs = 0;
    }
    
    if (event.t4 && event.t3) {
      event.dispatchWindowMs = Number(event.t4 - event.t3) / nsToMs;
    } else {
      event.dispatchWindowMs = 0;
    }
    
    if (event.t5 && event.t0) {
      event.e2eFirstMs = Number(event.t5 - event.t0) / nsToMs;
    } else {
      event.e2eFirstMs = 0;
    }
    
    if (event.t6 && event.t0) {
      event.e2eLastMs = Number(event.t6 - event.t0) / nsToMs;
    } else {
      event.e2eLastMs = 0;
    }
    
    if (event.t6 && event.t5) {
      event.ackWindowMs = Number(event.t6 - event.t5) / nsToMs;
    } else {
      event.ackWindowMs = 0;
    }
    
    this.events.set(eventId, event);
  }

  getEventMetrics(eventId) {
    return this.events.get(eventId);
  }
}

export function calculateStats(values) {
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  
  const getPercentile = (p) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };
  
  return {
    min: min.toFixed(2),
    max: max.toFixed(2),
    mean: mean.toFixed(2),
    p50: getPercentile(50).toFixed(2),
    p95: getPercentile(95).toFixed(2),
    p99: getPercentile(99).toFixed(2)
  };
}
