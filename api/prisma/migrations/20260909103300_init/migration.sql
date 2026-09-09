-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role_label" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#ECA826',
    "phone" TEXT NOT NULL DEFAULT '',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "active_praca_id" UUID,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_dismissed_notifs" (
    "user_id" UUID NOT NULL,
    "notif_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dismissed_notifs_pkey" PRIMARY KEY ("user_id","notif_id")
);

-- CreateTable
CREATE TABLE "pracas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "cobertura_uf" TEXT,
    "cobertura_cidade" TEXT,
    "cobertura_ibge" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "vizinhas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pracas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "praca_step_states" (
    "praca_id" UUID NOT NULL,
    "step_n" INTEGER NOT NULL,
    "actual" DOUBLE PRECISION,
    "unlocked_by" UUID,
    "unlocked_at" TIMESTAMP(3),
    "unlock_reason" TEXT,

    CONSTRAINT "praca_step_states_pkey" PRIMARY KEY ("praca_id","step_n")
);

-- CreateTable
CREATE TABLE "template_actions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "owners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rec_kind" TEXT NOT NULL,
    "rec_day" INTEGER,
    "rec_start_day" INTEGER,
    "rec_end_day" INTEGER,
    "rec_weekday" INTEGER,
    "rec_month_day" INTEGER,
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "how_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected" TEXT,
    "msg" TEXT,
    "attention" TEXT,
    "expects_result" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "template_key" TEXT,
    "step" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "owners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rec_kind" TEXT NOT NULL,
    "rec_day" INTEGER,
    "rec_start_day" INTEGER,
    "rec_end_day" INTEGER,
    "rec_weekday" INTEGER,
    "rec_month_day" INTEGER,
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected" TEXT,
    "msg" TEXT,
    "attention" TEXT,
    "expects_result" BOOLEAN NOT NULL DEFAULT false,
    "due_override" TEXT,
    "postpone_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "result" DOUBLE PRECISION,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_completions" (
    "action_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "by" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" DOUBLE PRECISION,

    CONSTRAINT "action_completions_pkey" PRIMARY KEY ("action_id","date")
);

