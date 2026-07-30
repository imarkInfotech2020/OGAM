import { AppState, type NativeEventSubscription } from 'react-native';
import { revalidateProEntitlement } from './proLicenseService';

class ProEntitlementLifecycle {
  private appStateSubscription: NativeEventSubscription | null = null;
  private launchOperation: Promise<void> | null = null;

  start(): Promise<void> {
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener('change', state => {
        if (state !== 'active') return;
        void revalidateProEntitlement('foreground');
      });
    }

    if (!this.launchOperation) {
      this.launchOperation = revalidateProEntitlement('launch');
    }
    return this.launchOperation;
  }
}

export const proEntitlementLifecycle = new ProEntitlementLifecycle();
