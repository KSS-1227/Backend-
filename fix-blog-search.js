#!/usr/bin/env node

/**
 * Blog Search Fix Script
 * Diagnoses and fixes blog search issues
 */

require("dotenv").config();

const contentstackService = require("./services/contentstack");
const supabaseService = require("./services/supabase");
const embeddingsService = require("./services/embeddings");
const syncJob = require("./jobs/syncContent");
const logger = require("./utils/logger");

async function fixBlogSearch() {
  console.log("🔧 Blog Search Fix Script");
  console.log("=".repeat(50));

  let issuesFound = [];
  let fixesApplied = [];

  try {
    // Step 1: Check ContentStack connection and blog posts
    console.log("\n1. Checking ContentStack Blog Posts...");

    const contentTypes = await contentstackService.getContentTypes();
    const blogContentType = contentTypes.find((ct) => ct.uid === "blog_post");

    if (!blogContentType) {
      issuesFound.push("blog_post content type not found in ContentStack");
      console.log("❌ blog_post content type not found");
      console.log(
        "Available content types:",
        contentTypes.map((ct) => ct.uid).join(", ")
      );
    } else {
      console.log("✅ blog_post content type found");

      // Try to fetch blog posts
      try {
        const blogPosts = await contentstackService.getEntriesByContentType(
          "blog_post",
          "en-us",
          10,
          0
        );
        console.log(
          `✅ Found ${blogPosts.entries.length} blog posts in ContentStack`
        );

        if (blogPosts.entries.length === 0) {
          issuesFound.push("No blog posts found in ContentStack");
        } else {
          console.log("Sample blog posts:");
          blogPosts.entries.slice(0, 3).forEach((post, index) => {
            console.log(`  ${index + 1}. ${post.title || post.uid}`);
          });
        }
      } catch (error) {
        issuesFound.push(`Failed to fetch blog posts: ${error.message}`);
        console.log(`❌ Failed to fetch blog posts: ${error.message}`);
      }
    }

    // Step 2: Check database
    console.log("\n2. Checking Database for Blog Posts...");

    try {
      const { data: dbBlogPosts, error } = await supabaseService.supabase
        .from("content_entries")
        .select("*")
        .eq("content_type", "blog_post")
        .limit(10);

      if (error) {
        issuesFound.push(`Database query failed: ${error.message}`);
        console.log(`❌ Database query failed: ${error.message}`);
      } else {
        console.log(`✅ Found ${dbBlogPosts.length} blog posts in database`);

        if (dbBlogPosts.length === 0) {
          issuesFound.push("No blog posts in database - sync needed");
          console.log("⚠️  No blog posts in database - will trigger sync");
        } else {
          console.log("Sample database entries:");
          dbBlogPosts.slice(0, 3).forEach((post, index) => {
            console.log(`  ${index + 1}. ${post.title} (${post.id})`);
          });
        }
      }
    } catch (error) {
      issuesFound.push(`Database check failed: ${error.message}`);
      console.log(`❌ Database check failed: ${error.message}`);
    }

    // Step 3: Run sync if needed
    if (
      issuesFound.some((issue) => issue.includes("No blog posts in database"))
    ) {
      console.log("\n3. Running Content Sync...");

      try {
        console.log("Starting content sync...");
        const syncResult = await syncJob.syncAllContent();

        if (syncResult && syncResult.success) {
          fixesApplied.push("Content sync completed successfully");
          console.log("✅ Content sync completed successfully");
          console.log(
            `   Processed: ${syncResult.totalProcessed || 0} entries`
          );
          console.log(`   Successful: ${syncResult.successful || 0}`);
          console.log(`   Failed: ${syncResult.failed || 0}`);
        } else {
          issuesFound.push("Content sync failed");
          console.log("❌ Content sync failed");
        }
      } catch (error) {
        issuesFound.push(`Content sync error: ${error.message}`);
        console.log(`❌ Content sync error: ${error.message}`);
      }
    }

    // Step 4: Test search after sync
    console.log("\n4. Testing Search Functionality...");

    try {
      const searchQuery = "blog";
      const queryEmbedding = await embeddingsService.generateEmbedding(
        searchQuery
      );

      const searchResults = await supabaseService.searchContent(
        queryEmbedding,
        { contentTypes: ["blog_post"] },
        10,
        0.3
      );

      console.log(
        `✅ Search test completed - Found ${searchResults.length} results`
      );

      if (searchResults.length > 0) {
        fixesApplied.push("Search is working correctly");
        console.log("Search results:");
        searchResults.forEach((result, index) => {
          console.log(
            `  ${index + 1}. ${
              result.title
            } (Similarity: ${result.similarity.toFixed(3)})`
          );
        });
      } else {
        issuesFound.push("Search returns no results even after sync");
      }
    } catch (error) {
      issuesFound.push(`Search test failed: ${error.message}`);
      console.log(`❌ Search test failed: ${error.message}`);
    }

    // Step 5: Check specific blog post by name
    console.log("\n5. Testing Specific Blog Post Search...");

    try {
      // Get a specific blog post title from ContentStack
      const blogPosts = await contentstackService.getEntriesByContentType(
        "blog_post",
        "en-us",
        5,
        0
      );

      if (blogPosts.entries.length > 0) {
        const firstBlogPost = blogPosts.entries[0];
        const blogTitle = firstBlogPost.title || firstBlogPost.uid;

        console.log(`Testing search for specific blog: "${blogTitle}"`);

        const titleEmbedding = await embeddingsService.generateEmbedding(
          blogTitle
        );
        const titleSearchResults = await supabaseService.searchContent(
          titleEmbedding,
          {},
          10,
          0.5
        );

        console.log(
          `✅ Specific blog search completed - Found ${titleSearchResults.length} results`
        );

        if (titleSearchResults.length > 0) {
          const exactMatch = titleSearchResults.find(
            (result) =>
              result.title.toLowerCase().includes(blogTitle.toLowerCase()) ||
              blogTitle.toLowerCase().includes(result.title.toLowerCase())
          );

          if (exactMatch) {
            fixesApplied.push("Specific blog post search working");
            console.log(
              `✅ Found exact match: ${
                exactMatch.title
              } (Similarity: ${exactMatch.similarity.toFixed(3)})`
            );
          } else {
            console.log("⚠️  No exact match found, but other results returned");
          }
        }
      }
    } catch (error) {
      console.log(`❌ Specific blog search failed: ${error.message}`);
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("DIAGNOSIS AND FIX SUMMARY");
    console.log("=".repeat(50));

    if (issuesFound.length > 0) {
      console.log("\n❌ Issues Found:");
      issuesFound.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }

    if (fixesApplied.length > 0) {
      console.log("\n✅ Fixes Applied:");
      fixesApplied.forEach((fix, index) => {
        console.log(`  ${index + 1}. ${fix}`);
      });
    }

    if (issuesFound.length === 0) {
      console.log("\n🎉 No issues found - blog search should be working!");
    } else if (fixesApplied.length > 0) {
      console.log("\n🔧 Issues found and fixes applied - please test again");
    } else {
      console.log(
        "\n⚠️  Issues found but no fixes could be applied automatically"
      );
    }

    // Recommendations
    console.log("\n📋 Recommendations:");
    console.log(
      '1. Ensure blog posts exist in ContentStack with content_type "blog_post"'
    );
    console.log("2. Run content sync: npm run sync");
    console.log("3. Check that blog posts have meaningful titles and content");
    console.log(
      "4. Verify the frontend is pointing to the correct backend URL"
    );
    console.log("5. Test search with exact blog post titles from ContentStack");
  } catch (error) {
    console.error("Fix script failed:", error);
  }
}

fixBlogSearch().catch(console.error);
