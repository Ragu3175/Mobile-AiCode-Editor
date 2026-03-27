const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware to verify JWT and extract githubToken
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.githubToken = decoded.githubToken;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authenticate);

// GET /github/repos - Fetch all repos for authenticated user
router.get('/repos', async (req, res) => {
  try {
    const response = await axios.get('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&visibility=all', {
      headers: { 
        Authorization: `Bearer ${req.githubToken}`,
        Accept: 'application/vnd.github.v3+json'
      },
    });
    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
    }));
    res.json(repos);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// GET /github/tree?repo=owner/repo&branch=main - Fetch full file tree
router.get('/tree', async (req, res) => {
  const { repo, branch } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json(response.data.tree);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// GET /github/file?repo=owner/repo&path=src/App.js&branch=main - Fetch file content
router.get('/file', async (req, res) => {
  const { repo, path, branch } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    res.json({ content, sha: response.data.sha, path: response.data.path });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/commit - Commit and push file change
router.post('/commit', async (req, res) => {
  const { repo, branch, path, content, message, fileSha } = req.body;
  console.log(`Commit request for ${repo}/${path} on branch ${branch}`);
  try {
    const response = await axios.put(`https://api.github.com/repos/${repo}/contents/${path}`, {
      message,
      content: Buffer.from(content).toString('base64'),
      sha: fileSha,
      branch,
    }, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    console.log(`Commit successful for ${path}`);
    res.json({ success: true, commitUrl: response.data.commit.html_url, sha: response.data.content.sha });
  } catch (error) {
    console.error(`Commit error for ${path}:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.message, 
      details: error.response?.data
    });
  }
});

// GET /github/branch/list?repo=owner/repo
router.get('/branch/list', async (req, res) => {
  const { repo } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/branches`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json(response.data.map(b => b.name));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/branch/create - { repo, branchName, fromBranch }
router.post('/branch/create', async (req, res) => {
  const { repo, branchName, fromBranch } = req.body;
  try {
    // Get SHA of fromBranch
    const fromBranchResponse = await axios.get(`https://api.github.com/repos/${repo}/git/refs/heads/${fromBranch}`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    const sha = fromBranchResponse.data.object.sha;

    // Create new branch
    await axios.post(`https://api.github.com/repos/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    }, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });

    res.json({ success: true, branchName });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/branch/delete
router.post('/branch/delete', async (req, res) => {
  const { repo, branchName } = req.body;
  try {
    await axios.delete(`https://api.github.com/repos/${repo}/git/refs/heads/${branchName}`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/branch/merge
router.post('/branch/merge', async (req, res) => {
  const { repo, base, head, commitMessage } = req.body;
  try {
    const response = await axios.post(`https://api.github.com/repos/${repo}/merges`, {
      base,
      head,
      commit_message: commitMessage,
    }, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json({ success: true, merged: response.status === 201 });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// GET /github/commits?repo=owner/repo&branch=main
router.get('/commits', async (req, res) => {
  const { repo, branch } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/commits?sha=${branch}`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json(response.data.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
    })));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/pr/create
router.post('/pr/create', async (req, res) => {
  const { repo, title, body, head, base } = req.body;
  try {
    const response = await axios.post(`https://api.github.com/repos/${repo}/pulls`, {
      title, body, head, base
    }, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json({ success: true, prUrl: response.data.html_url, prNumber: response.data.number });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// GET /github/pr/list?repo=owner/repo
router.get('/pr/list', async (req, res) => {
  const { repo } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/pulls`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json(response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user.login,
      url: pr.html_url
    })));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// POST /github/tag/create
router.post('/tag/create', async (req, res) => {
  const { repo, tagName, message, branch } = req.body;
  try {
    const branchRes = await axios.get(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    const sha = branchRes.data.object.sha;

    await axios.post(`https://api.github.com/repos/${repo}/git/refs`, {
      ref: `refs/tags/${tagName}`,
      sha
    }, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json({ success: true, tagName });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// GET /github/tag/list?repo=owner/repo
router.get('/tag/list', async (req, res) => {
  const { repo } = req.query;
  try {
    const response = await axios.get(`https://api.github.com/repos/${repo}/tags`, {
      headers: { Authorization: `Bearer ${req.githubToken}` },
    });
    res.json(response.data.map(t => t.name));
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

module.exports = router;
