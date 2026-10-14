// Server join announcements read "<Name> joined the plan"; rows written before the
// copy change may still say "joined the chat".
const JOIN_NOTICE_PATTERN = /^(.*)( joined the (?:plan|chat))$/s;

export interface JoinNotice {
  /** The member's name exactly as stored in the message body. */
  name: string;
  /** The action suffix, including its leading space (" joined the plan"). */
  action: string;
}

/** Split a join announcement body into the member's name and the action suffix. */
export const parseJoinNotice = (body: string): JoinNotice | null => {
  const match = body.match(JOIN_NOTICE_PATTERN);
  return match ? { name: match[1], action: match[2] } : null;
};

/**
 * Conversation previews name only the member's first name in a join announcement, so a long
 * full name cannot push the action out of the single preview line (issue #177). Other bodies
 * are returned unchanged, and the stored message is never rewritten.
 */
export const shortenJoinNotice = (body: string): string => {
  const notice = parseJoinNotice(body);
  const firstName = notice?.name.trim().split(/\s+/)[0];
  return notice && firstName ? `${firstName}${notice.action}` : body;
};
