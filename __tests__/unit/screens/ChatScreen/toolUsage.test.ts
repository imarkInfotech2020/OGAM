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
    it('triggers on "latest" keyword', () => {
      expect(shouldUseToolsForMessage('What is the latest news?', ['web_search'])).toBe(true);
    });

    it('triggers on "current" keyword', () => {
      expect(shouldUseToolsForMessage('What is the current weather?', ['web_search'])).toBe(true);
    });

    it('triggers on "news" keyword', () => {
      expect(shouldUseToolsForMessage('Tell me the news', ['web_search'])).toBe(true);
    });

    it('triggers on "search" keyword', () => {
      expect(shouldUseToolsForMessage('Search for cats', ['web_search'])).toBe(true);
    });

    it('triggers on "look up" keyword', () => {
      expect(shouldUseToolsForMessage('Look up that topic', ['web_search'])).toBe(true);
    });

    it('does not trigger without web search keywords', () => {
      expect(shouldUseToolsForMessage('What is 2 + 2?', ['web_search'])).toBe(false);
    });
  });

  describe('calculator tool', () => {
    it('triggers on simple math expression', () => {
      expect(shouldUseToolsForMessage('2 + 2', ['calculator'])).toBe(true);
    });

    it('triggers on complex math expression', () => {
      expect(shouldUseToolsForMessage('(10 + 5) * 3 - 8 / 2', ['calculator'])).toBe(true);
    });

    it('triggers on "calculate" keyword', () => {
      expect(shouldUseToolsForMessage('Calculate the total', ['calculator'])).toBe(true);
    });

    it('triggers on "solve" keyword', () => {
      expect(shouldUseToolsForMessage('Solve this problem', ['calculator'])).toBe(true);
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

    it('handles decimal numbers', () => {
      expect(shouldUseToolsForMessage('3.14 * 2', ['calculator'])).toBe(true);
    });

    it('handles percentages', () => {
      expect(shouldUseToolsForMessage('100 % 7', ['calculator'])).toBe(true);
    });

    it('handles power operator', () => {
      expect(shouldUseToolsForMessage('2 ^ 8', ['calculator'])).toBe(true);
    });
  });

  describe('get_current_datetime tool', () => {
    it('triggers on "time" keyword', () => {
      expect(shouldUseToolsForMessage('What time is it?', ['get_current_datetime'])).toBe(true);
    });

    it('triggers on "date" keyword', () => {
      expect(shouldUseToolsForMessage("What's the date today?", ['get_current_datetime'])).toBe(true);
    });

    it('triggers on "day" keyword', () => {
      expect(shouldUseToolsForMessage('What day is it?', ['get_current_datetime'])).toBe(true);
    });

    it('triggers on "what\'s the time" phrase', () => {
      expect(shouldUseToolsForMessage("What's the time?", ['get_current_datetime'])).toBe(true);
    });

    it('triggers on "what is the time" phrase', () => {
      expect(shouldUseToolsForMessage('What is the time?', ['get_current_datetime'])).toBe(true);
    });

    it('does not trigger without time keywords', () => {
      expect(shouldUseToolsForMessage('Hello world', ['get_current_datetime'])).toBe(false);
    });
  });

  describe('get_device_info tool', () => {
    it('triggers on "device" keyword', () => {
      expect(shouldUseToolsForMessage('What device am I using?', ['get_device_info'])).toBe(true);
    });

    it('triggers on "battery" keyword', () => {
      expect(shouldUseToolsForMessage('Check my battery level', ['get_device_info'])).toBe(true);
    });

    it('triggers on "storage" keyword', () => {
      expect(shouldUseToolsForMessage('How much storage do I have?', ['get_device_info'])).toBe(true);
    });

    it('triggers on "memory" keyword', () => {
      expect(shouldUseToolsForMessage('Show memory usage', ['get_device_info'])).toBe(true);
    });

    it('triggers on "ram" keyword', () => {
      expect(shouldUseToolsForMessage('How much RAM?', ['get_device_info'])).toBe(true);
    });

    it('does not trigger without device keywords', () => {
      expect(shouldUseToolsForMessage('Hello world', ['get_device_info'])).toBe(false);
    });
  });

  describe('read_url tool', () => {
    it('triggers on URL in message', () => {
      expect(shouldUseToolsForMessage('Check https://example.com', ['read_url'])).toBe(true);
    });

    it('triggers on HTTP URL', () => {
      expect(shouldUseToolsForMessage('Open http://test.org', ['read_url'])).toBe(true);
    });

    it('triggers on "read this url" phrase', () => {
      expect(shouldUseToolsForMessage('Read this url please', ['read_url'])).toBe(true);
    });

    it('triggers on "summarize this link" phrase', () => {
      expect(shouldUseToolsForMessage('Summarize this link', ['read_url'])).toBe(true);
    });

    it('triggers on "fetch this page" phrase', () => {
      expect(shouldUseToolsForMessage('Fetch this page', ['read_url'])).toBe(true);
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