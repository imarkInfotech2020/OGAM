#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SyncScreenshotModule, RCTEventEmitter)

RCT_EXTERN_METHOD(setEnabled:(BOOL)enabled)

@end