-- CreateTable
CREATE TABLE "action_comments" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,

    CONSTRAINT "action_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_subitems" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "action_subitems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicator_entries" (
    "praca_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "indicator_entries_pkey" PRIMARY KEY ("praca_id","key","date")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "praca_id" UUID,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "phone_key" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT,
    "instagram" TEXT,
    "site" TEXT,
    "decisor" TEXT NOT NULL DEFAULT '—',
    "decisor_role" TEXT NOT NULL DEFAULT '',
    "classe" TEXT NOT NULL DEFAULT 'alvo',
    "origem" TEXT NOT NULL DEFAULT 'prospecção',
    "owner_id" UUID,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "entered_at" TEXT NOT NULL,
    "stage_since" TEXT NOT NULL,
    "last_contact_at" TIMESTAMP(3),
    "next_step_what" TEXT,
    "next_step_date" TEXT,
    "lost_reason" TEXT,
    "reheat_at" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" UUID,
    "possible_dup" BOOLEAN NOT NULL DEFAULT false,
    "snooze_until" TEXT,
    "campanha_id" UUID,
    "form_answer" TEXT,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_id" UUID,
    "author_label" TEXT,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "stage_to" INTEGER,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_vagas" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "filled" BOOLEAN NOT NULL DEFAULT false,
    "hours" DOUBLE PRECISION,

    CONSTRAINT "lead_vagas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mappings" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "map" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_name" TEXT NOT NULL,
    "by" UUID NOT NULL,
    "origem" TEXT NOT NULL,
    "imported" INTEGER NOT NULL,
    "ignored" INTEGER NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "msg_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "text_a" TEXT NOT NULL,
    "text_b" TEXT,
    "attachment_kind" TEXT,
    "attachment_name" TEXT,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "msg_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'fila',
    "window_start" INTEGER NOT NULL DEFAULT 9,
    "window_end" INTEGER NOT NULL DEFAULT 19,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "daily_limit" INTEGER NOT NULL DEFAULT 200,
    "gap_min" INTEGER NOT NULL DEFAULT 20,
    "gap_max" INTEGER NOT NULL DEFAULT 90,
    "daily_quota" INTEGER NOT NULL DEFAULT 20,
    "template_defaults" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocklist" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "lead_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disparos" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "split" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL,
    "by" UUID NOT NULL,
    "filters" JSONB NOT NULL,
    "skipped_block" INTEGER NOT NULL DEFAULT 0,
    "skipped_dup" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'agendado',
    "freela_campaign_id" TEXT,

    CONSTRAINT "disparos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "msg_sends" (
    "id" UUID NOT NULL,
    "disparo_id" UUID,
    "cadence_id" UUID,
    "node_id" UUID,
    "enrollment_id" UUID,
    "template_id" UUID,
    "variant" TEXT NOT NULL DEFAULT 'A',
    "lead_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "text" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'fila',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'fila',
    "failure_reason" TEXT,
    "stage_at_send" INTEGER NOT NULL,
    "freela_campaign_id" TEXT,
    "freela_recipient_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "msg_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadences" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "exit_action" TEXT NOT NULL,
    "exit_note" TEXT NOT NULL DEFAULT '',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cadences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadence_nodes" (
    "id" UUID NOT NULL,
    "cadence_id" UUID NOT NULL,
    "sort" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "day" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT,
    "template_id" UUID,
    "text" TEXT,
    "task" TEXT,
    "rule" TEXT,
    "action" TEXT,
    "note" TEXT,

    CONSTRAINT "cadence_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "cadence_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "next_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "exit_reason" TEXT,
    "stage_at_start" INTEGER NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "compress_sec" INTEGER,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_logs" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_id" UUID,
    "kind" TEXT NOT NULL,

    CONSTRAINT "enrollment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" UUID NOT NULL,
    "praca_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanhas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "praca_id" UUID NOT NULL,
    "publico" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "verba" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gasto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dor" TEXT NOT NULL DEFAULT '',
    "oferta" TEXT NOT NULL DEFAULT '',
    "mensagem_chave" TEXT NOT NULL DEFAULT '',
    "destino" TEXT NOT NULL DEFAULT 'formulario',
    "kpi_name" TEXT NOT NULL DEFAULT '',
    "kpi_meta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kpi_custo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cac_teto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "gate_just_by" TEXT,
    "gate_just_at" TIMESTAMP(3),
    "gate_just_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanha_provas" (
    "campanha_id" UUID NOT NULL,
    "proof_id" UUID NOT NULL,

    CONSTRAINT "campanha_provas_pkey" PRIMARY KEY ("campanha_id","proof_id")
);

-- CreateTable
CREATE TABLE "creatives" (
    "id" UUID NOT NULL,
    "campanha_id" UUID NOT NULL,
    "formato" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "gancho" TEXT NOT NULL DEFAULT '',
    "roteiro_gancho" TEXT NOT NULL DEFAULT '',
    "roteiro_desenvolvimento" TEXT NOT NULL DEFAULT '',
    "roteiro_prova" TEXT NOT NULL DEFAULT '',
    "roteiro_cta" TEXT NOT NULL DEFAULT '',
    "legenda" TEXT NOT NULL DEFAULT '',
    "cta_botao" TEXT NOT NULL DEFAULT 'Saiba mais',
    "owner_id" UUID,
    "due" TEXT NOT NULL,
    "publish_at" TEXT,
    "status" TEXT NOT NULL DEFAULT 'a_fazer',
    "file_url" TEXT NOT NULL DEFAULT '',
    "ia_tool" TEXT,
    "ia_prompt" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_comments" (
    "id" UUID NOT NULL,
    "creative_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "creative_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_entries" (
    "id" UUID NOT NULL,
    "campanha_id" UUID NOT NULL,
    "plataforma" TEXT NOT NULL,
    "nome_la" TEXT NOT NULL DEFAULT '',
    "publico" TEXT NOT NULL DEFAULT '',
    "geo" TEXT NOT NULL DEFAULT '',
    "verba_diaria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criativos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manager_url" TEXT NOT NULL DEFAULT '',
    "api_connected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "traffic_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_days" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "investido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alcance" INTEGER NOT NULL DEFAULT 0,
    "cliques" INTEGER NOT NULL DEFAULT 0,
    "conversoes" INTEGER NOT NULL DEFAULT 0,
    "auto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "traffic_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freela_campaigns" (
    "id" UUID NOT NULL,
    "freela_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "praca_id" UUID,
    "disparo_id" UUID,
    "audience" TEXT NOT NULL,
    "audience_filters" JSONB,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "freela_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freela_templates" (
    "id" UUID NOT NULL,
    "freela_id" TEXT NOT NULL,
    "praca_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freela_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "template_actions_key_key" ON "template_actions"("key");

-- CreateIndex
CREATE INDEX "actions_praca_id_step_idx" ON "actions"("praca_id", "step");

-- CreateIndex
CREATE INDEX "leads_praca_id_stage_idx" ON "leads"("praca_id", "stage");

-- CreateIndex
CREATE INDEX "leads_phone_key_idx" ON "leads"("phone_key");

-- CreateIndex
CREATE INDEX "leads_import_batch_id_idx" ON "leads"("import_batch_id");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_at_idx" ON "lead_events"("lead_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "import_mappings_name_key" ON "import_mappings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "blocklist_phone_key_key" ON "blocklist"("phone_key");

-- CreateIndex
CREATE INDEX "msg_sends_disparo_id_idx" ON "msg_sends"("disparo_id");

-- CreateIndex
CREATE INDEX "msg_sends_lead_id_idx" ON "msg_sends"("lead_id");

-- CreateIndex
CREATE INDEX "msg_sends_status_mode_idx" ON "msg_sends"("status", "mode");

-- CreateIndex
CREATE INDEX "msg_sends_freela_campaign_id_idx" ON "msg_sends"("freela_campaign_id");

-- CreateIndex
CREATE INDEX "cadence_nodes_cadence_id_sort_idx" ON "cadence_nodes"("cadence_id", "sort");

-- CreateIndex
CREATE INDEX "enrollments_cadence_id_status_idx" ON "enrollments"("cadence_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_lead_id_status_idx" ON "enrollments"("lead_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_days_entry_id_date_key" ON "traffic_days"("entry_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "freela_campaigns_freela_id_key" ON "freela_campaigns"("freela_id");

-- CreateIndex
CREATE UNIQUE INDEX "freela_templates_freela_id_key" ON "freela_templates"("freela_id");

-- AddForeignKey
ALTER TABLE "user_dismissed_notifs" ADD CONSTRAINT "user_dismissed_notifs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "praca_step_states" ADD CONSTRAINT "praca_step_states_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_completions" ADD CONSTRAINT "action_completions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_comments" ADD CONSTRAINT "action_comments_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_subitems" ADD CONSTRAINT "action_subitems_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_vagas" ADD CONSTRAINT "lead_vagas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "msg_sends" ADD CONSTRAINT "msg_sends_disparo_id_fkey" FOREIGN KEY ("disparo_id") REFERENCES "disparos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "msg_sends" ADD CONSTRAINT "msg_sends_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cadence_nodes" ADD CONSTRAINT "cadence_nodes_cadence_id_fkey" FOREIGN KEY ("cadence_id") REFERENCES "cadences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cadence_id_fkey" FOREIGN KEY ("cadence_id") REFERENCES "cadences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_logs" ADD CONSTRAINT "enrollment_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_praca_id_fkey" FOREIGN KEY ("praca_id") REFERENCES "pracas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_provas" ADD CONSTRAINT "campanha_provas_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanha_provas" ADD CONSTRAINT "campanha_provas_proof_id_fkey" FOREIGN KEY ("proof_id") REFERENCES "proofs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_comments" ADD CONSTRAINT "creative_comments_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_entries" ADD CONSTRAINT "traffic_entries_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_days" ADD CONSTRAINT "traffic_days_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "traffic_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
