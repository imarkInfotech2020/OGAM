import { GB, installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';

describe('iOS Gallery deletion after an application-container change', () => {
  it('deletes the owned generated image and keeps a path outside that directory', async () => {
    const boundary = installNativeBoundary({
      fs: true,
      ram: { platform: 'ios', totalBytes: 8 * GB, availBytes: 5 * GB },
    });
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();

    const documents = boundary.fs!.DocumentDirectoryPath;
    const ownedPath = `${documents}/generated_images/owned-image.png`;
    const outsidePath = `${documents}/attachments/outside-image.png`;
    boundary.fs!.seedFile(ownedPath, 1024);
    boundary.fs!.seedFile(outsidePath, 1024);
    boundary.diffusion.seedGeneratedImages([
      {
        id: 'owned-image',
        prompt: 'Owned generated image',
        imagePath: ownedPath,
        width: 512,
        height: 512,
        steps: 20,
        seed: 1,
        modelId: 'image-model',
        createdAt: '2026-09-14T00:00:00.000Z',
      },
    ]);

    await AsyncStorage.setItem(
      'local-llm-app-storage',
      JSON.stringify({
        state: {
          generatedImages: [
            {
              id: 'owned-image',
              prompt: 'Owned generated image',
              imagePath:
                '/var/mobile/Containers/Data/Application/OLD/Documents/generated_images/owned-image.png',
              width: 512,
              height: 512,
              steps: 20,
              seed: 1,
              modelId: 'image-model',
              createdAt: '2026-09-14T00:00:00.000Z',
            },
            {
              id: 'outside-image',
              prompt: 'Outside image',
              imagePath:
                '/var/mobile/Containers/Data/Application/OLD/Documents/attachments/outside-image.png',
              width: 512,
              height: 512,
              steps: 20,
              seed: 2,
              modelId: 'image-model',
              createdAt: '2026-09-14T00:00:00.000Z',
            },
          ],
        },
        version: 0,
      }),
    );

    const React = require('react');
    const rtl = requireRTL();
    const { useAppStore } = require('../../../src/stores/appStore');
    await useAppStore.persist.rehydrate();
    const { GalleryScreen } = require('../../../src/screens/GalleryScreen');
    const gallery = rtl.render(React.createElement(GalleryScreen));

    rtl.fireEvent.press(await gallery.findByTestId('gallery-image-owned-image'));
    rtl.fireEvent.press(gallery.getByText('Delete'));
    await gallery.findByText('Delete Image');
    rtl.fireEvent.press(gallery.getAllByText('Delete')[1]);

    await rtl.waitFor(async () => {
      expect(await boundary.fs!.exists(ownedPath)).toBe(false);
      expect(gallery.queryByTestId('gallery-image-owned-image')).toBeNull();
    });

    rtl.fireEvent.press(gallery.getByTestId('gallery-image-outside-image'));
    rtl.fireEvent.press(gallery.getByText('Delete'));
    await gallery.findByText('Delete Image');
    rtl.fireEvent.press(gallery.getAllByText('Delete')[1]);

    await rtl.waitFor(async () => {
      expect(await boundary.fs!.exists(outsidePath)).toBe(true);
      expect(gallery.getByTestId('gallery-image-outside-image')).toBeTruthy();
    });
  });
});
