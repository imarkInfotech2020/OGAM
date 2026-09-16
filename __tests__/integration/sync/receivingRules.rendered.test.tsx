import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render } from '@testing-library/react-native';
import { ReceivingSection } from '../../../pro/ui/SyncScreen/ReceivingSection';
import { ReceivePreferencesStore } from '../../../pro/sync/receivePreferences';

it('turns off optional screenshots in Receiving and keeps required files available', async () => {
  await AsyncStorage.clear();
  const receiving = new ReceivePreferencesStore();
  await receiving.load();

  function Screen(): React.JSX.Element {
    const [policy, setPolicy] = useState(receiving.get());
    useEffect(() => receiving.subscribe(setPolicy), []);
    return (
      <ReceivingSection
        policy={policy}
        devices={[]}
        onOptionalEnabledChange={enabled => { void receiving.setOptionalEnabled(enabled); }}
        onCategoryChange={(category, enabled) => { void receiving.setCategory(category, enabled); }}
        onDeviceOptionalEnabledChange={(device, enabled) => { void receiving.setDeviceOptionalEnabled(device, enabled); }}
        onDeviceCategoryChange={(device, category, enabled) => { void receiving.setDeviceCategory(device, category, enabled); }}
      />
    );
  }

  const view = render(<Screen />);
  fireEvent.press(view.getByTestId('receive-open-rules'));
  expect(view.getByText('Screenshots')).toBeTruthy();
  expect(view.queryByText('Shared files')).toBeNull();
  expect(view.queryByText('Models')).toBeNull();

  fireEvent.press(view.getByTestId('receive-screenshot-refuse'));
  expect(view.getByTestId('receive-screenshot-refuse').props.accessibilityState.checked).toBe(true);
});
