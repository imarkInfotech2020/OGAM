/**
 * UI integration — what "CPU Threads" tells you when you have not chosen a number.
 *
 * Real CpuThreadsSlider + real useTextGenerationAdvanced + real hardwareService + real
 * cpuTopologyReader + real rule. Only the filesystem is faked, at the native line (react-native-fs),
 * and it serves the EXACT sysfs values read off the devices — so the count the screen shows is
 * emergent from the kernel's own topology rather than programmed by the test.
 *
 * Two things this pins, both device-confirmed on the OnePlus CPH2707:
 *  - The screen said "1" while the engine ran 6 ([LLM] Resolved params: threads=6). Unset means
 *    auto, and the slider's minimum is 1, so the sentinel rendered as a number nobody chose.
 *  - Auto was floor(cores * 0.8) = 6, spilling two threads onto efficiency cores. The device runs
 *    fastest on its four performance cores.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { CpuThreadsSlider } from '../../../src/components/settings/textGenAdvancedSections';
import { useAppStore } from '../../../src/stores';
import { hardwareService } from '../../../src/services/hardware';

/** Real per-core sysfs values. cpu_capacity is the scheduler's 0-1024 rating. */
const TOPOLOGIES = {
  // Read off the connected OnePlus CPH2707: 3 efficiency, 4 performance, 1 prime.
  'CPH2707 (3+4+1)': { capacities: [380, 380, 380, 873, 873, 873, 873, 1024], expected: 4 },
  // Classic big.LITTLE: four performance cores, four efficiency.
  'big.LITTLE (4+4)': { capacities: [1024, 1024, 1024, 1024, 410, 410, 410, 410], expected: 4 },
  // Two performance cores over six efficiency (mid-range MediaTek shape).
  'two-cluster (2+6)': { capacities: [1024, 1024, 380, 380, 380, 380, 380, 380], expected: 2 },
  // Uniform: every core is a performance core.
  'uniform (8)': { capacities: [1024, 1024, 1024, 1024, 1024, 1024, 1024, 1024], expected: 8 },
};

/** The filesystem, faked at the native line: /proc/cpuinfo lists the cores and each cpuN publishes
 *  its capacity, exactly as the kernel does. */
function serveTopology(capacities: number[]): void {
  const cpuinfo = capacities.map((_unused, cpu) => `processor\t: ${cpu}\n`).join('\n');
  (RNFS.readFile as jest.Mock).mockImplementation((path: string) => {
    if (path === '/proc/cpuinfo') return Promise.resolve(cpuinfo);
    const match = /\/sys\/devices\/system\/cpu\/cpu(\d+)\/cpu_capacity$/.exec(path);
    if (match) return Promise.resolve(`${capacities[Number(match[1])]}\n`);
    return Promise.reject(new Error(`ENOENT: ${path}`));
  });
}

describe('CPU Threads — what the screen says when you have not chosen', () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    // The topology is cached for the process, as it is in the app; each case starts fresh.
    (hardwareService as unknown as { performanceCores: number | null }).performanceCores = null;
    useAppStore.getState().updateSettings({ nThreads: 0 }); // unset: the app's own default
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
  });

  it.each(Object.entries(TOPOLOGIES))(
    'reads %s and offers its performance cores, never a bare "1"',
    async (_name, { capacities, expected }) => {
      serveTopology(capacities);
      const view = render(<CpuThreadsSlider />);

      // It names the setting as automatic and shows the count that will actually run — the "1" this
      // replaces was the slider's own minimum standing in for an unset value.
      await waitFor(() => {
        expect(view.queryByText(`Auto (${expected})`)).not.toBeNull();
      });
      expect(view.queryByText('1')).toBeNull();
    },
  );

  it('shows the number you chose, once you choose one', async () => {
    serveTopology(TOPOLOGIES['CPH2707 (3+4+1)'].capacities);
    const view = render(<CpuThreadsSlider />);
    await waitFor(() => { expect(view.queryByText('Auto (4)')).not.toBeNull(); });

    // A number the user picked is theirs, and the screen stops calling it automatic.
    useAppStore.getState().updateSettings({ nThreads: 6 });

    await waitFor(() => { expect(view.queryByText('6')).not.toBeNull(); });
    expect(view.queryByText(/Auto/)).toBeNull();
  });
});
