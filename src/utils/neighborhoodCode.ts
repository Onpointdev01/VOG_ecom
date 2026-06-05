/** Build a stable lookup code from a quartier display name (e.g. "GOLF MALELA HK" → "GOLF_MALELA_HK"). */
export function neighborhoodCodeFromName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export const DEFAULT_SHIPPING_FEE = 199.99;
