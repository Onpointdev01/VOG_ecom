import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application, Request, Response } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VOG E-commerce API',
      version: '1.0.0',
      description: 'API documentation for VOG E-commerce platform with bidding, payouts, and real-time notifications',
      contact: {
        name: 'API Support',
        email: 'support@vog.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'https://dev.st-cael.org',
        description: 'Development server',
      },
      {
        url: 'https://api.vog.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['user', 'seller', 'admin'] },
            verified: { type: 'boolean' },
          },
        },
        Bid: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            product: { type: 'string' },
            buyer: { type: 'string' },
            seller: { type: 'string' },
            bidPrice: { type: 'number' },
            status: {
              type: 'string',
              enum: ['open', 'countered', 'ACCEPTED', 'REJECTED', 'expired', 'CANCELLED'],
            },
          },
        },
        Payout: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            seller_id: { type: 'string' },
            order_id: { type: 'string' },
            amount_paid: { type: 'number' },
            payout_date: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['PENDING', 'PROCESSED', 'FAILED'] },
          },
        },
        Error: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/controllers/**/*.ts', './src/routes/**/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'VOG E-commerce API Documentation',
  }));

  // JSON endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

export default swaggerSpec;

