/**
 * Voice transcription using Groq's Whisper API.
 * Compatible with OpenAI's API format — just a different base URL.
 */
import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';
import { readEnvFile } from './env.js';

const envConfig = readEnvFile(['GROQ_API_KEY']);

const GROQ_API_KEY = process.env.GROQ_API_KEY || envConfig.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const WHISPER_MODEL = 'whisper-large-v3-turbo';

export async function transcribeAudio(
  filePath: string,
): Promise<string | null> {
  if (!GROQ_API_KEY) {
    logger.warn('GROQ_API_KEY not set, skipping voice transcription');
    return null;
  }

  if (!fs.existsSync(filePath)) {
    logger.warn({ filePath }, 'Audio file not found for transcription');
    return null;
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    // Groq accepts 'ogg' but not 'oga' — normalize Telegram voice note extensions
    const rawExt = path.extname(filePath).slice(1) || 'ogg';
    const ext = rawExt === 'oga' ? 'ogg' : rawExt;
    const filename =
      path.basename(filePath, path.extname(filePath)) + '.' + ext;

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([fileBuffer], { type: `audio/${ext}` }),
      filename,
    );
    formData.append('model', WHISPER_MODEL);
    formData.append('language', 'pt');

    const resp = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error({ status: resp.status, body }, 'Groq transcription failed');
      return null;
    }

    const data = (await resp.json()) as { text?: string };
    const text = data.text?.trim();

    if (text) {
      logger.info(
        { chars: text.length, file: filename },
        'Transcribed voice message',
      );
    }

    return text || null;
  } catch (err) {
    logger.error({ err, filePath }, 'Transcription error');
    return null;
  }
}
