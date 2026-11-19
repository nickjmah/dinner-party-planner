import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
const auth = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: {
 getSession: async () => ({ data: { session: auth.session } }),
 onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} } }));
vi.mock('../src/pages/LoginPage', () => ({ LoginPage: () => <p>Owner sign-in form</p> }));
vi.mock('../src/pages/DinnersPage', () => ({ DinnersPage: () => <p>My dinners</p> }));
vi.mock('../src/pages/EditorInvitePage', () => ({ EditorInvitePage: () => <p>Editor invitation</p> }));
import App from '../src/App';
afterEach(() => { cleanup(); localStorage.clear(); history.replaceState({}, '', '/'); });
function show(session: unknown) { auth.session = session; render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/login']}><App /></MemoryRouter></QueryClientProvider>); }
describe('owner login routing', () => {
 it('ignores an old saved invitation for a normal owner login', async () => { localStorage.setItem('pending-dinner-editor-invite', 'stale'); show({ user: { id: 'owner', is_anonymous: false } }); expect(await screen.findByText('My dinners')).toBeVisible(); });
 it('allows an anonymous editor to sign into the owner account', async () => { show({ user: { id: 'anonymous', is_anonymous: true } }); expect(await screen.findByText('Owner sign-in form')).toBeVisible(); });
 it('keeps explicit invitation confirmation redirects working', async () => { history.replaceState({}, '', '/?editorInvite=current'); show({ user: { id: 'editor', is_anonymous: false } }); expect(await screen.findByText('Editor invitation')).toBeVisible(); });
});
