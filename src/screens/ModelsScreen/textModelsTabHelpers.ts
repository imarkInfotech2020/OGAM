import { modelBudgetFraction } from '../../services/memoryBudget';

const BYTES_PER_GB = 1024 ** 3;

/**
 * Pure device-fit decision for a model file: does its on-disk size exceed the
 * device's safe RAM budget (totalRamGB * modelBudgetFraction)?
 *
 * This is the SINGLE source of truth the download-warning gate and the detail
 * list's compatibility filter both compute from — a static per-model
 * `confirmDownload` flag was device-blind and fired on every device. Zero-IO so
 * it is unit-testable; callers pass the RAM read from the device boundary
 * (hardwareService.getTotalMemoryGB).
 */
export function fileExceedsBudget(sizeBytes: number, ramGB: number): boolean {
  return sizeBytes / BYTES_PER_GB >= ramGB * modelBudgetFraction(ramGB);
}
