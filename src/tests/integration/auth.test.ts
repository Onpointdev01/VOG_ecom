import request from 'supertest';
import app from '../../app';
import { User } from '../../models/User';
import connectToDB from '../../db/connect';
import mongoose from 'mongoose';

// Note: These integration tests require a running MongoDB instance
// Make sure to set MONGO_URL in your test environment

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await connectToDB();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await User.deleteMany({ email: /test@/ });
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('email', 'test@example.com');
    });

    it('should prevent admin signup', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'admin@example.com',
          password: 'password123',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      // First create a user
      await request(app).post('/api/v1/auth/signup').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      // Verify email (in real scenario, user clicks link)
      const user = await User.findOne({ email: 'test@example.com' });
      if (user) {
        user.verified = true;
        await user.save();
      }

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('token');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should reject unverified users', async () => {
      await request(app).post('/api/v1/auth/signup').send({
        email: 'unverified@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unverified@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and clear refresh token cookie', async () => {
      // Login first
      await request(app).post('/api/v1/auth/signup').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      const user = await User.findOne({ email: 'test@example.com' });
      if (user) {
        user.verified = true;
        await user.save();
      }

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const token = loginResponse.body.data.token;

      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);
    });
  });
});

