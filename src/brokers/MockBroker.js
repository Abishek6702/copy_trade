import { BrokerAdapter } from "./BrokerAdapter.js";

export class MockBroker extends BrokerAdapter {
  constructor() {
    super();
    this.listeners = [];
  }

  async connect() {
    return Promise.resolve();
  }

  async disconnect() {
    return Promise.resolve();
  }

  onMasterOrder(callback) {
    this.listeners.push(callback);
  }

  simulateMasterOrder(orderParams) {
    const event = {
      eventId: `EVT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      broker: "MOCK",
      masterAccountId: "MASTER_001",
      symbol: orderParams.symbol,
      exchange: orderParams.exchange,
      side: orderParams.side,
      quantity: orderParams.quantity,
      orderType: orderParams.orderType,
      brokerOrderId: `MOCK_ORD_${Date.now()}`,
      brokerEventTimestamp: Date.now()
    };
    
    for (const listener of this.listeners) {
      listener(event);
    }
    
    return event;
  }

  async placeOrder(clientAccount, order) {
    const latencyStr = process.env.MOCK_ORDER_LATENCY_MS || "5";
    const jitterStr = process.env.MOCK_ORDER_JITTER_MS || "2";
    
    const baseLatency = parseInt(latencyStr, 10);
    const jitter = parseInt(jitterStr, 10);
    
    const actualLatency = baseLatency + (Math.random() * jitter * 2 - jitter);
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate order placement success
        resolve({
          success: true,
          internalOrderId: order.internalOrderId,
          brokerOrderId: `MOCK_CLIENT_ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          status: "COMPLETE",
          clientAccountId: clientAccount.brokerAccountId,
          symbol: order.symbol,
          quantity: order.quantity
        });
      }, Math.max(0, actualLatency));
    });
  }

  async getOrderStatus(orderId) {
    return { status: "COMPLETE" };
  }
}
