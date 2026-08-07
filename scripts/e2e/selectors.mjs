/**
 * WHAT things are called on screen. One file, so a copy change is one edit.
 *
 * Two vocabularies, because there are two driver families: the RN apps put testIDs on everything and
 * are addressed by those, the Electron apps are addressed by the text a person reads. Both are HERE
 * rather than inlined in a flow, so nothing below the surface layer contains a string that has to
 * match the product.
 */

/** Row controls on the RN device list. The row's device id completes each one: `sync-forget-<id>`. */
export const ROW_CONTROL = {
  pair: ['pair', 'repair', 'reconnect'],
  forget: ['forget'],
  disconnect: ['disconnect'],
  rename: ['rename'],
  sendModel: ['send-model'],
};

/**
 * The button that goes through with a destructive action, once its sheet has opened.
 *
 * Ordered most specific first: "Evict device" and "Forget device" name the object, and matching those
 * before the bare verbs keeps this off the sheet's TITLE ("Evict 17 pro max?"), which contains the
 * verb too. Both words appear because the same row control opens an evict sheet when the peer is
 * reachable and a plain forget sheet when it is not.
 */
export const CONFIRM_DESTRUCTIVE = [
  'Evict device',
  'Forget device',
  'Remove device',
  'Evict',
  'Forget',
  'Remove',
];

/** Backing out of a sheet without doing the thing. Used to restore state when a flow aborts. */
export const CANCEL = ['Cancel', 'Not now', 'Keep device'];

/**
 * A confirmation sheet is open and covering the list.
 *
 * This matters more than it looks. Every RN read - `sees`, `isConnectedTo`, `deviceName` - works off
 * the flat accessibility label list, and an open sheet REPLACES that list. So "is this device still
 * connected?" answers false while the device is perfectly connected, and a flow that tears something
 * down then checks its own work concludes the teardown worked when nothing was confirmed at all.
 * Anything reading device state has to know a sheet is in the way rather than trusting the answer.
 */
export const SHEET_TITLE = /^(Evict|Forget|Remove|Disconnect)\b.*\?$/;

/** The desktop equivalents, matched against the text a person reads. */
export const DESKTOP = {
  forget: ['Forget', 'Evict'],
  reconnect: ['Pair again', 'Reconnect', 'Pair'],
  confirmDestructive: /forget|evict|remove|confirm/i,
  codePrompt: /Enter the pairing code/i,
  devicesScreen: /PAIRING CODE/i,
  thisDevice: /This device:\s*(.+)/,
};
