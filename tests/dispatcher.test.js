import test from 'node:test';
import assert from 'node:assert';
import { OrderDispatcher } from '../src/dispatcher/OrderDispatcher.js';

test('OrderDispatcher - one client failure does not stop others', async () => {
  const mockBrokerAdapter = {
    placeOrder: async (client, order) => {
      if (client.clientId === 'C2') {
        throw new Error('Broker error for C2');
      }
      return { success: true };
    }
  };
  
  const dispatcher = new OrderDispatcher(mockBrokerAdapter, null);
  
  const clientOrders = [
    { client: { clientId: 'C1' }, order: {} },
    { client: { clientId: 'C2' }, order: {} }, // Will fail
    { client: { clientId: 'C3' }, order: {} }
  ];
  
  const result = await dispatcher.dispatchBatch('EVT_1', clientOrders);
  
  assert.strictEqual(result.successfulRequests, 2);
  assert.strictEqual(result.failedRequests, 1);
});
