# User offboarding (#356)

Deleting an assignee directly with `prisma.user.delete` clears `Bug.assigneeId`
and keeps the issue. Deploy migrations with `pnpm exec prisma migrate deploy`.
The initial migration already uses `SET NULL`; the new migration also repairs
databases that have a restrictive assignee constraint.

Reporter, comment author, and activity actor references are required so history
remains readable. Administrative cleanup must use `offboardUser` from
`lib/user-offboarding.ts` instead of deleting those users directly:

```ts
await offboardUser(prisma, departingUserId, retentionAccountId);
```

Choose an existing, administrator-controlled retention account as the replacement.
The caller must authorize the operation; this internal helper is not a public
server action. Do not offboard the last super admin. The helper transfers reported
issues, authored comments, and activities in one transaction, then deletes the
departing user. Assignments become null. Other user-owned rows (including uploaded
attachments, votes, watches, notifications, and reset tokens) follow the existing
cascade policies. Original author attribution is replaced by the retention
account; issue, comment, and activity content is preserved. Missing replacements
and any database failure abort the transaction.

## PostgreSQL regression tests

Start the repository's PostgreSQL 16 service with `docker compose up -d db`, then
set `TEST_DATABASE_URL` to its connection URL and run `pnpm test:postgres`.
The database role must be able to create and drop schemas. Tests deploy all
migrations into a randomly named schema and drop only that schema afterwards;
they never seed or reset the configured database. CI runs these tests against
its own PostgreSQL service.
