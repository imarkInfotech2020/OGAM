import { useEffect, useCallback } from 'react';
import { useTTSStore } from '../stores/ttsStore';
import { hardwareService } from '../services/hardware';
import { TTS_WARN_RAM_GB, TTS_BLOCK_RAM_GB } from '../constants/ttsModels';

export function useTTS() {
  const store = useTTSStore();

  useEffect(() => {
    store.checkDownloadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRunOnDevice = useCallback((): { allowed: boolean; warning: boolean } => {
    const ramGB = hardwareService.getTotalMemoryGB();
    return {
      allowed: ramGB >= TTS_BLOCK_RAM_GB,
      warning: ramGB < TTS_WARN_RAM_GB,
    };
  }, []);

  const speakMessage = useCallback(
    (text: string, messageId: string) => {
      store.speak(text, messageId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.isReady],
  );

  return {
    ...store,
    speakMessage,
    canRunOnDevice,
    isDownloading: store.isDownloading,
    overallDownloadProgress: store.overallDownloadProgress,
    isAudioMode: store.settings.interfaceMode === 'audio',
    isChatMode: store.settings.interfaceMode === 'chat',
  };
}
