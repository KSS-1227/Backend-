#!/usr/bin/env node

/**
 * Blog Search Diagnostic Script
 * Checks why blog posts aren't appearing in search results
 */

require("dotenv").config();

const contentstackService = require("./services/contentstack");
const supabaseService = require("./services/supabase");
const embeddingsService = require("./services/embeddings");
const logger = require("./utils/logger");

async function diagnoseBlogSearch() {
  console.log("🔍 Diagnosing Blog Search Issues");
  console.log("=".repeat(50));

  try {
    // Step 1: Check ContentStack connection
    console.log("\n1. Testing ContentStack Connection...");
    const contentTypes = await contentstackService.getContentTypes();
    console.log(
      `✅ Connected to ContentStack - Found ${contentTypes.length} content types`
    );

    // Check if blog_post content type exists
    const blogContentType = contentTypes.find((ct) => ct.uid === "blog_post");
    if (blogContentType) {
      console.log(`✅ Found blog_post content type: ${blogContentType.title}`);
    } else {
      console.log("❌ blog_post content type not found");
      console.log(
        "Available content types:",
        contentTypes.map((ct) => ct.uid).join(", ")
      );
    }

    // Step 2: Check blog posts in ContentStack
    console.log("\n2. Fetching Blog Posts from ContentStack...");
    try {
      const blogPosts = await contentstackService.fetchBlogPosts("en-us", 10);
      console.log(`✅ Found ${blogPosts.length} blog posts in ContentStack`);

      if (blogPosts.length > 0) {
        console.log("\nSample blog posts:");
        blogPosts.slice(0, 3).forEach((post, index) => {
          console.log(`  ${index + 1}. ${post.title} (${post.uid})`);
        });
      }
    } catch (error) {
      console.log(`❌ Failed to fetch blog posts: ${error.message}`);
    }

    // Step 3: Check if blog posts are in the database
    console.log("\n3. Checking Blog Posts in Database...");
    try {
      // Query Supabase for blog_post entries
      const { data: dbBlogPosts, error } = await supabaseService.supabase
        .from("content_entries")
        .select("*")
        .eq("content_type", "blog_post")
        .limit(10);

      if (error) {
        console.log(`❌ Database query failed: ${error.message}`);
      } else {
        console.log(`✅ Found ${dbBlogPosts.length} blog posts in database`);

        if (dbBlogPosts.length > 0) {
          console.log("\nSample database entries:");
          dbBlogPosts.slice(0, 3).forEach((post, index) => {
            console.log(`  ${index + 1}. ${post.title} (ID: ${post.id})`);
            console.log(`      Snippet: ${post.snippet?.substring(0, 100)}...`);
          });
        } else {
          console.log(
            "⚠️  No blog posts found in database - sync may be needed"
          );
        }
      }
    } catch (error) {
      console.log(`❌ Database check failed: ${error.message}`);
    }

    // Step 4: Test search functionality
    console.log("\n4. Testing Search Functionality...");
    try {
      // Test with a generic search term
      const searchQuery = "blog";
      console.log(`Searching for: "${searchQuery}"`);

      const queryEmbedding = await embeddingsService.generateEmbedding(
        searchQuery
      );
      console.log("✅ Generated search embedding");

      const searchResults = await supabaseService.searchContent(
        queryEmbedding,
        { contentTypes: ["blog_post"] },
        10,
        0.3
      );

      console.log(
        `✅ Search completed - Found ${searchResults.length} results`
      );

      if (searchResults.length > 0) {
        console.log("\nSearch results:");
        searchResults.forEach((result, index) => {
          console.log(
            `  ${index + 1}. ${
              result.title
            } (Similarity: ${result.similarity.toFixed(3)})`
          );
        });
      }
    } catch (error) {
      console.log(`❌ Search test failed: ${error.message}`);
    }

    // Step 5: Check sync job status
    console.log("\n5. Checking Sync Job Status...");
    try {
      const syncJob = require("./jobs/syncContent");
      const status = syncJob.getStatus();

      console.log("Sync Job Status:");
      console.log(`  - Last run: ${status.lastSyncTime || "Never"}`);
      console.log(`  - Status: ${status.lastRunStatus || "Unknown"}`);
      console.log(`  - Is running: ${status.isRunning}`);
      console.log(`  - Successful runs: ${status.stats.successfulRuns}`);
      console.log(`  - Failed runs: ${status.stats.failedRuns}`);

      if (status.stats.lastError) {
        console.log(`  - Last error: ${status.stats.lastError.message}`);
      }
    } catch (error) {
      console.log(`❌ Sync job status check failed: ${error.message}`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("DIAGNOSIS COMPLETE");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Diagnosis failed:", error);
  }
}

// Run diagnosis
diagnoseBlogSearch().catch(console.error);
