import { handleCallback } from './callback.js';

export const config = { runtime: 'edge' };

export default function handler(req) {
  return handleCallback(req, 'google');
}
