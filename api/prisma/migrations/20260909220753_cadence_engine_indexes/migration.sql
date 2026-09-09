-- CreateIndex
CREATE INDEX "enrollments_status_next_at_idx" ON "enrollments"("status", "next_at");

-- CreateIndex
CREATE INDEX "msg_sends_sent_at_idx" ON "msg_sends"("sent_at");
