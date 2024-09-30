import { Schema } from 'mongoose';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface SignUpUserDTO extends LoginDTO {
  firstName: string;
  lastName: string;
  nationality: string;
  phoneNumber: string;
  currentLocation: string;
}

export interface SignUpSellerDTO {
  user: string;
  type: string;
  name: string;
  logo: string;
  official: boolean;
}
export interface ResetPasswordDTO {
  email: string;
  code: string;
  password: string;
}

export interface VerifyEmailDTO {
  email: string;
  code: string;
}

export interface EmailCheckResult {
  isValid: boolean;
  isAvailable: boolean;
  message: string;
}

export interface socialLoginDTO {
  idToken: string;
  provider: string;
}

export interface createProductDTO {
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  brand: string;
  condition: string;
  sizes: string[];
  color: string;
  quantityAvailable: number;
  owner: string;
  images: string[];
}

export interface createReviewDTO {
  user: string;
  reviewType: string;
  rating: number;
  comment: string;
  product: string;
  seller: string;
}
export interface getAllProductsResponse {
  product: {
    name: string;
    description: string;
    price: number;
    originalPrice: number;
    images: string[];
  };
  description: {
    brand: string;
    condition: string;
    sizes: string[];
    color: string;
    quantityAvailable: number;
  };
  seller: {
    name: string;
    rating: number;
    logo: string;
    official: boolean;
  };
}

export interface getAllProductsQuery {
  isFlash?: string | boolean;
  category?: string;
  search?: string;
}

export interface addressDTO {
  id?: string;
  user?: string;
  fullName?: string;
  phoneNumber?: string;
  homeAddress?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
}

export interface updateCartItemDTO {
  quantity: number;
}

export interface addToCartDTO {
  user: string;
  productId: string;
  quantity: number;
  bidId?: string;
}

export interface cartItemResponse {
  // _id: Schema.Types.ObjectId;
  product: {
    // _id: Schema.Types.ObjectId;
    name: string;
    images: string[];
    price: number;
  };
  quantity: number;
  price: number;
  isBidItem: boolean;
  bid?: Schema.Types.ObjectId;
}

export interface cartResponse {
  _id: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
  items: cartItemResponse[];
  totalAmount: number;
}
