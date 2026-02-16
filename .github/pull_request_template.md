## Summary

<!-- Briefly describe what this PR does and why -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactor (code change that neither fixes a bug nor adds a feature)
- [ ] Chore (build process, CI, dependency updates, etc.)

## Screenshots / Screen Recordings

<!-- Mandatory for any UI change. Remove sections that don't apply. -->

### Android

| Before | After |
|--------|-------|
|        |       |

### iOS

| Before | After |
|--------|-------|
|        |       |

## Checklist

### General

- [ ] My code follows the project's coding style and conventions
- [ ] I have performed a self-review of my code
- [ ] I have added/updated comments where the logic isn't self-evident
- [ ] My changes generate no new warnings or errors

### Testing

- [ ] I have tested on **Android** (physical device or emulator)
- [ ] I have tested on **iOS** (physical device or simulator)
- [ ] I have tested in **light mode** and **dark mode**
- [ ] Existing tests pass locally (`npm test`)
- [ ] I have added tests that prove my fix is effective or my feature works

### React Native Specific

- [ ] No new native module without corresponding platform implementation (Android + iOS)
- [ ] New native modules are added to the Xcode project build target (`project.pbxproj`)
- [ ] No hardcoded pixel values — uses `SPACING` / `TYPOGRAPHY` constants from the theme
- [ ] Styles use `useThemedStyles` pattern (not inline or static `StyleSheet.create`)
- [ ] Animations/gestures work smoothly on both platforms
- [ ] Large lists use `FlatList` / `FlashList` (not `.map()` inside `ScrollView`)
- [ ] No unnecessary re-renders introduced (check with React DevTools Profiler if unsure)

### Performance & Models

- [ ] Downloads / long-running tasks report progress to the UI
- [ ] File paths are resolved correctly on both platforms (no hardcoded `/` vs `\\`)
- [ ] Large files (models, assets) are not committed to the repository

### Security

- [ ] No secrets, API keys, or credentials are included in the code
- [ ] User input is validated/sanitized where applicable

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->

## Additional Notes

<!-- Any context, trade-offs, or follow-up work worth mentioning -->
