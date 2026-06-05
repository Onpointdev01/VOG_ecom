/** Order statuses hidden from buyer/seller/admin order lists. */
export const HIDDEN_CANCELLED_ORDER_STATUSES = [
  'CANCELLED',
  'CANCELLED_BY_BUYER',
] as const;

const hiddenCancelledSet = new Set<string>(HIDDEN_CANCELLED_ORDER_STATUSES);

export const excludeCancelledOrdersClause = {
  orderStatus: { $nin: [...HIDDEN_CANCELLED_ORDER_STATUSES] },
};

/**
 * Merges list filters with exclusion of cancelled orders.
 * Cancelled orders remain in DB but never appear in list endpoints.
 */
export function applyExcludeCancelledFromOrderList(
  filters: Record<string, unknown> = {}
): Record<string, unknown> {
  const status = filters.orderStatus;
  if (typeof status === 'string' && hiddenCancelledSet.has(status)) {
    return { _id: { $exists: false } };
  }

  if (Object.keys(filters).length === 0) {
    return { ...excludeCancelledOrdersClause };
  }

  return {
    $and: [filters, excludeCancelledOrdersClause],
  };
}
