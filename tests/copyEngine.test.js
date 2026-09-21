import test from 'node:test';
import assert from 'node:assert';
import { CopyEngine } from '../src/engine/CopyEngine.js';
import { generateSimulatedClients } from '../src/clients/simulatedClients.js';

test('CopyEngine - duplicate master events are ignored', () => {
  const clients = generateSimulatedClients(10);
  let dispatchCalls = 0;
  
  const mockDispatcher = {
    dispatchBatch: () => { dispatchCalls++; }
  };
  
  const engine = new CopyEngine(clients, mockDispatcher, null);
  
  const signal = { eventId: 'EVT_1', side: 'BUY' };
  
  engine.processSignal(signal);
  engine.processSignal(signal); // Duplicate
  
  assert.strictEqual(dispatchCalls, 1);
});

test('CopyEngine - disabled clients are skipped', () => {
  const clients = [
    { clientId: 'C1', enabled: true, quantity: 1 },
    { clientId: 'C2', enabled: false, quantity: 1 },
    { clientId: 'C3', enabled: true, quantity: 1 }
  ];
  
  let dispatchedOrders = [];
  const mockDispatcher = {
    dispatchBatch: (eventId, orders) => { dispatchedOrders = orders; }
  };
  
  const engine = new CopyEngine(clients, mockDispatcher, null);
  
  engine.processSignal({ eventId: 'EVT_2', side: 'BUY' });
  
  assert.strictEqual(dispatchedOrders.length, 2);
  assert.strictEqual(dispatchedOrders[0].client.clientId, 'C1');
  assert.strictEqual(dispatchedOrders[1].client.clientId, 'C3');
});

test('CopyEngine - invalid signal is rejected', () => {
  const clients = generateSimulatedClients(5);
  let dispatchCalls = 0;
  
  const mockDispatcher = {
    dispatchBatch: () => { dispatchCalls++; }
  };
  
  const engine = new CopyEngine(clients, mockDispatcher, null);
  
  // missing eventId
  engine.processSignal({ side: 'BUY' }); 
  
  // invalid side
  engine.processSignal({ eventId: 'EVT_3', side: 'INVALID' }); 
  
  assert.strictEqual(dispatchCalls, 0);
});

test('CopyEngine - zero quantity is rejected', () => {
  const clients = [
    { clientId: 'C1', enabled: true, quantity: 1 },
    { clientId: 'C2', enabled: true, quantity: 0 },
    { clientId: 'C3', enabled: true, quantity: -1 }
  ];
  
  let dispatchedOrders = [];
  const mockDispatcher = {
    dispatchBatch: (eventId, orders) => { dispatchedOrders = orders; }
  };
  
  const engine = new CopyEngine(clients, mockDispatcher, null);
  
  engine.processSignal({ eventId: 'EVT_4', side: 'BUY' });
  
  assert.strictEqual(dispatchedOrders.length, 1);
  assert.strictEqual(dispatchedOrders[0].client.clientId, 'C1');
});
