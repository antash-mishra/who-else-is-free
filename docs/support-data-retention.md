# Support Data Retention

Contact Us and Feedback submissions can contain personal or safety-sensitive information. Access is
limited to database-granted administrators through the Support Inbox, and message bodies or reply
addresses must not be copied into analytics or routine logs.

## Initial Retention Decision

- New and reviewed submissions remain available until an administrator closes them.
- Closed general Contact Us and Feedback submissions should be retained for 12 months, then deleted
  by a reviewed maintenance job.
- Closed urgent-safety submissions should be reviewed at 12 months. They may be retained for up to
  24 months when needed for incident continuity, legal obligations, or an active investigation.
- A litigation, regulatory, or safety hold overrides normal deletion until the hold is released.
- Deleting an app account does not automatically delete the associated submission; the user identity
  link becomes null, preserving the record under the same retention policy.

The first release documents the policy but does not run an automatic purge. Before enabling a purge,
the team must review the applicable privacy/legal requirements, back up the production database, test
the query on a copy, and record deletion counts without logging submission content.

## Operational Rules

- Do not export the production SQLite database as the normal review workflow.
- Do not paste full messages into Slack, analytics, issue trackers, or unapproved personal accounts.
- Use the reply address only for the requested support conversation.
- Close submissions when handling is complete so future retention automation has a reliable anchor.
- Review admin membership whenever a team member joins, changes responsibility, or leaves.
