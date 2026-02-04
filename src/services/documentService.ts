/**
 * DocumentService - Handles reading and parsing document files
 * Supports: text files, code files, CSV, JSON, and other text-based formats
 * Note: Document picker removed due to compatibility issues.
 * Documents can still be processed if shared to the app or read from known paths.
 * Note: PDF support requires native modules not currently available.
 */

import RNFS from 'react-native-fs';
import { MediaAttachment } from '../types';

// File extensions we can read as text
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.log', '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.swift', '.kt', '.go', '.rs', '.rb', '.php', '.sql', '.sh', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'];

// Max file size we'll read (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

class DocumentService {
  /**
   * Check if a file extension is supported
   */
  isSupported(fileName: string): boolean {
    const extension = '.' + fileName.split('.').pop()?.toLowerCase();
    return TEXT_EXTENSIONS.includes(extension);
  }

  /**
   * Process a document from a file path
   */
  async processDocumentFromPath(filePath: string, fileName?: string): Promise<MediaAttachment | null> {
    try {
      // Check if file exists
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        throw new Error('File not found');
      }

      // Get file info
      const stat = await RNFS.stat(filePath);

      // Check file size
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error(`File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }

      const name = fileName || filePath.split('/').pop() || 'document';
      const extension = '.' + name.split('.').pop()?.toLowerCase();

      // Check if we can read this file type
      if (!TEXT_EXTENSIONS.includes(extension)) {
        throw new Error(`Unsupported file type: ${extension}. Supported: txt, md, csv, json, code files`);
      }

      // Read the file content
      let textContent = await RNFS.readFile(filePath, 'utf8');

      // Truncate if too long (keep first 50k chars for context limits)
      const maxChars = 50000;
      if (textContent.length > maxChars) {
        textContent = textContent.substring(0, maxChars) + '\n\n... [Content truncated due to length]';
      }

      return {
        id: Date.now().toString(),
        type: 'document',
        uri: filePath,
        fileName: name,
        textContent,
        fileSize: stat.size,
      };
    } catch (error: any) {
      console.error('[DocumentService] Error processing document:', error);
      throw error;
    }
  }

  /**
   * Create a document attachment from pasted text
   */
  createFromText(text: string, fileName: string = 'pasted-text.txt'): MediaAttachment {
    // Truncate if too long
    const maxChars = 50000;
    let textContent = text;
    if (textContent.length > maxChars) {
      textContent = textContent.substring(0, maxChars) + '\n\n... [Content truncated due to length]';
    }

    return {
      id: Date.now().toString(),
      type: 'document',
      uri: '',
      fileName,
      textContent,
      fileSize: text.length,
    };
  }

  /**
   * Format document content for including in LLM context
   */
  formatForContext(attachment: MediaAttachment): string {
    if (attachment.type !== 'document' || !attachment.textContent) {
      return '';
    }

    const fileName = attachment.fileName || 'document';
    return `\n\n---\n📄 **Attached Document: ${fileName}**\n\`\`\`\n${attachment.textContent}\n\`\`\`\n---\n`;
  }

  /**
   * Get a short preview of document content
   */
  getPreview(attachment: MediaAttachment, maxLength: number = 100): string {
    if (attachment.type !== 'document' || !attachment.textContent) {
      return attachment.fileName || 'Document';
    }

    const preview = attachment.textContent.substring(0, maxLength).replace(/\n/g, ' ');
    return preview.length < attachment.textContent.length ? preview + '...' : preview;
  }

  /**
   * Get list of supported file extensions
   */
  getSupportedExtensions(): string[] {
    return TEXT_EXTENSIONS;
  }
}

export const documentService = new DocumentService();
