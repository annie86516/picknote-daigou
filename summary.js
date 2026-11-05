export function summarizeBuyers(items) {
  const buyers = new Map();
  for (const item of items) {
    const name = item.buyer.trim();
    let row = buyers.get(name);
    if (!row) {
      row = { name, total: 0, purchased: 0, pending: 0, missing: 0 };
      buyers.set(name, row);
    }
    if (!item.done) {
      row.pending += 1;
      continue;
    }
    row.purchased += 1;
    if (Number.isSafeInteger(item.actualAmount) && item.actualAmount >= 0) {
      row.total += item.actualAmount;
    } else {
      row.missing += 1;
    }
  }
  return [...buyers.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}
