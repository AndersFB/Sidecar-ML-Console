import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { idbGet, idbSet } from '../utils/idb';
import { useStoredState } from '../utils/useStoredState';

vi.mock('../utils/idb', { spy: true });

describe('useStoredState', () => {
  it('persists changes and hydrates them on the next mount', async () => {
    const first = renderHook(() => useStoredState('t.persist', 'initial'));
    act(() => first.result.current[1]('changed'));
    await waitFor(async () => expect(await idbGet('t.persist')).toBe('changed'));
    first.unmount();

    const second = renderHook(() => useStoredState('t.persist', 'initial'));
    await waitFor(() => expect(second.result.current[0]).toBe('changed'));
    second.unmount();
  });

  it('applies revive to the stored value on hydration', async () => {
    await idbSet('t.revive', 'stored');
    const hook = renderHook(() =>
      useStoredState('t.revive', 'initial', (stored) => `${stored}-revived`),
    );
    await waitFor(() => expect(hook.result.current[0]).toBe('stored-revived'));
    hook.unmount();
  });

  it('lets a change made before hydration win over the stored value', async () => {
    await idbSet('t.race', 'stored');
    const hook = renderHook(() => useStoredState('t.race', 'initial'));
    act(() => hook.result.current[1]('typed-first'));
    await waitFor(async () => expect(await idbGet('t.race')).toBe('typed-first'));
    expect(hook.result.current[0]).toBe('typed-first');
    hook.unmount();
  });

  it('does not write back what hydration just read', async () => {
    await idbSet('t.noecho', 'stored');
    vi.mocked(idbSet).mockClear();

    const hook = renderHook(() => useStoredState('t.noecho', 'initial'));
    await waitFor(() => expect(hook.result.current[0]).toBe('stored'));
    // Give the write effect a macrotask to (wrongly) fire before asserting.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(idbSet).not.toHaveBeenCalled();

    // A real change after hydration still writes.
    act(() => hook.result.current[1]('changed'));
    await waitFor(async () => expect(await idbGet('t.noecho')).toBe('changed'));
    hook.unmount();
  });

  it('round-trips structured result objects', async () => {
    type Result = { kind: string; faces: { roll: number }[] } | null;
    const stored: Result = { kind: 'faces', faces: [{ roll: 10 }, { roll: -7.9 }] };
    const first = renderHook(() => useStoredState<Result>('t.object', null));
    act(() => first.result.current[1](stored));
    await waitFor(async () => expect(await idbGet('t.object')).toBeDefined());
    first.unmount();

    const second = renderHook(() => useStoredState<Result>('t.object', null));
    await waitFor(() => expect(second.result.current[0]).toEqual(stored));
    second.unmount();
  });
});
