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
