export function attachClientRuntimeHandlers(name, client, formatError) {
  client.on('error', error => {
    console.error(`[${name}] client error:`, formatError(error));
  });
  client.on('shardError', error => {
    console.error(`[${name}] shard error:`, formatError(error));
  });
  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[${name}] shard disconnected (id=${shardId}, code=${event?.code ?? 'n/a'})`);
  });
  client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[${name}] shard resumed (id=${shardId}, replayed=${replayedEvents})`);
  });
}

export function attachAllRuntimeHandlers(clients, formatError) {
  attachClientRuntimeHandlers('Scout', clients.scout, formatError);
  attachClientRuntimeHandlers('Spark', clients.spark, formatError);
  attachClientRuntimeHandlers('Forge', clients.forge, formatError);
  attachClientRuntimeHandlers('Mirror', clients.mirror, formatError);
  attachClientRuntimeHandlers('Coordinator', clients.coordinator, formatError);
}
