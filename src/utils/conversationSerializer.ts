import { toIdString } from './mongoId';

const pickId = (ref: unknown): string | null => {
  if (!ref) return null;
  try {
    return toIdString(ref);
  } catch {
    return null;
  }
};

const pickProduct = (product: unknown) => {
  if (!product || typeof product !== 'object') return null;
  const p = product as Record<string, unknown>;
  return {
    id: pickId(p),
    name: p.name,
    images: p.images,
    price: p.price,
    quantityAvailable: p.quantityAvailable,
    totalStock: p.totalStock,
    status: p.status,
    slug: p.slug,
  };
};

const pickUser = (user: unknown) => {
  if (!user || typeof user !== 'object') return null;
  const u = user as Record<string, unknown>;
  return {
    id: pickId(u),
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
  };
};

const pickAdmin = (admin: unknown) => {
  if (!admin || typeof admin !== 'object') return null;
  const a = admin as Record<string, unknown>;
  return {
    id: pickId(a),
    firstName: a.firstName,
    lastName: a.lastName,
    email: a.email,
  };
};

const pickSeller = (seller: unknown) => {
  if (!seller || typeof seller !== 'object') return null;
  const s = seller as Record<string, unknown>;
  return {
    id: pickId(s),
    name: s.name,
    logo: s.logo,
    official: s.official,
  };
};

const pickOffer = (offer: unknown) => {
  if (!offer || typeof offer !== 'object') return null;
  const o = offer as Record<string, unknown>;
  return {
    id: pickId(o),
    amount: o.amount,
    finalPrice: o.finalPrice,
    quantity: o.quantity,
    currency: o.currency,
    status: o.status,
    expiresAt: o.expiresAt,
    convertedToCart: o.convertedToCart ?? o.status === 'CONVERTED',
    productId: pickId(o.product),
  };
};

/** Plain JSON-safe conversation (no Mongoose circular graphs). */
export const serializeConversation = (
  doc: Record<string, unknown>,
  extras?: { attachedProducts?: unknown[] }
) => ({
  id: pickId(doc),
  type: doc.type ?? 'PRODUCT',
  status: doc.status ?? 'OPEN',
  product: pickProduct(doc.product),
  contextProduct: pickProduct(doc.contextProduct),
  attachedProducts: (extras?.attachedProducts || [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const prod = r.product ?? r;
      return pickProduct(prod);
    })
    .filter(Boolean),
  buyer: pickUser(doc.buyer),
  admin: pickAdmin(doc.admin),
  seller: pickSeller(doc.seller),
  sellerUser: pickUser(doc.sellerUser),
  activeOffer: pickOffer(doc.activeOffer),
  lastMessage: doc.lastMessage ?? '',
  lastMessageAt: doc.lastMessageAt,
  hasActiveOffer: Boolean(doc.hasActiveOffer),
  unreadByBuyer: doc.unreadByBuyer ?? 0,
  unreadBySeller: doc.unreadBySeller ?? 0,
  unreadByAdmin: doc.unreadByAdmin ?? 0,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});
