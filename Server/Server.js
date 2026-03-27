const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Route imports
const authRoutes = require('./routes/auth');
const githubRoutes = require('./routes/github');
const aiRoutes = require('./routes/ai');
const voiceRoutes = require('./routes/voice');
const runnerRoutes = require('./routes/runner');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mount routes
app.use('/auth', authRoutes);
app.use('/github', githubRoutes);
app.use('/ai', aiRoutes);
app.use('/api', voiceRoutes);
app.use('/runner', runnerRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Mobile AI Editor API is running' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});