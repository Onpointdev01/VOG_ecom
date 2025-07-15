/**
 * Utility functions for consistent id transformation across the application
 */

/**
 * Transform a Mongoose document or object to use 'id' instead of '_id'
 * @param doc - The document or object to transform
 * @returns The transformed object with 'id' field
 */
export const transformId = (doc: any): any => {
  if (!doc) return doc;

  // Handle arrays
  if (Array.isArray(doc)) {
    return doc.map((item) => transformId(item));
  }

  // Handle objects
  if (typeof doc === 'object' && doc !== null) {
    const transformed = { ...doc };

    if (transformed._id) {
      transformed.id = transformed._id.toString();
      delete transformed._id;
    }

    // Remove __v field if present
    if (transformed.__v !== undefined) {
      delete transformed.__v;
    }

    return transformed;
  }

  return doc;
};

/**
 * Transform multiple documents to use 'id' instead of '_id'
 * @param docs - Array of documents to transform
 * @returns Array of transformed documents
 */
export const transformIds = (docs: any[]): any[] => {
  if (!Array.isArray(docs)) return docs;
  return docs.map((doc) => transformId(doc));
};

/**
 * Standard toJSON transform function for Mongoose schemas
 * This can be used in schema definitions to automatically transform _id to id
 */
export const standardJsonTransform = (doc: any, ret: any) => {
  ret.id = ret._id.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
};
