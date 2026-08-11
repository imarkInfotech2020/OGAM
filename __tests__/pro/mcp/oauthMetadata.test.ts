/**
 * The invisible OAuth handshake behind "connect an MCP server".
 *
 * The user pastes a URL and expects to be signed in. Everything here happens before they see a browser, and each
 * step fails in a way that surfaces as "it just doesn't connect":
 *
 *  - the 401 hint. A server tells us where its metadata lives via WWW-Authenticate. Miss it and discovery falls
 *    back to a guessed path, which for a path-scoped server is a 404.
 *  - the auth method we register with. We prefer `none` (public + PKCE, right for a phone with nowhere to keep a
 *    secret), but a server that only accepts confidential clients REJECTS that registration outright. Honouring
 *    what the server advertises is the difference between connecting and a dead end the user cannot diagnose.
 *  - the failures. A registration response with no client_id, a non-200, or a body that is not JSON must each
 *    raise a typed error, because the screen renders the reason and "something went wrong" is unactionable.
 *
 * `fetch` is faked - it is the network, the genuine boundary here. The MCP SDK's discovery module is faked for
 * the same reason: it is a third-party package that reaches out over HTTP.
 */
import { proIsPresent, requirePro } from '../helpers/requirePro';

const describePro = proIsPresent() ? describe : describe.skip;

type MetadataModule = typeof import('@offgrid/pro/mcp/oauth/metadata');
let metadata: MetadataModule;

beforeAll(() => {
  const mod = requirePro<MetadataModule>('@offgrid/pro/mcp/oauth/metadata');
  if (mod) metadata = mod;
});

const originalFetch = global.fetch;

/** A single scripted HTTP answer, recording what was posted. */
function scriptFetch(answer: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  invalidJson?: boolean;
}): { body: () => Record<string, unknown> | undefined } {
  let sent: Record<string, unknown> | undefined;
  global.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) sent = JSON.parse(init.body) as Record<string, unknown>;
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      headers: { get: () => null },
      json: async () => {
        if (answer.invalidJson) throw new Error('not json');
        return answer.json ?? {};
      },
    };
  }) as never;
  return { body: () => sent };
}

afterEach(() => {
  global.fetch = originalFetch;
});

describePro('reading the 401 hint that says where a server keeps its metadata', () => {
  it.each([
    [
      'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"',
      'https://api.example.com/.well-known/oauth-protected-resource',
    ],
    // Unquoted is legal and servers send it.
    [
      'Bearer resource_metadata=https://api.example.com/.well-known/x',
      'https://api.example.com/.well-known/x',
    ],
    // Followed by other parameters, so the value must stop at the comma rather than swallowing the rest.
    [
      'Bearer realm="mcp", resource_metadata="https://api.example.com/prm", error="invalid_token"',
      'https://api.example.com/prm',
    ],
    // Header names and parameters are case-insensitive per RFC 7235.
    ['Bearer RESOURCE_METADATA="https://api.example.com/prm"', 'https://api.example.com/prm'],
  ])('finds the url in %s', (header, expected) => {
    expect(metadata.parseResourceMetadataUrl(header)).toBe(expected);
  });

  it('returns null when there is no header at all', () => {
    // Not an error: discovery then falls back to the conventional well-known path.
    expect(metadata.parseResourceMetadataUrl(null)).toBeNull();
  });

  it('returns null when the header carries no resource_metadata', () => {
    expect(metadata.parseResourceMetadataUrl('Bearer realm="mcp", error="invalid_token"')).toBeNull();
  });
});

describePro('registering this app with a server', () => {
  it('registers as a public client when the server says nothing about auth methods', async () => {
    const call = scriptFetch({ json: { client_id: 'client-123' } });

    const client = await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
    });

    // `none` is right for a phone: there is nowhere to keep a client secret, and PKCE covers it.
    expect(call.body()?.token_endpoint_auth_method).toBe('none');
    expect(client.clientId).toBe('client-123');
  });

  it('honours a server that only accepts a posted secret', async () => {
    const call = scriptFetch({ json: { client_id: 'c', client_secret: 's' } });

    const client = await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
      supportedAuthMethods: ['client_secret_post', 'client_secret_basic'],
    });

    // Registering as `none` here is REJECTED by the server (Supabase does exactly this), and the user sees an
    // MCP server that will not connect with nothing explaining why.
    expect(call.body()?.token_endpoint_auth_method).toBe('client_secret_post');
    expect(client.clientSecret).toBe('s');
  });

  it('falls back to basic auth when that is all the server offers', async () => {
    const call = scriptFetch({ json: { client_id: 'c' } });

    await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
      supportedAuthMethods: ['client_secret_basic'],
    });

    expect(call.body()?.token_endpoint_auth_method).toBe('client_secret_basic');
  });

  it('takes the server at its word when it offers something unfamiliar', async () => {
    const call = scriptFetch({ json: { client_id: 'c' } });

    await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
      supportedAuthMethods: ['private_key_jwt'],
    });

    // Sending our preference anyway would be refused. Its own first choice at least has a chance.
    expect(call.body()?.token_endpoint_auth_method).toBe('private_key_jwt');
  });

  it('still prefers a public client when the server lists none among its options', async () => {
    const call = scriptFetch({ json: { client_id: 'c' } });

    await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
      supportedAuthMethods: ['client_secret_post', 'none'],
    });

    expect(call.body()?.token_endpoint_auth_method).toBe('none');
  });

  it('asks for the grants a refresh flow needs', async () => {
    const call = scriptFetch({ json: { client_id: 'c' } });

    await metadata.registerClient('https://auth.example.com/register', {
      clientName: 'Off Grid',
      redirectUri: 'offgrid://oauth',
    });

    // Without refresh_token the user is signed out whenever the access token expires, which reads as the
    // connection randomly breaking.
    expect(call.body()?.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(call.body()?.redirect_uris).toEqual(['offgrid://oauth']);
  });

  it('refuses a registration that came back without a client id', async () => {
    scriptFetch({ json: { client_secret: 'only-a-secret' } });

    // Proceeding would start an authorization request with an undefined client_id, and the browser would show
    // the server's own error page instead of ours.
    await expect(
      metadata.registerClient('https://auth.example.com/register', {
        clientName: 'Off Grid',
        redirectUri: 'offgrid://oauth',
      }),
    ).rejects.toMatchObject({ code: 'registration_failed' });
  });

  it('reports an HTTP failure as an HTTP failure', async () => {
    scriptFetch({ ok: false, status: 403 });

    await expect(
      metadata.registerClient('https://auth.example.com/register', {
        clientName: 'Off Grid',
        redirectUri: 'offgrid://oauth',
      }),
    ).rejects.toMatchObject({ code: 'metadata_http_error' });
  });

  it('reports a body that is not JSON as a parse failure, not a network one', async () => {
    scriptFetch({ invalidJson: true });

    // The distinction is what tells the user (or us, in a log) whether the server is unreachable or is
    // answering with an HTML error page - two very different things to do next.
    await expect(
      metadata.registerClient('https://auth.example.com/register', {
        clientName: 'Off Grid',
        redirectUri: 'offgrid://oauth',
      }),
    ).rejects.toMatchObject({ code: 'metadata_parse_error' });
  });
});
