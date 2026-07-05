import { CHARACTERS, ITEMS, WEAPONS } from "@patchwork/content";
import type { PlayerView, ShopOfferView } from "@patchwork/protocol";

interface ItemModifiers {
  maxHp?: number;
  damageMult?: number;
  attackSpeedMult?: number;
  moveSpeed?: number;
  pickupRadius?: number;
  repairSpeed?: number;
}

export interface PurchaseSnapshot {
  coins: number;
  weaponIds: readonly string[];
}

interface WeaponPriceDef {
  shopPrice?: number;
}

const WEAPON_CAP = 4;

export function itemModifiersText(modifiers: ItemModifiers): string {
  const parts: string[] = [];
  appendFlat(parts, modifiers.maxHp, "Max HP");
  appendPercent(parts, modifiers.damageMult, "Damage");
  appendPercent(parts, modifiers.attackSpeedMult, "Attack Speed");
  appendFlat(parts, modifiers.moveSpeed, "Move Speed");
  appendFlat(parts, modifiers.pickupRadius, "Pickup Range");
  appendFlat(parts, modifiers.repairSpeed, "Repair Speed");
  return parts.length > 0 ? parts.join(" · ") : "No stat change";
}

export function weaponStatLine(def: (typeof WEAPONS)[keyof typeof WEAPONS]): string {
  return `DMG ${formatNumber(def.damage)} · every ${formatNumber(def.cooldownS)}s · range ${formatNumber(def.rangeTiles)}`;
}

export function weaponStackText(weaponIds: readonly string[]): string {
  if (weaponIds.length === 0) {
    return `Weapons 0/${WEAPON_CAP}: None`;
  }

  const counts = new Map<string, number>();
  for (const id of weaponIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const weapons = [...counts.entries()]
    .map(([id, count]) => `${WEAPONS[id as keyof typeof WEAPONS]?.name ?? id} x${count}`)
    .join(", ");
  return `Weapons ${weaponIds.length}/${WEAPON_CAP}: ${weapons}`;
}

export function sellRefund(
  defId: string,
  registry: Record<string, WeaponPriceDef | undefined>
): number | undefined {
  const price = registry[defId]?.shopPrice;
  return typeof price === "number" ? Math.floor(price / 2) : undefined;
}

export function characterLabel(characterId: PlayerView["characterId"]): string {
  if (characterId === undefined || characterId === null) {
    return "Unpicked";
  }

  return CHARACTERS[characterId as keyof typeof CHARACTERS]?.name ?? characterId;
}

export function ownedItemText(player: PlayerView | undefined): string {
  const itemIds = optionalItemIds(player);
  if (itemIds === undefined) {
    return "Items not shown yet";
  }

  if (itemIds.length === 0) {
    return "Items 0";
  }

  const counts = new Map<string, number>();
  for (const id of itemIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const itemText = [...counts.entries()]
    .map(([id, count]) => `${ITEMS[id as keyof typeof ITEMS]?.name ?? id} x${count}`)
    .join(", ");
  return `Items ${itemIds.length}: ${itemText}`;
}

export function playerStatText(player: PlayerView | undefined): string {
  if (player === undefined) {
    return "HP --";
  }

  const hp = `HP ${Math.max(0, Math.ceil(player.hp))}/${Math.ceil(player.maxHp)}`;
  const stats = player.stats;
  if (stats === undefined) {
    return hp;
  }

  return `${hp} · Damage ${Math.round(stats.damageDealt)} · Repairs ${Math.round(stats.tilesRepaired)}`;
}

export function purchaseSnapshot(player: PlayerView | undefined): PurchaseSnapshot | undefined {
  if (player === undefined) {
    return undefined;
  }

  return {
    coins: player.coins ?? 0,
    weaponIds: [...player.weaponIds]
  };
}

export function purchaseToastText(
  previous: PurchaseSnapshot | undefined,
  current: PurchaseSnapshot | undefined,
  previousOffers: readonly ShopOfferView[]
): string | undefined {
  if (previous === undefined || current === undefined) {
    return undefined;
  }

  const addedWeapon = firstAddedWeapon(previous.weaponIds, current.weaponIds);
  if (addedWeapon !== undefined) {
    const def = WEAPONS[addedWeapon as keyof typeof WEAPONS];
    return def === undefined ? `Bought ${addedWeapon}` : `Bought ${def.name} - ${weaponStatLine(def)}`;
  }

  const coinDelta = previous.coins - current.coins;
  if (coinDelta <= 0) {
    return undefined;
  }

  const itemOffer = previousOffers.find(
    (offer): offer is Extract<ShopOfferView, { kind: "item" }> =>
      offer.kind === "item" && offer.price === coinDelta
  );
  if (itemOffer !== undefined) {
    const item = ITEMS[itemOffer.defId as keyof typeof ITEMS];
    return item === undefined
      ? `Bought ${itemOffer.defId}`
      : `Bought ${item.name} - ${itemModifiersText(item.modifiers)}`;
  }

  return "Bought upgrade";
}

function firstAddedWeapon(
  previousIds: readonly string[],
  currentIds: readonly string[]
): string | undefined {
  const previousCounts = new Map<string, number>();
  for (const id of previousIds) {
    previousCounts.set(id, (previousCounts.get(id) ?? 0) + 1);
  }

  for (const id of currentIds) {
    const previousCount = previousCounts.get(id) ?? 0;
    if (previousCount === 0) {
      return id;
    }
    previousCounts.set(id, previousCount - 1);
  }

  return undefined;
}

function appendPercent(parts: string[], value: number | undefined, label: string): void {
  if (value === undefined || value === 0) {
    return;
  }

  parts.push(`${signed(Math.round(value * 100))}% ${label}`);
}

function appendFlat(parts: string[], value: number | undefined, label: string): void {
  if (value === undefined || value === 0) {
    return;
  }

  parts.push(`${signed(formatNumber(value))} ${label}`);
}

function signed(value: number | string): string {
  const text = String(value);
  return text.startsWith("-") ? text : `+${text}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function optionalItemIds(player: PlayerView | undefined): readonly string[] | undefined {
  if (player === undefined || !("itemIds" in player)) {
    return undefined;
  }

  const value = (player as PlayerView & { itemIds?: unknown }).itemIds;
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}
