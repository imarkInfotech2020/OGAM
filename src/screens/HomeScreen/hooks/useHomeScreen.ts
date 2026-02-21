import { useEffect, useState, useRef, useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { AlertState, initialAlertState, showAlert, hideAlert } from '../../../components';
import { useAppStore, useChatStore } from '../../../stores';
import { modelManager, hardwareService, activeModelService, ResourceUsage } from '../../../services';
import { Conversation, DownloadedModel, ONNXImageModel } from '../../../types';
import { NavigatorScreenParams } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ChatsStackParamList } from '../../../navigation/types';

type MainTabParamListWithNested = {
  HomeTab: undefined;
  ChatsTab: NavigatorScreenParams<ChatsStackParamList> | undefined;
  ProjectsTab: undefined;
  ModelsTab: undefined;
  SettingsTab: undefined;
};

export type HomeScreenNavigationProp = BottomTabNavigationProp<MainTabParamListWithNested, 'HomeTab'>;

export type ModelPickerType = 'text' | 'image' | null;

export type LoadingState = {
  isLoading: boolean;
  type: 'text' | 'image' | null;
  modelName: string | null;
};

// Track if we've synced native state to avoid repeated calls
let hasInitializedNativeSync = false;

export const useHomeScreen = (navigation: HomeScreenNavigationProp) => {
  const [pickerType, setPickerType] = useState<ModelPickerType>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    type: null,
    modelName: null,
  });
  const [isEjecting, setIsEjecting] = useState(false);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [memoryInfo, setMemoryInfo] = useState<ResourceUsage | null>(null);
  const isFirstMount = useRef(true);

  const {
    downloadedModels,
    setDownloadedModels,
    activeModelId,
    setActiveModelId: _setActiveModelId,
    downloadedImageModels,
    setDownloadedImageModels,
    activeImageModelId,
    setActiveImageModelId: _setActiveImageModelId,
    deviceInfo,
    setDeviceInfo,
    generatedImages,
  } = useAppStore();

  const { conversations, createConversation, setActiveConversation, deleteConversation } = useChatStore();

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      loadData();
      if (!hasInitializedNativeSync) {
        hasInitializedNativeSync = true;
        activeModelService.syncWithNativeState();
      }
    });

    isFirstMount.current = false;

    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshMemoryInfo = useCallback(async () => {
    try {
      const info = await activeModelService.getResourceUsage();
      setMemoryInfo(info);
    } catch (error) {
      console.warn('[HomeScreen] Failed to get memory info:', error);
    }
  }, []);

  useEffect(() => {
    refreshMemoryInfo();

    const unsubscribe = activeModelService.subscribe(() => {
      refreshMemoryInfo();
    });

    return () => unsubscribe();
  }, [refreshMemoryInfo]);

  const loadData = async () => {
    if (!deviceInfo) {
      const info = await hardwareService.getDeviceInfo();
      setDeviceInfo(info);
    }
    const models = await modelManager.getDownloadedModels();
    setDownloadedModels(models);
    const imageModels = await modelManager.getDownloadedImageModels();
    setDownloadedImageModels(imageModels);
  };

  const proceedWithTextModelLoad = async (model: DownloadedModel) => {
    setLoadingState({ isLoading: true, type: 'text', modelName: model.name });
    setPickerType(null);

    await new Promise<void>(resolve => requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => resolve(), 100);
      });
    }));

    try {
      await activeModelService.loadTextModel(model.id);
    } catch (error) {
      setAlertState(showAlert('Error', `Failed to load model: ${(error as Error).message}`));
    } finally {
      setLoadingState({ isLoading: false, type: null, modelName: null });
    }
  };

  const handleSelectTextModel = async (model: DownloadedModel) => {
    if (activeModelId === model.id) return;

    const memoryCheck = await activeModelService.checkMemoryForModel(model.id, 'text');

    if (!memoryCheck.canLoad) {
      setAlertState(showAlert('Insufficient Memory', memoryCheck.message));
      return;
    }

    if (memoryCheck.severity === 'warning') {
      setAlertState(showAlert(
        'Low Memory Warning',
        memoryCheck.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Load Anyway',
            style: 'default',
            onPress: () => {
              setAlertState(hideAlert());
              proceedWithTextModelLoad(model);
            },
          },
        ]
      ));
      return;
    }

    proceedWithTextModelLoad(model);
  };

  const handleUnloadTextModel = async () => {
    console.log('[HomeScreen] handleUnloadTextModel called, activeModelId:', activeModelId);
    setLoadingState({ isLoading: true, type: 'text', modelName: null });
    setPickerType(null);
    try {
      await activeModelService.unloadTextModel();
      console.log('[HomeScreen] unloadTextModel completed');
    } catch (error) {
      console.log('[HomeScreen] unloadTextModel error:', error);
      setAlertState(showAlert('Error', 'Failed to unload model'));
    } finally {
      setLoadingState({ isLoading: false, type: null, modelName: null });
    }
  };

  const proceedWithImageModelLoad = async (model: ONNXImageModel) => {
    setLoadingState({ isLoading: true, type: 'image', modelName: model.name });
    setPickerType(null);

    await new Promise<void>(resolve => requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => resolve(), 100);
      });
    }));

    try {
      await activeModelService.loadImageModel(model.id);
    } catch (error) {
      setAlertState(showAlert('Error', `Failed to load model: ${(error as Error).message}`));
    } finally {
      setLoadingState({ isLoading: false, type: null, modelName: null });
    }
  };

  const handleSelectImageModel = async (model: ONNXImageModel) => {
    if (activeImageModelId === model.id) return;

    const memoryCheck = await activeModelService.checkMemoryForModel(model.id, 'image');

    if (!memoryCheck.canLoad) {
      setAlertState(showAlert('Insufficient Memory', memoryCheck.message));
      return;
    }

    if (memoryCheck.severity === 'warning') {
      setAlertState(showAlert(
        'Low Memory Warning',
        memoryCheck.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Load Anyway',
            style: 'default',
            onPress: () => {
              setAlertState(hideAlert());
              proceedWithImageModelLoad(model);
            },
          },
        ]
      ));
      return;
    }

    proceedWithImageModelLoad(model);
  };

  const handleUnloadImageModel = async () => {
    setLoadingState({ isLoading: true, type: 'image', modelName: null });
    setPickerType(null);
    try {
      await activeModelService.unloadImageModel();
    } catch (_error) {
      setAlertState(showAlert('Error', 'Failed to unload model'));
    } finally {
      setLoadingState({ isLoading: false, type: null, modelName: null });
    }
  };

  const handleEjectAll = () => {
    const hasModels = activeModelId || activeImageModelId;
    if (!hasModels) return;

    setAlertState(showAlert(
      'Eject All Models',
      'Unload all active models to free up memory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Eject All',
          style: 'destructive',
          onPress: async () => {
            setAlertState(hideAlert());
            setIsEjecting(true);
            try {
              const results = await activeModelService.unloadAllModels();
              const count = (results.textUnloaded ? 1 : 0) + (results.imageUnloaded ? 1 : 0);
              if (count > 0) {
                setAlertState(showAlert('Done', `Unloaded ${count} model${count > 1 ? 's' : ''}`));
              }
            } catch (_error) {
              setAlertState(showAlert('Error', 'Failed to unload models'));
            } finally {
              setIsEjecting(false);
            }
          },
        },
      ]
    ));
  };

  const startNewChat = () => {
    if (!activeModelId) return;
    const conversationId = createConversation(activeModelId);
    setActiveConversation(conversationId);
    navigation.navigate('ChatsTab', { screen: 'Chat', params: { conversationId } });
  };

  const continueChat = (conversationId: string) => {
    setActiveConversation(conversationId);
    navigation.navigate('ChatsTab', { screen: 'Chat', params: { conversationId } });
  };

  const handleDeleteConversation = (conversation: Conversation) => {
    setAlertState(showAlert(
      'Delete Conversation',
      `Delete "${conversation.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setAlertState(hideAlert());
            deleteConversation(conversation.id);
          },
        },
      ]
    ));
  };

  const activeTextModel = downloadedModels.find((m) => m.id === activeModelId);
  const activeImageModel = downloadedImageModels.find((m) => m.id === activeImageModelId);
  const recentConversations = conversations.slice(0, 4);

  return {
    pickerType,
    setPickerType,
    loadingState,
    isEjecting,
    alertState,
    setAlertState,
    memoryInfo,
    downloadedModels,
    activeModelId,
    downloadedImageModels,
    activeImageModelId,
    generatedImages,
    conversations,
    activeTextModel,
    activeImageModel,
    recentConversations,
    handleSelectTextModel,
    handleUnloadTextModel,
    handleSelectImageModel,
    handleUnloadImageModel,
    handleEjectAll,
    startNewChat,
    continueChat,
    handleDeleteConversation,
  };
};
