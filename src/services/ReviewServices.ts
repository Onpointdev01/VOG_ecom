// src/services/ReviewService.ts
import { IReview, Review } from '../models/Review';

// Get all reviews
export const getAllReviews = async (): Promise<IReview[]> => {
  return Review.find().populate('product').populate('user').exec();
};

// Get a review by ID
export const getReviewById = async (id: string): Promise<IReview | null> => {
  return Review.findById(id).populate('product').populate('user').exec();
};

// Create a new review
export const createReview = async (reviewData: Omit<IReview, '_id' | 'reviewDate'>): Promise<IReview> => {
  const review = new Review(reviewData);
  return review.save();
};

// Update a review
export const updateReview = async (id: string, updateData: Partial<Omit<IReview, '_id' | 'reviewDate'>>): Promise<IReview | null> => {
  return Review.findByIdAndUpdate(id, updateData, { new: true }).populate('product').populate('user').exec();
};

// Delete a review
export const deleteReview = async (id: string): Promise<IReview | null> => {
  return Review.findByIdAndDelete(id).populate('product').populate('user').exec();
};