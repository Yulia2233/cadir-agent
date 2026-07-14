import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

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
});
