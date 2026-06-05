// import aws from 'aws-sdk';
import { S3Client } from '@aws-sdk/client-s3';
import { Request } from 'express';
import multer from 'multer';
import multers3 from 'multer-s3';
import { env } from '../../config';
import logger from '../logger';
import { formatLog } from '../logger';
const { BUCKET_NAME, SECRET_ACCESS_KEY, ACCESS_KEY_ID } = env;
const s3 = new S3Client({
  credentials: {
    secretAccessKey: SECRET_ACCESS_KEY,
    accessKeyId: ACCESS_KEY_ID,
  },
  region: 'eu-north-1',
});

const validFileTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'text/csv',
  'text/plain',
  'application/pdf',
  'application/mspowerpoint',
  'application/msword',
  'application/excel',
  'audio/mpeg',
  'audio/mp4',
  'audio/mp3',
  'audio/ogg',
  'audio/vnd.wav',
  'audio/wave',
  'video/mp4',
  'video/3gpp',
  'video/quicktime',
  'video/x-ms-wmv',
  'video/x-msvideo',
  'video/x-flv',
];

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (validFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, JPG files are allowed'));
  }
};

const upload = multer({
  fileFilter,
  limits: {
    parts: Infinity,
    fileSize: 1024 * 1024 * 250, //Maximum of 200Mb file size
  },
  storage: multers3({
    // acl: 'public-read',
    s3,
    bucket: BUCKET_NAME,
    contentType: multers3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req: Request, file, cb) {
      try {
        const timestamp = Date.now();
        const fileName = file.originalname.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
        let key = `${timestamp}-${fileName}`;

        //Create sub folders in S3 bucket based on field name and purpose
        if (file.fieldname === 'profileImageUrl' || file.fieldname === 'profilePicture') {
          key = `profile-images/${key}`;
        } else if (file.fieldname === 'images' || file.fieldname === 'image') {
          key = `product-images/${key}`;
        } else if (file.fieldname === 'csv') {
          key = `bulk-uploads/${key}`;
        } else {
          key = `general/${key}`;
        }

        logger.info(formatLog(req, `Saving file ${file.originalname} as ${key} in AWS bucket`));
        cb(null, key);
      } catch (err) {
        cb(new Error('An Error occured while uploading files'));
      }
    },
  }),
});

export default upload;

// export const deleteSingleFileFromS3 = async (filepath: string): Promise<void> => {
//   logger.info(`Deleting file with key "${filepath}"`);

//   const params = { Bucket: BUCKET_NAME, Key: filepath };

//   await s3.deleteObject(params, (err) => {
//     if (err) throw new Error(err.message);
//     else logger.info(`Deleted file with key "${filepath}"`);
//   });
// };

// export const deleteMultipleFiles = async (filepaths: { Key: string }[]): Promise<void> => {
//   logger.info(`Deleting files with filepaths "${JSON.stringify(filepaths)}"`);

//   const params = { Bucket: BUCKET_NAME, Delete: { Objects: filepaths } };

//   await s3.deleteObjects(params, (err) => {
//     if (err) throw new Error(err.message);
//     else logger.info(`Deleted files with filepaths "${JSON.stringify(filepaths)}`);
//   });
// };
