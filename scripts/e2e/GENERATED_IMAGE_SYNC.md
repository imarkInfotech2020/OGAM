# Android to mesh image test

This physical test starts image generation on Android. It then checks the same journey on Android,
iOS, macOS, and Windows.

It verifies:

- the synced chat opens without an app restart;
- a live Enhancing, Loading image model, or Generating image state appears;
- the live state ends when the saved result arrives;
- the prompt and one decoded image are in one message bubble;
- `Image arriving` does not remain;
- the new decoded image appears in Gallery;
- screenshots and a JSON result are saved for every device.

## Preconditions

- All devices are already paired and connected on the mesh.
- Android is visible to `adb`.
- WebDriverAgent is available at `WDA_URL` for the iPhone.
- Off Grid Desktop runs with CDP on local port 9222 for macOS.
- The Windows CDP tunnel uses local port 9224.
- Android has an image model downloaded. The test selects it through forced image mode.

Run this command on the Mac that owns the device-control channels:

```sh
npm run e2e:image-sync
```

The default mesh is `ios,macos,windows`. Use a smaller observer set only for diagnosis:

```sh
npm run e2e:image-sync -- --mesh ios,macos --timeout-minutes 30
```

The run does not pair, forget, disconnect, restart, or change mesh membership. Evidence is written to
`.artifacts/e2e-flows/generated-image-sync/`.
