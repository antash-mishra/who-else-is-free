import { requestJson } from '@api/client';

import { uploadEventCover } from '../eventCovers';

jest.mock('@api/client', () => ({ requestJson: jest.fn() }));

it('uploads multipart media with authentication and a bounded timeout', async () => {
  (requestJson as jest.Mock).mockResolvedValue({
    cover_upload_id: 'upload-1',
    cover_url: '/api/event-covers/upload-1',
  });
  const result = await uploadEventCover(
    { uri: 'file:///synthetic.jpg', mimeType: 'image/jpeg' },
    'token',
    jest.fn(),
  );
  expect(result).toMatchObject({ id: 'upload-1' });
  expect(requestJson).toHaveBeenCalledWith(
    '/api/event-covers',
    expect.objectContaining({
      method: 'POST',
      token: 'token',
      timeoutMs: 60000,
      body: expect.any(FormData),
    }),
  );
  expect((requestJson as jest.Mock).mock.calls[0][1].headers).toBeUndefined();
});
