import { injectable } from 'inversify';
import { Model } from 'mongoose';
import validator from 'validator';
import AppError from '../utils/errors/AppError';

@injectable()
export abstract class BaseService {
  async verifyDoc<T>(id: string, model: Model<T>, ...populate: string[]): Promise<T> {
    if (!validator.isMongoId(id)) throw new AppError('invalid id provided', 400);
    let query: any = model.findById(id);
    for (const field of populate) {
      query = query.populate(field);
    }
    const doc = await query;
    if (!doc) throw new AppError(`${model.name} not found`, 404);
    return doc;
  }
}
