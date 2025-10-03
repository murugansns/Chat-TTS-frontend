// API Configuration
export const API_BASE_URL = 'http://192.168.1.218:8000';

// TTS API endpoints
export const TTS_API = {
  GENERATE: `${API_BASE_URL}/api/v1/tts/generate`,
  STREAM: `${API_BASE_URL}/api/v1/tts/stream`,
  UPLOAD_VOICE: `${API_BASE_URL}/api/v1/tts/upload-voice`,
  LIST_VOICES: `${API_BASE_URL}/api/v1/tts/voices`
};

// Other API endpoints
export const API_ENDPOINTS = {
  UPLOAD: `${API_BASE_URL}/api/v1/upload`,
  ASK: `${API_BASE_URL}/api/v1/ask`
};
