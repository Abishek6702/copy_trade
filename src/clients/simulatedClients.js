export function generateSimulatedClients(count = 200) {
  const clients = [];
  
  for (let i = 1; i <= count; i++) {
    const id = i.toString().padStart(3, '0');
    clients.push({
      clientId: `CLIENT_${id}`,
      brokerAccountId: `ACCOUNT_${id}`,
      quantity: (i % 5) + 1, // Deterministic quantity between 1 and 5
      enabled: i % 10 !== 0 // Every 10th client is disabled
    });
  }
  
  return clients;
}
