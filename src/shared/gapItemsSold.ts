// shared/gapItemsSold.ts — a new merchant page's `items_sold` (owner, 2026-10-23: "why doesn't our
// merchant page show items sold? I just clicked on a bunch from one vendor and the code doesn't show
// any items (it doesn't have to list price)"). The engine (gaps_stock.rs) serves on the merchant's
// row what it quoted or sold the player, A to Z under each item's catalog page title, with the price
// of its latest quote heard at ally. Never what the player sold to it.
//
// Written as the wiki's merchant pages write it, measured on the cached pages (2026-10-23): 1,321 of
// 1,378 `{{MerchantPage}}` pages open `<ul><li> {{:Item}}`, each item transcluded, one per
// `\n</li><li> `, closed by `\n</li></ul>`; a priced line pads `{{:Item}}` to 40 characters (9,495 of
// the priced lines) before `<span class='ddp'>(5gp 2sp 4cp)</span>`, zero parts left out.
//
// A price stands only at ally (owner, 2026-10-23: "don't show the price since we can't guarantee
// it"): a quote moves with faction standing and with Charisma, which the log never shows, so no
// formula converts one standing's price to another's. Prices are written only when every item has
// an ally quote, and the block then says so (`Prices at Ally.`); otherwise no item carries one.

/** One item the merchant sold, as served: its page title, and its latest price at ally in copper. */
export interface SoldSeen {
  item: string
  copper?: number
}

/** A row's items sold, as the engine serves them; read here rather than typed on `GapRow` (its size bar). */
export const itemsSoldOf = (row: object): SoldSeen[] => (row as { itemsSold?: SoldSeen[] }).itemsSold ?? []

/** `{ itemsSold }` for a row that sold something, else nothing: a page's facts carry no empty list. */
export function itemsSoldField(row: object): { itemsSold?: SoldSeen[] } {
  const sold = itemsSoldOf(row)
  return sold.length === 0 ? {} : { itemsSold: sold }
}

/** `104pp 9gp 9sp 9cp`: the wiki's merchant price, zero parts left out. */
export function ddpCoin(copper: number): string {
  let rest = Math.max(0, Math.round(copper))
  const parts: string[] = []
  for (const [unit, per] of [['pp', 1000], ['gp', 100], ['sp', 10], ['cp', 1]] as const) {
    const n = Math.floor(rest / per)
    rest -= n * per
    if (n > 0) parts.push(`${String(n)}${unit}`)
  }
  return parts.length > 0 ? parts.join(' ') : '0cp'
}

/** The stated standing every written price was heard at: the only one a price is written at. */
export const PRICES_AT = 'Prices at Ally.'

/** The `items_sold` block, or '' for a merchant the log saw sell nothing. */
export function itemsSoldBlock(sold: readonly SoldSeen[]): string {
  if (sold.length === 0) return ''
  const priced = sold.every((s) => s.copper !== undefined)
  const line = (s: SoldSeen): string => {
    const link = `{{:${s.item}}}`
    if (!priced) return link
    return `${link.length >= 40 ? `${link} ` : link.padEnd(40)}<span class='ddp'>(${ddpCoin(s.copper ?? 0)})</span>`
  }
  return `<ul><li> ${sold.map(line).join('\n</li><li> ')}\n</li></ul>${priced ? `\n${PRICES_AT}` : ''}`
}
