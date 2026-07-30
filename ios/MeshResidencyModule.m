#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MeshResidencyModule, NSObject)

RCT_EXTERN_METHOD(begin:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(end:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

@end
