import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Renderer crash', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-0)',
            color: 'var(--text-primary)',
            padding: 'var(--space-8)',
            display: 'grid',
            alignContent: 'start',
            gap: 'var(--space-4)'
          }}
        >
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-semibold)' }}>
            L’interface ne s’est pas chargée correctement.
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Une erreur côté interface a interrompu le rendu. Le détail est affiché ci-dessous.
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 'var(--space-4)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-lg)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

