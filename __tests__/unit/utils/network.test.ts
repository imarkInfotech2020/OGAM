jest.mock('react-native-device-info', () => ({
  getIpAddress: jest.fn(),
  isEmulator: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getIpAddress } from 'react-native-device-info';
import {
  isPrivateIPv4,
  isIPv6,
  isOnLocalNetwork,
} from '../../../src/utils/network';

const mockGetIpAddress = getIpAddress as jest.Mock;

describe('network utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isPrivateIPv4', () => {
    it('returns true for 10.x.x.x addresses', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('10.255.255.255')).toBe(true);
      expect(isPrivateIPv4('10.1.2.3')).toBe(true);
    });

    it('returns true for 172.16-31.x.x addresses', () => {
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('172.20.10.1')).toBe(true);
    });

    it('returns false for 172.x outside 16-31 range', () => {
      expect(isPrivateIPv4('172.15.0.1')).toBe(false);
      expect(isPrivateIPv4('172.32.0.1')).toBe(false);
      expect(isPrivateIPv4('172.0.0.1')).toBe(false);
    });

    it('returns true for 192.168.x.x addresses', () => {
      expect(isPrivateIPv4('192.168.0.1')).toBe(true);
      expect(isPrivateIPv4('192.168.1.100')).toBe(true);
      expect(isPrivateIPv4('192.168.255.255')).toBe(true);
    });

    it('returns false for public IP addresses', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('203.0.113.5')).toBe(false);
      expect(isPrivateIPv4('192.169.0.1')).toBe(false);
    });

    it('returns false for malformed input', () => {
      expect(isPrivateIPv4('10.0.0')).toBe(false);
      expect(isPrivateIPv4('10.0.0.1.5')).toBe(false);
      expect(isPrivateIPv4('not-an-ip')).toBe(false);
      expect(isPrivateIPv4('...')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isPrivateIPv4('')).toBe(false);
    });
  });

  describe('isIPv6', () => {
    it('returns true for IPv6 addresses', () => {
      expect(isIPv6('::1')).toBe(true);
      expect(isIPv6('fe80::1')).toBe(true);
      expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    });

    it('returns false for IPv4 addresses', () => {
      expect(isIPv6('192.168.1.1')).toBe(false);
      expect(isIPv6('10.0.0.1')).toBe(false);
    });
  });

  describe('isOnLocalNetwork', () => {
    it('returns true when on private WiFi', async () => {
      mockGetIpAddress.mockResolvedValue('192.168.1.100');
      expect(await isOnLocalNetwork()).toBe(true);
    });

    it('returns false for a public IP', async () => {
      mockGetIpAddress.mockResolvedValue('8.8.8.8');
      expect(await isOnLocalNetwork()).toBe(false);
    });

    it('returns false for an IPv6 address', async () => {
      mockGetIpAddress.mockResolvedValue('fe80::1');
      expect(await isOnLocalNetwork()).toBe(false);
    });

    it('returns false when IP is null', async () => {
      mockGetIpAddress.mockResolvedValue(null);
      expect(await isOnLocalNetwork()).toBe(false);
    });

    it('returns false for 0.0.0.0', async () => {
      mockGetIpAddress.mockResolvedValue('0.0.0.0');
      expect(await isOnLocalNetwork()).toBe(false);
    });

    it('returns false for 127.0.0.1', async () => {
      mockGetIpAddress.mockResolvedValue('127.0.0.1');
      expect(await isOnLocalNetwork()).toBe(false);
    });

    it('returns false when getIpAddress throws', async () => {
      mockGetIpAddress.mockRejectedValue(new Error('No network'));
      expect(await isOnLocalNetwork()).toBe(false);
    });
  });
});
