/* eslint-disable max-lines, complexity */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Icon from 'react-native-vector-icons/Feather';
import { pick, keepLocalCopy } from '@react-native-documents/picker';
import { Button } from '../components/Button';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { useTheme, useThemedStyles } from '../theme';
import { createStyles } from './ProjectDetailScreen.styles';
import { useChatStore, useProjectStore, useAppStore } from '../stores';
import { ragService } from '../services/rag';
import type { RagDocument } from '../services/rag';
import { Conversation } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ProjectDetail'>;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface KBSectionProps {
  projectId: string;
  colors: any;
  styles: any;
  setAlertState: (state: AlertState) => void;
  onNavigateToKb: () => void;
  onDocumentPress: (doc: RagDocument) => void;
}

const KnowledgeBaseSection: React.FC<KBSectionProps> = ({ projectId, colors, styles, setAlertState, onNavigateToKb, onDocumentPress }) => {
  const [kbDocs, setKbDocs] = useState<RagDocument[]>([]);
  const [indexingFile, setIndexingFile] = useState<string | null>(null);

  const loadKbDocs = useCallback(async () => {
    try { setKbDocs(await ragService.getDocumentsByProject(projectId)); }
    catch (err: any) { setAlertState(showAlert('Error', err?.message || 'Failed to load documents')); }
  }, [projectId, setAlertState]);

  useEffect(() => { loadKbDocs(); }, [loadKbDocs]);

  const handleAddDocument = async () => {
    try {
      // Allow multi-select for knowledge base uploads
      const files = await pick({ mode: 'open', allowMultiSelection: true });
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || 'document';
        setIndexingFile(files.length > 1 ? `${fileName} (${i + 1}/${files.length})` : fileName);

        console.log('[DocumentPicker] Original URI:', file.uri);
        console.log('[DocumentPicker] File name:', fileName, 'Size:', file.size);

        let filePath = file.uri;
        try {
          const copyResult = await keepLocalCopy({
            files: [{ uri: file.uri, fileName }],
            destination: 'documentDirectory',
          });
          console.log('[DocumentPicker] keepLocalCopy result:', JSON.stringify(copyResult));
          if (copyResult[0]?.status === 'success' && copyResult[0].localUri) {
            filePath = copyResult[0].localUri;
            console.log('[DocumentPicker] Using localUri:', filePath);
          } else if (copyResult[0]?.status === 'error') {
            console.warn('[DocumentPicker] keepLocalCopy failed:', copyResult[0].copyError);
          }
        } catch (copyErr: any) {
          console.warn('[DocumentPicker] keepLocalCopy error:', copyErr?.message);
        }

        // Decode the file path and strip file:// prefix for storage
        let pathForDb = filePath;
        try {
          pathForDb = decodeURIComponent(filePath).replace(/^file:\/\//, '');
          console.log('[DocumentPicker] Path for DB storage:', pathForDb);
        } catch (e) {
          console.warn('[DocumentPicker] Could not decode path:', e);
        }

        console.log('[DocumentPicker] Final filePath for indexing:', pathForDb);
        await ragService.indexDocument({ projectId, filePath: pathForDb, fileName, fileSize: file.size || 0 });
        await loadKbDocs();
      }

      await loadKbDocs();
    } catch (err: any) {
      if (err && !err.message?.includes('cancel')) {
        setAlertState(showAlert('Error', err.message || 'Failed to index document'));
      }
    } finally {
      setIndexingFile(null);
    }
  };

  const handleToggleDocument = async (docId: number, enabled: boolean) => {
    try { await ragService.toggleDocument(docId, enabled); await loadKbDocs(); }
    catch (err: any) { setAlertState(showAlert('Error', err?.message || 'Failed to update document')); }
  };

  const handleDeleteDocument = (doc: RagDocument) => {
    setAlertState(showAlert('Remove Document', `Remove "${doc.name}" from the knowledge base?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        ragService.deleteDocument(doc.id).then(() => loadKbDocs())
          .catch((err: any) => setAlertState(showAlert('Error', err?.message || 'Failed to remove document')));
      }},
    ]));
  };

  return (
    <View style={styles.sectionContent}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onNavigateToKb}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Knowledge Base</Text>
          {kbDocs.length > 0 && (
            <Text style={styles.sectionCount}>{kbDocs.length}</Text>
          )}
        </View>
        <View style={styles.sectionActions}>
          <Button
            title="Add"
            variant="primary"
            size="small"
            onPress={handleAddDocument}
            icon={<Icon name="plus" size={16} color={colors.primary} />}
          />
          <Icon
            name="chevron-right"
            size={16}
            color={colors.textMuted}
            style={styles.navIcon}
          />
        </View>
      </TouchableOpacity>

      {indexingFile && (
        <View style={styles.kbIndexing}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.kbIndexingText} numberOfLines={1}>Indexing {indexingFile}...</Text>
        </View>
      )}

      {kbDocs.length === 0 && !indexingFile ? (
        <View style={styles.emptyState}>
          <Icon name="file-text" size={24} color={colors.textMuted} />
          <Text style={styles.emptyStateText}>No documents added</Text>
        </View>
      ) : (
        <ScrollView style={styles.sectionList} nestedScrollEnabled>
          {kbDocs.map((doc) => (
            <TouchableOpacity key={doc.id} style={styles.kbDocRow} onPress={() => onDocumentPress(doc)} activeOpacity={0.7}>
              <View style={styles.kbDocInfo}>
                <Text style={styles.kbDocName} numberOfLines={1}>{doc.name}</Text>
                <Text style={styles.kbDocSize}>{formatFileSize(doc.size)}</Text>
              </View>
              <Switch value={doc.enabled === 1} onValueChange={(val) => handleToggleDocument(doc.id, val)}
                trackColor={{ false: colors.border, true: colors.primary }} />
              <TouchableOpacity style={styles.kbDocDelete} onPress={() => handleDeleteDocument(doc)}>
                <Icon name="trash-2" size={14} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

export const ProjectDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { projectId } = route.params;
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { getProject, deleteProject } = useProjectStore();
  const { conversations, deleteConversation, setActiveConversation, createConversation } = useChatStore();
  const { downloadedModels, activeModelId } = useAppStore();

  const project = getProject(projectId);
  const hasModels = downloadedModels.length > 0;

  // Get chats for this project
  const projectChats = conversations
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleChatPress = (conversation: Conversation) => {
    setActiveConversation(conversation.id);
    navigation.navigate('Chat', { conversationId: conversation.id });
  };

  const handleNewChat = () => {
    if (!hasModels) {
      setAlertState(showAlert('No Model', 'Please download a model first from the Models tab.'));
      return;
    }
    const modelId = activeModelId || downloadedModels[0]?.id;
    if (modelId) {
      const newConversationId = createConversation(modelId, undefined, projectId);
      navigation.navigate('Chat', { conversationId: newConversationId, projectId });
    }
  };

  const handleDeleteProject = () => {
    setAlertState(showAlert(
      'Delete Project',
      `Delete "${project?.name}"? This will not delete the chats associated with this project.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProject(projectId);
            navigation.goBack();
          },
        },
      ]
    ));
  };

  const handleDeleteChat = (conversation: Conversation) => {
    setAlertState(showAlert(
      'Delete Chat',
      `Delete "${conversation.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteConversation(conversation.id),
        },
      ]
    ));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderChatRightActions = (conversation: Conversation) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteChat(conversation)}
    >
      <Icon name="trash-2" size={16} color={colors.error} />
    </TouchableOpacity>
  );

  const renderChat = ({ item }: { item: Conversation }) => {
    const lastMessage = item.messages[item.messages.length - 1];

    return (
      <Swipeable
        renderRightActions={() => renderChatRightActions(item)}
        overshootRight={false}
        containerStyle={styles.swipeableContainer}
      >
        <TouchableOpacity
          style={styles.chatItem}
          onPress={() => handleChatPress(item)}
        >
          <View style={styles.chatIcon}>
            <Icon name="message-circle" size={14} color={colors.textMuted} />
          </View>
          <View style={styles.chatContent}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.chatDate}>{formatDate(item.updatedAt)}</Text>
            </View>
            {lastMessage && (
              <Text style={styles.chatPreview} numberOfLines={1}>
                {lastMessage.role === 'user' ? 'You: ' : ''}{lastMessage.content}
              </Text>
            )}
          </View>
          <Icon name="chevron-right" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Project not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.errorLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.projectIcon}>
            <Text style={styles.projectIconText}>
              {project.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>{project.name}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ProjectEdit', { projectId })} style={styles.editButton}>
          <Icon name="edit-2" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionsContainer}>
        {/* Knowledge Base Section */}
        <View style={styles.sectionHalf}>
          <KnowledgeBaseSection
            projectId={projectId}
            colors={colors}
            styles={styles}
            setAlertState={setAlertState}
            onNavigateToKb={() => navigation.navigate('KnowledgeBase', { projectId })}
            onDocumentPress={(doc) => navigation.navigate('DocumentPreview', { filePath: doc.path, fileName: doc.name, fileSize: doc.size })}
          />
        </View>

        {/* Chats Section */}
        <View style={styles.sectionHalf}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => navigation.navigate('ProjectChats', { projectId })}
            activeOpacity={0.7}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Chats</Text>
              {projectChats.length > 0 && (
                <Text style={styles.sectionCount}>{projectChats.length}</Text>
              )}
            </View>
            <View style={styles.sectionActions}>
              <Button
                title="New"
                variant="primary"
                size="small"
                onPress={handleNewChat}
                disabled={!hasModels}
                icon={<Icon name="plus" size={16} color={hasModels ? colors.primary : colors.textDisabled} />}
              />
              <Icon
                name="chevron-right"
                size={16}
                color={colors.textMuted}
                style={styles.navIcon}
              />
            </View>
          </TouchableOpacity>

          <ScrollView style={styles.sectionList} nestedScrollEnabled>
            {projectChats.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="message-circle" size={24} color={colors.textMuted} />
                <Text style={styles.emptyStateText}>No chats yet</Text>
                {hasModels && (
                  <Button
                    title="Start a Chat"
                    variant="primary"
                    size="small"
                    onPress={handleNewChat}
                    style={styles.emptyStateButton}
                  />
                )}
              </View>
            ) : (
              projectChats.map((chat) => (
                <View key={chat.id} style={styles.chatItemWrapper}>
                  {renderChat({ item: chat })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      {/* Delete Project Button */}
      <View style={styles.footer}>
        <Button
          title="Delete Project"
          variant="ghost"
          size="medium"
          onPress={handleDeleteProject}
          icon={<Icon name="trash-2" size={16} color={colors.error} />}
          textStyle={{ color: colors.error }}
        />
      </View>
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};