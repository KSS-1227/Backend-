const express = require("express");
const contentstackService = require("../services/contentstack.js");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const blogs = await contentstackService.fetchBlogPosts();
    res.json({ blogs });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch blog posts." });
  }
});

module.exports = router;
