-- Adds an optional WhatsApp group invite link to a batch.
-- Nullable and additive: existing batches are unchanged.
ALTER TABLE "Batch" ADD COLUMN "whatsappLink" TEXT;
