import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ConnectionProvider } from '../state/ConnectionContext';
import { ALL_DOCUMENTED_ROUTES } from '../docs/apiReference';
import { BASE } from './msw/handlers';

/**
 * The routes the iOS server actually registers (ToolkitCore services +
 * ToolkitServer core routes). If a server endpoint is added or removed,
 * update this list AND src/docs/apiReference.ts AND docs/API.md.
 */
const SERVER_ROUTES = [
  'GET /',
  'GET /health',
  'GET /v1/capabilities',
  'GET /v1/models',
  'POST /v1/chat/completions',
  'POST /v1/images/generations',
  'GET /v1/images/styles',
  'POST /v1/vision/ocr',
  'POST /v1/vision/barcodes',
  'POST /v1/vision/classify',
  'POST /v1/vision/feature-print',
  'POST /v1/vision/similarity',
  'POST /v1/vision/subject-mask',
  'POST /v1/vision/person-segmentation',
  'POST /v1/vision/faces',
  'POST /v1/vision/body-pose',
  'POST /v1/vision/hand-pose',
  'POST /v1/vision/document',
  'POST /v1/speech/speak',
  'GET /v1/speech/voices',
  'POST /v1/speech/transcribe',
  'GET /v1/speech/transcribe/locales',
  'GET /v1/translation/languages',
  'POST /v1/translation/translate',
  'POST /v1/nlp/analyze',
  'POST /v1/nlp/embed',
  'POST /v1/nlp/similarity',
  'POST /v1/sound/classify',
  'GET /v1/sound/labels',
  'POST /v1/shazam/match',
];

function renderApp() {
  return render(
    <ConnectionProvider>
      <App />
    </ConnectionProvider>,
  );
}

describe('API Reference', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sidecar.baseUrl', BASE);
  });

  it('documents every server route, and nothing else', () => {
    expect([...ALL_DOCUMENTED_ROUTES].sort()).toEqual([...SERVER_ROUTES].sort());
  });

  it('renders all endpoints with the connected base URL', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /API Reference/ }));

    // No "unavailable" banner for the docs panel (it has no capability).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Every documented path is on the page.
    for (const route of ALL_DOCUMENTED_ROUTES) {
      const path = route.split(' ')[1];
      expect(screen.getAllByText(path).length).toBeGreaterThan(0);
    }

    // Examples substitute the live phone address.
    expect(screen.getAllByText(new RegExp(`curl ${BASE}/health`)).length).toBeGreaterThan(0);
  });

  it('filters endpoints', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/Online/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /API Reference/ }));

    await userEvent.type(screen.getByLabelText('Filter endpoints'), 'shazam');
    expect(screen.getByText('/v1/shazam/match')).toBeInTheDocument();
    expect(screen.queryByText('/v1/vision/ocr')).not.toBeInTheDocument();
  });
});
