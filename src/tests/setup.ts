import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/vog_ecom_test';

// Mock console methods in tests (optional - only if needed)
// Uncomment if you want to suppress console output in tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

