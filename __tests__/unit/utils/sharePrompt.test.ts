import { shouldShowSharePrompt, subscribeSharePrompt, emitSharePrompt } from '../../../src/utils/sharePrompt';

describe('shouldShowSharePrompt', () => {
  it('returns true for count 1 (first generation)', () => {
    expect(shouldShowSharePrompt(1)).toBe(true);
  });

  it('returns false for counts 2-9', () => {
    for (let i = 2; i <= 9; i++) {
      expect(shouldShowSharePrompt(i)).toBe(false);
    }
  });

  it('returns true for every 10th generation', () => {
    expect(shouldShowSharePrompt(10)).toBe(true);
    expect(shouldShowSharePrompt(20)).toBe(true);
    expect(shouldShowSharePrompt(30)).toBe(true);
    expect(shouldShowSharePrompt(100)).toBe(true);
  });

  it('returns false for non-milestone counts', () => {
    expect(shouldShowSharePrompt(5)).toBe(false);
    expect(shouldShowSharePrompt(11)).toBe(false);
    expect(shouldShowSharePrompt(15)).toBe(false);
    expect(shouldShowSharePrompt(25)).toBe(false);
  });

  it('returns false for count 0', () => {
    expect(shouldShowSharePrompt(0)).toBe(false);
  });
});

describe('sharePrompt pub/sub', () => {
  it('notifies listeners when emitSharePrompt is called', () => {
    const listener = jest.fn();
    subscribeSharePrompt(listener);
    emitSharePrompt('text');
    expect(listener).toHaveBeenCalledWith('text');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const listener = jest.fn();
    const unsub = subscribeSharePrompt(listener);
    unsub();
    emitSharePrompt('image');
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple listeners', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    subscribeSharePrompt(listener1);
    subscribeSharePrompt(listener2);
    emitSharePrompt('image');
    expect(listener1).toHaveBeenCalledWith('image');
    expect(listener2).toHaveBeenCalledWith('image');
  });
});
