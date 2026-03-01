#!/usr/bin/env npx tsx
/**
 * Google Tasks OAuth Setup
 *
 * One-time script to authorize Google Tasks API access.
 * Reuses the same GCP OAuth client as Gmail/Calendar.
 *
 * Prerequisites:
 *   1. Enable "Google Tasks API" in Google Cloud Console
 *   2. Add http://localhost:8095/callback to OAuth client's authorized redirect URIs
 *   3. Have ~/.gmail-mcp/gcp-oauth.keys.json (already set up for Gmail)
 *
 * Usage:
 *   cd ~/Projects/ground-control
 *   npx tsx scripts/setup-google-tasks.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';

const HOME = process.env.HOME || '';
const OAUTH_KEYS_PATH = path.join(HOME, '.gmail-mcp', 'gcp-oauth.keys.json');
const TOKEN_PATH = path.join(process.cwd(), 'data', 'google-tasks-token.json');
const SCOPE = 'https://www.googleapis.com/auth/tasks';
const REDIRECT_PORT = 8095;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

function heading(text: string) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

function success(text: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

function error(text: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${text}`);
}

async function main() {
  console.log('\n\x1b[1mGoogle Tasks — OAuth Setup\x1b[0m');
  console.log('─'.repeat(40));

  // Check OAuth keys exist
  if (!fs.existsSync(OAUTH_KEYS_PATH)) {
    error(`OAuth keys not found at ${OAUTH_KEYS_PATH}`);
    console.log('  Run the Gmail MCP setup first to create OAuth credentials.');
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(OAUTH_KEYS_PATH, 'utf-8'));
  const { client_id, client_secret } = keys.installed;

  // Ensure data directory exists
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });

  // Check if token already exists
  if (fs.existsSync(TOKEN_PATH)) {
    heading('Existing token found');
    const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    if (existing.refresh_token) {
      console.log('  Token already exists with refresh token.');
      console.log('  Delete data/google-tasks-token.json to re-authorize.');
      process.exit(0);
    }
  }

  heading('Starting OAuth flow');
  console.log('  A browser window will open for Google authorization.');
  console.log('  Grant access to Google Tasks when prompted.\n');

  // Build auth URL
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(client_id)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  // Start local server to receive callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === '/callback') {
        const authCode = url.searchParams.get('code');
        const authError = url.searchParams.get('error');

        if (authError) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
          server.close();
          reject(new Error(`Auth error: ${authError}`));
          return;
        }

        if (authCode) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
          server.close();
          resolve(authCode);
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`  Listening on port ${REDIRECT_PORT}...`);
      // Open browser
      exec(`open "${authUrl}"`);
    });

    server.on('error', (e) => {
      reject(new Error(`Server error: ${e.message}`));
    });
  });

  // Exchange code for tokens
  heading('Exchanging code for tokens');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    error(`Token exchange failed: ${tokenData.error}`);
    process.exit(1);
  }

  // Save token
  const token = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Date.now() + (tokenData.expires_in * 1000),
    scope: tokenData.scope,
    token_type: tokenData.token_type,
  };

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  success(`Token saved to ${TOKEN_PATH}`);

  heading('Setup complete!');
  console.log('  Google Tasks sync is ready to use.');
  console.log('  Test it: curl -X POST http://localhost:3000/api/task-sync\n');
}

main().catch((e) => {
  error(String(e));
  process.exit(1);
});
