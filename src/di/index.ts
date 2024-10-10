export const TYPES = {
  User: Symbol.for('User'),
  Category: Symbol.for('Category'),
  Product: Symbol.for('Product'),
  Review: Symbol.for('Review'),
  Seller: Symbol.for('Seller'),
  Address: Symbol.for('Address'),
  Cart: Symbol.for('Cart'),
  PaymentOption: Symbol.for('PaymentOption'),

  AuthService: Symbol.for('AuthService'),
  CategoryService: Symbol.for('CategoryService'),
  ProductService: Symbol.for('ProductService'),
  ReviewService: Symbol.for('ReviewServices'),
  UserService: Symbol.for('UserService'),
  AddressService: Symbol.for('AddressService'),
  CartService: Symbol.for('CartService'),
  PaymentOptionService: Symbol.for('PaymentOptionService'),

  RequireSignIn: Symbol.for('RequireSignIn'),
  RequireSeller: Symbol.for('RequireSeller'),
};
export default TYPES;
