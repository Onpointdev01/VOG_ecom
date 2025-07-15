class AppError extends Error {
  statusCode: number = 500;
  code?: string;
  errors?: any;
  isOperational: boolean = true;

  constructor(
    message: string, 
    statusCode: number = 500, 
    code?: string, 
    errors?: any
  ) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }

  static fromMongoError(err: any): AppError {
    // Handle MongoDB duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field];
      return new AppError(
        `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`,
        400,
        'DUPLICATE_KEY',
        { [field]: `${field} must be unique` }
      );
    }

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const errors: any = {};
      Object.keys(err.errors).forEach(key => {
        const errorObj = err.errors[key] as any;
        if (errorObj.kind === 'required') {
          errors[key] = `${key} is required`;
        } else if (errorObj.kind === 'enum') {
          const enumValues = errorObj.properties?.enumValues || [];
          errors[key] = `${key} must be one of: ${enumValues.join(', ')}`;
        } else if (errorObj.kind === 'minlength') {
          const minLength = errorObj.properties?.minlength || 0;
          errors[key] = `${key} must be at least ${minLength} characters`;
        } else if (errorObj.kind === 'maxlength') {
          const maxLength = errorObj.properties?.maxlength || 0;
          errors[key] = `${key} cannot exceed ${maxLength} characters`;
        } else if (errorObj.kind === 'min') {
          const min = errorObj.properties?.min || 0;
          errors[key] = `${key} must be at least ${min}`;
        } else if (errorObj.kind === 'max') {
          const max = errorObj.properties?.max || 0;
          errors[key] = `${key} cannot exceed ${max}`;
        } else {
          errors[key] = errorObj.message || `${key} is invalid`;
        }
      });
      
      return new AppError(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        errors
      );
    }

    // Handle Mongoose cast errors
    if (err.name === 'CastError') {
      return new AppError(
        `Invalid ${err.path} format`,
        400,
        'CAST_ERROR',
        { [err.path]: `${err.path} is not valid` }
      );
    }

    // Default error
    return new AppError(err.message || 'Internal server error', 500);
  }
}

export default AppError;
