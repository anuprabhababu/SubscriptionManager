export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function priceInvoice({ unitPrice, quantity, taxRate }) {
  const subtotal = roundMoney(unitPrice * quantity);
  const taxAmount = roundMoney(subtotal * taxRate / 100);
  return { subtotal, taxAmount, total: roundMoney(subtotal + taxAmount) };
}
