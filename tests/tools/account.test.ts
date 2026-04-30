import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/datto-api.js', () => ({
  api: {
    getAccount: vi.fn(),
    getAccountSites: vi.fn(),
    createAccountVariable: vi.fn(),
    updateAccountVariable: vi.fn(),
    deleteAccountVariable: vi.fn(),
  },
}));

import { accountTools } from '../../src/tools/account.js';
import { api } from '../../src/datto-api.js';

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function tool(name: string) {
  const t = accountTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('account tools', () => {
  it('get-account calls api.getAccount and returns JSON text', async () => {
    mockedApi.getAccount.mockResolvedValue({ name: 'Acme', deviceCount: 42 });
    const result = await tool('get-account').handler({});
    expect(mockedApi.getAccount).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('"name": "Acme"');
    expect(result.content[0].text).toContain('"deviceCount": 42');
  });

  it('list-account-sites builds query string from supported keys only', async () => {
    mockedApi.getAccountSites.mockResolvedValue({ sites: [] });
    await tool('list-account-sites').handler({
      page: '0',
      max: '50',
      siteName: 'Main',
      bogus: 'should-be-ignored',
    });
    const arg = mockedApi.getAccountSites.mock.calls[0][0] as string;
    expect(arg).toContain('page=0');
    expect(arg).toContain('max=50');
    expect(arg).toContain('siteName=Main');
    expect(arg).not.toContain('bogus');
  });

  it('list-account-sites omits query string when no args provided', async () => {
    mockedApi.getAccountSites.mockResolvedValue({});
    await tool('list-account-sites').handler({});
    expect(mockedApi.getAccountSites).toHaveBeenCalledWith('');
  });

  it('create-account-variable converts masked flag to boolean', async () => {
    mockedApi.createAccountVariable.mockResolvedValue({ id: 'v1' });
    await tool('create-account-variable').handler({
      name: 'API_KEY',
      value: 'secret',
      masked: 'true',
    });
    expect(mockedApi.createAccountVariable).toHaveBeenCalledWith({
      name: 'API_KEY',
      value: 'secret',
      masked: true,
    });
  });

  it('update-account-variable only sends provided fields', async () => {
    mockedApi.updateAccountVariable.mockResolvedValue({});
    await tool('update-account-variable').handler({
      variableId: 'v1',
      value: 'new-value',
    });
    expect(mockedApi.updateAccountVariable).toHaveBeenCalledWith('v1', { value: 'new-value' });
  });

  it('delete-account-variable forwards id to api', async () => {
    mockedApi.deleteAccountVariable.mockResolvedValue({ success: true });
    await tool('delete-account-variable').handler({ variableId: 'v1' });
    expect(mockedApi.deleteAccountVariable).toHaveBeenCalledWith('v1');
  });
});
