CREATE TABLE "access_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"can_download" boolean DEFAULT false NOT NULL,
	"allowed_folder_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tier" text DEFAULT 'confirmatory' NOT NULL,
	"bound_fingerprint" text,
	"bound_ip" text,
	"invited_by" text,
	"sent_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"request_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"max_page_reached" integer DEFAULT 1 NOT NULL,
	"pages_viewed" integer DEFAULT 0 NOT NULL,
	"completion" real DEFAULT 0 NOT NULL,
	"downloaded" boolean DEFAULT false NOT NULL,
	"print_attempted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"blob_path" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"download_policy" text DEFAULT 'inherit' NOT NULL,
	"tier" text DEFAULT 'inherit' NOT NULL,
	"content_updated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"visitor_id" uuid,
	"document_id" uuid,
	"type" text NOT NULL,
	"actor" text DEFAULT 'visitor' NOT NULL,
	"label" text,
	"metadata" jsonb,
	"ip" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"tier" text DEFAULT 'diligence' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nda_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"access_link_id" uuid,
	"nda_version" text NOT NULL,
	"nda_text_hash" text NOT NULL,
	"signed_name" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_view_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"document_id" uuid,
	"folder_id" uuid,
	"kind" text DEFAULT 'question' NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"access_link_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"active_ms" integer DEFAULT 0 NOT NULL,
	"ip" text,
	"country" text,
	"country_region" text,
	"city" text,
	"latitude" text,
	"longitude" text,
	"timezone" text,
	"user_agent" text,
	"browser" text,
	"os" text,
	"device_type" text,
	"screen" text,
	"referrer" text,
	"fingerprint" text,
	"is_new_device" boolean DEFAULT false NOT NULL,
	"suspicious" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"organization" text,
	"role" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_views" ADD CONSTRAINT "document_views_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_views" ADD CONSTRAINT "document_views_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_views" ADD CONSTRAINT "document_views_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_acceptances" ADD CONSTRAINT "nda_acceptances_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_acceptances" ADD CONSTRAINT "nda_acceptances_access_link_id_access_links_id_fk" FOREIGN KEY ("access_link_id") REFERENCES "public"."access_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_document_view_id_document_views_id_fk" FOREIGN KEY ("document_view_id") REFERENCES "public"."document_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_access_link_id_access_links_id_fk" FOREIGN KEY ("access_link_id") REFERENCES "public"."access_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_token_hash_idx" ON "access_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_links_visitor_idx" ON "access_links" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "admin_login_codes_email_idx" ON "admin_login_codes" USING btree ("email","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "doc_views_session_idx" ON "document_views" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "doc_views_document_idx" ON "document_views" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_views_visitor_idx" ON "document_views" USING btree ("visitor_id","opened_at");--> statement-breakpoint
CREATE INDEX "documents_folder_idx" ON "documents" USING btree ("folder_id","sort_order");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_visitor_idx" ON "events" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_slug_idx" ON "folders" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "nda_visitor_idx" ON "nda_acceptances" USING btree ("visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_unique_idx" ON "page_views" USING btree ("document_view_id","page_number");--> statement-breakpoint
CREATE INDEX "page_views_document_idx" ON "page_views" USING btree ("document_id","page_number");--> statement-breakpoint
CREATE INDEX "questions_visitor_idx" ON "questions" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sessions_visitor_idx" ON "sessions" USING btree ("visitor_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_started_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitors_email_idx" ON "visitors" USING btree ("email");