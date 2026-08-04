import React from 'react';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PERSONAL_MESH_DEVICE_CAP } from '@offgrid/sync';

import { AppNavigator } from '../../../src/navigation/AppNavigator';
import {
  registerScreen,
  _clearScreensForTesting,
} from '../../../src/navigation/screenRegistry';
import { _clearSectionsForTesting } from '../../../src/components/settings/sectionRegistry';
import { useAppStore } from '../../../src/stores/appStore';
import { createDownloadedModel } from '../../utils/factories';
import { SyncScreen } from '../../../pro/ui/SyncScreen';
import { useSyncStore } from '../../../pro/sync/syncStore';
import { syncService } from '../../../pro/sync/syncService';
import {
  createLicensedMesh,
  MESH_LICENCE_KEY,
} from '../../harness/licensedMesh';

/**
 * How much of your licence is in use, and which devices are using it.
 *
 * The user problem: you replaced a phone, the old one still holds a seat, and you cannot bring the new
 * one on until it lets go. So the mesh has to SHOW what is occupying the licence - a seat you cannot see
 * is a seat you cannot free.
 *
 * The licence stack runs for real - the client, the credential store, the registry, the reconciliation.
 * Only Keygen's HTTP endpoint is substituted, by a fake that really holds machines and really enforces
 * the seat limit, so the number this screen shows is emergent rather than arranged.
 *
 * This used to drive a separate licensed-machines list with a per-machine deactivate button. That UI is
 * gone: capacity and membership are one thing now, shown by the mesh, and this suite follows it.
 */

jest.unmock('@react-navigation/native');

jest.mock('react-native-tcp-socket', () => {
  const {
    createNativeTcpBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeTcpBoundary() };
});

jest.mock('react-native-zeroconf', () => {
  const {
    createNativeDiscoveryBoundary,
  } = require('../../utils/nativeSyncBoundaries');
  return { __esModule: true, default: createNativeDiscoveryBoundary() };
});

/** This install's Keygen fingerprint. It is also the sync device id the installation registers under. */
const THIS_FINGERPRINT = 'fp-current';
const RETIRED_FINGERPRINT = 'fp-old';

const mesh = createLicensedMesh();
const storedSecrets = new Map<string, string>();

/** Settings, then Sync - the way a user reaches this screen. */
async function openSync() {
  const ui = render(
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>,
  );
  fireEvent.press(ui.getByTestId('settings-tab'));
  fireEvent.press(await waitFor(() => ui.getByTestId('open-sync-settings')));
  return ui;
}

describe('Settings to Sync licensed-device management', () => {
  beforeEach(async () => {
    mesh.reset(PERSONAL_MESH_DEVICE_CAP);
    await syncService.stop();
    await AsyncStorage.clear();
    jest.clearAllMocks();
    _clearScreensForTesting();
    _clearSectionsForTesting();
    registerScreen({ name: 'Sync', component: SyncScreen });

    const app = useAppStore.getState();
    app.setOnboardingComplete(true);
    app.setDownloadedModels([createDownloadedModel()]);
    app.setThemeMode('dark');
    app.setHasRegisteredPro(true);
    app.setProActive(true);
    useSyncStore.getState().reset();

    storedSecrets.clear();
    // The credential names the provider's licence, because the app asks for installations BY that id.
    storedSecrets.set(
      'off-grid-pro-license',
      JSON.stringify({
        isPro: true,
        key: MESH_LICENCE_KEY,
        licenseId: mesh.licenceId,
        expiry: null,
        verifiedAt: 0,
      }),
    );
    storedSecrets.set('off-grid-device-fingerprint', THIS_FINGERPRINT);
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      async ({ service }: { service: string }) => {
        const value = storedSecrets.get(service);
        return value ? { username: 'stored', password: value } : false;
      },
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      async (
        _username: string,
        password: string,
        options: { service: string },
      ) => {
        storedSecrets.set(options.service, password);
        return true;
      },
    );

    // Two devices already on the licence before the app starts: this phone, and one that was replaced.
    mesh.register({ id: THIS_FINGERPRINT, name: 'My iPhone', platform: 'ios' });
    mesh.register({
      id: RETIRED_FINGERPRINT,
      name: 'Old Android',
      platform: 'android',
    });
  });

  afterEach(async () => {
    mesh.restore();
    await syncService.stop();
    _clearScreensForTesting();
    _clearSectionsForTesting();
  });

  it('shows how much of the licence is in use and which device is using the other seat', async () => {
    // The app starts Sync itself on launch (pro/index.ts); there is no toggle for the user to press, so
    // the equivalent arrival here is starting the service. Reconciliation with the licence runs inside it.
    await syncService.start();
    const ui = await openSync();

    // Two installations, so two of the five slots are gone - and the retired phone is one of them.
    await waitFor(() =>
      expect(
        ui.getByText(`2 of ${PERSONAL_MESH_DEVICE_CAP} devices saved`),
      ).toBeTruthy(),
    );
    expect(ui.getByText('Old Android')).toBeTruthy();

    ui.unmount();
  });

  // NOT covered here, deliberately: freeing that seat. The Forget button on this row is visible and
  // enabled, but evicting an installation this phone never paired with throws `mapping_required` from
  // pairingSecretStore.prepareCapacityReplacement - which requires an active LOCAL pairing - and
  // SyncScreen's onForget swallows it. So the tap does nothing, silently, and the seat stays occupied.
  // Recorded in docs/GAPS_BACKLOG.md rather than asserted, because asserting today's behaviour would
  // bless a dead button.

});
