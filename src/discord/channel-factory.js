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

const BOT_CHANNEL_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

async function resolveMemberOverwriteId(guild, memberId, label) {
  if (!memberId) return null;

  const cachedMember = guild.members.resolve(memberId);
  if (cachedMember) return cachedMember.id;

  try {
    const member = await guild.members.fetch(memberId);
    return member?.id ?? null;
  } catch {
    console.warn(`[channel-factory] Skipping ${label} overwrite: member not found in guild (${memberId})`);
    return null;
  }
}

async function resolveRoleOverwriteId(guild, roleId, label) {
  if (!roleId) return null;

  const cachedRole = guild.roles.resolve(roleId);
  if (cachedRole) return cachedRole.id;

  try {
    const role = await guild.roles.fetch(roleId);
    return role?.id ?? null;
  } catch {
    console.warn(`[channel-factory] Skipping ${label} overwrite: role not found in guild (${roleId})`);
    return null;
  }
}

async function buildTaskChannelOverwrites(guild, creatorId) {
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
  ];

  const botIds = [
    { id: guild.client.user?.id, label: 'runtime bot user' },
    { id: SCOUT_CLIENT_ID, label: 'SCOUT_CLIENT_ID' },
    { id: SPARK_CLIENT_ID, label: 'SPARK_CLIENT_ID' },
    { id: FORGE_CLIENT_ID, label: 'FORGE_CLIENT_ID' },
    { id: MIRROR_CLIENT_ID, label: 'MIRROR_CLIENT_ID' },
    { id: COORDINATOR_CLIENT_ID, label: 'COORDINATOR_CLIENT_ID' },
  ];

  const addedMemberIds = new Set();
  for (const bot of botIds) {
    if (!bot.id || addedMemberIds.has(bot.id)) continue;
    const memberId = await resolveMemberOverwriteId(guild, bot.id, bot.label);
    if (!memberId || addedMemberIds.has(memberId)) continue;

    overwrites.push({
      id: memberId,
      allow: BOT_CHANNEL_ALLOW,
    });
    addedMemberIds.add(memberId);
  }

  const adminRoleId = await resolveRoleOverwriteId(guild, TASK_ADMIN_ROLE_ID, 'TASK_ADMIN_ROLE_ID');
  if (adminRoleId) {
    overwrites.push({
      id: adminRoleId,
      allow: BOT_CHANNEL_ALLOW,
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
    permissionOverwrites: await buildTaskChannelOverwrites(guild, creatorId),
  });
}

export { safeChannelName, buildTaskChannelOverwrites, createTaskChannel };
