import mongoose from 'mongoose';

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;

/** True for 24-char hex strings and BSON ObjectId instances. */
export function isValidMongoId(value: unknown): value is string {
  if (value == null) return false;
  if (typeof value === 'string') {
    return OBJECT_ID_HEX.test(value);
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return true;
  }
  if (Buffer.isBuffer(value) && value.length === 12) {
    return true;
  }
  return mongoose.isValidObjectId(value);
}

function bufferToHexId(buf: Buffer): string {
  return new mongoose.Types.ObjectId(buf).toHexString();
}

/**
 * Resolve MongoDB ObjectIds / populated docs to strings.
 * Uses a visit set so circular _id/id chains cannot blow the stack (seen on conversation routes).
 */
export function toIdString(value: unknown, visited: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) {
    throw new Error('Missing document id');
  }

  if (typeof value === 'string') {
    if (!OBJECT_ID_HEX.test(value)) {
      throw new Error(`Invalid document id: ${value}`);
    }
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toHexString();
  }

  if (Buffer.isBuffer(value)) {
    if (value.length !== 12) {
      throw new Error('Invalid document id buffer length');
    }
    return bufferToHexId(value);
  }

  if (typeof value !== 'object') {
    throw new Error('Invalid document id type');
  }

  if (visited.has(value)) {
    throw new Error('Circular reference while resolving document id');
  }
  visited.add(value);

  const obj = value as { _id?: unknown; id?: unknown; toString?: () => string };

  if (obj._id != null && obj._id !== value) {
    return toIdString(obj._id, visited);
  }

  if (obj.id != null && obj.id !== value) {
    return toIdString(obj.id, visited);
  }

  if (typeof obj.toString === 'function') {
    const serialized = obj.toString();
    if (serialized && serialized !== '[object Object]' && OBJECT_ID_HEX.test(serialized)) {
      return serialized;
    }
  }

  throw new Error('Could not resolve document id');
}
