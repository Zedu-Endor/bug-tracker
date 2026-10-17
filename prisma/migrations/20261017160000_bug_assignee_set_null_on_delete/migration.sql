-- #356: Ensure Bug_assigneeId_fkey has ON DELETE SET NULL so deleting a user does not fail with foreign key violation
ALTER TABLE "Bug" DROP CONSTRAINT IF EXISTS "Bug_assigneeId_fkey";
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Bug" VALIDATE CONSTRAINT "Bug_assigneeId_fkey";
