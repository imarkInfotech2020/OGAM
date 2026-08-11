import React from 'react';
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
  installLicensedPhone,
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
    installLicensedPhone(mesh, {
      fingerprint: THIS_FINGERPRINT,
      secrets: storedSecrets,
    });

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

  it('says so when a seat cannot be freed, instead of looking like nothing happened', async () => {
    await syncService.start();
    const ui = await openSync();
    await waitFor(() =>
      expect(
        ui.getByText(`2 of ${PERSONAL_MESH_DEVICE_CAP} devices saved`),
      ).toBeTruthy(),
    );

    // The provider goes away between opening the screen and confirming - a plane, a captive portal, a
    // bad afternoon at Keygen. The seat cannot be released, and that is worth a sentence: this action
    // used to swallow its failure, so confirming produced no error, no change, and no explanation.
    mesh.keygen.setOffline(true);
    fireEvent.press(ui.getByTestId(`sync-forget-${RETIRED_FINGERPRINT}`));
    fireEvent.press(await waitFor(() => ui.getByText('Evict device')));

    // What matters is that SOMETHING is said and that it names a failure - the sentence itself is the
    // provider's, passed through rather than invented, so the wording is not pinned here.
    const complaint = await waitFor(() => ui.getByRole('alert'));
    expect(String(complaint.props.children)).toMatch(
      /failed|could not|unreachable|unavailable/i,
    );
    // And nothing was quietly half-done: the device still holds its seat on the licence.
    expect(
      mesh.installations().map(({ fingerprint }) => fingerprint),
    ).toContain(RETIRED_FINGERPRINT);

    ui.unmount();
  });

  it('frees the seat a replaced device was holding, at the provider and not only on screen', async () => {
    await syncService.start();
    const ui = await openSync();
    await waitFor(() =>
      expect(
        ui.getByText(`2 of ${PERSONAL_MESH_DEVICE_CAP} devices saved`),
      ).toBeTruthy(),
    );

    // Forget, then confirm in the sheet - this app never uses a system modal for a confirmation.
    fireEvent.press(ui.getByTestId(`sync-forget-${RETIRED_FINGERPRINT}`));
    fireEvent.press(await waitFor(() => ui.getByText('Evict device')));

    // The seat comes back on the LICENCE, not merely off this list. That is the difference between
    // being able to pair a new phone and being told the mesh is full.
    await waitFor(() =>
      expect(
        ui.getByText(`1 of ${PERSONAL_MESH_DEVICE_CAP} devices saved`),
      ).toBeTruthy(),
    );
    expect(mesh.installations().map(({ fingerprint }) => fingerprint)).toEqual([
      THIS_FINGERPRINT,
    ]);
    expect(ui.queryByText('Old Android')).toBeNull();

    ui.unmount();
  });
});
