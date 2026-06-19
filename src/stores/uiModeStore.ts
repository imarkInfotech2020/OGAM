import { create } from 'zustand';

/**
 * Public, reactive UI-mode flag. The chat surface (input row, message list,
 * scroll behaviour) renders differently in voice/audio mode vs text mode. The
 * audio feature lives in the private pro package, but core needs to react to
 * the mode without importing pro — so pro mirrors its interface mode into this
 * tiny core store, and core components subscribe here.
 *
 * Free builds (no pro) leave this at the default 'chat' forever.
 */
export type InterfaceMode = 'chat' | 'audio';

interface UiModeState {
  interfaceMode: InterfaceMode;
  setInterfaceMode: (mode: InterfaceMode) => void;
}

export const useUiModeStore = create<UiModeState>((set) => ({
  interfaceMode: 'chat',
  setInterfaceMode: (interfaceMode) => set({ interfaceMode }),
}));
