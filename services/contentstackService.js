import Stack from "../lib/contentstack.js";

export async function fetchBlogPosts() {
  const Query = Stack.ContentType("blog_post").Query();
  try {
    const result = await Query.toJSON().find();
    // result[0] is the array of blog entries
    return result[0];
  } catch (error) {
    // Log error and rethrow for route handler
    console.error("Contentstack fetchBlogPosts error:", error);
    throw error;
  }
}
