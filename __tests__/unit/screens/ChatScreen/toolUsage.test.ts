/**
 * Tool Usage Detection Unit Tests
 *
 * Tests for determining when tools should be automatically triggered.
 */

import { shouldUseToolsForMessage } from '../../../../src/screens/ChatScreen/toolUsage';

describe('shouldUseToolsForMessage', () => {
  describe('basic cases', () => {
    it('returns false for empty message', () => {
      expect(shouldUseToolsForMessage('', ['web_search'])).toBe(false);
    });

    it('returns false for whitespace-only message', () => {
      expect(shouldUseToolsForMessage('   ', ['web_search'])).toBe(false);
    });

    it('returns false when no tools enabled', () => {
      expect(shouldUseToolsForMessage('What is the weather today?', [])).toBe(false);
    });

    it('returns false for message without tool triggers', () => {
      expect(shouldUseToolsForMessage('Hello world', ['web_search', 'calculator'])).toBe(false);
    });
  });

  describe('web_search tool', () => {
    test.each([
      ['latest', 'What is the latest news?'],
      ['current', 'What is the current weather?'],
      ['news', 'Tell me the news'],
      ['search', 'Search for cats'],
      ['look up', 'Look up that topic'],
    ])('triggers on "%s" keyword', (_keyword, message) => {
      expect(shouldUseToolsForMessage(message, ['web_search'])).toBe(true);
    });

    it('does not trigger without web search keywords', () => {
      expect(shouldUseToolsForMessage('What is 2 + 2?', ['web_search'])).toBe(false);
    });
  });

  describe('calculator tool', () => {
    test.each([
      ['simple math expression', '2 + 2'],
      ['complex math expression', '(10 + 5) * 3 - 8 / 2'],
      ['"calculate" keyword', 'Calculate the total'],
      ['"solve" keyword', 'Solve this problem'],
      ['decimal numbers', '3.14 * 2'],
      ['percentages', '100 % 7'],
      ['power operator', '2 ^ 8'],
    ])('triggers on %s', (_label, message) => {
      expect(shouldUseToolsForMessage(message, ['calculator'])).toBe(true);
    });

    it('triggers on word math expressions', () => {
      expect(shouldUseToolsForMessage('5 plus 3', ['calculator'])).toBe(true);
      expect(shouldUseToolsForMessage('10 minus 5', ['calculator'])).toBe(true);
      expect(shouldUseToolsForMessage('4 times 3', ['calculator'])).toBe(true);
      expect(shouldUseToolsForMessage('20 divided by 4', ['calculator'])).toBe(true);
    });

    it('does not trigger on non-math text', () => {
      expect(shouldUseToolsForMessage('Hello there', ['calculator'])).toBe(false);
    });

    it('does not trigger on math without leading digit', () => {
      expect(shouldUseToolsForMessage('Add these numbers', ['calculator'])).toBe(false);
    });
  });

  describe('get_current_datetime tool', () => {
    test.each([
      ['"time" keyword', 'What time is it?'],
      ['"date" keyword', "What's the date today?"],
      ['"day" keyword', 'What day is it?'],
      ['"what\'s the time" phrase', "What's the time?"],
      ['"what is the time" phrase', 'What is the time?'],
    ])('triggers on %s', (_label, message) => {
      expect(shouldUseToolsForMessage(message, ['get_current_datetime'])).toBe(true);
    });

    it('does not trigger without time keywords', () => {
      expect(shouldUseToolsForMessage('Hello world', ['get_current_datetime'])).toBe(false);
    });
  });

  describe('get_device_info tool', () => {
    test.each([
      ['device', 'What device am I using?'],
      ['battery', 'Check my battery level'],
      ['storage', 'How much storage do I have?'],
      ['memory', 'Show memory usage'],
      ['ram', 'How much RAM?'],
    ])('triggers on "%s" keyword', (_keyword, message) => {
      expect(shouldUseToolsForMessage(message, ['get_device_info'])).toBe(true);
    });

    it('does not trigger without device keywords', () => {
      expect(shouldUseToolsForMessage('Hello world', ['get_device_info'])).toBe(false);
    });
  });

  describe('read_url tool', () => {
    test.each([
      ['URL in message', 'Check https://example.com'],
      ['HTTP URL', 'Open http://test.org'],
      ['"read this url" phrase', 'Read this url please'],
      ['"summarize this link" phrase', 'Summarize this link'],
      ['"fetch this page" phrase', 'Fetch this page'],
    ])('triggers on %s', (_label, message) => {
      expect(shouldUseToolsForMessage(message, ['read_url'])).toBe(true);
    });

    it('does not trigger without URL keywords', () => {
      expect(shouldUseToolsForMessage('Hello world', ['read_url'])).toBe(false);
    });
  });

  describe('multiple tools', () => {
    it('returns true when any tool matches', () => {
      expect(shouldUseToolsForMessage('What is the weather?', ['web_search', 'calculator', 'get_current_datetime'])).toBe(true);
    });

    it('returns false when no tool matches', () => {
      expect(shouldUseToolsForMessage('Tell me a joke', ['web_search', 'calculator'])).toBe(false);
    });

    it('handles unknown tools gracefully', () => {
      expect(shouldUseToolsForMessage('Hello', ['unknown_tool', 'another_unknown'])).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles case insensitivity', () => {
      expect(shouldUseToolsForMessage('WHAT IS THE LATEST NEWS?', ['web_search'])).toBe(true);
      expect(shouldUseToolsForMessage('What TIME is it?', ['get_current_datetime'])).toBe(true);
    });

    it('handles leading/trailing whitespace', () => {
      expect(shouldUseToolsForMessage('  What is the weather today?  ', ['web_search'])).toBe(true);
    });

    it('handles negative numbers in math', () => {
      expect(shouldUseToolsForMessage('-5 + 3', ['calculator'])).toBe(true);
    });

    it('handles parentheses in math', () => {
      expect(shouldUseToolsForMessage('(2 + 3) * 4', ['calculator'])).toBe(true);
    });

    it('rejects math with letters', () => {
      expect(shouldUseToolsForMessage('2 + x', ['calculator'])).toBe(false);
    });

    it('rejects empty parentheses in math', () => {
      expect(shouldUseToolsForMessage('()', ['calculator'])).toBe(false);
    });
  });
});