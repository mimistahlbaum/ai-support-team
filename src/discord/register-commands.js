import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { COORDINATOR_BOT_TOKEN, COORDINATOR_CLIENT_ID, DISCORD_GUILD_ID } from '../app/env.js';
import { API_RETRIES, REQUEST_TIMEOUT_MS } from '../app/constants.js';
import { retryAsync } from '../utils/retry.js';
import { withTimeout } from '../utils/timeout.js';

export async function registerCoordinatorCommands() {
  const rest = new REST({ version: '10' }).setToken(COORDINATOR_BOT_TOKEN);

  const commands = [
    new SlashCommandBuilder()
      .setName('starttask')
      .setDescription('Create dedicated task channel and start autonomous team')
      .addStringOption(option => option.setName('task_type').setDescription('Task type').setRequired(true).addChoices(
        { name: 'general', value: 'general' },
        { name: 'research', value: 'research' },
        { name: 'grant', value: 'grant' },
        { name: 'website', value: 'website' },
        { name: 'marketing', value: 'marketing' },
        { name: 'admin', value: 'admin' }
      ))
      .addStringOption(option => option.setName('title').setDescription('Task title').setRequired(true))
      .addStringOption(option => option.setName('prompt').setDescription('What should the team work on?').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('continue')
      .setDescription('Continue autonomous team in current task channel')
      .addStringOption(option => option.setName('prompt').setDescription('What should the team do next?').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder().setName('resume').setDescription('Resume current task from saved memory').toJSON(),
    new SlashCommandBuilder().setName('finish').setDescription('Finish task').toJSON(),
  ];

  await retryAsync(
    () => withTimeout(
      () => rest.put(Routes.applicationGuildCommands(COORDINATOR_CLIENT_ID, DISCORD_GUILD_ID), { body: commands }),
      REQUEST_TIMEOUT_MS,
      'register slash commands'
    ),
    { retries: API_RETRIES, label: 'register coordinator commands' }
  );
  console.log('Coordinator slash commands registered.');
}
