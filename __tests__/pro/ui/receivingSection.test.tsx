/**
 * The Receiving section: what this phone will take, and from which device.
 *
 * The interesting thing here is SCOPE. The user picks All devices or one device and then edits rules for that
 * scope, and the same switch has to route to a different handler depending on which is selected - a device rule
 * overrides the global one. Getting that wrong is silent and expensive: the user turns off screenshots from one
 * laptop and it stops accepting them from everything, or they think they have restricted one device and have
 * restricted nothing.
 *
 * So these tests press real buttons on the real component and assert WHICH callback fires with which arguments,
 * because that is the only externally visible difference between the two cases.
 *
 * The projection that resolves device-versus-global precedence is real (@offgrid/sync), so the rows and the
 * enabled answers are computed the way the app computes them. Only the icon font is shimmed.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-vector-icons/Feather', () => {
  const { Text } = require('react-native');
  return ({ name }: { name: string }) => <Text>{name}</Text>;
});

type SectionModule = typeof import('@offgrid/pro/ui/SyncScreen/ReceivingSection');

let ReceivingSection: SectionModule['ReceivingSection'];
let RECEIVE_ANY_SOURCE: SectionModule['RECEIVE_ANY_SOURCE'];
let available = true;

beforeAll(() => {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const mod = require('@offgrid/pro/ui/SyncScreen/ReceivingSection') as SectionModule;
    /* eslint-enable @typescript-eslint/no-var-requires */
    ReceivingSection = mod.ReceivingSection;
    RECEIVE_ANY_SOURCE = mod.RECEIVE_ANY_SOURCE;
  } catch {
    // The private pro/ submodule is absent (open-core checkout); nothing to test here.
    available = false;
  }
});

const handlers = () => ({
  onEnabledChange: jest.fn(),
  onCategoryChange: jest.fn(),
  onDeviceEnabledChange: jest.fn(),
  onDeviceCategoryChange: jest.fn(),
});

// The app's own default policy, not a hand-made partial. A partial one crashed inside the projection
// (policy.devices[id] on an undefined map), which is a fixture bug rather than a finding - and building it from
// DEFAULT_RECEIVE_POLICY means this test cannot drift from the shape the app actually stores.
/** The category ids the projection actually offers, so the test names real rows rather than guessing. */
const categoryIds = (policy: never, deviceId?: string): string[] => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { projectSyncReceiving } = require('@offgrid/sync');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return projectSyncReceiving(policy, deviceId).categories.map(
    (category: { id: string }) => category.id,
  );
};

const policyWith = (overrides: Record<string, unknown> = {}): never => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { DEFAULT_RECEIVE_POLICY } = require('@offgrid/sync');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return { ...DEFAULT_RECEIVE_POLICY, ...overrides } as never;
};

