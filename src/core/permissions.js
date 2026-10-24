import { PermissionFlagsBits } from 'discord.js';

/**
 * Role-based capabilities. Roles are resolved from Discord role IDs in the environment
 * (never role names), and checked server-side on every command and button press.
 */
export const ROLES = ['owner', 'admin', 'moderator', 'eventManager', 'loreManager'];

export const CAPABILITIES = {
  manageCharacters: ['owner', 'admin', 'moderator'],
  deleteCharacters: ['owner', 'admin'],
  manageEconomy: ['owner', 'admin'],
  manageItems: ['owner', 'admin'],
  manageQuests: ['owner', 'admin', 'eventManager', 'loreManager'],
  reviewQuests: ['owner', 'admin', 'moderator', 'eventManager'],
  manageNpcs: ['owner', 'admin', 'loreManager'],
  manageEvents: ['owner', 'admin', 'eventManager'],
  manageGuilds: ['owner', 'admin', 'moderator'],
  manageFactions: ['owner', 'admin', 'loreManager'],
  manageWorld: ['owner', 'admin', 'loreManager'],
  manageLore: ['owner', 'admin', 'loreManager'],
  manageSettings: ['owner', 'admin'],
  viewLogs: ['owner', 'admin', 'moderator'],
};

export const CAPABILITY_LABELS = {
  manageCharacters: 'إدارة الشخصيات',
  deleteCharacters: 'حذف الشخصيات',
  manageEconomy: 'إدارة الاقتصاد',
  manageItems: 'إدارة الأغراض',
  manageQuests: 'إدارة المهام',
  reviewQuests: 'مراجعة المهام',
  manageNpcs: 'إدارة الشخصيات غير القابلة للعب',
  manageEvents: 'إدارة الأحداث',
  manageGuilds: 'إدارة النقابات',
  manageFactions: 'إدارة الفصائل',
  manageWorld: 'إدارة العالم',
  manageLore: 'إدارة القصص',
  manageSettings: 'إدارة الإعدادات',
  viewLogs: 'عرض السجلات',
};

/** Pure role resolution, testable without Discord. */
export function resolveRoles({ userId, roleIds = [], isGuildOwner = false, isDiscordAdmin = false }, config) {
  const roles = new Set();
  const has = (list) => list.some((id) => roleIds.includes(id));
  if (config.ownerIds.includes(userId) || isGuildOwner) roles.add('owner');
  if (has(config.adminRoleIds) || (config.trustDiscordAdmin && isDiscordAdmin)) roles.add('admin');
  if (has(config.moderatorRoleIds)) roles.add('moderator');
  if (has(config.eventManagerRoleIds)) roles.add('eventManager');
  if (has(config.loreManagerRoleIds)) roles.add('loreManager');
  return roles;
}

export function can(roles, capability) {
  const allowed = CAPABILITIES[capability];
  if (!allowed) throw new Error(`Unknown capability: ${capability}`);
  return allowed.some((r) => roles.has(r));
}

export function permissionConfigFromEnv(env) {
  return {
    ownerIds: env.OWNER_USER_ID,
    adminRoleIds: env.ADMIN_ROLE_ID,
    moderatorRoleIds: env.MODERATOR_ROLE_ID,
    eventManagerRoleIds: env.EVENT_MANAGER_ROLE_ID,
    loreManagerRoleIds: env.LORE_MANAGER_ROLE_ID,
    trustDiscordAdmin: env.TRUST_DISCORD_ADMINISTRATOR,
  };
}

/** Reads the member behind an interaction and returns its role set. */
export function rolesForInteraction(interaction, config) {
  const member = interaction.member;
  const roleIds = member?.roles?.cache ? [...member.roles.cache.keys()] : Array.isArray(member?.roles) ? member.roles : [];
  const perms = interaction.memberPermissions;
  return resolveRoles(
    {
      userId: interaction.user.id,
      roleIds,
      isGuildOwner: interaction.guild?.ownerId === interaction.user.id,
      isDiscordAdmin: Boolean(perms?.has?.(PermissionFlagsBits.Administrator)),
    },
    config,
  );
}
