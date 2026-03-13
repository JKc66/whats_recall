import { sileo } from 'sileo';

export { sileo };

export const notify = {
  deleted: (sender: string, preview: string) =>
    sileo.error({
      title: `${sender} deleted a message`,
      description: preview || '[Media]',
    }),

  info: (title: string, body = '') =>
    sileo.info({ title, description: body || undefined }),

  success: (title: string, body = '') =>
    sileo.success({ title, description: body || undefined }),

  warning: (title: string, body = '') =>
    sileo.warning({ title, description: body || undefined }),

  error: (title: string, body = '') =>
    sileo.error({ title, description: body || undefined }),
};
