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
