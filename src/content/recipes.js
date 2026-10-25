// Crafting recipes for /craft. `chapter` = story chapters required, `level` = character level.
// Region materials feed region gear, so every new place has something worth gathering.

const R = (output, materials, { nx = 0, level = 1, chapter = 0, qty = 1 } = {}) => ({ key: output, output, qty, materials, nx, level, chapter });

export const RECIPES = [
  // Consumables
  R('health_potion', [['glow_herb', 2]], { nx: 5, qty: 2 }),
  R('energy_tonic', [['moon_beans', 3]], { nx: 5, qty: 2 }),
  R(
    'antidote',
    [
      ['glow_herb', 1],
      ['scorpion_venom', 1],
    ],
    { nx: 10, level: 3 },
  ),
  R(
    'greater_potion',
    [
      ['glow_herb', 3],
      ['faerie_dust', 1],
    ],
    { nx: 30, level: 8, chapter: 3 },
  ),
  R(
    'soul_ward',
    [
      ['lost_trinket', 2],
      ['fountain_coin', 1],
      ['ink_of_ages', 1],
    ],
    { nx: 120, level: 5, chapter: 2 },
  ),
  R(
    'hunters_brew',
    [
      ['wolf_pelt', 2],
      ['storm_quartz', 1],
    ],
    { nx: 60, level: 10, chapter: 4 },
  ),
  R(
    'void_tonic',
    [
      ['rift_essence', 1],
      ['moon_beans', 4],
    ],
    { nx: 80, level: 25, chapter: 10 },
  ),
  R(
    'grand_potion',
    [
      ['abyss_coral', 2],
      ['siren_scale', 1],
      ['glow_herb', 4],
    ],
    { nx: 200, level: 45, chapter: 14 },
  ),
  R(
    'titan_tonic',
    [
      ['ember_steel', 1],
      ['yeti_fur', 3],
    ],
    { nx: 250, level: 30, chapter: 9 },
  ),
  R(
    'aegis_tonic',
    [
      ['sentinel_core', 1],
      ['echo_crystal', 2],
    ],
    { nx: 250, level: 30, chapter: 9 },
  ),
  R(
    'phoenix_draught',
    [
      ['phoenix_ash', 1],
      ['magma_core', 1],
      ['glow_herb', 5],
    ],
    { nx: 600, level: 100, chapter: 28 },
  ),

  // Gear, in saga order
  R(
    'moonbark_bow',
    [
      ['moonbark', 4],
      ['reed_fiber', 2],
    ],
    { nx: 80, level: 4, chapter: 2 },
  ),
  R(
    'yeti_cloak',
    [
      ['yeti_fur', 4],
      ['wolf_pelt', 2],
    ],
    { nx: 100, level: 6, chapter: 4 },
  ),
  R(
    'storm_ring',
    [
      ['storm_quartz', 2],
      ['iron_ore', 2],
    ],
    { nx: 160, level: 10, chapter: 5 },
  ),
  R(
    'sunstone_amulet',
    [
      ['sunstone', 3],
      ['scorpion_venom', 2],
    ],
    { nx: 200, level: 14, chapter: 7 },
  ),
  R(
    'runic_blade',
    [
      ['rune_fragment', 4],
      ['iron_ore', 4],
      ['trophy_rune_colossus', 1],
    ],
    { nx: 350, level: 20, chapter: 8 },
  ),
  R(
    'sentinel_plate',
    [
      ['sentinel_core', 2],
      ['iron_ore', 6],
      ['scrap_metal', 4],
    ],
    { nx: 400, level: 22, chapter: 9 },
  ),
  R(
    'prism_staff',
    [
      ['prism_heart', 2],
      ['echo_crystal', 4],
      ['trophy_prism_matriarch', 1],
    ],
    { nx: 700, level: 24, chapter: 10 },
  ),
  R(
    'ember_greatsword',
    [
      ['ember_steel', 3],
      ['cinder_ash', 6],
      ['trophy_cinder_warlord', 1],
    ],
    { nx: 900, level: 30, chapter: 11 },
  ),
  R(
    'cloudweave_robe',
    [
      ['cloud_silk', 6],
      ['roc_feather', 2],
    ],
    { nx: 900, level: 36, chapter: 13 },
  ),
  R(
    'siren_charm',
    [
      ['siren_scale', 2],
      ['abyss_coral', 4],
    ],
    { nx: 900, level: 45, chapter: 15 },
  ),
  R(
    'shadowweave_mantle',
    [
      ['shadow_thread', 6],
      ['faceless_mask', 1],
      ['trophy_mask_collector', 1],
    ],
    { nx: 1400, level: 64, chapter: 19 },
  ),
  R(
    'voidglass_dagger',
    [
      ['void_glass', 5],
      ['hunger_shard', 1],
      ['trophy_void_matriarch', 1],
    ],
    { nx: 2200, level: 80, chapter: 22 },
  ),
  R(
    'rimefang_spear',
    [
      ['rime_crystal', 6],
      ['frozen_ember', 1],
      ['trophy_rime_sovereign', 1],
    ],
    { nx: 3000, level: 96, chapter: 26 },
  ),
  R(
    'magma_aegis',
    [
      ['magma_core', 6],
      ['phoenix_ash', 1],
      ['trophy_magma_tyrant', 1],
    ],
    { nx: 3200, level: 100, chapter: 28 },
  ),
  R(
    'emerald_heartguard',
    [
      ['emerald_scale', 6],
      ['worldtree_sap', 1],
      ['trophy_jade_serpent_king', 1],
    ],
    { nx: 3200, level: 102, chapter: 30 },
  ),
  R(
    'aether_gauntlets',
    [
      ['brass_gear', 6],
      ['aether_coil', 2],
      ['trophy_war_engine', 1],
    ],
    { nx: 3800, level: 108, chapter: 32 },
  ),
  R(
    'marshlight_lantern',
    [
      ['whisper_moss', 6],
      ['bog_pearl', 1],
      ['trophy_bog_witch', 1],
    ],
    { nx: 3800, level: 112, chapter: 34 },
  ),
  R(
    'meteor_hammer',
    [
      ['meteor_iron', 5],
      ['starlight_dust', 2],
      ['trophy_meteor_behemoth', 1],
    ],
    { nx: 4400, level: 118, chapter: 38 },
  ),
  R(
    'starlight_robe',
    [
      ['starlight_dust', 6],
      ['cloud_silk', 6],
      ['trophy_star_eater', 1],
    ],
    { nx: 4400, level: 122, chapter: 40 },
  ),
  R(
    'mirror_edge',
    [
      ['mirror_shard', 6],
      ['reflection_essence', 1],
      ['trophy_mirror_twin', 1],
    ],
    { nx: 7000, level: 124, chapter: 41 },
  ),
  R(
    'leviathan_plate',
    [
      ['leviathan_bone', 6],
      ['pale_pearl', 1],
      ['trophy_bone_leviathan', 1],
    ],
    { nx: 7500, level: 132, chapter: 44 },
  ),
  R(
    'halo_of_the_spire',
    [
      ['celestial_feather', 3],
      ['halo_fragment', 2],
      ['trophy_seraph_sentinel', 1],
    ],
    { nx: 8000, level: 138, chapter: 47 },
  ),
  R(
    'origin_blade',
    [
      ['origin_ember', 4],
      ['meteor_iron', 4],
      ['trophy_loom_warden', 1],
    ],
    { nx: 12000, level: 145, chapter: 50 },
  ),
  R(
    'weaver_mantle',
    [
      ['weaver_thread', 2],
      ['origin_ember', 3],
      ['trophy_first_hunger', 1],
    ],
    { nx: 12000, level: 150, chapter: 55 },
  ),
];

export const RECIPE_BY_KEY = Object.fromEntries(RECIPES.map((r) => [r.key, r]));
