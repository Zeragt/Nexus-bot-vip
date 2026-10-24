import { classCommand, classComponent } from './classes.js';
import { storyCommand, codexCommand, storyComponent, codexComponent } from './story.js';
import characterCommand from './character.js';
import economyCommand from './economy.js';
import inventoryCommand, { inventoryPager } from './inventory.js';
import leaderboardCommand, { leaderboardPager } from './leaderboard.js';
import questCommand, { questBoardComponent } from './quest.js';
import { travelCommand, worldCommand, npcCommand, shopCommand, worldComponents } from './world.js';
import { combatCommand, huntCommand, combatComponent } from './combat.js';
import { tradeCommand, tradeComponent } from './trade.js';
import {
  startCommand,
  helpCommand,
  helpComponent,
  skillCommand,
  factionCommand,
  jobCommand,
  achievementsCommand,
  relationCommand,
  guildCommand,
  guildComponent,
} from './social.js';
import { eventCommand, eventComponent, randomEventComponent } from './event.js';
import { adminCommand, gmCommand, adminComponent } from './admin.js';
import { characterModals, profileNav, genericUi } from '../components/character.js';

export const commandList = [
  startCommand,
  helpCommand,
  characterCommand,
  skillCommand,
  inventoryCommand,
  economyCommand,
  leaderboardCommand,
  travelCommand,
  worldCommand,
  npcCommand,
  shopCommand,
  questCommand,
  combatCommand,
  huntCommand,
  tradeCommand,
  guildCommand,
  factionCommand,
  jobCommand,
  achievementsCommand,
  relationCommand,
  eventCommand,
  adminCommand,
  gmCommand,
  classCommand,
  storyCommand,
  codexCommand,
];

export const componentList = [
  characterModals,
  profileNav,
  genericUi,
  helpComponent,
  inventoryPager,
  leaderboardPager,
  questBoardComponent,
  ...worldComponents,
  combatComponent,
  tradeComponent,
  guildComponent,
  eventComponent,
  randomEventComponent,
  adminComponent,
  classComponent,
  storyComponent,
  codexComponent,
];

export function buildRegistry() {
  const commands = new Map();
  for (const c of commandList) {
    const name = c.data.name;
    if (commands.has(name)) throw new Error(`Duplicate command: ${name}`);
    commands.set(name, c);
  }
  const components = new Map();
  for (const h of componentList) {
    if (components.has(h.prefix)) throw new Error(`Duplicate component prefix: ${h.prefix}`);
    components.set(h.prefix, h);
  }
  return { commands, components };
}

export const commandPayloads = () => commandList.map((c) => c.data.toJSON());
