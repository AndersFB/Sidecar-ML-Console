import { test, expect, gate } from '../support/test.ts';
import { activePanel, awaitChatReply, openPanel, waitForOnline } from '../support/console.ts';

// Streaming, then non-streaming, then clear — each step builds on the last.
test.describe.configure({ mode: 'serial' });

test.describe('Chat', () => {
  gate('Chat');

  test('streams a reply over SSE', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Chat');

    await panel.getByLabel('Chat message').fill('Reply with exactly one short sentence about the sea.');
    await expect(panel.getByLabel('Stream tokens (SSE)')).toBeChecked();
    await panel.getByRole('button', { name: 'Send', exact: true }).click();

    const reply = await awaitChatReply(page);
    expect(reply.length).toBeGreaterThan(0);
  });

  test('completes without streaming', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Chat');

    await panel.getByLabel('Stream tokens (SSE)').uncheck();
    await panel.getByLabel('Chat message').fill('Say the single word: PONG');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();

    const reply = await awaitChatReply(page);
    expect(reply.length).toBeGreaterThan(0);
  });

  test('clears the conversation', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const panel = await openPanel(page, 'Chat');

    await panel.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(panel.getByTestId('chat-transcript')).toContainText(
      'Talk to the Apple Intelligence model',
    );
  });
});

test.describe('Chat transcript survives a panel switch', () => {
  gate('Chat');

  test('hidden panels keep their state', async ({ page }) => {
    await page.goto('/');
    await waitForOnline(page);
    const chat = await openPanel(page, 'Chat');
    await chat.getByLabel('Chat message').fill('Hello from the e2e suite');
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await awaitChatReply(page);

    await openPanel(page, 'Text Analysis');
    // The chat panel is still mounted, just hidden — this is what forces every
    // other locator in the suite to be scoped to activePanel().
    await expect(page.getByTestId('chat-transcript')).not.toBeVisible();
    await expect(activePanel(page)).toHaveCount(1);

    await openPanel(page, 'Chat');
    await expect(page.getByTestId('chat-transcript').locator('> div')).toHaveCount(2);
  });
});
