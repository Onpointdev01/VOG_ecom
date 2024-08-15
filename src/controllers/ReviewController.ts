// src/controllers/reviewController.ts
import { Request, Response } from 'express';
import { getAllReviews, getReviewById, createReview, updateReview, deleteReview } from '../services/ReviewServices';

export const getReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const reviews = await getAllReviews();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getReview = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const review = await getReviewById(id);
    if (review) {
      res.json(review);
    } else {
      res.status(404).json({ message: 'Review not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const addReview = async (req: Request, res: Response): Promise<void> => {
  const reviewData = req.body;
  try {
    const newReview = await createReview(reviewData);
    res.status(201).json(newReview);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const modifyReview = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updateData = req.body;
  try {
    const updatedReview = await updateReview(id, updateData);
    if (updatedReview) {
      res.json(updatedReview);
    } else {
      res.status(404).json({ message: 'Review not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const removeReview = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const deletedReview = await deleteReview(id);
    if (deletedReview) {
      res.status(204).end();
    } else {
      res.status(404).json({ message: 'Review not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};