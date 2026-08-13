import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { SPACING, TYPOGRAPHY } from '../constants';
import type { ThemeColors, ThemeShadows } from '../theme';
import { useThemedStyles } from '../theme';

export interface SelectDropdownOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  value: string;
  options: readonly SelectDropdownOption[];
  onChange: (value: string) => void;
  accessibilityLabel: string;
  testID?: string;
}

/** One compact Mobile selector for settings whose option count can grow with user data. */
export const SelectDropdown: React.FC<SelectDropdownProps> = ({
  value,
  options,
  onChange,
  accessibilityLabel,
  testID,
}) => {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value) ?? options[0];

  return (
    <View
      style={[
        styles.selectDropdown,
        open && styles.selectDropdownOpen,
      ]}
    >
      <TouchableOpacity
        style={styles.selectDropdownTrigger}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        activeOpacity={0.8}
        onPress={() => setOpen(current => !current)}
        testID={testID}
      >
        <Text style={styles.selectDropdownText} numberOfLines={1}>
          {selected?.label ?? ''}
        </Text>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={styles.selectDropdownIcon.color}
        />
      </TouchableOpacity>
      {open ? (
        <View style={styles.selectDropdownList}>
          {options.map((option, index) => {
            const active = option.value === value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.selectDropdownOption,
                  index < options.length - 1 &&
                    styles.selectDropdownOptionBorder,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={0.8}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                testID={
                  testID ? `${testID}-option-${option.value}` : undefined
                }
              >
                <Text
                  style={[
                    styles.selectDropdownOptionText,
                    active && styles.selectDropdownOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                {active ? (
                  <Icon
                    name="check"
                    size={16}
                    color={styles.selectDropdownIconActive.color}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

function createStyles(colors: ThemeColors, shadows: ThemeShadows) {
  return {
    selectDropdown: {
      width: '100%' as const,
      position: 'relative' as const,
    },
    selectDropdownOpen: {
      zIndex: 100,
    },
    selectDropdownTrigger: {
      minHeight: 44,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
    },
    selectDropdownText: {
      ...TYPOGRAPHY.body,
      color: colors.text,
      flex: 1,
    },
    selectDropdownIcon: { color: colors.textMuted },
    selectDropdownIconActive: { color: colors.primary },
    selectDropdownList: {
      position: 'absolute' as const,
      top: 44 + SPACING.xs,
      left: 0,
      right: 0,
      zIndex: 100,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      overflow: 'hidden' as const,
      ...shadows.medium,
    },
    selectDropdownOption: {
      minHeight: 44,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    selectDropdownOptionBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    selectDropdownOptionText: {
      ...TYPOGRAPHY.body,
      color: colors.text,
      flex: 1,
    },
    selectDropdownOptionTextActive: {
      color: colors.primary,
    },
  };
}
