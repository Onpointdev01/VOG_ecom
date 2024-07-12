import dotenv from 'dotenv';
dotenv.config();
import Joi from 'joi';

const requiredString = Joi.string().required();

const schema = {
  NODE_ENV: requiredString.default('development'),
  MONGO_URL: requiredString,
};

const envSchema = Joi.object(schema);

export interface Env {
  NODE_ENV: string;
  MONGO_URL: string;
}

const tenv: any = {};
for (const key in schema) {
  tenv[key] = process.env[key];
}

function loadEnv() {
  const { error } = envSchema.validate(tenv);

  //return error if the error object contains details
  if (error !== null && error?.details) {
    const { details }: Joi.ValidationError = error;
    const message = details.map((err: Joi.ValidationErrorItem) => err.message).join(',');

    throw new Error(message);
  }
}

loadEnv();

export const env = tenv as Env;
