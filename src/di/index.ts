export const TYPES = {
  User: Symbol.for('User'),
  Category: Symbol.for('Category'),
  Product: Symbol.for('Product'),
  Review: Symbol.for('Review'),
  Seller: Symbol.for('Seller'),
  Address: Symbol.for('Address'),
  Cart: Symbol.for('Cart'),
  PaymentOption: Symbol.for('PaymentOption'),
  Bid: Symbol.for('Bid'),
  BidMessages: Symbol.for('BidMessages'),

  AuthService: Symbol.for('AuthService'),
  CategoryService: Symbol.for('CategoryService'),
  ProductService: Symbol.for('ProductService'),
  ReviewService: Symbol.for('ReviewServices'),
  UserService: Symbol.for('UserService'),
  AddressService: Symbol.for('AddressService'),
  CartService: Symbol.for('CartService'),
  PaymentOptionService: Symbol.for('PaymentOptionService'),
  ProductBidService: Symbol.for('ProductBidService'),

  RequireSignIn: Symbol.for('RequireSignIn'),
  RequireSeller: Symbol.for('RequireSeller'),
  OptionalAuth: Symbol.for('OptionalAuth'),
};
export default TYPES;
