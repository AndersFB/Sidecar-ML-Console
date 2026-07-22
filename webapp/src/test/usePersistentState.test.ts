import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentState } from '../utils/usePersistentState';

describe('usePersistentState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with the default and writes changes to localStorage', () => {
    const { result } = renderHook(() => usePersistentState('test.key', 'fallback'));
    expect(result.current[0]).toBe('fallback');

    act(() => result.current[1]('changed'));
    expect(result.current[0]).toBe('changed');
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
    expect(localStorage.getItem('test.count')).toBe('2');
  });

  it('falls back to the default on corrupt JSON', () => {
    localStorage.setItem('test.key', '{not json');
    const { result } = renderHook(() => usePersistentState('test.key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });
});
