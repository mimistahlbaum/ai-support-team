import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
  SCOUT_CLIENT_ID,
  SPARK_CLIENT_ID,
  FORGE_CLIENT_ID,
  MIRROR_CLIENT_ID,
  COORDINATOR_CLIENT_ID,
  TASK_ADMIN_ROLE_ID,
} from '../app/env.js';
import { clip } from '../utils/text.js';

function safeChannelName(title) {
  const base = String(title || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

  const cleaned = base
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const isUsable = cleaned && /[\p{L}\p{N}]/u.test(cleaned);
  if (isUsable) return `task-${cleaned}`.slice(0, 95);

  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `task-${ts}`;
}

function buildTaskChannelOverwrites(guild, creatorId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: creatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: SCOUT_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: SPARK_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: FORGE_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: MIRROR_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: COORDINATOR_CLIENT_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  if (TASK_ADMIN_ROLE_ID) {
    overwrites.push({
      id: TASK_ADMIN_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  return overwrites;
}

async function createTaskChannel(guild, creatorId, title, taskType, reason) {
  return guild.channels.create({
    name: safeChannelName(title),
    type: ChannelType.GuildText,
    topic: `Task channel for ${taskType} | title: ${clip(title, 120)}`,
    reason,
    permissionOverwrites: buildTaskChannelOverwrites(guild, creatorId),
  });
}

export { safeChannelName, buildTaskChannelOverwrites, createTaskChannel };
