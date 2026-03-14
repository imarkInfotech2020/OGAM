/**
 * Shared CustomAlert mock for test files.
 *
 * Usage in test files:
 *   jest.mock('.../CustomAlert', () =>
 *     require('../../helpers/mockCustomAlert').customAlertMock,
 *   );
 *   const { mockShowAlert } = require('../../helpers/mockCustomAlert');
 */
export const mockShowAlert = jest.fn(
  (_t: string, _m: string, _b?: any) => ({
    visible: true,
    title: _t,
    message: _m,
    buttons: _b || [],
  }),
);

export const customAlertMock = {
  CustomAlert: ({ visible, title, message, buttons, onClose }: any) => {
    if (!visible) return null;
    const { View, Text, TouchableOpacity: TO } = require('react-native');
    return (
      <View testID="custom-alert">
        <Text testID="alert-title">{title}</Text>
        <Text testID="alert-message">{message}</Text>
        {buttons &&
          buttons.map((btn: any, i: number) => (
            <TO
              key={i}
              testID={`alert-button-${btn.text}`}
              onPress={btn.onPress}>
              <Text>{btn.text}</Text>
            </TO>
          ))}
        <TO testID="alert-close" onPress={onClose}>
          <Text>CloseAlert</Text>
        </TO>
      </View>
    );
  },
  showAlert: (...args: any[]) => (mockShowAlert as any)(...args),
  hideAlert: jest.fn(() => ({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  })),
  initialAlertState: { visible: false, title: '', message: '', buttons: [] },
};
