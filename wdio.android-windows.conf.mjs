import path from 'node:path';

const artifacts = path.resolve(
  process.env.E2E_ARTIFACT_DIR ?? '.artifacts/wdio/android-windows-pairing',
);

const windowsHost = process.env.E2E_WINDOWS_HOST ?? '192.168.1.28';
const windowsWebDriverPort = Number(
  process.env.E2E_WINDOWS_WEBDRIVER_PORT ?? 9515,
);
const windowsCdpPort = Number(process.env.E2E_WINDOWS_CDP_PORT ?? 9224);

/**
 * One coordinator, two real applications.
 *
 * Android is owned locally by Appium/UiAutomator2. Windows is deliberately attached rather than
 * launched: ChromeDriver runs on the Windows VM and attaches to the already-running Electron app's
 * local CDP port. That preserves the real profile, licence, identity and pairing store.
 *
 * Windows prerequisite (run on the VM):
 *   1. Start Off Grid with --remote-debugging-port=9224.
 *   2. Start a ChromeDriver matching Electron's Chromium version on port 9515, allowing this Mac.
 *
 * The test never resets either app. It quits only the automation sessions when the run ends.
 */
export const config = {
  runner: 'local',
  specs: ['./__tests__/device/androidWindowsPairing.multiremote.e2e.mjs'],
  maxInstances: 1,
  logLevel: 'info',
  outputDir: path.join(artifacts, 'webdriver-logs'),
  bail: 1,
  waitforTimeout: 30_000,
  connectionRetryTimeout: Number(
    process.env.E2E_CONNECTION_RETRY_TIMEOUT ?? 120_000,
  ),
  connectionRetryCount: Number(process.env.E2E_CONNECTION_RETRY_COUNT ?? 1),
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    timeout: 240_000,
  },
  services: [
    [
      'appium',
      {
        command: process.env.APPIUM_COMMAND ?? 'appium',
        args: {
          address: '127.0.0.1',
          port: 4723,
          basePath: '/',
        },
        logPath: path.join(artifacts, 'appium'),
      },
    ],
  ],
  capabilities: {
    android: {
      hostname: '127.0.0.1',
      port: 4723,
      path: '/',
      capabilities: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:udid': process.env.E2E_ANDROID_SERIAL ?? '505b53a0',
        'appium:appPackage': 'ai.offgridmobile.dev',
        'appium:appActivity': 'ai.offgridmobile.MainActivity',
        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:forceAppLaunch': false,
        'appium:shouldTerminateApp': false,
        'appium:autoGrantPermissions': false,
        'appium:disableWindowAnimation': true,
      },
    },
    windows: {
      hostname: windowsHost,
      port: windowsWebDriverPort,
      path: '/',
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          debuggerAddress: `127.0.0.1:${windowsCdpPort}`,
          windowTypes: ['webview'],
        },
        'goog:loggingPrefs': {
          browser: 'ALL',
          driver: 'ALL',
        },
      },
    },
  },
};
