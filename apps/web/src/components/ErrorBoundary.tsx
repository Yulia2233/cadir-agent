import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  public override state = { failed: false };

  public static getDerivedStateFromError() {
    return { failed: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Web workbench rendering failed', {
      name: error.name,
      component: info.componentStack,
    });
  }

  public override render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <h1>CAD workspace could not be displayed</h1>
          <p>Reload the page. Your saved conversations and model revisions are not affected.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      );
    }
    return this.props.children;
  }
}
