// src/components/ErrorBoundary.jsx
import React from "react";

/**
 * Prevents a single runtime error from killing the whole app.
 * Wrap sections like modals, reservations, etc.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // Optional: send to your logger
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-sm text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-xl">
          <div className="font-semibold mb-2">Сталася помилка в модулі інтерфейсу</div>
          <div className="opacity-75 break-all">{String(this.state.error)}</div>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-slate-800 text-white"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Спробувати знову
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
