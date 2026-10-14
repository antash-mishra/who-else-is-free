import { parseJoinNotice, shortenJoinNotice } from '@utils/joinNotice';

describe('parseJoinNotice', () => {
  it('splits the member name from the action suffix', () => {
    expect(parseJoinNotice('Sumit Narang joined the plan')).toEqual({
      name: 'Sumit Narang',
      action: ' joined the plan',
    });
  });

  it('recognises the legacy "joined the chat" spelling', () => {
    expect(parseJoinNotice('Jane Doe joined the chat')).toEqual({
      name: 'Jane Doe',
      action: ' joined the chat',
    });
  });

  it('returns null for other system copy', () => {
    expect(parseJoinNotice('Plan details updated')).toBeNull();
  });
});

describe('shortenJoinNotice', () => {
  it('keeps only the first name of a long member name', () => {
    expect(shortenJoinNotice('Sumit Narang Dndndn Jsjsjs Nsjdjjd Jdjdjd joined the plan')).toBe(
      'Sumit joined the plan',
    );
  });

  it('shortens legacy join notices too', () => {
    expect(shortenJoinNotice('Jane  Doe joined the chat')).toBe('Jane joined the chat');
  });

  it('leaves single-word names unchanged', () => {
    expect(shortenJoinNotice('c2whp9swrb joined the plan')).toBe('c2whp9swrb joined the plan');
  });

  it('leaves other system copy unchanged', () => {
    expect(shortenJoinNotice('Plan details updated')).toBe('Plan details updated');
  });

  it('leaves a notice without a name unchanged', () => {
    expect(shortenJoinNotice(' joined the plan')).toBe(' joined the plan');
  });
});
