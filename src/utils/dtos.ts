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
