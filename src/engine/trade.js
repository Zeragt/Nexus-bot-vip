/**
 * Trade offer helpers. Offers are { nx: number, items: { [itemId]: qty } }.
 */

export const emptyOffer = () => ({ nx: 0, items: {} });

export function setOfferItem(offer, itemId, qty) {
  const next = { nx: offer.nx, items: { ...offer.items } };
  if (qty <= 0) delete next.items[itemId];
  else next.items[itemId] = qty;
  return next;
}

export function setOfferNx(offer, nx) {
  return { nx: Math.max(0, Math.floor(nx)), items: { ...offer.items } };
}

export function isEmptyOffer(offer) {
  return offer.nx === 0 && Object.keys(offer.items).length === 0;
}

/**
 * Checks an offer against what the owner actually has. Called both when the offer is
 * edited and again inside the final transaction (after row locks) so nothing can be
 * duplicated by spending it elsewhere between those moments.
 */
export function validateOffer(offer, { nx, inventory, tradeable }) {
  const problems = [];
  if (!Number.isInteger(offer.nx) || offer.nx < 0) problems.push('مبلغ غير صالح');
  if (offer.nx > nx) problems.push('رصيد NX غير كافٍ');
  for (const [itemId, qty] of Object.entries(offer.items)) {
    if (!Number.isInteger(qty) || qty <= 0) problems.push('كمية غير صالحة');
    else if ((inventory[itemId] ?? 0) < qty) problems.push('لا تملك الكمية المعروضة من أحد الأغراض');
    if (tradeable && tradeable[itemId] === false) problems.push('أحد الأغراض غير قابل للتداول');
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

export function offerCount(offer) {
  return Object.keys(offer.items).length;
}
