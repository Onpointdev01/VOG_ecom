import { inject } from 'inversify';
import {
  controller,
  httpPost,
  httpGet,
  httpPut,
  httpDelete,
  requestParam,
  requestBody,
  response,
  request,
} from 'inversify-express-utils';
import { Request, Response } from 'express';

import { BaseController } from './BaseController';
import TYPES from '../di';
import { IReviewService } from '../services';
import { IReview } from '../models';

@controller('/api/v1/reviews')
export class ReviewController extends BaseController {
  constructor(@inject(TYPES.ReviewService) private reviewService: IReviewService) {
    super();
  }

  @httpPost('/', TYPES.RequireSignIn)
  async createReview(
    @request() req: Request,
    @response() res: Response,
    @requestBody() payload: Partial<IReview>
  ) {
    // Extract user ID from authenticated request (res.locals.user is set by RequireSignIn middleware)
    const authenticatedUserId = res.locals.user || req.user?._id?.toString();

    // Always use authenticated user ID to prevent users from submitting reviews on behalf of others
    const reviewPayload = {
      ...payload,
      user: authenticatedUserId,
    };

    const newReview = await this.reviewService.createReview(reviewPayload);
    return this.sendResponse(res, 201, 'Review created successfully', newReview);
  }

  @httpGet('/:id')
  async getReviewById(@response() res: Response, @requestParam('id') id: string) {
    const review = await this.reviewService.getReviewById(id);
    return this.sendResponse(res, 200, 'Review retrieved successfully', review);
  }

  @httpGet('/')
  async getAllReviews(@response() res: Response) {
    const reviews = await this.reviewService.getAllReviews();
    return this.sendResponse(res, 200, 'Reviews retrieved successfully', reviews);
  }

  @httpPut('/:id')
  async updateReview(
    @response() res: Response,
    @requestParam('id') id: string,
    @requestBody() payload: Partial<IReview>
  ) {
    const updatedReview = await this.reviewService.updateReview(id, payload);
    return this.sendResponse(res, 200, 'Review updated successfully', updatedReview);
  }

  @httpDelete('/:id')
  async deleteReview(@response() res: Response, @requestParam('id') id: string) {
    await this.reviewService.deleteReview(id);
    return this.sendResponse(res, 204, 'Review deleted successfully');
  }

  @httpGet('/product/:productId')
  async getReviewsByProduct(@response() res: Response, @requestParam('productId') productId: string) {
    const reviews = await this.reviewService.getReviewsByProduct(productId);
    return this.sendResponse(res, 200, 'Reviews retrieved successfully', reviews);
  }
}
