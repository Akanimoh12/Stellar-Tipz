-- Rollback for 20260826000000_add_event_log_archive.
-- EventLogArchive is a derived compliance copy; the source EventLog table is
-- untouched. This rollback is safe only before archived rows are needed.
DROP TABLE "EventLogArchive";