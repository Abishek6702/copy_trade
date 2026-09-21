export class BrokerAdapter {
  async connect() {
    throw new Error("connect() not implemented");
  }

  async disconnect() {
    throw new Error("disconnect() not implemented");
  }

  onMasterOrder(callback) {
    throw new Error("onMasterOrder() not implemented");
  }

  async placeOrder(clientAccount, order) {
    throw new Error("placeOrder() not implemented");
  }

  async getOrderStatus(orderId) {
    throw new Error("getOrderStatus() not implemented");
  }
}
