import { Category } from '../../models/newCategory';

/**
 * Migration to update category slug index to be sparse
 * Run this once to fix existing database
 */
export const updateCategorySlugIndex = async () => {
  try {
    // Drop existing index
    await Category.collection.dropIndex('slug_1');
    console.log('Dropped existing slug index');
    
    // Create new sparse index
    await Category.collection.createIndex({ slug: 1 }, { unique: true, sparse: true });
    console.log('Created new sparse slug index');
    
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
};