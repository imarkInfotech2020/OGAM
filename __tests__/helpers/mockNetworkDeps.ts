/**
 * Shared mocks for react-native-device-info and logger,
 * used by network.test.ts and networkDiscovery.test.ts.
 *
 * Usage:
 *   jest.mock('react-native-device-info', () =>
 *     require('../../helpers/mockNetworkDeps').deviceInfoMock,
 *   );
 *   jest.mock('.../logger', () =>
 *     require('../../helpers/mockNetworkDeps').loggerMock,
 *   );
 */
export const deviceInfoMock = {
  getIpAddress: jest.fn(),
  isEmulator: jest.fn().mockResolvedValue(false),
};

export const loggerMock = {
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
};
