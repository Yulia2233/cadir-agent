import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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
});

describe('CAD workbench', () => {
  it('opens directly into the operational three-panel workspace', () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Model viewer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'CAD request' })).toBeInTheDocument();
  });

  it('keeps SimpleCAD outputs enabled and exposes the FreeCAD option', () => {
    render(<App />);
    expect(screen.getByText('SimpleCAD outputs included')).toBeInTheDocument();
    expect(screen.getByLabelText('FreeCAD')).not.toBeChecked();
  });

  it('switches face and edge selection modes', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Select edges'));
    expect(screen.getByText('Select an edge to inspect exact BRep geometry.')).toBeInTheDocument();
  });

  it('searches local conversations and creates a new one', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.getAllByText('New CAD conversation')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search conversations'), {
      target: { value: 'missing' },
    });
    expect(
      screen.queryAllByRole('button', { name: /Actions for New CAD conversation/ }),
    ).toHaveLength(0);
  });

  it('opens provider settings without exposing a saved key value', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Provider settings' }));
    expect(screen.getByRole('dialog', { name: 'Model providers' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter or replace key')).toHaveAttribute('type', 'password');
  });

  it('sends a local CAD request and exposes the stop control', () => {
    render(<App />);
    fireEvent.change(screen.getByRole('textbox', { name: 'CAD request' }), {
      target: { value: 'Create a 60 x 40 x 4 mm mounting plate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      screen.getByText('Create a 60 x 40 x 4 mm mounting plate', { selector: '.message p' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});
