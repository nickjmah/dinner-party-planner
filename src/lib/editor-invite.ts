const pendingKey = 'pending-dinner-editor-invite';

export function rememberEditorInvite(token: string): void {
  if (token) localStorage.setItem(pendingKey, token);
}

export function clearPendingEditorInvite(): void {
  localStorage.removeItem(pendingKey);
  const url = new URL(location.href);
  if (url.searchParams.has('editorInvite')) {
    url.searchParams.delete('editorInvite');
    history.replaceState(history.state, '', url);
  }
}

export function pendingEditorInvite(): string {
  const fromRedirect = new URLSearchParams(location.search).get('editorInvite') || '';
  if (fromRedirect) rememberEditorInvite(fromRedirect);
  return fromRedirect;
}
