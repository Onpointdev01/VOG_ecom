import crypto from 'crypto';

export const generateCode = (n: number) => {
  let code = '';

  for (let i = 0; i < n; i++) {
    code += String(Math.floor(Math.random() * 10));
  }

  return code;
};

export const generateReference = () => {
  const reference = crypto.randomBytes(32).toString('hex');
  return reference;
};
