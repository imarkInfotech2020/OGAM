/* eslint-disable max-lines-per-function */
import type { ThemeColors, ThemeShadows } from '../../theme';
import { TYPOGRAPHY } from '../../constants';

export const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  tabBar: {
    flexDirection: 'row' as const,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    gap: 8,
  },
  tabActive: {
    backgroundColor: `${colors.primary}20`,
  },
  tabText: {
    ...TYPOGRAPHY.body,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: `${colors.primary}30`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tabBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  loadingBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: `${colors.primary}20`,
    paddingVertical: 10,
    gap: 10,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
  },
  content: {
    padding: 16,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  loadedSection: {
    marginBottom: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  loadedSectionImage: {
    borderColor: `${colors.info}40`,
  },
  loadedHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 10,
  },
  loadedLabel: {
    ...TYPOGRAPHY.label,
    color: colors.success,
    textTransform: 'uppercase' as const,
  },
  loadedModelItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  loadedModelInfo: {
    flex: 1,
  },
  loadedModelName: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    marginBottom: 2,
  },
  loadedModelMeta: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
  },
  unloadButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: `${colors.error}15`,
    gap: 6,
  },
  unloadButtonText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.error,
  },
  sectionTitle: {
    ...TYPOGRAPHY.label,
    color: colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase' as const,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
  modelItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  modelItemSelected: {
    backgroundColor: `${colors.primary}15`,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modelItemSelectedImage: {
    backgroundColor: `${colors.info}15`,
    borderWidth: 1,
    borderColor: colors.info,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    marginBottom: 4,
  },
  modelNameSelected: {
    color: colors.primary,
  },
  modelNameSelectedImage: {
    color: colors.info,
  },
  modelMeta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  modelSize: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
  },
  metaSeparator: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
    marginHorizontal: 6,
  },
  modelQuant: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
  },
  modelStyle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
  },
  visionBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: `${colors.info}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  visionBadgeText: {
    ...TYPOGRAPHY.label,
    color: colors.info,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkmarkImage: {
    backgroundColor: colors.info,
  },
  // Remote tab styles
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  addButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.background,
    fontWeight: '600' as const,
  },
  addServerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  addServerButtonText: {
    ...TYPOGRAPHY.body,
    color: colors.primary,
    fontWeight: '600' as const,
  },
  remoteModelsContainer: {
    marginTop: 8,
    marginLeft: 16,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.surfaceLight,
  },
  remoteModelItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
  },
  remoteModelName: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  capabilityBadges: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  capabilityBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  moreModelsText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
    marginTop: 4,
  },
  statusText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '500' as const,
  },
  sectionSubTitle: {
    ...TYPOGRAPHY.label,
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  sectionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
  },
  remoteBadge: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.warning,
  },
  modelItemSelectedRemote: {
    backgroundColor: `${colors.warning}10`,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  modelNameSelectedRemote: {
    color: colors.warning,
  },
  checkmarkRemote: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.warning,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  toolBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: `${colors.warning}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
});
