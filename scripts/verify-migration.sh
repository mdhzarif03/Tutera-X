#!/usr/bin/env bash
# Verifies that the committed migrations produce exactly the schema in prisma/schema.prisma.
# Uses Prisma's own migration diff. Requires a disposable, empty shadow database.
#
#   SHADOW_DATABASE_URL=postgresql://... npm run db:verify
#
# Exit codes: 0 = migrations match the schema; non-zero = drift, or a validation or connection failure.
set -euo pipefail

: "${SHADOW_DATABASE_URL:?Set SHADOW_DATABASE_URL to an empty, disposable PostgreSQL database}"

echo "1/3 Validating the Prisma schema"
npx prisma validate

echo "2/3 Diffing committed migrations against the schema"
set +e
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > /tmp/tutera-x-drift.sql
status=$?
set -e
if [ "$status" -ne 0 ]; then
  echo "Migration diff failed (exit $status)."
  exit "$status"
fi
if [ -s /tmp/tutera-x-drift.sql ] && grep -qvE '^(--|\s*$)' /tmp/tutera-x-drift.sql; then
  echo "DRIFT: the schema has changes that no migration contains. Generated SQL:"
  cat /tmp/tutera-x-drift.sql
  echo "Create a migration with: npx prisma migrate dev --name <change>"
  exit 2
fi

echo "3/3 Migrations match the schema."
