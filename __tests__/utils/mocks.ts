/**
 * Shared Mock Utilities
 *
 * Centralized mock factories for common dependencies across all tests.
 */

/**
 * Creates a mock AsyncStorage instance.
 * Use in jest.mock('@react-native-async-storage/async-storage')
 */
export const createAsyncStorageMock = () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
});

/**
 * Creates a mock logger instance.
 */
export const createLoggerMock = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
});

/**
 * Creates a mock whisper service.
 */
export const createWhisperServiceMock = () => ({
  isAvailable: jest.fn(() => Promise.resolve(true)),
  isDownloaded: jest.fn(() => Promise.resolve(false)),
  download: jest.fn(() => Promise.resolve()),
  transcribe: jest.fn(() => Promise.resolve({ text: 'transcribed text' })),
  getDownloadProgress: jest.fn(() => Promise.resolve(0)),
  cancel: jest.fn(() => Promise.resolve()),
});

/**
 * Creates a mock HTTP client.
 */
export const createHttpClientMock = () => ({
  get: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  post: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  put: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  delete: jest.fn(() => Promise.resolve({ ok: true })),
  request: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
});

/**
 * Creates a mock fetch function for network requests.
 */
export const createFetchMock = (responseData: any = {}) => {
  return jest.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseData),
    text: () => Promise.resolve(JSON.stringify(responseData)),
    headers: new Map(),
  }));
};
