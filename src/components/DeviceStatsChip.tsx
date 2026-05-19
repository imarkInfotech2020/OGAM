import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { liteRTService, LiteRTMemoryInfo } from '../services/litert';
import { useTheme } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';

interface Props {
  visible: boolean;
  onPress?: () => void;
}

export const DeviceStatsChip: React.FC<Props> = ({ visible, onPress }) => {
  const { colors } = useTheme();
  const [mem, setMem] = useState<LiteRTMemoryInfo | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || !liteRTService.isAvailable()) return;

    const refresh = async () => {
      const info = await liteRTService.getMemoryInfo();
      if (info) setMem(info);
    };

    refresh();
    intervalRef.current = setInterval(refresh, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible]);

  if (!visible || !liteRTService.isAvailable() || !mem) return null;

  const usedPct = Math.round((mem.usedRamMb / mem.totalRamMb) * 100);
  const barColor = mem.lowMemory ? colors.error : usedPct > 80 ? '#FF9F0A' : colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>RAM</Text>
        <Text style={[styles.value, { color: barColor }]}>
          {Math.round(mem.usedRamMb / 1024 * 10) / 10}
          <Text style={[styles.unit, { color: colors.textSecondary }]}>/</Text>
          {Math.round(mem.totalRamMb / 1024 * 10) / 10}
          <Text style={[styles.unit, { color: colors.textSecondary }]}>GB</Text>
        </Text>
      </View>
      {mem.gpuPrivateMb > 0 && (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>GPU</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {mem.gpuPrivateMb}
            <Text style={[styles.unit, { color: colors.textSecondary }]}>MB</Text>
          </Text>
        </View>
      )}
      {mem.lowMemory && (
        <Text style={[styles.warn, { color: colors.error }]}>low mem</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    zIndex: 100,
    minWidth: 90,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    ...TYPOGRAPHY.meta,
    fontSize: 10,
  },
  value: {
    ...TYPOGRAPHY.meta,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 9,
  },
  warn: {
    ...TYPOGRAPHY.meta,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },
});
