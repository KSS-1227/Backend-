const logger = require("../utils/logger");
const config = require("../utils/config");

class ContentTypeManager {
  constructor() {
    this.contentTypeConfigs = new Map();
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default configurations for common content types
   */
  initializeDefaultConfigs() {
    // Blog Post Configuration
    this.contentTypeConfigs.set('blog_post', {
      name: 'Blog Post',
      embeddingFields: ['title', 'description', 'content'],
      titleFields: ['title'],
      snippetFields: ['description', 'content'],
      tagFields: ['tag', 'tags', 'keywords'],
      categoryFields: ['category', 'type'],
      urlTemplate: '${baseUrl}/blog/${slug}',
      searchWeight: {
        title: 2.0,
        content: 1.0,
        tags: 0.5
      },
      filterOptions: {
        category: true,
        tags: true,
        publishedDate: true
      },
      icon: '📝',
      color: '#3b82f6'
    });

    // Product Configuration
    this.contentTypeConfigs.set('product', {
      name: 'Product',
      embeddingFields: ['name', 'description', 'features'],
      titleFields: ['name', 'title'],
      snippetFields: ['description', 'summary'],
      tagFields: ['tags', 'features'],
      categoryFields: ['category', 'type'],
      urlTemplate: '${baseUrl}/products/${slug}',
      searchWeight: {
        name: 2.5,
        description: 1.5,
        features: 1.0,
        tags: 0.8
      },
      filterOptions: {
        category: true,
        price: true,
        brand: true
      },
      icon: '🛍️',
      color: '#10b981'
    });

    // Documentation Configuration
    this.contentTypeConfigs.set('documentation', {
      name: 'Documentation',
      embeddingFields: ['title', 'content', 'summary'],
      titleFields: ['title', 'heading'],
      snippetFields: ['summary', 'content'],
      tagFields: ['tags', 'topics'],
      categoryFields: ['category', 'section'],
      urlTemplate: '${baseUrl}/docs/${slug}',
      searchWeight: {
        title: 2.0,
        content: 1.5,
        summary: 1.0
      },
      filterOptions: {
        section: true,
        version: true,
        difficulty: true
      },
      icon: '📚',
      color: '#8b5cf6'
    });

    // FAQ Configuration
    this.contentTypeConfigs.set('faq', {
      name: 'FAQ',
      embeddingFields: ['question', 'answer'],
      titleFields: ['question'],
      snippetFields: ['answer'],
      tagFields: ['tags', 'topics'],
      categoryFields: ['category'],
      urlTemplate: '${baseUrl}/faq#${uid}',
      searchWeight: {
        question: 3.0,
        answer: 1.0
      },
      filterOptions: {
        category: true
      },
      icon: '❓',
      color: '#f59e0b'
    });

    // Page Configuration
    this.contentTypeConfigs.set('page', {
      name: 'Page',
      embeddingFields: ['title', 'description', 'rich_text'],
      titleFields: ['title'],
      snippetFields: ['description'],
      tagFields: [],
      categoryFields: [],
      urlTemplate: '${baseUrl}${url}',
      searchWeight: {
        title: 2.0,
        description: 1.0,
        content: 0.8
      },
      filterOptions: {},
      icon: '📄',
      color: '#6b7280'
    });

    logger.info(`Initialized ${this.contentTypeConfigs.size} default content type configurations`);
  }

  /**
   * Register a custom content type configuration
   */
  registerContentType(uid, config) {
    const requiredFields = ['name', 'embeddingFields', 'titleFields', 'snippetFields'];
    
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Content type configuration missing required field: ${field}`);
      }
    }

    const fullConfig = {
      tagFields: [],
      categoryFields: [],
      urlTemplate: '${baseUrl}/${contentType}/${slug}',
      searchWeight: {},
      filterOptions: {},
      icon: '📄',
      color: '#6b7280',
      ...config
    };

    this.contentTypeConfigs.set(uid, fullConfig);
    logger.info(`Registered custom content type configuration: ${uid}`);
  }

  /**
   * Get configuration for a content type
   */
  getContentTypeConfig(uid) {
    return this.contentTypeConfigs.get(uid) || this.getDefaultConfig(uid);
  }

  /**
   * Get default configuration for unknown content types
   */
  getDefaultConfig(uid) {
    return {
      name: uid.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      embeddingFields: ['title', 'description', 'content'],
      titleFields: ['title', 'name'],
      snippetFields: ['description', 'summary', 'content'],
      tagFields: ['tags', 'tag'],
      categoryFields: ['category', 'type'],
      urlTemplate: '${baseUrl}/${contentType}/${slug}',
      searchWeight: {
        title: 2.0,
        content: 1.0
      },
      filterOptions: {
        category: true
      },
      icon: '📄',
      color: '#6b7280'
    };
  }

  /**
   * Generate embedding text based on content type configuration
   */
  generateEmbeddingText(entry, contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    const texts = [];

    for (const field of config.embeddingFields) {
      const value = this.extractFieldValue(entry, field);
      if (value) {
        const weight = config.searchWeight[field] || 1.0;
        // Repeat text based on weight to emphasize important fields
        const repetitions = Math.ceil(weight);
        for (let i = 0; i < repetitions; i++) {
          texts.push(value);
        }
      }
    }

    return texts.join(' ');
  }

  /**
   * Extract title using content type configuration
   */
  extractTitle(entry, contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    
    for (const field of config.titleFields) {
      const value = this.extractFieldValue(entry, field);
      if (value) {
        return value;
      }
    }

    return entry.uid || 'Untitled';
  }

  /**
   * Extract snippet using content type configuration
   */
  extractSnippet(entry, contentTypeUid, maxLength = 500) {
    const config = this.getContentTypeConfig(contentTypeUid);
    
    for (const field of config.snippetFields) {
      const value = this.extractFieldValue(entry, field);
      if (value) {
        return this.truncateText(value, maxLength);
      }
    }

    return 'No description available';
  }

  /**
   * Extract tags using content type configuration
   */
  extractTags(entry, contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    
    for (const field of config.tagFields) {
      const value = entry[field];
      if (value) {
        if (Array.isArray(value)) {
          return value.map(tag => 
            typeof tag === 'string' ? tag : (tag.title || tag.name || tag.toString())
          );
        } else if (typeof value === 'string') {
          return value.split(',').map(tag => tag.trim()).filter(Boolean);
        }
      }
    }

    return [];
  }

  /**
   * Extract category using content type configuration
   */
  extractCategory(entry, contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    
    for (const field of config.categoryFields) {
      const value = entry[field];
      if (value) {
        return typeof value === 'string' 
          ? value 
          : (value.title || value.name || value.toString());
      }
    }

    return null;
  }

  /**
   * Generate URL using content type configuration
   */
  generateUrl(entry, contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    const baseUrl = process.env.CONTENT_BASE_URL || 'https://example.com';
    const slug = entry.url || entry.slug || entry.uid;

    return config.urlTemplate
      .replace('${baseUrl}', baseUrl)
      .replace('${contentType}', contentTypeUid)
      .replace('${slug}', slug)
      .replace('${uid}', entry.uid);
  }

  /**
   * Get available filter options for a content type
   */
  getFilterOptions(contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    return config.filterOptions;
  }

  /**
   * Get content type metadata for UI
   */
  getContentTypeMetadata(contentTypeUid) {
    const config = this.getContentTypeConfig(contentTypeUid);
    return {
      uid: contentTypeUid,
      name: config.name,
      icon: config.icon,
      color: config.color,
      filterOptions: config.filterOptions
    };
  }

  /**
   * Get all registered content types
   */
  getAllContentTypes() {
    return Array.from(this.contentTypeConfigs.keys()).map(uid => 
      this.getContentTypeMetadata(uid)
    );
  }

  /**
   * Extract field value with support for rich text and complex fields
   */
  extractFieldValue(entry, field) {
    const value = entry[field];
    if (!value) return null;

    // Handle rich text fields
    if (typeof value === 'object' && value.json) {
      return this.extractTextFromRichText(value);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => 
        typeof item === 'string' ? item : (item.title || item.name || item.toString())
      ).join(' ');
    }

    // Handle objects
    if (typeof value === 'object') {
      return value.title || value.name || JSON.stringify(value);
    }

    return value.toString();
  }

  /**
   * Extract plain text from Contentstack rich text format
   */
  extractTextFromRichText(richText) {
    try {
      if (!richText.json || !richText.json.children) {
        return '';
      }

      const extractText = (nodes) => {
        let text = '';
        for (const node of nodes) {
          if (node.type === 'text') {
            text += node.text;
          } else if (node.children) {
            text += extractText(node.children);
          }
        }
        return text;
      };

      return extractText(richText.json.children);
    } catch (error) {
      logger.warn('Failed to extract text from rich text:', error);
      return '';
    }
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Analyze content types in the system
   */
  async analyzeContentTypes(entries) {
    const analysis = new Map();

    for (const entry of entries) {
      const contentType = entry.content_type;
      if (!analysis.has(contentType)) {
        analysis.set(contentType, {
          uid: contentType,
          count: 0,
          fields: new Set(),
          config: this.getContentTypeConfig(contentType)
        });
      }

      const typeAnalysis = analysis.get(contentType);
      typeAnalysis.count++;
      
      // Collect field names
      Object.keys(entry.raw_data || entry).forEach(field => {
        typeAnalysis.fields.add(field);
      });
    }

    // Convert to array and add metadata
    return Array.from(analysis.values()).map(item => ({
      ...item,
      fields: Array.from(item.fields),
      hasConfig: this.contentTypeConfigs.has(item.uid)
    }));
  }

  /**
   * Get statistics about content type usage
   */
  getStats() {
    return {
      registeredTypes: this.contentTypeConfigs.size,
      defaultTypes: ['blog_post', 'product', 'documentation', 'faq', 'page'],
      customTypes: Array.from(this.contentTypeConfigs.keys()).filter(
        uid => !['blog_post', 'product', 'documentation', 'faq', 'page'].includes(uid)
      )
    };
  }
}

module.exports = new ContentTypeManager();
