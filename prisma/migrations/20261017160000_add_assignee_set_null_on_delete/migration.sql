-- Keep fresh installs and databases with a restrictive assignee FK consistent.
ALTER TABLE "Bug"
    DROP CONSTRAINT "Bug_assigneeId_fkey",
    ADD CONSTRAINT "Bug_assigneeId_fkey" FOREIGN KEY ("assigneeId")
        REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
