import axios from 'axios';

/**
 * Single source of truth for the backend address.
 *
 * In production (Vercel) this is supplied by the VITE_API_URL environment
 * variable, which points at the deployed AWS App Runner backend.
 * On a developer machine no variable is set, so it falls back to the
 * local FastAPI server started with `python -m app.main`.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;
