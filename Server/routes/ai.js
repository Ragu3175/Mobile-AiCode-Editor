const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const router = express.Router();

// #region agent log
const DEBUG_INGEST = 'http://127.0.0.1:7863/ingest/f3cfaab2-f8d4-44f3-a91f-f7bf68f0cabe';
/** NDJSON next to Server (reliable path vs repo-root when cwd differs) */
const DEBUG_LOG_CANDIDATES = [
  path.join(__dirname, '..', 'debug-4cc488.log'),
  path.join(__dirname, '..', '..', 'debug-4cc488.log'),
  path.join(process.cwd(), 'debug-4cc488.log')
];
function agentLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: '4cc488',
    location,
    message,
    data: data || {},
    timestamp: Date.now(),
    hypothesisId: hypothesisId || 'S'
  };
  const line = `${JSON.stringify(payload)}\n`;
  let written = false;
  for (const p of DEBUG_LOG_CANDIDATES) {
    try {
      fs.appendFileSync(p, line);
      written = true;
      break;
    } catch (e) {
      console.warn('[agentLog] append failed:', p, e.message);
    }
  }
  if (!written) console.warn('[agentLog] no log file written for:', message);
  axios.post(DEBUG_INGEST, payload, {
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4cc488' },
    timeout: 2000
  }).catch(() => {});
}
// #endregion
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY 
});

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

/**
 * Robustly cleans and parses JSON from AI responses that might be wrapped in markdown.
 */
function cleanJsonResponse(text, fallback = null) {
  try {
    console.log('Raw AI response snippet:', text.substring(0, 500));
    
    // 1. First, try to extract from JSON markdown block specifically
    const jsonSpecificRegex = /```json\s*([\s\S]*?)\s*```/i;
    const jsonMatch = jsonSpecificRegex.exec(text);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        // Continue to other methods if parsing fails
      }
    }

    // 2. Try generic code blocks, test parsing each one
    const genericBlockRegex = /```[\s\S]*?\n([\s\S]*?)\s*```/g;
    let match;
    while ((match = genericBlockRegex.exec(text)) !== null) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {
        // Skip this block, it's probably actual code, not JSON
      }
    }

    // 3. Fallback to finding first '{' and last '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const jsonString = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonString.trim());
      } catch (e) {
        // Skip
      }
    }

    // 4. Try parsing the raw text entirely
    return JSON.parse(text.trim());
    
  } catch (error) {
    // LLM fix-up phase: if first parse fails, try escaping literal newlines inside strings
    try {
      console.log('Initial parse failed, attempting surgical fix-up v2...');
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        let jsonString = text.substring(firstBrace, lastBrace + 1);
        
        // 1. Surgical Fix: Escape literal newlines ONLY inside double-quoted strings
        // This regex correctly handles escaped quotes and now supports multi-line matches
        let fixed = jsonString.replace(/"([^"\\]*(?:\\[\s\S][^"\\]*)*)"/g, (match) => {
          return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        });

        // 2. Fix invalid backslashes (not followed by valid JSON escape chars)
        // Common in LLM output for Windows paths or shell commands
        fixed = fixed.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

        console.log('Surgical fix-up v2 applied, re-attempting parse...');
        return JSON.parse(fixed);
      }
    } catch (fixError) {
      console.error('Surgical fix-up v2 also failed:', fixError.message);
      // Log failure context for debugging: 50 chars around the failure point if possible
      const errorIndex = fixError.message.match(/at position (\d+)/);
      if (errorIndex && errorIndex[1]) {
        const idx = parseInt(errorIndex[1]);
        console.log('Error context:', text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + 50)));
      }
    }

    console.error('Failed to parse AI JSON response. Error:', error.message);
    if (fallback) {
      console.log('Returning fallback object due to parse failure');
      return fallback;
    }
    throw new Error('Invalid JSON format from AI: ' + error.message);
  }
}

