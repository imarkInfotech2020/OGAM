#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SyncClipboardModule, RCTEventEmitter)

RCT_EXTERN_METHOD(setEnabled:(BOOL)enabled)
RCT_EXTERN_METHOD(writeText:(NSString *)text)

@end
