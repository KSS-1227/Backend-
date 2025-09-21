const express = require("express");
const router = express.Router();

const supabaseService = require("../services/supabase");
const logger = require("../utils/logger");

/**
 * GET /api/filters
 * Get available filter options (content types and locales)
 */
router.get("/", async (req, res) => {
  try {
    logger.debug("Fetching filter options");

    const filterOptions = await supabaseService.getFilterOptions();

    const response = {
      filters: {
        contentTypes: filterOptions.contentTypes.map((type) => ({
          value: type,
          label: formatContentTypeLabel(type),
          count: null, // Could be populated if needed
        })),
        locales: filterOptions.locales.map((locale) => ({
          value: locale,
          label: formatLocaleLabel(locale),
          count: null, // Could be populated if needed
        })),
      },
      meta: {
        totalContentTypes: filterOptions.contentTypes.length,
        totalLocales: filterOptions.locales.length,
        timestamp: new Date().toISOString(),
      },
    };

    logger.debug(
      `Returned ${filterOptions.contentTypes.length} content types and ${filterOptions.locales.length} locales`
    );

    res.json(response);
  } catch (error) {
    logger.error("Failed to fetch filter options:", error);
    res.status(500).json({
      error: "Failed to fetch filter options",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/filters/content-types
 * Get only content types
 */
router.get("/content-types", async (req, res) => {
  try {
    const filterOptions = await supabaseService.getFilterOptions();

    const response = {
      contentTypes: filterOptions.contentTypes.map((type) => ({
        value: type,
        label: formatContentTypeLabel(type),
      })),
      meta: {
        total: filterOptions.contentTypes.length,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Failed to fetch content types:", error);
    res.status(500).json({
      error: "Failed to fetch content types",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/filters/locales
 * Get only locales
 */
router.get("/locales", async (req, res) => {
  try {
    const filterOptions = await supabaseService.getFilterOptions();

    const response = {
      locales: filterOptions.locales.map((locale) => ({
        value: locale,
        label: formatLocaleLabel(locale),
      })),
      meta: {
        total: filterOptions.locales.length,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Failed to fetch locales:", error);
    res.status(500).json({
      error: "Failed to fetch locales",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/filters/stats
 * Get statistics about content distribution
 */
router.get("/stats", async (req, res) => {
  try {
    // Get filter options first
    const filterOptions = await supabaseService.getFilterOptions();

    // Get counts for each content type and locale
    const [contentTypeCounts, localeCounts, totalEntries] = await Promise.all([
      getContentTypeCounts(),
      getLocaleCounts(),
      getTotalEntriesCount(),
    ]);

    const response = {
      stats: {
        totalEntries,
        contentTypes: {
          total: filterOptions.contentTypes.length,
          distribution: contentTypeCounts,
        },
        locales: {
          total: filterOptions.locales.length,
          distribution: localeCounts,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Failed to get filter stats:", error);
    res.status(500).json({
      error: "Failed to get filter statistics",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Format content type for display
 */
function formatContentTypeLabel(contentType) {
  if (!contentType) return "Unknown";

  // Convert snake_case to Title Case
  return contentType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Format locale for display
 */
function formatLocaleLabel(locale) {
  const localeMap = {
    "en-us": "English (US)",
    "en-gb": "English (UK)",
    "es-es": "Spanish (Spain)",
    "es-mx": "Spanish (Mexico)",
    "fr-fr": "French (France)",
    "de-de": "German (Germany)",
    "it-it": "Italian (Italy)",
    "pt-br": "Portuguese (Brazil)",
    "ja-jp": "Japanese (Japan)",
    "ko-kr": "Korean (Korea)",
    "zh-cn": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    "ru-ru": "Russian (Russia)",
    "ar-ae": "Arabic (UAE)",
    "hi-in": "Hindi (हिन्दी)",
    "bn-in": "Bengali (বাংলা)",
    "ta-in": "Tamil (தமிழ்)",
    "te-in": "Telugu (తెలుగు)",
    "mr-in": "Marathi (मराठी)",
  };

  return localeMap[locale] || locale.toUpperCase();
}

/**
 * Get content type distribution counts
 */
async function getContentTypeCounts() {
  try {
    // Use an RPC call for efficient database-side aggregation.
    const { data, error } = await supabaseService.client.rpc(
      "get_content_type_counts"
    );

    if (error) throw error;

    return data.map(([type, count]) => ({
      value: type,
      label: formatContentTypeLabel(type),
      count,
    }));
  } catch (error) {
    logger.warn("Failed to get content type counts:", error.message);
    return [];
  }
}

/**
 * Get locale distribution counts
 */
async function getLocaleCounts() {
  try {
    // Use an RPC call for efficient database-side aggregation.
    const { data, error } = await supabaseService.client.rpc(
      "get_locale_counts"
    );

    if (error) throw error;

    return data.map(({ locale_val: locale, count }) => ({
      value: locale,
      label: formatLocaleLabel(locale),
      count,
    }));
  } catch (error) {
    logger.warn("Failed to get locale counts:", error.message);
    return [];
  }
}

/**
 * Get total number of entries
 */
async function getTotalEntriesCount() {
  try {
    const { count, error } = await supabaseService.client
      .from("content_entries")
      .select("*", { count: "exact", head: true });

    if (error) throw error;

    return count || 0;
  } catch (error) {
    logger.warn("Failed to get total entries count:", error.message);
    return 0;
  }
}

module.exports = router;
