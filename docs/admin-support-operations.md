# Admin Support Operations

## Provision the First Administrators

Admin authorization is persisted in `admin_users` by immutable user ID. Email is used only to find a
verified account during initial provisioning.

1. Have each administrator sign in once with the exact Google or Apple account they will use.
2. Copy the exact stored account emails into the Fly secret:

   ```bash
   fly secrets set ADMIN_BOOTSTRAP_EMAILS="first@example.com,second@example.com" \
     -a who-else-is-free-server
   ```

3. Restart/deploy the server. Existing matching accounts are granted during startup; a matching new
   account is granted immediately after successful sign-in.
4. Verify each account sees **Profile → Support Inbox** and that a normal account does not.
5. Remove the provisioning secret after the grants are persisted:

   ```bash
   fly secrets unset ADMIN_BOOTSTRAP_EMAILS -a who-else-is-free-server
   ```

Removing the secret does not remove existing database grants.

## Add an Administrator After Launch

This workflow requires the server release that creates `admin_users` and supports
`ADMIN_BOOTSTRAP_EMAILS`. If the deployment still uses only the legacy `ADMIN_USER_IDS` secret,
deploy the admin-support migration before using this procedure.

1. Confirm the intended person's exact Google or Apple account email. Have them sign in once so the
   account exists and its verified email is stored. Do not use an alias or an unverified address.
2. Review the address carefully, then temporarily set the bootstrap secret with only the new
   administrator or administrators. Existing grants are already stored in the database and do not
   need to be repeated.

   ```bash
   fly secrets set ADMIN_BOOTSTRAP_EMAILS="new-admin@example.com" \
     -a who-else-is-free-server
   ```

   For several new administrators, use a comma-separated list:

   ```bash
   fly secrets set ADMIN_BOOTSTRAP_EMAILS="new-one@example.com,new-two@example.com" \
     -a who-else-is-free-server
   ```

3. Wait for Fly to restart the server. Startup grants any existing matching accounts. If the person
   had not signed in yet, their first successful sign-in while the secret is present grants access.
4. Ask the person to reopen the app and verify that **Profile → Support Inbox** appears and loads.
   Also verify that a normal account still cannot access the inbox.
5. Remove the bootstrap secret immediately after verification:

   ```bash
   fly secrets unset ADMIN_BOOTSTRAP_EMAILS -a who-else-is-free-server
   ```

6. Record the administrator's user ID, email, grant date, and approver in the team's approved access
   record. Do not commit the administrator list or personal email addresses to this repository.

`fly secrets list` shows whether the secret name exists, but it does not reveal its value. The
`admin_users` table—not the bootstrap secret—is the source of truth for current administrators.
Removing the secret prevents future email matches; it does not revoke grants that were already
persisted.

## Verify the Authorization Boundary

Before release, confirm all three cases against production or staging:

- No bearer token: `/api/admin/help-submissions` returns `401`.
- Signed-in normal user: the endpoint returns `403`.
- Database-granted administrator: the endpoint returns `200`.

Never put a shared admin key, bootstrap email list, or database credentials in the mobile bundle.

## Revoke Access

Until a dedicated role-management UI is added, revoke access with a reviewed database maintenance
operation that deletes only the intended `admin_users` row. Back up the database first and identify
the target by both user ID and stored email. Do not delete the user's app account merely to revoke
admin access.

After revocation, the server immediately returns `403` for sensitive admin endpoints. The client may
still show the menu until its next access refresh, but it cannot read or mutate admin data.
