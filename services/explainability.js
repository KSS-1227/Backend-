const OpenAI = require("openai");
const config = require("../utils/config");
const logger = require("../utils/logger");

class ExplainabilityService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.stats = {
      explanationsGenerated: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Generate explanation for why a search result was returned
   */
  async explainSearchResult(query, result, similarity) {
    const startTime = Date.now();
    
    try {
      const explanation = await this.generateExplanation(query, result, similarity);
      
      // Update stats
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime);
      
      logger.debug(`Generated explanation for search result in ${responseTime}ms`);
      
      return {
        explanation,
        confidence: this.calculateConfidence(similarity),
        keyFactors: this.extractKeyFactors(query, result),
        similarity,
        responseTime
      };
      
    } catch (error) {
      logger.error("Failed to generate search explanation:", error);
      return this.getFallbackExplanation(query, result, similarity);
    }
  }

  /**
   * Generate multiple explanations for search results
   */
  async explainSearchResults(query, results) {
    const explanations = await Promise.allSettled(
      results.slice(0, 5).map(result => 
        this.explainSearchResult(query, result, result.similarity)
      )
    );

    return explanations.map((explanation, index) => ({
      resultId: results[index].id,
      ...explanation.status === 'fulfilled' ? explanation.value : {
        explanation: "Unable to generate explanation",
        confidence: "low",
        keyFactors: [],
        similarity: results[index].similarity,
        error: explanation.reason?.message
      }
    }));
  }

  /**
   * Generate AI explanation using OpenAI
   */
  async generateExplanation(query, result, similarity) {
    const prompt = this.buildExplanationPrompt(query, result, similarity);
    
    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a search result explainer. Provide clear, concise explanations for why a specific content item matches a user's search query. Focus on semantic similarity, content relevance, and key matching concepts. Keep explanations under 150 words."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    return completion.choices[0].message.content.trim();
  }

  /**
   * Build prompt for explanation generation
   */
  buildExplanationPrompt(query, result, similarity) {
    return `
Query: "${query}"

Content Found:
- Title: ${result.title}
- Type: ${result.contentType}
- Snippet: ${result.snippet}
- Similarity Score: ${(similarity * 100).toFixed(1)}%

Explain why this content matches the user's query. Focus on:
1. Key concepts that overlap between query and content
2. Semantic relationships
3. Content relevance
4. Why the similarity score makes sense

Provide a clear, user-friendly explanation in 2-3 sentences.
    `.trim();
  }

  /**
   * Calculate confidence level based on similarity score
   */
  calculateConfidence(similarity) {
    if (similarity >= 0.8) return "very high";
    if (similarity >= 0.7) return "high";
    if (similarity >= 0.6) return "medium";
    if (similarity >= 0.4) return "low";
    return "very low";
  }

  /**
   * Extract key matching factors between query and result
   */
  extractKeyFactors(query, result) {
    const factors = [];
    const queryWords = this.extractKeywords(query.toLowerCase());
    const titleWords = this.extractKeywords(result.title.toLowerCase());
    const snippetWords = this.extractKeywords(result.snippet.toLowerCase());

    // Title matches
    const titleMatches = queryWords.filter(word => 
      titleWords.some(titleWord => titleWord.includes(word) || word.includes(titleWord))
    );
    if (titleMatches.length > 0) {
      factors.push({
        type: "title_match",
        description: `Title contains: ${titleMatches.join(", ")}`,
        impact: "high"
      });
    }

    // Content matches
    const contentMatches = queryWords.filter(word => 
      snippetWords.some(snippetWord => snippetWord.includes(word) || word.includes(snippetWord))
    );
    if (contentMatches.length > 0) {
      factors.push({
        type: "content_match",
        description: `Content mentions: ${contentMatches.join(", ")}`,
        impact: "medium"
      });
    }

    // Content type relevance
    factors.push({
      type: "content_type",
      description: `Content type: ${result.contentType}`,
      impact: "low"
    });

    return factors.slice(0, 3); // Return top 3 factors
  }

  /**
   * Extract meaningful keywords from text
   */
  extractKeywords(text) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 
      'would', 'should', 'could', 'can', 'may', 'might', 'must', 'shall',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 
      'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ]);

    return text
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, ''))
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers
  }

  /**
   * Get fallback explanation when AI fails
   */
  getFallbackExplanation(query, result, similarity) {
    const confidence = this.calculateConfidence(similarity);
    const keyFactors = this.extractKeyFactors(query, result);
    
    let explanation = `This ${result.contentType} matches your search with ${confidence} confidence (${(similarity * 100).toFixed(1)}% similarity). `;
    
    if (keyFactors.length > 0) {
      const highImpactFactors = keyFactors.filter(f => f.impact === "high");
      if (highImpactFactors.length > 0) {
        explanation += `Key matches found in: ${highImpactFactors.map(f => f.description).join(", ")}.`;
      } else {
        explanation += `Matches found in content and context.`;
      }
    } else {
      explanation += `The match is based on semantic similarity between your query and the content.`;
    }

    return {
      explanation,
      confidence,
      keyFactors,
      similarity,
      fallback: true
    };
  }

  /**
   * Generate search suggestions based on query analysis
   */
  async generateSearchSuggestions(query, results) {
    try {
      const prompt = `
Given this search query: "${query}"

And these search results:
${results.slice(0, 3).map((result, index) => 
  `${index + 1}. ${result.title} (${result.contentType})`
).join('\n')}

Suggest 3-5 related search queries that might help the user find more relevant content. 
Make suggestions more specific, broader, or from different angles.
Return as a simple JSON array of strings.
      `.trim();

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a search assistant. Generate helpful search suggestions in JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.5
      });

      const suggestions = JSON.parse(completion.choices[0].message.content);
      return Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
      
    } catch (error) {
      logger.warn("Failed to generate search suggestions:", error.message);
      return this.getFallbackSuggestions(query);
    }
  }

  /**
   * Get fallback search suggestions
   */
  getFallbackSuggestions(query) {
    const words = query.split(' ').filter(word => word.length > 2);
    const suggestions = [];

    if (words.length > 1) {
      // More specific
      suggestions.push(`${query} tutorial`);
      suggestions.push(`${query} guide`);
      
      // Individual words
      words.forEach(word => {
        suggestions.push(`${word} examples`);
      });
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Update service statistics
   */
  updateStats(responseTime) {
    this.stats.explanationsGenerated++;
    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime = Math.round(
      this.stats.totalResponseTime / this.stats.explanationsGenerated
    );
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConfigured: !!config.openai.apiKey,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      explanationsGenerated: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
  }
}

module.exports = new ExplainabilityService();
