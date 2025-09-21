const express = require("express");
const contentstackService = require("../services/contentstack");
const embeddingsService = require("../services/embeddings");
const supabaseService = require("../services/supabase");
const logger = require("../utils/logger");
const config = require("../utils/config");

const router = express.Router();

/**
 * Contentstack Webhook Handler
 * Handles real-time content updates from Contentstack
 */
router.post("/contentstack", async (req, res) => {
  try {
    const { body } = req;

    // Verify webhook payload
    if (!body || !body.data) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const { data, event } = body;

    logger.info(`📥 Contentstack webhook received: ${event}`, {
      contentType: data?.content_type_uid,
      entryUid: data?.entry?.uid,
      locale: data?.entry?.locale,
    });

    // Handle different events
    switch (event) {
      case "entry.published":
        await handleEntryPublished(data);
        break;
      case "entry.unpublished":
        await handleEntryUnpublished(data);
        break;
      case "entry.deleted":
        await handleEntryDeleted(data);
        break;
      default:
        logger.warn(`Unhandled Contentstack event: ${event}`);
    }

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    logger.error("Contentstack webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Handle entry published event
 */
async function handleEntryPublished(data) {
  const { content_type_uid: contentTypeUid, entry, locale } = data;

  if (!contentTypeUid || !entry || !entry.uid) {
    logger.warn("Invalid entry published data");
    return;
  }

  // Transform the entry
  const transformedEntry = contentstackService.transformEntry(
    entry,
    contentTypeUid,
    locale || "en-us"
  );

  // Generate embedding
  const embeddingText =
    embeddingsService.generateEmbeddingText(transformedEntry);
  const embedding = await embeddingsService.generateEmbedding(embeddingText);

  // Sync to Supabase
  const supabaseEntry = {
    id: transformedEntry.id,
    title: transformedEntry.title,
    snippet: transformedEntry.snippet,
    url: transformedEntry.url,
    content_type: transformedEntry.content_type,
    locale: transformedEntry.locale,
    updated_at: transformedEntry.updated_at,
    embedding: embedding,
  };

  await supabaseService.upsertContentEntry(supabaseEntry);

  logger.info(`✅ Entry published and synced: ${transformedEntry.id}`);
}

/**
 * Handle entry unpublished event
 */
async function handleEntryUnpublished(data) {
  const { content_type_uid: contentTypeUid, entry, locale } = data;

  if (!contentTypeUid || !entry || !entry.uid) {
    logger.warn("Invalid entry unpublished data");
    return;
  }

  const entryId = `${contentTypeUid}_${entry.uid}_${locale || "en-us"}`;

  // Remove from Supabase
  const { error } = await supabaseService.client
    .from("content_entries")
    .delete()
    .eq("id", entryId);

  if (error) {
    throw error;
  }

  logger.info(`🗑️ Entry unpublished and removed: ${entryId}`);
}

/**
 * Handle entry deleted event
 */
async function handleEntryDeleted(data) {
  const { content_type_uid: contentTypeUid, entry, locale } = data;

  if (!contentTypeUid || !entry || !entry.uid) {
    logger.warn("Invalid entry deleted data");
    return;
  }

  const entryId = `${contentTypeUid}_${entry.uid}_${locale || "en-us"}`;

  // Remove from Supabase
  const { error } = await supabaseService.client
    .from("content_entries")
    .delete()
    .eq("id", entryId);

  if (error) {
    throw error;
  }

  logger.info(`🗑️ Entry deleted and removed: ${entryId}`);
}

module.exports = router;
