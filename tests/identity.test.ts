import { describe, expect, it, vi } from 'vitest';
import { settleUserAgent } from '../electron/identity';
import { stableUserAgent } from '../electron/user-agent';

/**
 * A guest is pinned to one agent, once.
 *
 * The regression this guards is subtle and expensive: setting a user agent on a
 * WebContents that is mid-navigation installs a new override, Chromium cancels
 * and restarts the pending navigation, and an OAuth redirect chain replays until
 * the identity provider answers 429. So the assertions are (a) the value never
 * carries the shell tokens, (b) a second call changes nothing, and (c) no
 * navigation listener is ever attached — the fix is the absence of that code.
 */
function guest() {
  const setUserAgent = vi.fn();
  const on = vi.fn(() => {
    throw new Error('settleUserAgent must not listen to navigation');
  });
  return {
    contents: { setUserAgent, on } as unknown as Parameters<typeof settleUserAgent>[0],
    setUserAgent,
    on,
  };
}

describe('settleUserAgent', () => {
  it('sets the stable engine agent and listens to no navigation', () => {
    const { contents, setUserAgent, on } = guest();
    settleUserAgent(contents);

    expect(setUserAgent).toHaveBeenCalledTimes(1);
    expect(setUserAgent).toHaveBeenCalledWith(
      stableUserAgent(process.platform, process.versions.chrome),
    );
    expect(on).not.toHaveBeenCalled();
    const agent = setUserAgent.mock.calls[0]?.[0] as string;
    expect(agent).toMatch(/Chrome\/\d+\.0\.0\.0/);
    expect(agent).not.toMatch(/Electron|Kryvex/i);
  });

  it('does not touch a guest twice', () => {
    const { contents, setUserAgent } = guest();
    settleUserAgent(contents);
    settleUserAgent(contents);
    expect(setUserAgent).toHaveBeenCalledTimes(1);
  });

  it('keeps one guest independent of another', () => {
    const first = guest();
    const second = guest();
    settleUserAgent(first.contents);
    settleUserAgent(second.contents);
    expect(first.setUserAgent).toHaveBeenCalledTimes(1);
    expect(second.setUserAgent).toHaveBeenCalledTimes(1);
  });
});
