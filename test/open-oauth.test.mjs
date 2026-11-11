import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  authorizationServerMetadata, protectedResourceMetadata, register, authorize, token, safeRedirect, RESOURCE,
} from '../src/lib/mcp/open-oauth.ts';

const b64url = (b) => Buffer.from(b).toString('base64url');
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

test('discovery points the MCP resource at this site as its own authorization server', () => {
  const pr = protectedResourceMetadata();
  assert.equal(pr.resource, RESOURCE);
  const as = authorizationServerMetadata();
  assert.deepEqual(pr.authorization_servers, [as.issuer]);
  assert.ok(as.registration_endpoint.endsWith('/register'));
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
});

test('the full connector handshake: register, authorize without login, PKCE token', async () => {
  const reg = register({ redirect_uris: [CALLBACK], client_name: 'claudeai', token_endpoint_auth_method: 'none' });
  assert.equal(reg.status, 201);
  assert.match(reg.body.client_id, /^open_/);
  assert.equal(reg.body.client_secret, undefined);

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const a = authorize(new URLSearchParams({
    response_type: 'code', client_id: reg.body.client_id, redirect_uri: CALLBACK,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', resource: RESOURCE,
  }));
  assert.ok('location' in a);
  const back = new URL(a.location);
  assert.equal(back.origin + back.pathname, CALLBACK);
  assert.equal(back.searchParams.get('state'), 'xyz');
  const code = back.searchParams.get('code');
  assert.ok(code);

  const t = await token(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier, client_id: reg.body.client_id }));
  assert.equal(t.status, 200);
  assert.match(t.body.access_token, /^open_/);
  assert.equal(t.body.token_type, 'Bearer');

  const bad = await token(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: 'wrong' }));
  assert.equal(bad.status, 400);

  const r = await token(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.body.refresh_token }));
  assert.equal(r.status, 200);
});

test('a confidential client gets a secret', () => {
  const reg = register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_post' });
  assert.ok(reg.body.client_secret);
});

test('redirects only to https, or http on loopback', () => {
  assert.ok(safeRedirect('http://localhost:33418/callback'));
  assert.ok(safeRedirect('http://127.0.0.1:9/cb'));
  assert.equal(safeRedirect('http://evil.example/cb'), null);
  assert.equal(safeRedirect('javascript:alert(1)'), null);
  assert.equal(register({ redirect_uris: ['javascript:alert(1)'] }).status, 400);
  const a = authorize(new URLSearchParams({ response_type: 'code', redirect_uri: 'data:text/html,hi' }));
  assert.equal(a.status, 400);
});

test('the issued token is not an OpenAccess token, so account tools still refuse', async () => {
  const { TOOLS_BY_NAME } = await import('../src/lib/mcp/tools.ts');
  const t = await token(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x' }));
  const ctx = { header: (n) => (n === 'authorization' ? `Bearer ${t.body.access_token}` : null) };
  await assert.rejects(() => TOOLS_BY_NAME.get('list_submissions').run({}, ctx), /submissions:review/);
});