const INTEL_MODELS = [
  { type: 'gemini', model: 'gemini-2.5-flash-lite' },
  { type: 'gemini', model: 'gemini-2.5-flash' },
  { type: 'gemini', model: 'gemini-2.0-flash' },
  { type: 'groq', model: 'llama-3.3-70b-versatile' },
  { type: 'groq', model: 'llama3-8b-8192' }
];

const EDIT_MODELS = [
  { type: 'gemini', model: 'gemini-2.5-flash-lite' },
  { type: 'gemini', model: 'gemini-2.5-flash' },
  { type: 'gemini', model: 'gemini-2.0-flash' },
  { type: 'groq', model: 'llama-3.3-70b-versatile' },
  { type: 'groq', model: 'llama3-8b-8192' }
];

async function callAI(modelChain, prompt, maxTokens=4000) {
  let lastError = null;
  
  for (const modelConfig of modelChain) {
    try {
      console.log(`Trying model: ${modelConfig.model}`);
      
      if (modelConfig.type === 'gemini') {
        const model = genAI.getGenerativeModel({ 
          model: modelConfig.model 
        });
        const result = await Promise.race([
          model.generateContent(prompt),
          new Promise((_, reject) =>
            setTimeout(() => 
              reject(new Error('timeout')), 15000)
          )
        ]);
        console.log(`Success with: ${modelConfig.model}`);
        return result.response.text();
        
      } else if (modelConfig.type === 'groq') {
        const response = await groq.chat.completions.create({
          model: modelConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: maxTokens
        });
        console.log(`Success with: ${modelConfig.model}`);
        return response.choices[0].message.content;
      }
      
    } catch (error) {
      console.log(
        `Model ${modelConfig.model} failed:`, 
        error.status, 
        error.message ? error.message.substring(0, 100) : error
      );
      lastError = error;
      
      // Try next model on these errors:
      if (error.status === 429 || 
          error.status === 404 ||
          error.status === 400 ||
          (error.message && (
            error.message.includes('decommissioned') ||
            error.message.includes('deprecated') ||
            error.message.includes('not found') ||
            error.message.includes('quota')
          ))) {
        console.log('Trying next model in chain...');
        continue;
      }
      
      // For other errors throw immediately
      throw error;
    }
  }
  
  // All models failed
  throw lastError || new Error('All models failed');
}

