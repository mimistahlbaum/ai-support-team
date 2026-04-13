import { Client, GatewayIntentBits } from 'discord.js';

export const scout = new Client({ intents: [GatewayIntentBits.Guilds] });
export const spark = new Client({ intents: [GatewayIntentBits.Guilds] });
export const forge = new Client({ intents: [GatewayIntentBits.Guilds] });
export const mirror = new Client({ intents: [GatewayIntentBits.Guilds] });
export const coordinator = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export function roleClient(role) {
  if (role === 'Scout') return scout;
  if (role === 'Spark') return spark;
  if (role === 'Forge') return forge;
  if (role === 'Mirror') return mirror;
  return coordinator;
}

export function attachReadyHandlers({ registerCoordinatorCommands, formatError }) {
  scout.once('clientReady', () => console.log(`Scout ready: ${scout.user.tag}`));
  spark.once('clientReady', () => console.log(`Spark ready: ${spark.user.tag}`));
  forge.once('clientReady', () => console.log(`Forge ready: ${forge.user.tag}`));
  mirror.once('clientReady', () => console.log(`Mirror ready: ${mirror.user.tag}`));

  coordinator.once('clientReady', async () => {
    console.log(`Coordinator ready: ${coordinator.user.tag}`);
    try {
      await registerCoordinatorCommands();
    } catch (error) {
      console.error('Slash command registration failed:', formatError(error));
    }
  });
}
