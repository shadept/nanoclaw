/**
 * Voice transcription via Groq's Whisper API (OpenAI-compatible).
 * Reads GROQ_API_KEY from .env / env. Returns null when unconfigured or on error
 * so callers can fall back to delivering the raw audio attachment.
 */
import { readEnvFile } from './env.js';
import { log } from './log.js';

const envConfig = readEnvFile(['GROQ_API_KEY', 'TRANSCRIPTION_LANGUAGE']);
const GROQ_API_KEY = process.env.GROQ_API_KEY || envConfig.GROQ_API_KEY;
const LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || envConfig.TRANSCRIPTION_LANGUAGE || 'pt';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const WHISPER_MODEL = 'whisper-large-v3-turbo';

export function transcriptionConfigured(): boolean {
  return Boolean(GROQ_API_KEY);
}

export async function transcribeBuffer(data: Buffer, mimeType: string): Promise<string | null> {
  if (!GROQ_API_KEY) return null;

  // Normalize Telegram's audio/oga → ogg, etc. Groq accepts the common ones.
  const sub = (mimeType.split('/')[1] || 'ogg').replace(/^x-/, '').replace('oga', 'ogg');
  const filename = `voice.${sub}`;

  try {
    const formData = new FormData();
    formData.append('file', new Blob([data], { type: `audio/${sub}` }), filename);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', LANGUAGE);

    const resp = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });

    if (!resp.ok) {
      const body = await resp.text();
      log.error('Groq transcription failed', { status: resp.status, body: body.slice(0, 200) });
      return null;
    }

    const json = (await resp.json()) as { text?: string };
    const text = json.text?.trim();
    if (text) log.info('Transcribed voice message', { chars: text.length, mimeType });
    return text || null;
  } catch (err) {
    log.error('Transcription error', { err });
    return null;
  }
}
