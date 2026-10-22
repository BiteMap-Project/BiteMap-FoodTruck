import type { MenuImagePreset } from "../../types/api";

export const menuImagePresets: { value: MenuImagePreset; label: string; icon: string }[] = [
  { value: "GENERIC", label: "Generic plate", icon: "🍽️" },
  { value: "DRINK", label: "Drink", icon: "🥤" },
  { value: "TACO", label: "Taco", icon: "🌮" },
  { value: "INDIAN", label: "Indian platter", icon: "🍛" },
  { value: "DESSERT", label: "Dessert", icon: "🍨" },
];

export function presetArtwork(preset?: MenuImagePreset) {
  return menuImagePresets.find(option => option.value === preset) ?? menuImagePresets[0];
}
