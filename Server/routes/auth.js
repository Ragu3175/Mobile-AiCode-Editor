const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

router.post('/github', async (req, res) => {
  const { code } = req.body;
  console.log('Auth route hit with code:', code);

  if (!code) {
    return res.status(400).json({ error: 'OAuth code is required' });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL || 'exp://192.168.1.7:8081',
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    const githubToken = tokenResponse.data.access_token;

    if (!githubToken) {
      console.error('GitHub token exchange failed. Response:', tokenResponse.data);
      return res.status(401).json({ error: 'Failed to obtain GitHub token', detail: tokenResponse.data });
    }

    // Fetch user profile
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${githubToken}` },
    });

    const { login, avatar_url } = userResponse.data;

    // Sign JWT
    const token = jwt.sign(
      { githubToken, username: login, avatar: avatar_url },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({ token, username: login, avatar: avatar_url });
  } catch (error) {
    console.error('Auth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
