#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SyncDirectorySourceModule, NSObject)

RCT_EXTERN_METHOD(enumerate:(NSString *)grant
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stage:(NSString *)grant
                  sourceId:(NSString *)sourceId
                  destinationName:(NSString *)destinationName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
