export interface LoginDTO {
  email: string;
  password: string;
  type?: 'user' | 'seller' | 'admin'; // Optional: specify login type for access control
}

export interface SignUpUserDTO extends LoginDTO {
  firstName: string;
  lastName: string;
  nationality: string;
  phoneNumber: string;
  currentLocation: string;
  role?: 'user' | 'seller'; // Optional, defaults to 'user', cannot be 'admin'
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

export interface firebaseSocialLoginDTO {
  firebaseIdToken: string;
  providerHint?: 'google' | 'apple';
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
  isRecommended?: string | boolean;
  category?: string;
  search?: string;
  q?: string; // Frontend parameter (alias for search)
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minPrice?: string;
  maxPrice?: string;
  condition?: string;
  brand?: string;
  page?: string;
  limit?: string;
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

export interface UpdateCartItemDTO {
  quantity?: number;
  sku?: string; // SKU for variable products (preferred method)
  size?: string; // Fallback for backward compatibility
  color?: string; // Fallback for backward compatibility
}

export interface AddToCartDTO {
  user: string;
  productId: string;
  quantity: number;
  sku?: string; // SKU for variable products (preferred method)
  size?: string; // Fallback for backward compatibility
  color?: string; // Fallback for backward compatibility
  variantId?: string; // For variable products (alternative method)
}

export interface CartItemResponse {
  id: string;
  product: {
    id: string;
    name: string;
    images: string[];
    price: number;
  };
  quantity: number;
  size: string;
  color: string;
  price: number;
  bidId?: string;
  isPending?: boolean; // Indicates if item is in a pending order
}

export interface CartResponse {
  id: string;
  user: string;
  items: CartItemResponse[];
  totalPrice: number;
  updatedAt: Date;
}

//modify cart response
export interface CartItemUpdateDTO {
  quantity: number;
  price: number;
  totalPrice?: number; // Optional: if you want to include cart total
}

//payment
export interface CreatePaymentOptionDTO {
  name: string;
  code: 'MPESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
  logoUrl?: string;
  isEnabled?: boolean;
  processingFee?: number;
}

export interface UpdatePaymentOptionDTO {
  name?: string;
  code?: 'MPESA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY';
  logoUrl?: string;
  isEnabled?: boolean;
  processingFee?: number;
}

//bid
export interface AddBidDTO {
  userId: string;
  productId: string;
  bidPrice: number;
}

export interface BidResponseDTO {
  id: string;
  user: string;
  product: string;
  bidPrice: number;
  status: string;
  expiresAt: Date;
}
