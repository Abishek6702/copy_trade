import { processHrtimeBigint } from "../metrics/LatencyMetrics.js";

export class OrderDispatcher {
  constructor(brokerAdapter, metrics) {
    this.brokerAdapter = brokerAdapter;
    this.metrics = metrics;
    
    const concurrencyStr = process.env.DISPATCH_CONCURRENCY || "50";
    this.concurrency = parseInt(concurrencyStr, 10);
  }

  async dispatchBatch(eventId, clientOrders) {
    if (clientOrders.length === 0) return;
    
    const t3 = processHrtimeBigint();
    if (this.metrics) {
      this.metrics.recordFirstDispatch(eventId, t3);
    }
    
    let activeWorkers = 0;
    let currentIndex = 0;
    
    let firstAck = null;
    let successfulRequests = 0;
    let failedRequests = 0;
    
    return new Promise((resolve) => {
      const worker = async () => {
        while (currentIndex < clientOrders.length) {
          const index = currentIndex++;
          const { client, order } = clientOrders[index];
          
          try {
            const result = await this.brokerAdapter.placeOrder(client, order);
            successfulRequests++;
            
            if (firstAck === null) {
              firstAck = processHrtimeBigint();
              if (this.metrics) {
                this.metrics.recordFirstAck(eventId, firstAck);
              }
            }
          } catch (error) {
            failedRequests++;
            if (process.env.LOG_LEVEL === 'debug') {
              console.error(`Order failed for client ${client.clientId}`, error);
            }
          }
        }
        
        activeWorkers--;
        if (activeWorkers === 0) {
          const t6 = processHrtimeBigint();
          if (this.metrics) {
            this.metrics.recordLastAck(eventId, t6, successfulRequests, failedRequests);
          }
          resolve({ successfulRequests, failedRequests });
        }
      };
      
      const t4 = processHrtimeBigint();
      if (this.metrics) {
        this.metrics.recordLastDispatch(eventId, t4);
      }
      
      const workersToStart = Math.min(this.concurrency, clientOrders.length);
      activeWorkers = workersToStart;
      
      for (let i = 0; i < workersToStart; i++) {
        worker();
      }
    });
  }
}
