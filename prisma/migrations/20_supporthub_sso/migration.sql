-- SupportHub SSO fork: externalRef dedup fields + JTI single-use table

-- Team.externalRef
ALTER TABLE "team" ADD COLUMN "external_ref" VARCHAR(255);
CREATE UNIQUE INDEX "team_external_ref_key" ON "team"("external_ref");
CREATE INDEX "team_external_ref_idx" ON "team"("external_ref");

-- Website.externalRef
ALTER TABLE "website" ADD COLUMN "external_ref" VARCHAR(255);
CREATE UNIQUE INDEX "website_external_ref_key" ON "website"("external_ref");
CREATE INDEX "website_external_ref_idx" ON "website"("external_ref");

-- SSO handoff JTI single-use table
CREATE TABLE "sso_handoff_jti" (
    "jti" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sso_handoff_jti_pkey" PRIMARY KEY ("jti")
);
