const express = require('express');
const axios = require('axios');

const router = express.Router();

router.post('/execute', async (req, res) => {
  const { language, version, code } = req.body;

  try {
    const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
      language,
      version: version || '*',
      files: [{ content: code }],
    });

    res.json({
      stdout: response.data.run.stdout,
      stderr: response.data.run.stderr,
      exitCode: response.data.run.code,
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

module.exports = router;
