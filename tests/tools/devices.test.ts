import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/datto-api.js', () => ({
  api: {
    getDevice: vi.fn(),
    moveDevice: vi.fn(),
    setDeviceWarranty: vi.fn(),
    setDeviceUdf: vi.fn(),
    createQuickJob: vi.fn(),
  },
}));

import { deviceTools } from '../../src/tools/devices.js';
import { api } from '../../src/datto-api.js';

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function tool(name: string) {
  const t = deviceTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('device tools', () => {
  it('get-device forwards deviceUid', async () => {
    mockedApi.getDevice.mockResolvedValue({ uid: 'abc' });
    await tool('get-device').handler({ deviceUid: 'abc' });
    expect(mockedApi.getDevice).toHaveBeenCalledWith('abc');
  });

  it('move-device passes deviceUid and siteUid in order', async () => {
    mockedApi.moveDevice.mockResolvedValue({ success: true });
    await tool('move-device').handler({ deviceUid: 'dev-1', siteUid: 'site-2' });
    expect(mockedApi.moveDevice).toHaveBeenCalledWith('dev-1', 'site-2');
  });

  it('set-device-warranty wraps date in body object', async () => {
    mockedApi.setDeviceWarranty.mockResolvedValue({});
    await tool('set-device-warranty').handler({
      deviceUid: 'dev-1',
      warrantyDate: '2027-01-01',
    });
    expect(mockedApi.setDeviceWarranty).toHaveBeenCalledWith('dev-1', {
      warrantyDate: '2027-01-01',
    });
  });

  it('set-device-udf parses udfData JSON string before sending', async () => {
    mockedApi.setDeviceUdf.mockResolvedValue({});
    await tool('set-device-udf').handler({
      deviceUid: 'dev-1',
      udfData: '{"udf1":"hello","udf2":"world"}',
    });
    expect(mockedApi.setDeviceUdf).toHaveBeenCalledWith('dev-1', {
      udf1: 'hello',
      udf2: 'world',
    });
  });

  it('create-quick-job parses jobData JSON before sending', async () => {
    mockedApi.createQuickJob.mockResolvedValue({ jobUid: 'job-1' });
    await tool('create-quick-job').handler({
      deviceUid: 'dev-1',
      jobData: '{"jobName":"Restart","jobComponent":{"componentUid":"c-1","variables":{}}}',
    });
    expect(mockedApi.createQuickJob).toHaveBeenCalledWith('dev-1', {
      jobName: 'Restart',
      jobComponent: { componentUid: 'c-1', variables: {} },
    });
  });
});
