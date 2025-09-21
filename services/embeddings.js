const OpenAI = require("openai");
const config = require("../utils/config");
const logger = require("../utils/logger");
const contentTypeManager = require("./contentTypeManager");

class EmbeddingsService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    logger.info("🤖 OpenAI client initialized");
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error("Text cannot be empty");
      }

      // Truncate text if it's too long
      const truncatedText = this.truncateText(text, config.openai.maxTokens);

      const response = await this.openai.embeddings.create({
        model: config.openai.model,
        input: truncatedText,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No embedding returned from OpenAI");
      }

      return response.data[0].embedding;
    } catch (error) {
      logger.error("Failed to generate embedding:", error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddings(texts, batchSize = 100) {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error("Texts must be a non-empty array");
      }

      const embeddings = [];
      const totalBatches = Math.ceil(texts.length / batchSize);

      logger.info(
        `🔄 Generating embeddings for ${texts.length} texts in ${totalBatches} batches`
      );

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        logger.debug(
          `Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`
        );

        try {
          // Prepare batch texts (truncate if needed)
          const preparedTexts = batch.map((text) =>
            this.truncateText(text || "", config.openai.maxTokens)
          );

          const response = await this.openai.embeddings.create({
            model: config.openai.model,
            input: preparedTexts,
          });

          if (!response.data || response.data.length !== batch.length) {
            throw new Error(
              `Expected ${batch.length} embeddings, got ${
                response.data?.length || 0
              }`
            );
          }

          const batchEmbeddings = response.data.map((item) => item.embedding);
          embeddings.push(...batchEmbeddings);

          logger.debug(
            `✅ Batch ${batchNumber} completed (${batchEmbeddings.length} embeddings)`
          );

          // Add a small delay between batches to respect rate limits
          if (i + batchSize < texts.length) {
            await this.delay(1000); // 1 second delay
          }
        } catch (error) {
          logger.error(`❌ Failed to process batch ${batchNumber}:`, error);
          // Add null embeddings for failed batch to maintain array alignment
          embeddings.push(...new Array(batch.length).fill(null));
        }
      }

      const successfulEmbeddings = embeddings.filter(
        (emb) => emb !== null
      ).length;
      logger.info(
        `✅ Generated ${successfulEmbeddings}/${texts.length} embeddings successfully`
      );

      return embeddings;
    } catch (error) {
      logger.error("Failed to generate batch embeddings:", error);
      throw error;
    }
  }

  /**
   * Generate embedding text from content entry using content type manager
   */
  generateEmbeddingText(entry) {
    try {
      // Use content type manager to generate optimized embedding text
      if (entry.content_type && entry.raw_data) {
        return contentTypeManager.generateEmbeddingText(entry.raw_data, entry.content_type);
      }
      
      // Fallback to basic method for entries without content type info
      return this.generateBasicEmbeddingText(entry);
    } catch (error) {
      logger.error("Failed to generate embedding text:", error);
      throw error;
    }
  }

  /**
   * Generate basic embedding text (fallback method)
   */
  generateBasicEmbeddingText(entry) {
    const parts = [];

    // Add title with higher weight
    if (entry.title) {
      parts.push(`Title: ${entry.title}`);
    }

    // Add snippet/description
    if (entry.snippet) {
      parts.push(`Description: ${entry.snippet}`);
    }

    // Add content type for context
    if (entry.content_type) {
      parts.push(`Type: ${entry.content_type}`);
    }

    // Add any additional searchable fields
    if (entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0) {
      parts.push(`Tags: ${entry.tags.join(", ")}`);
    }

    if (entry.category) {
      parts.push(`Category: ${entry.category}`);
    }

    // Add raw content if available and not already included
    if (entry.raw_data) {
      const contentFields = ["content", "body", "text", "details"];
      for (const field of contentFields) {
        if (entry.raw_data[field]) {
          let content = entry.raw_data[field];
          if (typeof content === "object" && content.json) {
            content = this.extractTextFromRichText(content);
          } else if (typeof content === "object") {
            content = JSON.stringify(content);
          }

          if (content && content.trim()) {
            parts.push(`Content: ${this.truncateText(content, 1000)}`);
            break; // Only add one content field to avoid overwhelming the embedding
          }
        }
      }
    }

    const text = parts.join("\n\n");

    if (!text.trim()) {
      throw new Error("No content available for embedding generation");
    }

    return text;
  }

  /**
   * Extract text from rich text field
   */
  extractTextFromRichText(richText) {
    try {
      if (!richText.json || !richText.json.children) {
        return "";
      }

      const extractText = (nodes) => {
        let text = "";
        for (const node of nodes) {
          if (node.type === "text") {
            text += node.text;
          } else if (node.children) {
            text += extractText(node.children);
          }
        }
        return text;
      };

      return extractText(richText.json.children);
    } catch (error) {
      return "";
    }
  }

  /**
   * Process content entries and add embeddings
   */
  async processContentEntries(entries) {
    try {
      logger.info(
        `🔄 Processing ${entries.length} content entries for embeddings`
      );

      // Generate embedding texts
      const embeddingTexts = entries.map((entry, index) => {
        try {
          return this.generateEmbeddingText(entry);
        } catch (error) {
          logger.warn(
            `Failed to generate embedding text for entry ${index}:`,
            error.message
          );
          return entry.title || entry.snippet || "No content available";
        }
      });

      // Generate embeddings in batches
      const embeddings = await this.generateEmbeddings(embeddingTexts);

      // Combine entries with embeddings
      const processedEntries = entries
        .map((entry, index) => ({
          ...entry,
          embedding: embeddings[index],
        }))
        .filter((entry) => entry.embedding !== null); // Filter out failed embeddings

      logger.info(
        `✅ Successfully processed ${processedEntries.length}/${entries.length} entries with embeddings`
      );

      return processedEntries;
    } catch (error) {
      logger.error("Failed to process content entries:", error);
      throw error;
    }
  }

  /**
   * Truncate text to fit within token limits
   */
  truncateText(text, maxTokens) {
    if (!text) return "";

    // Rough estimation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;

    if (text.length <= maxChars) {
      return text;
    }

    // Truncate and try to end at a word boundary
    let truncated = text.substring(0, maxChars);
    const lastSpaceIndex = truncated.lastIndexOf(" ");

    if (lastSpaceIndex > maxChars * 0.8) {
      truncated = truncated.substring(0, lastSpaceIndex);
    }

    return truncated + "...";
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    if (!text) return 0;

    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Utility function to add delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate embedding dimensions
   */
  validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length !== config.search.embeddingDimensions) {
      return false;
    }

    return embedding.every((val) => typeof val === "number" && !isNaN(val));
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      model: config.openai.model,
      maxTokens: config.openai.maxTokens,
      embeddingDimensions: config.search.embeddingDimensions,
    };
  }
}

module.exports = new EmbeddingsService();
