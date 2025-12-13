import { injectable } from 'inversify';

export interface ITranslationService {
  translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  translateBatch(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<string[]>;
}

/**
 * Translation Service - Stub implementation
 * Returns original text without external API calls
 * Translation should be handled at the database level or via frontend i18n
 */
@injectable()
export class TranslationService implements ITranslationService {
  /**
   * Translate a single text
   * @param text - Text to translate
   * @param targetLanguage - Target language code (e.g., 'fr', 'en')
   * @param sourceLanguage - Source language code (optional)
   * @returns Original text (no translation performed)
   */
  async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    // Return original text - translation should be handled at database level or via frontend i18n
    return text;
  }

  /**
   * Translate multiple texts in batch
   * @param texts - Array of texts to translate
   * @param targetLanguage - Target language code (e.g., 'fr', 'en')
   * @param sourceLanguage - Source language code (optional)
   * @returns Original texts array (no translation performed)
   */
  async translateBatch(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<string[]> {
    // Return original texts - translation should be handled at database level or via frontend i18n
    return texts;
  }
}

