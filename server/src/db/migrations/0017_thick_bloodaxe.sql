CREATE INDEX "eval_batches_workspace_idx" ON "eval_batches" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "eval_runs_batch_idx" ON "eval_runs" USING btree ("batch_id");