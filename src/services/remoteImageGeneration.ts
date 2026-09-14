import RNFS from 'react-native-fs';
import type { GeneratedImage, RemoteServer } from '../types';
import { useAppStore } from '../stores';
import { generateId } from '../utils/generateId';
import type { GenerateImageParams, ImageGenerationState } from './imageGenerationTypes';
import { resolveMobileImageParameters } from './imageParameterPolicy';
import { remoteMediaRuntime } from './remoteMediaRuntime';
import {
  completedImageGenerationState,
  saveImageGenerationResult,
} from './imageGenerationResult';

interface RemoteImageGenerationDeps {
  updateState: (state: Partial<ImageGenerationState>) => void;
  fail: (message: string, cause?: unknown) => null;
  isCancelled: () => boolean;
  setRequest: (controller: AbortController | null) => void;
}

export async function runRemoteImageGeneration(
  params: GenerateImageParams,
  server: RemoteServer,
  deps: RemoteImageGenerationDeps,
  options: { override?: boolean; enhancedPrompt?: string } = {},
): Promise<GeneratedImage | null> {
  const modelId = server.mediaModels?.image;
  if (!modelId) return deps.fail('No remote image model is configured');
  const settings = useAppStore.getState().settings;
  const imageParameters = resolveMobileImageParameters(
    { id: modelId, name: modelId }, settings, params,
  );
  const width = imageParameters.size;
  const height = imageParameters.size;
  const { steps, guidanceScale } = imageParameters;
  const messageId = params.conversationId ? generateId() : null;
  const startTime = Date.now();
  deps.updateState({
    phase: 'generating', prompt: params.prompt, conversationId: params.conversationId || null,
    messageId, status: `Creating image on ${server.name}...`, previewPath: null,
    progress: null, error: null, result: null,
  });
  const controller = new AbortController();
  deps.setRequest(controller);
  try {
    const remote = await remoteMediaRuntime.generateImage(
      server,
      { prompt: options.enhancedPrompt ?? params.prompt, size: `${width}x${height}` },
      {
        signal: controller.signal,
        override: options.override,
        onImageProgress: (step, total) => {
          if (!deps.isCancelled() && total > 0) {
            deps.updateState({
              progress: { step, totalSteps: total },
              status: `Generating image (${step}/${total})...`,
            });
          }
        },
      },
    );
    const dataUrl = remote.url?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
    const base64 = dataUrl?.[2] ?? remote.base64;
    if (!base64 && !/^https?:\/\//i.test(remote.url ?? '')) {
      throw new Error('Remote server returned no image data');
    }
    if (deps.isCancelled()) return null;
    const id = generateId();
    const directory = `${RNFS.DocumentDirectoryPath}/generated_images`;
    const urlExtension = remote.url?.match(/\.(png|jpe?g|webp)(?:[?#]|$)/i)?.[1]?.toLowerCase();
    const extension = dataUrl?.[1]?.toLowerCase() === 'image/jpeg'
      ? 'jpg'
      : dataUrl?.[1]?.toLowerCase().replace('image/', '') ?? urlExtension ?? 'png';
    let fileName = `${id}.${extension}`;
    let imagePath = `${directory}/${fileName}`;
    await RNFS.mkdir(directory);
    if (base64) {
      await RNFS.writeFile(imagePath, base64, 'base64');
    } else {
      const transfer = RNFS.downloadFile({ fromUrl: remote.url!, toFile: imagePath });
      const outcome = await transfer.promise;
      if (outcome.statusCode < 200 || outcome.statusCode >= 300) {
        throw new Error(`Image download returned HTTP ${outcome.statusCode}`);
      }
      const contentType = Object.entries(outcome.headers ?? {})
        .find(([key]) => key.toLowerCase() === 'content-type')?.[1]
        ?.split(';')[0]?.toLowerCase();
      const receivedExtension = contentType === 'image/jpeg' ? 'jpg'
        : contentType === 'image/png' ? 'png'
        : contentType === 'image/webp' ? 'webp'
        : undefined;
      if (contentType && !receivedExtension) {
        throw new Error('Remote server returned an unsupported image format');
      }
      if (receivedExtension && receivedExtension !== extension) {
        fileName = `${id}.${receivedExtension}`;
        const correctedPath = `${directory}/${fileName}`;
        await RNFS.moveFile(imagePath, correctedPath);
        imagePath = correctedPath;
      }
    }
    const result: GeneratedImage = {
      id, prompt: params.prompt, negativePrompt: params.negativePrompt, imagePath, fileName,
      width, height, steps, seed: params.seed ?? 0, modelId, createdAt: new Date().toISOString(),
    };
    deps.updateState(completedImageGenerationState(result));
    return saveImageGenerationResult(result, {
      params,
      activeImageModel: {
        id: modelId, name: `${server.name} / ${modelId}`, modelPath: server.endpoint, backend: 'remote',
      },
      messageId, steps, guidanceScale, useOpenCL: false, startTime, isRemote: true,
    });
  } catch (error) {
    if (controller.signal.aborted || deps.isCancelled()) return null;
    return deps.fail(error instanceof Error ? error.message : 'Remote image generation failed', error);
  } finally {
    deps.setRequest(null);
  }
}
