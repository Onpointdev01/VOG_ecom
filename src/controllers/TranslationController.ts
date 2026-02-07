/* eslint-disable @typescript-eslint/no-explicit-any */
import { controller, httpPost, requestBody, response } from 'inversify-express-utils';
import { Response } from 'express';
import { inject } from 'inversify';
import TYPES from '../di';
import { BaseController } from './BaseController';
import { ITranslationService } from '../services/TranslationService';

@controller('/api/v1/translate')
export class TranslationController extends BaseController {
  constructor(
    @inject(TYPES.TranslationService) private translationService: ITranslationService
  ) {
    super();
  }

  @httpPost('/')
  async translate(@response() res: Response, @requestBody() body: { text: string | string[]; targetLanguage: string; sourceLanguage?: string }) {
    try {
      const { text, targetLanguage, sourceLanguage } = body;

      if (!text) {
        return this.sendResponse(res, 400, 'Text is required');
      }

      if (!targetLanguage) {
        return this.sendResponse(res, 400, 'Target language is required');
      }

      let result: string | string[];

      if (Array.isArray(text)) {
        result = await this.translationService.translateBatch(text, targetLanguage, sourceLanguage);
      } else {
        result = await this.translationService.translateText(text, targetLanguage, sourceLanguage);
      }

      return this.sendResponse(res, 200, 'Translation successful', { translation: result });
    } catch (error: any) {
      return this.sendResponse(res, 500, error.message || 'Translation failed');
    }
  }
}

