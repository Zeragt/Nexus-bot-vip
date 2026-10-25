// Shop stock that ships with the content items: [itemKey, price, stock|null].
// Synced by services/content.js with ON CONFLICT DO NOTHING, so staff edits are kept.

export const SHOP_STOCK = {
  mira: [['moon_beans', 14, null]],
  rook: [
    ['soul_ward', 320, null],
    ['hunters_brew', 380, null],
  ],
  selene: [
    ['soul_ward', 300, null],
    ['explorer_cache', 450, 5],
  ],
  borin: [
    ['moonbark_bow', 340, null],
    ['yeti_cloak', 380, null],
  ],
  elder_ka: [
    ['ink_of_ages', 80, null],
    ['void_tonic', 300, null],
  ],
  hrafn: [
    ['grand_potion', 650, null],
    ['rime_crystal', 900, 10],
    ['soul_ward', 300, null],
  ],
  ignia: [
    ['titan_tonic', 800, null],
    ['magma_core', 980, 10],
    ['phoenix_draught', 2000, 3],
  ],
  verdan: [
    ['aegis_tonic', 800, null],
    ['emerald_scale', 1050, 10],
  ],
  cogwin: [
    ['brass_gear', 1100, 10],
    ['void_tonic', 300, null],
    ['soul_ward', 300, null],
  ],
  astra: [
    ['starlight_dust', 3600, 5],
    ['grand_potion', 650, null],
  ],
  nil: [
    ['mirror_shard', 3900, 5],
    ['phoenix_draught', 2000, 3],
  ],
  charon: [
    ['leviathan_bone', 4100, 5],
    ['grand_potion', 650, null],
  ],
  ilun: [
    ['celestial_feather', 9800, 2],
    ['phoenix_draught', 2000, 5],
  ],
  weaver: [
    ['origin_ember', 12000, 2],
    ['phoenix_draught', 2000, null],
  ],
};
