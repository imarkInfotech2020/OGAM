/**
 * The tool-call surfaces of a chat message: what the model asked a tool to do, what came back, and
 * the routed-tools row above a reply.
 *
 * Extracted from ChatMessage, which had grown past the 500-line cap with these living inside it. They
 * are their own subject - a tool result is not a message bubble - and nothing here is shared with the
 * bubble beyond the styles object.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../../theme';
import { useAccordionExpanded } from '../../../stores';
import { CustomAlert, type AlertState } from '../../CustomAlert';
import { MarkdownText } from '../../MarkdownText';
import { ToolsSentCollapsible } from './ToolsSentCollapsible';
import type { createStyles } from '../styles';
import type { Message } from '../../../types';

export function getToolIcon(toolName?: string): string {
  switch (toolName) {
    case 'web_search':
      return 'globe';
    case 'calculator':
      return 'hash';
    case 'get_current_datetime':
      return 'clock';
    case 'get_device_info':
      return 'smartphone';
    default:
      return 'tool';
  }
}

export function getToolLabel(toolName?: string, content?: string): string {
  switch (toolName) {
    case 'web_search': {
      const queryMatch = content
        ? /^No results found for "([^"]+)"/.exec(content)
        : null;
      if (queryMatch) return `Searched: "${queryMatch[1]}" (no results)`;
      return 'Web search result';
    }
    case 'calculator':
      return content || 'Calculated';
    case 'get_current_datetime':
      return 'Retrieved date/time';
    case 'get_device_info':
      return 'Retrieved device info';
    default:
      return toolName || 'Tool result';
  }
}

type ToolResultBubbleProps = {
  /** Stable identity for persisting expanded state across the streaming→finalized
   *  remount (not the message id, which changes on finalize). */
  stableKey: string;
  toolIcon: string;
  toolLabel: string;
  toolName: string;
  durationLabel: string;
  content: string;
  hasDetails: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: any;
};

export const ToolResultBubbleInner: React.FC<ToolResultBubbleProps> = ({
  stableKey,
  toolIcon,
  toolLabel,
  toolName,
  durationLabel,
  content,
  hasDetails,
  styles,
  colors,
}) => {
  const [expanded, toggle] = useAccordionExpanded(`tool-result:${stableKey}`);
  return (
    <View testID="tool-message" style={styles.systemInfoContainer}>
      <TouchableOpacity
        style={styles.toolStatusRow}
        onPress={hasDetails ? toggle : undefined}
        activeOpacity={hasDetails ? 0.6 : 1}
        disabled={!hasDetails}
      >
        <Icon name={toolIcon} size={13} color={colors.textMuted} />
        <Text
          style={styles.toolStatusText}
          numberOfLines={expanded ? undefined : 2}
          testID={`tool-result-label-${toolName || 'unknown'}`}
        >
          {toolLabel}
          {durationLabel}
        </Text>
        {hasDetails && (
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={colors.textMuted}
          />
        )}
      </TouchableOpacity>
      {expanded && hasDetails && (
        <View style={styles.toolDetailContainer}>
          <MarkdownText dimmed>{content}</MarkdownText>
        </View>
      )}
    </View>
  );
};

/**
 * Memoized so token churn on a streaming sibling (which re-renders the chat subtree
 * every token) does not re-render this row and reset its TouchableOpacity press target
 * mid-gesture — the tap-during-streaming drop in bug #37. Props are stable for a
 * finalized tool-result message; the expanded flag lives in accordionStore so a real
 * toggle still re-renders it.
 */
const ToolResultBubble = React.memo(ToolResultBubbleInner);

/** Renders the routed-tools collapsible for a finished assistant message, or nothing. */
export const RoutedToolsRow: React.FC<{
  message: Message;
  isUser: boolean;
  isStreaming?: boolean;
  styles: any;
  colors: any;
}> = ({ message, isUser, isStreaming, styles, colors }) => {
  const names = message.generationMeta?.routedToolNames;
  if (isUser || isStreaming || !names?.length) return null;
  // This row only renders on a finalized assistant message (isStreaming is false),
  // so message.id is already the real, stable id here.
  return (
    <ToolsSentCollapsible
      names={names}
      stableKey={message.id}
      styles={styles}
      colors={colors}
    />
  );
};

export const ToolResultMessage: React.FC<{
  message: Message;
  styles: any;
  colors: any;
}> = ({ message, styles, colors }) => {
  const toolIcon = getToolIcon(message.toolName);
  const toolLabel = getToolLabel(message.toolName, message.content);
  const durationLabel =
    message.generationTimeMs == null ? '' : ` (${message.generationTimeMs}ms)`;
  const hasDetails = !!(
    message.content &&
    message.content.length > 0 &&
    !message.content.startsWith('No results')
  );
  // Prefer toolCallId (carried on every tool-result message and stable across the
  // streaming→finalized remount); fall back to the message id.
  const stableKey = message.toolCallId || message.id;
  return (
    <ToolResultBubble
      stableKey={stableKey}
      toolIcon={toolIcon}
      toolLabel={toolLabel}
      toolName={message.toolName || 'unknown'}
      durationLabel={durationLabel}
      content={message.content}
      hasDetails={hasDetails}
      styles={styles}
      colors={colors}
    />
  );
};

export const SyncedToolArtifacts: React.FC<{
  message: Message;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
}> = ({ message, styles, colors }) => (
  <>
    {message.toolArtifacts?.map((artifact, index) => (
      <ToolResultBubble
        key={`${artifact.name}:${index}`}
        stableKey={`${message.uuid ?? message.id}:${artifact.name}:${index}`}
        toolIcon={getToolIcon(artifact.name)}
        toolLabel={getToolLabel(artifact.name, artifact.result)}
        toolName={artifact.name}
        durationLabel=""
        content={artifact.result}
        hasDetails={artifact.result.length > 0}
        styles={styles}
        colors={colors}
      />
    ))}
  </>
);

export const ToolCallMessage: React.FC<{
  message: Message;
  styles: any;
  colors: any;
}> = ({ message, styles, colors }) => (
  <View testID="tool-call-message" style={styles.systemInfoContainer}>
    {message.toolCalls?.map((tc, i) => {
      let argsPreview = '';
      try {
        argsPreview = Object.values(JSON.parse(tc.arguments)).join(', ');
      } catch {
        argsPreview = tc.arguments;
      }
      return (
        <View key={`${tc.id || i}`} style={styles.toolStatusRow}>
          <Icon name={getToolIcon(tc.name)} size={13} color={colors.primary} />
          <Text
            style={[styles.toolStatusText, { color: colors.primary }]}
            numberOfLines={1}
          >
            Using {tc.name}
            {argsPreview ? `: ${argsPreview}` : ''}
          </Text>
        </View>
      );
    })}
  </View>
);

export const SystemInfoMessage: React.FC<{
  content: string;
  styles: ReturnType<typeof createStyles>;
  alertState: AlertState;
  onCloseAlert: () => void;
}> = ({ content, styles, alertState, onCloseAlert }) => (
  <>
    <View testID="system-info-message" style={styles.systemInfoContainer}>
      <Text style={styles.systemInfoText}>{content}</Text>
    </View>
    <CustomAlert
      visible={alertState.visible}
      title={alertState.title}
      message={alertState.message}
      buttons={alertState.buttons}
      onClose={onCloseAlert}
    />
  </>
);
