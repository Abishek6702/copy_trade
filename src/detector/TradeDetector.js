import { processHrtimeBigint } from "../metrics/LatencyMetrics.js";

export class TradeDetector {
  constructor(brokerAdapter, copyEngine) {
    this.brokerAdapter = brokerAdapter;
    this.copyEngine = copyEngine;
  }

  start() {
    this.brokerAdapter.onMasterOrder((brokerEvent) => {
      this.handleMasterOrder(brokerEvent);
    });
  }

  handleMasterOrder(brokerEvent) {
    const detectorReceivedAt = processHrtimeBigint();
    
    const tradeSignal = {
      eventId: brokerEvent.eventId,
      broker: brokerEvent.broker,
      masterAccountId: brokerEvent.masterAccountId,
      symbol: brokerEvent.symbol,
      exchange: brokerEvent.exchange,
      side: brokerEvent.side,
      quantity: brokerEvent.quantity,
      orderType: brokerEvent.orderType,
      brokerOrderId: brokerEvent.brokerOrderId,
      brokerEventTimestamp: brokerEvent.brokerEventTimestamp,
      detectorReceivedAt: detectorReceivedAt
    };
    
    this.copyEngine.processSignal(tradeSignal);
  }
}
