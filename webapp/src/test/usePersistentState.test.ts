import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentState } from '../utils/usePersistentState';

/** Writes are batched; pagehide forces the synchronous flush a reload gets. */
function flushWrites() {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

describe('usePersistentState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with the default and writes changes to localStorage', () => {
    const { result } = renderHook(() => usePersistentState('test.key', 'fallback'));
    expect(result.current[0]).toBe('fallback');

    act(() => result.current[1]('changed'));
    expect(result.current[0]).toBe('changed');
    flushWrites();
    expect(localStorage.getItem('test.key')).toBe(JSON.stringify('changed'));
  });

  it('restores the stored value on a fresh mount', () => {
    localStorage.setItem('test.key', JSON.stringify({ nested: true }));
    const { result } = renderHook(() => usePersistentState('test.key', { nested: false }));
    expect(result.current[0]).toEqual({ nested: true });
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => usePersistentState('test.count', 1));
    act(() => result.current[1]((current) => current + 1));
    expect(result.current[0]).toBe(2);
    flushWrites();
    expect(localStorage.getItem('test.count')).toBe('2');
  });

  it('falls back to the default on corrupt JSON', () => {
    localStorage.setItem('test.key', '{not json');
    const { result } = renderHook(() => usePersistentState('test.key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('batches rapid updates into a single storage write', () => {
    vi.useFakeTimers();
    try {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      const { result } = renderHook(() => usePersistentState('test.stream', ''));
      act(() => {
        vi.runAllTimers(); // absorb the initial-mount write
      });
      spy.mockClear();

      for (let i = 0; i < 50; i += 1) {
        act(() => result.current[1]((current) => `${current}x`));
      }
      expect(spy).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(250);
      });
      const writes = spy.mock.calls.filter(([key]) => key === 'test.stream');
      expect(writes).toHaveLength(1);
      expect(writes[0][1]).toBe(JSON.stringify('x'.repeat(50)));
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes the pending write on pagehide so reloads never lose state', () => {
    const { result } = renderHook(() => usePersistentState('test.key', 'a'));
    act(() => result.current[1]('b'));
    expect(localStorage.getItem('test.key')).toBeNull();
    flushWrites();
    expect(localStorage.getItem('test.key')).toBe(JSON.stringify('b'));
  });

  it('flushes the pending write on unmount', () => {
    const { result, unmount } = renderHook(() => usePersistentState('test.key', 'a'));
    act(() => result.current[1]('b'));
    unmount();
    expect(localStorage.getItem('test.key')).toBe(JSON.stringify('b'));
  });
});
