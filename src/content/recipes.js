/**
 * Crafting recipes (v3). Materials come from /gather and /explore; stations are places:
 *   forge   — the blacksmith (weapons, armour, metal)
 *   alchemy — the market or the library (potions, tonics, scrolls)
 *   camp    — anywhere outside combat (simple field recipes)
 *
 * R(key, output, qty, station, minLevel, nx, inputs)
 */
const R = (key, output, quantity, station, minLevel, nx, inputs) => ({ key, output, quantity, station, minLevel, nx, inputs });

export const STATIONS = {
  forge: { name: 'السندان', locations: ['blacksmith'], icon: 'hammer' },
  alchemy: { name: 'طاولة الخيمياء', locations: ['market', 'library'], icon: 'flask' },
  camp: { name: 'نار المخيم', locations: null, icon: 'flame' },
};

export const RECIPES = [
  // Field cooking and basics
  R('trail_rations', 'trail_rations', 2, 'camp', 1, 0, [
    ['glow_herb', 2],
    ['river_reed', 1],
  ]),
  R('antidote', 'antidote', 1, 'camp', 2, 0, [
    ['frost_lichen', 2],
    ['glow_herb', 1],
  ]),
  // Alchemy
  R('health_potion', 'health_potion', 2, 'alchemy', 1, 10, [['glow_herb', 3]]),
  R('energy_tonic', 'energy_tonic', 2, 'alchemy', 2, 10, [
    ['river_reed', 2],
    ['storm_quartz', 1],
  ]),
  R('greater_potion', 'greater_potion', 1, 'alchemy', 6, 30, [
    ['glow_herb', 3],
    ['firefly_jar', 1],
  ]),
  R('stamina_draught', 'stamina_draught', 1, 'alchemy', 10, 40, [
    ['sun_salt', 2],
    ['storm_quartz', 1],
    ['frost_lichen', 2],
  ]),
  R('haste_tonic', 'haste_tonic', 1, 'alchemy', 12, 50, [
    ['wind_seed', 3],
    ['storm_quartz', 1],
  ]),
  R('regen_salve', 'regen_salve', 1, 'alchemy', 14, 50, [
    ['ancient_bark', 2],
    ['glow_herb', 3],
    ['coral_branch', 1],
  ]),
  R('superior_potion', 'superior_potion', 1, 'alchemy', 20, 80, [
    ['frost_lichen', 3],
    ['firefly_jar', 2],
    ['sun_salt', 1],
  ]),
  R('fury_elixir', 'fury_elixir', 1, 'alchemy', 8, 40, [
    ['ember_core', 1],
    ['glow_herb', 2],
  ]),
  R('stone_elixir', 'stone_elixir', 1, 'alchemy', 8, 40, [
    ['geode', 2],
    ['frost_lichen', 1],
  ]),
  R('ward_scroll', 'ward_scroll', 1, 'alchemy', 25, 120, [
    ['rune_fragment', 1],
    ['cloud_silk', 1],
    ['echo_dust', 1],
  ]),
  R('reroll_token', 'reroll_token', 1, 'alchemy', 5, 100, [
    ['orin_coin', 5],
    ['rune_fragment', 1],
  ]),
  R('guardian_charm', 'guardian_charm', 1, 'alchemy', 18, 800, [
    ['rune_fragment', 2],
    ['moon_pearl', 1],
    ['shadow_thread', 1],
  ]),
  // Forge: basics
  R('iron_sword', 'iron_sword', 1, 'forge', 3, 60, [['iron_ore', 6]]),
  R('chainmail', 'chainmail', 1, 'forge', 4, 80, [
    ['iron_ore', 8],
    ['wolf_pelt', 2],
  ]),
  // Verdant set
  R('warden_bow', 'warden_bow', 1, 'forge', 8, 250, [
    ['ancient_bark', 6],
    ['river_reed', 4],
    ['thunder_feather', 1],
  ]),
  R('mossguard_mail', 'mossguard_mail', 1, 'forge', 8, 250, [
    ['ancient_bark', 5],
    ['wolf_pelt', 4],
    ['iron_ore', 4],
  ]),
  R('firefly_charm', 'firefly_charm', 1, 'forge', 8, 250, [
    ['firefly_jar', 3],
    ['mirror_scale', 2],
  ]),
  // Sands set
  R('dune_khopesh', 'dune_khopesh', 1, 'forge', 20, 700, [
    ['sand_glass', 8],
    ['ash_iron', 4],
    ['rune_fragment', 1],
  ]),
  R('scarab_plate', 'scarab_plate', 1, 'forge', 20, 700, [
    ['scarab_shell', 6],
    ['ash_iron', 4],
  ]),
  R('orin_signet', 'orin_signet', 1, 'forge', 20, 700, [
    ['orin_coin', 10],
    ['rune_fragment', 2],
    ['sun_salt', 2],
  ]),
  // Crystal Deep set
  R('resonance_staff', 'resonance_staff', 1, 'forge', 30, 1000, [
    ['song_crystal', 6],
    ['echo_dust', 2],
    ['ancient_bark', 3],
  ]),
  R('coral_aegis', 'coral_aegis', 1, 'forge', 30, 1000, [
    ['coral_branch', 8],
    ['geode', 4],
    ['drowned_bell', 1],
  ]),
  R('bell_of_tides', 'bell_of_tides', 1, 'forge', 30, 1000, [
    ['drowned_bell', 2],
    ['moon_pearl', 1],
    ['coral_branch', 3],
  ]),
  // Heights set
  R('skyfall_lance', 'skyfall_lance', 1, 'forge', 40, 2400, [
    ['skyfall_ore', 6],
    ['cloud_silk', 3],
    ['thunder_feather', 2],
  ]),
  R('cloudweave_robe', 'cloudweave_robe', 1, 'forge', 40, 2400, [
    ['cloud_silk', 10],
    ['wind_seed', 6],
  ]),
  R('thunder_talisman', 'thunder_talisman', 1, 'forge', 40, 2400, [
    ['thunder_feather', 3],
    ['storm_quartz', 4],
    ['skyfall_ore', 2],
  ]),
  // Rift set
  R('shadowthread_blade', 'shadowthread_blade', 1, 'forge', 65, 4000, [
    ['shadow_thread', 8],
    ['void_crystal', 2],
    ['rift_ember', 3],
  ]),
  R('facesteel_armor', 'facesteel_armor', 1, 'forge', 65, 4000, [
    ['stolen_mask', 3],
    ['ash_iron', 8],
    ['shadow_thread', 3],
  ]),
  R('void_heart', 'void_heart', 1, 'forge', 65, 4000, [
    ['void_crystal', 3],
    ['hunger_ash', 1],
  ]),
  // Returned Worlds set
  R('chrono_edge', 'chrono_edge', 1, 'forge', 90, 10000, [
    ['chrono_spring', 3],
    ['brass_gear', 8],
    ['mirror_shard', 4],
  ]),
  R('penumbra_mantle', 'penumbra_mantle', 1, 'forge', 90, 10000, [
    ['penumbra_silk', 4],
    ['eclipse_ash', 6],
    ['cloud_silk', 4],
  ]),
  R('mirror_crown', 'mirror_crown', 1, 'forge', 90, 10000, [
    ['mirror_shard', 6],
    ['nexus_essence', 1],
    ['glass_grass', 6],
  ]),
];

export const RECIPE_BY_KEY = Object.fromEntries(RECIPES.map((r) => [r.key, r]));

export function stationAvailable(station, locationKey) {
  const s = STATIONS[station];
  if (!s) return false;
  return !s.locations || s.locations.includes(locationKey);
}
