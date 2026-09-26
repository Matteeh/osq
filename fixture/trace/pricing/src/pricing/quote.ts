/** Percentage codes, as whole percentages. */
export const CODES: Readonly<Record<string, number>> = {
  SAVE10: 10,
};

/** One quote, every amount an integer number of cents. */
export interface Quote {
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
}

/** Round half up to a whole number of cents. */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** The unit price in cents for a quantity's tier. */
function tierPrice(quantity: number): number {
  if (quantity >= 500) return 800;
  if (quantity >= 100) return 900;
  return 1000;
}

/**
 * Price one quote, in integer cents.
 *
 * @scenario pricing: Volume discount tiers
 * @scenario pricing: A percentage code comes off the tiered subtotal
 * @adr 001
 */
export function quote(quantity: number, code?: string): Quote {
  const unitPrice = tierPrice(quantity);
  const subtotal = quantity * unitPrice;
  const percent = code === undefined ? 0 : (CODES[code] ?? 0);
  const discount = roundHalfUp((subtotal * percent) / 100);
  return { unitPrice, subtotal, discount, total: subtotal - discount };
}