// POST /ai/analyze-project
router.post('/analyze-project', async (req, res) => {
  const { fileTree, repoName } = req.body;
  const prompt = `You are analyzing a software project called ${repoName}.
   Here is the complete file tree: ${JSON.stringify(fileTree)}
   Respond in JSON only:
   {
     "projectType": "string",
     "mainPurpose": "string",
     "modules": [{ "name": "string", "description": "string", "files": ["string"] }],
     "techStack": ["string"]
   }`;

  try {
    const text = await callAI(INTEL_MODELS, prompt);
    res.json(cleanJsonResponse(text));
  } catch (error) {
    console.error('Analyze Project Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /ai/analyze-file
router.post('/analyze-file', async (req, res) => {
  console.log('1. analyze-file called');
  agentLog('ai.js:analyze-file', '1. analyze-file called', {
    filePath: req.body?.filePath,
    contentLen: req.body?.fileContent?.length,
    hasProjectContext: !!req.body?.projectContext
  }, 'H3');

  const { filePath, fileContent, projectContext, allFilePaths } = req.body;

  let truncatedContent;
  try {
    // Truncate file content to prevent prompt bloat
    truncatedContent = fileContent && typeof fileContent === 'string' && fileContent.length > 2000
      ? fileContent.substring(0, 2000) + '\n// ... file truncated for AI analysis'
      : fileContent;
  } catch (syncErr) {
    console.error('analyze-file sync error (fileContent):', syncErr.message);
    agentLog('ai.js:analyze-file', 'sync error fileContent', { message: syncErr.message }, 'H3');
    return res.status(400).json({ error: 'Invalid fileContent' });
  }

  if (truncatedContent == null || truncatedContent === '') {
    console.log('1b. empty or missing fileContent after parse');
    agentLog('ai.js:analyze-file', 'empty fileContent', {}, 'H3');
    return res.status(400).json({ error: 'fileContent required' });
  }

  const prompt = `You are analyzing a file in a software project.
   Project context: ${projectContext}
   File path: ${filePath}
   File content: 
   ${truncatedContent}

   All project files: ${Array.isArray(allFilePaths) ? allFilePaths.slice(0, 10).join(', ') : allFilePaths}
   Respond in JSON only, no markdown:
   {
     "role": "string (what this file does in the project)",
     "contents": [
       { 
         "name": "string", 
         "type": "string (function/class/component/route)",
         "description": "string (one line)"
       }
     ],
     "connectedFiles": [
       { "path": "string", "reason": "string" }
     ],
     "summary": "string (one sentence)"
   }`;

  try {
    console.log('2. Sending to AI chain...');
    agentLog('ai.js:analyze-file', '2. Sending to AI chain', { promptLen: prompt.length }, 'H4');
    const text = await callAI(INTEL_MODELS, prompt);
    
    console.log('3. AI response received');
    console.log('4. Raw response:', text.substring(0, 200));
    
    agentLog('ai.js:analyze-file', '3. AI response received', {
      choiceLen: text?.length
    }, 'H4');
    
    const fallback = {
      role: "Unknown",
      contents: [],
      connectedFiles: [],
      summary: "Analysis timed out or failed to parse."
    };
    
    const parsed = cleanJsonResponse(text, fallback);
    console.log('5. Parsed successfully');
    
    agentLog('ai.js:analyze-file', '5. Sending response to mobile', {
      hasRole: !!parsed?.role
    }, 'H4');
    
    res.json(parsed);
  } catch(error) {
    console.error('Gemini error:', {
      message: error.message,
      status: error.status,
      details: error.errorDetails
    });
    res.status(500).json({ error: error.message });
  }
});

// GET /ai/test-ai
router.get('/test-ai', async (req, res) => {
  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Say hello' }],
      temperature: 0.3,
      max_tokens: 100
    });
    res.json({ success: true, response: response.choices[0].message.content });
  } catch(error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /ai/edit-code
router.post('/edit-code', async (req, res) => {
  console.log('edit-code called with body keys:', Object.keys(req.body));
  console.log('fileContent length:', req.body.fileContent?.length);
  console.log('instruction:', req.body.instruction);
  console.log('filePath:', req.body.filePath);

  const { fileContent, filePath, instruction, startLine, projectContext, connectedFiles } = req.body;
  
  // Validate required fields
  if (!fileContent) {
    return res.status(400).json({ error: 'fileContent is required' });
  }
  if (!instruction) {
    return res.status(400).json({ error: 'instruction is required' });
  }
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  agentLog('ai.js:edit-code', 'Request received', { filePath, instruction, contentLen: (fileContent || '').length }, 'H3');
  const lineCount = (fileContent || '').split('\n').length;
  const prompt = `You are an expert code editor.
   File: ${filePath}
   Project: ${projectContext}
   Instruction: ${instruction}
   Reference line: ${startLine} (use as context only, not restriction - user may want broader changes)
   Total lines in file: ${lineCount}
   
   Current file content:
   ${fileContent}
   
   Connected files that may be affected:
   ${JSON.stringify(connectedFiles || [])}
   
   Perform the edit the user requested.
   Then analyze if any connected files need changes.
   
   Respond in JSON only:
   {
     "editedContent": "string (full edited file)",
     "changes": [
       { 
         "lineNumber": "number",
         "before": "string",
         "after": "string",
         "description": "string"
       }
     ],
     "impactedFiles": [
       {
         "path": "string",
         "reason": "string",
         "requiresChange": "boolean",
         "suggestedChange": "string"
       }
     ],
     "explanation": "string"
   }
   
   CRITICAL: Your entire response must be valid JSON.
   Start with { and end with }.
   No text before or after the JSON.
   No markdown code blocks.

   CRITICAL REQUIREMENT: 
   The editedContent field MUST contain the COMPLETE file content from line 1 to the last line.
   Do NOT return only the changed section.
   Do NOT summarize or truncate any part of the file.
   NEVER USE COMMENTS LIKE "/* rest of code */" OR "// existing code".
   YOU MUST WRITE OUT EVERY SINGLE RAW LINE of the original file that you did not change.
   IF YOU OMIT A SINGLE LINE, THE ENTIRE PROJECT WILL CORRUPT.
   The file had ${lineCount} lines - your editedContent must have the exact same number of lines, plus or minus your specific edits.`;

  const truncatedContent = fileContent.length > 8000
    ? fileContent.substring(0, 8000) + '\n// ... file truncated for AI processing'
    : fileContent;

  try {
    agentLog('ai.js:edit-code', 'Sending to AI chain', {}, 'H4');
    const text = await callAI(EDIT_MODELS, prompt.replace(fileContent, truncatedContent), 8000);
    const fallback = {
      editedContent: fileContent,
      changes: [],
      impactedFiles: [],
      explanation: "Could not parse AI response"
    };

    const parsed = cleanJsonResponse(text, fallback);

    // Validation: check if AI returned incomplete file
    const originalLines = fileContent.split('\n').length;
    const editedLines = parsed.editedContent.split('\n').length;

    if (editedLines < originalLines * 0.5 && originalLines > 10) {
      console.warn('AI returned partial content, original:', originalLines, 'edited:', editedLines);
      return res.status(400).json({ 
        error: 'AI returned incomplete file. Please try again with a simpler instruction.' 
      });
    }

    res.json(parsed);
  } catch (error) {
    console.error('Edit Code Error:', error);
    agentLog('ai.js:edit-code', 'Error', { message: error.message, status: error.status }, 'H4');
    res.status(error.status || 500).json({ 
      error: error.message,
      isRateLimit: error.status === 429 
    });
  }
});

// POST /ai/github-command
router.post('/github-command', async (req, res) => {
  const { command, repo, currentBranch } = req.body;
  const prompt = `You are a GitHub command parser for a mobile code editor.
   User said: ${command}
   Current repo: ${repo}
   Current branch: ${currentBranch}
   
   Parse this into a structured GitHub action.
   Respond in JSON only:
   {
     "action": "create_branch|switch_branch|delete_branch|merge_branch|commit_push|pull|sync|show_status|show_history|show_diff|create_pr|list_prs|create_tag|list_tags|list_branches|unknown",
     "params": { "branchName": "string", "commitMessage": "string", "base": "string", "head": "string", "tagName": "string" },
     "confirmation": "string",
     "requiresConfirmation": "boolean"
   }`;

  try {
    const text = await callAI(EDIT_MODELS, prompt, 1000);
    res.json(cleanJsonResponse(text));
  } catch (error) {
    console.error('GitHub Command Error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /ai/explain-output
router.post('/explain-output', async (req, res) => {
  const { output, stderr, language } = req.body;
  const prompt = `A developer ran their code and got this output:
   stdout: ${output}
   stderr: ${stderr}
   Language: ${language}
   
   Explain in simple terms:
   - If success: what the output means
   - If error: exactly what went wrong, which line, how to fix it
   
   Respond in JSON only:
   {
     "status": "success/error",
     "explanation": "string",
     "fixSuggestion": "string",
     "errorLine": "number"
   }`;

  try {
    const text = await callGroqWithRetry(prompt, 1000);
    res.json(cleanJsonResponse(text));
  } catch (error) {
    console.error('Explain Output Error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /ai/terminal
router.post('/terminal', async (req, res) => {
  const { prompt, fileContent, filePath, projectContext } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const systemPrompt = `You are an AI terminal assistant inside a mobile code editor. The user is a developer. You have access to their current open file content. Answer concisely in plain text — no markdown, no asterisks, no headers. Respond like a senior developer in a terminal. Keep responses short and direct.

Current File: ${filePath || 'unknown'}
Project Context: ${projectContext || 'unknown'}

File Content:
---
${fileContent || '// No file content available'}
---`;

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });
    
    res.json({ response: response.choices[0].message.content });
  } catch (error) {
    console.error('AI Terminal Error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
