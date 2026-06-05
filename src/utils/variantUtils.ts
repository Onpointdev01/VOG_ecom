/**
 * Helpers for size/color variant configuration and combination generation.
 */

export interface VariantConfigInput {
  hasSizes?: boolean;
  hasColors?: boolean;
  sizes?: string[];
  colors?: string[];
}

export interface VariantCombinationInput {
  size?: string;
  color?: string;
  price: number;
  originalPrice?: number;
  quantityAvailable: number;
  sku?: string;
  images?: string[];
  id?: string;
}

export function normalizeStringList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function buildVariantCombinations(config: VariantConfigInput): Array<{ size?: string; color?: string }> {
  const hasSizes = Boolean(config.hasSizes);
  const hasColors = Boolean(config.hasColors);
  const sizes = hasSizes ? normalizeStringList(config.sizes) : [];
  const colors = hasColors ? normalizeStringList(config.colors) : [];

  if (!hasSizes && !hasColors) {
    return [{}];
  }

  if (hasSizes && !hasColors) {
    return sizes.map((size) => ({ size }));
  }

  if (!hasSizes && hasColors) {
    return colors.map((color) => ({ color }));
  }

  const combos: Array<{ size?: string; color?: string }> = [];
  for (const size of sizes) {
    for (const color of colors) {
      combos.push({ size, color });
    }
  }
  return combos;
}

export function variantIdentityKey(size?: string, color?: string): string {
  return `${(size || '').trim().toLowerCase()}::${(color || '').trim().toLowerCase()}`;
}

export function mergeVariantRowsWithConfig(
  config: VariantConfigInput,
  rows: VariantCombinationInput[],
  basePrice: number,
  baseOriginalPrice?: number
): VariantCombinationInput[] {
  const combos = buildVariantCombinations(config);
  const rowMap = new Map<string, VariantCombinationInput>();

  for (const row of rows || []) {
    rowMap.set(variantIdentityKey(row.size, row.color), row);
  }

  return combos.map((combo) => {
    const key = variantIdentityKey(combo.size, combo.color);
    const existing = rowMap.get(key);
    const price = existing?.price ?? basePrice;
    const originalPrice = existing?.originalPrice ?? baseOriginalPrice ?? price;

    return {
      ...combo,
      ...existing,
      size: combo.size,
      color: combo.color,
      price: Number(price) >= 0 ? Number(price) : 0,
      originalPrice: Number(originalPrice) >= 0 ? Number(originalPrice) : price,
      quantityAvailable: Math.max(0, Number(existing?.quantityAvailable ?? 0)),
    };
  });
}
