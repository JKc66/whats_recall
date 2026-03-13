import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sileo';

let mounted = false;

export function mountSileo() {
  if (mounted) return;
  mounted = true;

  const container = document.createElement('div');
  container.id = 'sileo-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    React.createElement(Toaster, { position: 'top-right', theme: 'dark' })
  );
}
