-- #632: the #595 backfill copied Project."deliveryWindowMinutes" into
-- ProjectWorkflow."deliveryMinutes" with no upper bound, while
-- WORKFLOW_LIMITS.deliveryMinutes in lib/workflow-config.ts caps the field at
-- 10080 minutes (seven days). A project that legitimately carried a longer
-- legacy window is now stuck: updateProjectWorkflowAction re-validates every
-- field, so even an unrelated change fails with
-- "Delivery window must be at most 10080".
--
-- Policy: clamp, do not grandfather. Seven days is already the longest window
-- the product offers, and preserving a longer deadline would leave the project
-- permanently unsaveable — the settings form cannot round-trip the value. The
-- repair keeps the weeks-long intent as far as the configuration can express
-- it instead of silently dropping it back to the 15-minute default.
-- Non-positive legacy values already fell back to the 15-minute default in
-- #595; repeating that here keeps this migration safe to re-run.
--
-- This is a forward migration on purpose: 20261027120000_project_workflow has
-- already been applied to real databases, so editing it would not repair the
-- rows it wrote.
UPDATE "ProjectWorkflow"
SET "deliveryMinutes" = CASE
        WHEN "deliveryMinutes" > 10080 THEN 10080
        WHEN "deliveryMinutes" < 1 THEN 15
        ELSE "deliveryMinutes"
    END
WHERE "deliveryMinutes" > 10080
   OR "deliveryMinutes" < 1;

-- Align the table constraint with the application range so the database and
-- lib/workflow-config.ts stop disagreeing about what may be stored. Every other
-- workflow dial already matched its CHECK constraint; delivery minutes was the
-- only one left open-ended.
ALTER TABLE "ProjectWorkflow"
    DROP CONSTRAINT "ProjectWorkflow_deliveryMinutes_check";

ALTER TABLE "ProjectWorkflow"
    ADD CONSTRAINT "ProjectWorkflow_deliveryMinutes_check"
    CHECK ("deliveryMinutes" BETWEEN 1 AND 10080);
