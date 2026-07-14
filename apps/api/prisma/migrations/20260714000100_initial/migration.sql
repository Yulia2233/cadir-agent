-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('IDLE', 'RUNNING', 'WAITING_USER', 'FAILED', 'COMPLETED', 'ARCHIVED', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_USER', 'NEEDS_USER', 'ABORTING', 'ABORTED', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskMode" AS ENUM ('AUTO', 'PLAN', 'TARGET');

-- CreateEnum
CREATE TYPE "TaskPhase" AS ENUM ('DOMAIN_GUARD', 'ANALYZE', 'WAITING_USER', 'RETRIEVE', 'PLAN', 'CODE', 'EXECUTE', 'VALIDATE', 'VISUAL_REVIEW', 'PUBLISH', 'CASE_PACKAGE', 'CASE_CANDIDATE', 'REJECTED', 'NEEDS_USER', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PUBLISHING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('ACTIVE', 'RECOVERED', 'AMBIGUOUS', 'INVALID');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PRECHECKING', 'PRECHECK_FAILED', 'CANDIDATE', 'APPROVED', 'REJECTED', 'DUPLICATE', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('PUBLISHED', 'DEPRECATED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_model_configs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "base_url" VARCHAR(2048) NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "model_id" VARCHAR(200) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL DEFAULT 'New CAD conversation',
    "title_source" VARCHAR(20) NOT NULL DEFAULT 'system',
    "opencode_session_id" VARCHAR(160) NOT NULL,
    "current_revision_id" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'IDLE',
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID,
    "task_id" UUID,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured_parts" JSONB NOT NULL DEFAULT '[]',
    "opencode_message_id" VARCHAR(160),
    "idempotency_key" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "current_phase" "TaskPhase" NOT NULL DEFAULT 'DOMAIN_GUARD',
    "mode" "TaskMode" NOT NULL DEFAULT 'AUTO',
    "requirement_snapshot" JSONB NOT NULL DEFAULT '{}',
    "freecad_requested" BOOLEAN NOT NULL DEFAULT false,
    "runtime_id" VARCHAR(160),
    "error" JSONB,
    "iteration_count" INTEGER NOT NULL DEFAULT 0,
    "aborted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "runtime_image_version" VARCHAR(160) NOT NULL,
    "simplecadapi_version" VARCHAR(40) NOT NULL,
    "skill_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_revisions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "parent_revision_id" UUID,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHING',
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "object_key" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(160) NOT NULL,
    "size" BIGINT NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "backend" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selections" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "topology_ref" VARCHAR(200) NOT NULL,
    "display_id" VARCHAR(40) NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "signature" JSONB NOT NULL,
    "ql_selector" JSONB NOT NULL,
    "status" "SelectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(160) NOT NULL,
    "size" BIGINT NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" VARCHAR(80) NOT NULL,
    "conversation_id" UUID NOT NULL,
    "task_id" UUID,
    "type" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "text_version" VARCHAR(40) NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_case_candidates" (
    "id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "source_user_id" UUID NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PRECHECKING',
    "metadata" JSONB NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "precheck_result" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_case_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_cases" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "candidate_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "dimensions" JSONB NOT NULL,
    "geometry_summary" JSONB NOT NULL,
    "compatibility" JSONB NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'PUBLISHED',
    "published_at" TIMESTAMP(3),
    "unpublished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_case_artifacts" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "object_key" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_case_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_case_reviews" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" VARCHAR(40) NOT NULL,
    "notes" TEXT,
    "metadata_changes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_case_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_case_retrieval_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "task_id" UUID,
    "query" TEXT NOT NULL,
    "returned_case_ids" JSONB NOT NULL,
    "opened_case_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_case_retrieval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(160),
    "trace_id" VARCHAR(80) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "user_model_configs_user_id_is_default_idx" ON "user_model_configs"("user_id", "is_default");

-- PostgreSQL enforces at most one default provider configuration per user.
CREATE UNIQUE INDEX "user_model_configs_one_default_per_user_idx"
ON "user_model_configs"("user_id") WHERE "is_default" = true;

-- CreateIndex
CREATE UNIQUE INDEX "conversations_opencode_session_id_key" ON "conversations"("opencode_session_id");

-- CreateIndex
CREATE INDEX "conversations_user_id_status_updated_at_idx" ON "conversations"("user_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_current_revision_id_key" ON "conversations"("current_revision_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_idempotency_key_key" ON "messages"("conversation_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "tasks_conversation_id_status_created_at_idx" ON "tasks"("conversation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_status_idx" ON "tasks"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_conversation_id_key" ON "workspaces"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_storage_path_key" ON "workspaces"("storage_path");

-- CreateIndex
CREATE INDEX "workspaces_owner_user_id_status_idx" ON "workspaces"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "model_revisions_conversation_id_status_revision_number_idx" ON "model_revisions"("conversation_id", "status", "revision_number" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "model_revisions_conversation_id_revision_number_key" ON "model_revisions"("conversation_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_object_key_key" ON "artifacts"("object_key");

-- CreateIndex
CREATE INDEX "artifacts_revision_id_type_idx" ON "artifacts"("revision_id", "type");

-- CreateIndex
CREATE INDEX "selections_conversation_id_revision_id_user_id_idx" ON "selections"("conversation_id", "revision_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_object_key_key" ON "uploads"("object_key");

-- CreateIndex
CREATE INDEX "uploads_conversation_id_status_idx" ON "uploads"("conversation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_event_id_key" ON "domain_events"("event_id");

-- CreateIndex
CREATE INDEX "domain_events_conversation_id_id_idx" ON "domain_events"("conversation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_revision_id_key" ON "consent_records"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_case_candidates_source_revision_id_key" ON "model_case_candidates"("source_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_case_candidates_consent_record_id_key" ON "model_case_candidates"("consent_record_id");

-- CreateIndex
CREATE INDEX "model_case_candidates_status_created_at_idx" ON "model_case_candidates"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_cases_candidate_id_key" ON "model_cases"("candidate_id");

-- CreateIndex
CREATE INDEX "model_cases_status_published_at_idx" ON "model_cases"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_cases_family_id_version_key" ON "model_cases"("family_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "model_case_artifacts_object_key_key" ON "model_case_artifacts"("object_key");

-- CreateIndex
CREATE INDEX "model_case_artifacts_case_id_case_version_type_idx" ON "model_case_artifacts"("case_id", "case_version", "type");

-- CreateIndex
CREATE INDEX "model_case_reviews_candidate_id_created_at_idx" ON "model_case_reviews"("candidate_id", "created_at");

-- CreateIndex
CREATE INDEX "model_case_retrieval_logs_user_id_created_at_idx" ON "model_case_retrieval_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_model_configs" ADD CONSTRAINT "user_model_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "model_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_revisions" ADD CONSTRAINT "model_revisions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_revisions" ADD CONSTRAINT "model_revisions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_revisions" ADD CONSTRAINT "model_revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "model_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "model_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "model_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_candidates" ADD CONSTRAINT "model_case_candidates_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "model_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_candidates" ADD CONSTRAINT "model_case_candidates_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_candidates" ADD CONSTRAINT "model_case_candidates_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_cases" ADD CONSTRAINT "model_cases_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "model_case_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_artifacts" ADD CONSTRAINT "model_case_artifacts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "model_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_reviews" ADD CONSTRAINT "model_case_reviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "model_case_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_reviews" ADD CONSTRAINT "model_case_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_retrieval_logs" ADD CONSTRAINT "model_case_retrieval_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_retrieval_logs" ADD CONSTRAINT "model_case_retrieval_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_case_retrieval_logs" ADD CONSTRAINT "model_case_retrieval_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
