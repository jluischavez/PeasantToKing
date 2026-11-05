// Extend this catalog when another stage introduces products. Gold is treasury,
// not a physical product. No unimplemented products are registered here.
export const productCatalog = {
  food: { name: 'Comida', marketSale: true },
  wood: { name: 'Madera', marketSale: false },
} as const;

export type ProductId = keyof typeof productCatalog;
export type ProductFlags = Record<ProductId, boolean>;
export const productIds = Object.keys(productCatalog) as ProductId[];
export const marketProductIds = productIds.filter(product => productCatalog[product].marketSale);
export const productNames = Object.fromEntries(
  productIds.map(product => [product, productCatalog[product].name]),
) as Record<ProductId, string>;

export function isProductId(value: unknown): value is ProductId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(productCatalog, value);
}

export function productFlags(enabled: readonly ProductId[] = productIds): ProductFlags {
  return Object.fromEntries(productIds.map(product => [product, enabled.includes(product)])) as ProductFlags;
}
