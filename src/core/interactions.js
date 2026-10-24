import crypto from 'node:crypto';
import { MessageFlags } from 'discord.js';
import { app } from './context.js';
import { logger, scrub } from './logger.js';
import { UserError, translateDbError } from './errors.js';
import { parseCid } from './customId.js';
import { rolesForInteraction, can, CAPABILITY_LABELS } from './permissions.js';
import { warn } from './ui.js';

/** Throws unless the member holds a capability (checked server-side on every use). */
export function requireCap(i, capability) {
  const roles = rolesForInteraction(i, app.permConfig);
  if (!can(roles, capability)) throw new UserError(`ليست لديك صلاحية: ${CAPABILITY_LABELS[capability] ?? capability}`);
  return roles;
}

export function rolesOf(i) {
  return rolesForInteraction(i, app.permConfig);
}

async function replyError(i, err) {
  let message = err instanceof UserError ? err.userMessage : translateDbError(err);
  if (!message) {
    const ref = crypto.randomBytes(3).toString('hex');
    logger.error(
      { ref, err: { message: scrub(err?.message), stack: scrub(err?.stack ?? '') }, command: i.commandName, customId: i.customId, user: i.user?.id },
      'Interaction failed',
    );
    message = `حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل. (رمز: ${ref})`;
  }
  const priv = { ...warn(message), flags: MessageFlags.Ephemeral };
  try {
    if (i.isMessageComponent?.() || i.isModalSubmit?.()) {
      // Never overwrite the card the button sits on: errors go to a private follow-up.
      if (i.deferred || i.replied) await i.followUp(priv);
      else await i.reply(priv);
    } else if (i.deferred && !i.replied) {
      if (i.ephemeral) await i.editReply({ ...warn(message), components: [], files: [] });
      else {
        await i.followUp(priv);
        await i.deleteReply().catch(() => {});
      }
    } else if (i.replied) await i.followUp(priv);
    else await i.reply(priv);
  } catch (e) {
    logger.debug({ err: e.message }, 'Could not deliver error message');
  }
}

/**
 * Wires the interactionCreate event.
 * commands: Map<name, module>; components: Map<prefix, handler>.
 */
export function createInteractionHandler({ commands, components }) {
  return async function onInteraction(i) {
    try {
      if (i.isAutocomplete()) {
        const cmd = commands.get(i.commandName);
        if (!cmd?.autocomplete) return i.respond([]);
        const choices = await cmd.autocomplete(i);
        return i.respond((choices ?? []).slice(0, 25));
      }

      if (i.isChatInputCommand()) {
        const cmd = commands.get(i.commandName);
        if (!cmd) return;
        if (!app.commandLimiter.hit(i.user.id)) throw new UserError('أنت ترسل الأوامر بسرعة كبيرة. تمهّل قليلاً.');
        const sub = i.options.getSubcommand(false);
        const group = i.options.getSubcommandGroup(false);
        const mode = typeof cmd.defer === 'function' ? cmd.defer(i, { sub, group }) : cmd.defer;
        if (mode) await i.deferReply({ flags: mode === 'ephemeral' ? MessageFlags.Ephemeral : undefined });
        await app.userLocks.run(i.user.id, () => cmd.execute(i, { sub, group }));
        return;
      }

      if (i.isMessageComponent() || i.isModalSubmit()) {
        const parsed = parseCid(i.customId);
        const handler = components.get(parsed.handler);
        if (!handler) return;
        if (!app.buttonLimiter.hit(i.user.id)) throw new UserError('تمهّل! أنت تضغط بسرعة كبيرة.');
        await app.userLocks.run(i.user.id, () => handler.handle(i, parsed));
      }
    } catch (err) {
      if (i.isAutocomplete()) {
        logger.debug({ err: err.message }, 'Autocomplete failed');
        return i.respond([]).catch(() => {});
      }
      await replyError(i, err);
    }
  };
}
