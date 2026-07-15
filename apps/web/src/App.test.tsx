import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, isRunningPhase } from './App';

async function renderOfflineWorkbench() {
  render(<App />);
  await screen.findByRole('textbox', { name: 'CAD request' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  vi.stubGlobal(
    'EventSource',
    class {
      public onopen: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public addEventListener() {}
      public close() {}
    },
  );
});

describe('CAD workbench', () => {
  it('creates a server conversation for an authenticated account with an empty list', async () => {
    const serverConversation = {
      id: '22e94590-ad4c-48f3-9da6-02c2c9cae1c2',
      title: 'New CAD conversation',
      status: 'IDLE',
      updatedAt: new Date().toISOString(),
      currentRevisionId: null,
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/me') && !url.includes('/model-configs')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: 'd68ca16a-b70d-42b7-a67e-f00512fd073c',
                email: 'user@example.test',
                displayName: 'User',
                role: 'USER',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/conversations') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(serverConversation), { status: 201 }));
      }
      if (url.includes('/api/conversations')) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
        );
      }
      if (url.includes('/api/me/model-configs')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'New CAD conversation' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/conversations',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('opens directly into the operational three-panel workspace', async () => {
    await renderOfflineWorkbench();
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Model viewer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'CAD request' })).toBeInTheDocument();
  });

  it('starts with a closed conversation drawer on a small screen', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 780px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await renderOfflineWorkbench();
    expect(screen.getByRole('button', { name: 'Open conversations' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open conversations' }));
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeInTheDocument();
  });

  it('keeps SimpleCAD outputs enabled and exposes the FreeCAD option', async () => {
    await renderOfflineWorkbench();
    expect(screen.getByText('SimpleCAD outputs included')).toBeInTheDocument();
    expect(screen.getByLabelText('FreeCAD')).not.toBeChecked();
  });

  it('switches face and edge selection modes', async () => {
    await renderOfflineWorkbench();
    fireEvent.click(screen.getByTitle('Select edges'));
    expect(screen.getByText('Select an edge to inspect exact BRep geometry.')).toBeInTheDocument();
  });

  it('searches local conversations and creates a new one', async () => {
    await renderOfflineWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(
      screen.getAllByRole('button', { name: 'Actions for New CAD conversation' }),
    ).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search conversations'), {
      target: { value: 'missing' },
    });
    expect(
      screen.queryAllByRole('button', { name: /Actions for New CAD conversation/ }),
    ).toHaveLength(0);
  });

  it('opens provider settings without exposing a saved key value', async () => {
    await renderOfflineWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'Provider settings' }));
    expect(screen.getByRole('dialog', { name: 'Model providers' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter API key')).toHaveAttribute('type', 'password');
    expect(screen.getByPlaceholderText('https://vip.auto-code.net/v1')).toHaveValue(
      'https://vip.auto-code.net/v1',
    );
    expect(screen.getByDisplayValue('5.6-sol')).toBeInTheDocument();
  });

  it('sends a local CAD request and exposes the stop control', async () => {
    await renderOfflineWorkbench();
    fireEvent.change(screen.getByRole('textbox', { name: 'CAD request' }), {
      target: { value: 'Create a 60 x 40 x 4 mm mounting plate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      screen.getByText('Create a 60 x 40 x 4 mm mounting plate', { selector: '.message p' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('uploads selected references before sending their server-owned IDs', async () => {
    const serverConversation = {
      id: '22e94590-ad4c-48f3-9da6-02c2c9cae1c2',
      title: 'New CAD conversation',
      status: 'IDLE',
      updatedAt: new Date().toISOString(),
      currentRevisionId: null,
    };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/me'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: 'user', email: 'u@example.test', displayName: 'User', role: 'USER' },
            }),
            { status: 200 },
          ),
        );
      if (url.includes('/api/conversations') && init?.method === 'POST')
        return Promise.resolve(new Response(JSON.stringify(serverConversation), { status: 201 }));
      if (url.includes('/api/conversations') && url.includes('/uploads'))
        return Promise.resolve(new Response(JSON.stringify({ id: 'upload-id' }), { status: 201 }));
      if (url.includes('/api/conversations'))
        return Promise.resolve(
          new Response(JSON.stringify({ items: [serverConversation], nextCursor: null }), {
            status: 200,
          }),
        );
      if (url.includes('/api/me/model-configs'))
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    await renderOfflineWorkbench();
    const file = new File(['cad-reference'], 'reference.step', { type: 'application/step' });
    const input = screen.getByLabelText('Attach image, document, STEP, or STL');
    fireEvent.click(input);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.change(screen.getByRole('textbox', { name: 'CAD request' }), {
      target: { value: 'Modify the uploaded part' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const uploadCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/uploads'));
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
  });

  it('re-enables the composer when a task waits for user input', () => {
    expect(isRunningPhase('WAITING_USER')).toBe(false);
    expect(isRunningPhase('NEEDS_USER')).toBe(false);
    expect(isRunningPhase('EXECUTE')).toBe(true);
  });

  it('shows first-administrator setup when the empty server allows bootstrap', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/auth/bootstrap/status')) {
        return Promise.resolve(new Response(JSON.stringify({ available: true }), { status: 200 }));
      }
      if (url.includes('/api/conversations')) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
      );
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Create the first administrator' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create administrator' })).toBeInTheDocument();
  });
});
