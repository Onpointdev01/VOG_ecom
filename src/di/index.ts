export const TYPES = {
  User: Symbol.for('User'),
  Category: Symbol.for('Category'),
  Product: Symbol.for('Product'),
  Review: Symbol.for('Review'),
  Seller: Symbol.for('Seller'),
  Address: Symbol.for('Address'),

  AuthService: Symbol.for('AuthService'),
  CategoryService: Symbol.for('CategoryService'),
  ProductService: Symbol.for('ProductService'),
  ReviewService: Symbol.for('ReviewServices'),
  UserService: Symbol.for('UserService'),
  AddressService: Symbol.for('AddressService'),

  RequireSignIn: Symbol.for('RequireSignIn'),
  RequireSeller: Symbol.for('RequireSeller'),
};
export default TYPES;
