-- Ensure Bug_assigneeId_fkey has ON DELETE SET NULL (#356)
DO $$
DECLARE
  curr_confdeltype "char";
BEGIN
  -- Look up existing foreign key action on Bug.assigneeId
  SELECT confdeltype INTO curr_confdeltype
  FROM pg_constraint
  WHERE conname = 'Bug_assigneeId_fkey'
    AND conrelid = '"Bug"'::regclass;

  -- 'n' represents SET NULL in PostgreSQL pg_constraint
  IF curr_confdeltype IS DISTINCT FROM 'n' THEN
    ALTER TABLE "Bug" DROP CONSTRAINT IF EXISTS "Bug_assigneeId_fkey";
    ALTER TABLE "Bug"
      ADD CONSTRAINT "Bug_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    ALTER TABLE "Bug" VALIDATE CONSTRAINT "Bug_assigneeId_fkey";
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