describe('the Receiving section', () => {
  const maybe = (name: string, body: jest.ProvidesCallback): void => {
    // eslint-disable-next-line jest/valid-title, jest/no-disabled-tests
    (available ? it : it.skip)(name, body);
  };

  maybe('offers no device chooser when nothing is paired yet', () => {
    const on = handlers();
    const view = render(
      <ReceivingSection policy={policyWith()} devices={[]} {...on} />,
    );

    // With no peers there is no scope to choose, and an "All devices" button next to an empty list would
    // suggest devices exist that the user simply cannot see.
    expect(view.queryByTestId('receive-source-all')).toBeNull();
    expect(view.getByTestId('receive-master-toggle')).toBeTruthy();
  });

  maybe('says plainly what happens to data it refuses', () => {
    const view = render(
      <ReceivingSection policy={policyWith()} devices={[]} {...handlers()} />,
    );

    // The one thing no switch can show: refusing is not "hold it aside", it is never written and never passed
    // on. Without this line a user cannot tell whether declining still stores the data somewhere.
    expect(
      view.getByText(/never written to this phone and never passed on/i),
    ).toBeTruthy();
  });

  maybe('starts scoped to every paired device', () => {
    const on = handlers();
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'laptop', name: 'The Mac' }]}
        {...on}
      />,
    );

    expect(view.getByText(/Editing rules for all paired devices/)).toBeTruthy();
    fireEvent(view.getByTestId('receive-master-toggle'), 'valueChange', false);

    // The global handler, with no device id: the default scope is everything, so the first switch a user
    // touches must change the global rule rather than silently pick a device for them.
    expect(on.onEnabledChange).toHaveBeenCalledWith(false);
    expect(on.onDeviceEnabledChange).not.toHaveBeenCalled();
  });

  maybe('routes the same switch to ONE device once that device is selected', () => {
    const on = handlers();
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'laptop', name: 'The Mac' }]}
        {...on}
      />,
    );

    fireEvent.press(view.getByTestId('receive-source-laptop'));
    fireEvent(view.getByTestId('receive-master-toggle'), 'valueChange', false);

    // Same control, different meaning. This is the assertion that catches the expensive bug: a per-device
    // switch wired to the global handler turns off receiving from everything.
    expect(on.onDeviceEnabledChange).toHaveBeenCalledWith('laptop', false);
    expect(on.onEnabledChange).not.toHaveBeenCalled();
  });

  maybe('names the device being edited, and warns that its rule wins', () => {
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'laptop', name: 'The Mac' }]}
        {...handlers()}
      />,
    );

    fireEvent.press(view.getByTestId('receive-source-laptop'));

    // Precedence stated where the user is editing it. Without it, someone who has set a device rule cannot
    // understand why changing All devices appears to do nothing for that device.
    expect(view.getByText(/Editing rules for The Mac/)).toBeTruthy();
    expect(view.getByText(/A device rule overrides All devices/)).toBeTruthy();
  });

  maybe('falls back to a readable name for a device that has none', () => {
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'unnamed-device-id' }]}
        {...handlers()}
      />,
    );

    // A peer can appear before it has advertised a name. Showing its id beats showing "undefined", and the
    // button still has to be pressable.
    expect(view.getByText('unnamed-device-id')).toBeTruthy();
    fireEvent.press(view.getByTestId('receive-source-unnamed-device-id'));
    expect(view.getByText(/Editing rules for this device/)).toBeTruthy();
  });

  maybe('can go back to editing every device', () => {
    const on = handlers();
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'laptop', name: 'The Mac' }]}
        {...on}
      />,
    );

    fireEvent.press(view.getByTestId('receive-source-laptop'));
    fireEvent.press(view.getByTestId('receive-source-all'));
    fireEvent(view.getByTestId('receive-master-toggle'), 'valueChange', true);

    // A one-way trip into a device scope would leave the user unable to edit the global rule again without
    // restarting the screen.
    expect(on.onEnabledChange).toHaveBeenCalledWith(true);
    expect(on.onDeviceEnabledChange).not.toHaveBeenCalled();
  });

  maybe('routes a category the same way the master switch is routed', () => {
    const on = handlers();
    const view = render(
      <ReceivingSection
        policy={policyWith()}
        devices={[{ id: 'laptop', name: 'The Mac' }]}
        {...on}
      />,
    );

    const [categoryId] = categoryIds(policyWith());
    expect(categoryId).toBeTruthy()
    const categoryTestId = `receive-${categoryId}-toggle`

    fireEvent(view.getByTestId(categoryTestId), 'valueChange', false);
    expect(on.onCategoryChange).toHaveBeenCalledWith(categoryId, false);

    fireEvent.press(view.getByTestId('receive-source-laptop'));
    fireEvent(view.getByTestId(categoryTestId), 'valueChange', false);
    // Per-device control is per CATEGORY, not a single on/off for the device - that is the reason this section
    // reuses the ambient-sharing scope pattern instead of a flat list of device switches.
    expect(on.onDeviceCategoryChange).toHaveBeenCalledWith('laptop', categoryId, false);
  });

  maybe('shows categories as unavailable rather than off while the scope is off', () => {
    const view = render(
      <ReceivingSection
        policy={policyWith({ enabled: false })}
        devices={[]}
        {...handlers()}
      />,
    );

    const disabled = categoryIds(policyWith({ enabled: false })).map(
      id => view.getByTestId(`receive-${id}-toggle`).props.disabled,
    )
    expect(disabled.length).toBeGreaterThan(0)
    // Disabled, not switched off: the user's per-category choices survive turning the scope off and come back
    // exactly as they were, so the two states must not look the same.
    expect(disabled.every(value => value === true)).toBe(true);
  });

  maybe('exports the sentinel the screen uses for the all-devices scope', () => {
    // Named rather than a bare 'any' string at the call site, so the screen and this section cannot disagree
    // about what "no device selected" looks like.
    expect(RECEIVE_ANY_SOURCE).toBe('any');
  });
});
