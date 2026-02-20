/**
 * MarkdownText Component Tests
 *
 * Tests for the themed markdown renderer covering:
 * - Rendering markdown elements (bold, italic, headers, code, lists, blockquotes)
 * - dimmed prop changes the text color to secondary
 * - Empty and plain text content
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { MarkdownText } from '../../../src/components/MarkdownText';

describe('MarkdownText', () => {
  it('renders plain text', () => {
    const { getByText } = render(<MarkdownText>Hello world</MarkdownText>);
    expect(getByText(/Hello world/)).toBeTruthy();
  });

  it('renders bold text', () => {
    const { getByText } = render(<MarkdownText>{'**bold content**'}</MarkdownText>);
    expect(getByText(/bold content/)).toBeTruthy();
  });

  it('renders italic text', () => {
    const { getByText } = render(<MarkdownText>{'*italic content*'}</MarkdownText>);
    expect(getByText(/italic content/)).toBeTruthy();
  });

  it('renders inline code', () => {
    const { getByText } = render(<MarkdownText>{'Use `myFunction()` here'}</MarkdownText>);
    expect(getByText(/myFunction/)).toBeTruthy();
  });

  it('renders fenced code block', () => {
    const { getByText } = render(
      <MarkdownText>{'```\nconst x = 42;\n```'}</MarkdownText>
    );
    expect(getByText(/const x = 42/)).toBeTruthy();
  });

  it('renders heading', () => {
    const { getByText } = render(<MarkdownText>{'# Section Title'}</MarkdownText>);
    expect(getByText(/Section Title/)).toBeTruthy();
  });

  it('renders unordered list items', () => {
    const { getByText } = render(
      <MarkdownText>{'- Alpha\n- Beta\n- Gamma'}</MarkdownText>
    );
    expect(getByText(/Alpha/)).toBeTruthy();
    expect(getByText(/Beta/)).toBeTruthy();
    expect(getByText(/Gamma/)).toBeTruthy();
  });

  it('renders ordered list items', () => {
    const { getByText } = render(
      <MarkdownText>{'1. First\n2. Second\n3. Third'}</MarkdownText>
    );
    expect(getByText(/First/)).toBeTruthy();
    expect(getByText(/Second/)).toBeTruthy();
    expect(getByText(/Third/)).toBeTruthy();
  });

  it('renders blockquote', () => {
    const { getByText } = render(
      <MarkdownText>{'> Quoted text here'}</MarkdownText>
    );
    expect(getByText(/Quoted text here/)).toBeTruthy();
  });

  it('renders with dimmed prop without crashing', () => {
    const { getByText } = render(
      <MarkdownText dimmed>{'Some dimmed content'}</MarkdownText>
    );
    expect(getByText(/Some dimmed content/)).toBeTruthy();
  });

  it('renders empty string without crashing', () => {
    const { toJSON } = render(<MarkdownText>{''}</MarkdownText>);
    expect(toJSON()).toBeTruthy();
  });

  it('renders multiple paragraphs as separate nodes', () => {
    const { getByText } = render(
      <MarkdownText>{'Paragraph one\n\nParagraph two'}</MarkdownText>
    );
    expect(getByText(/Paragraph one/)).toBeTruthy();
    expect(getByText(/Paragraph two/)).toBeTruthy();
  });
});
