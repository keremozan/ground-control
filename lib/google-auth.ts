import fs from 'fs';
import { OAUTH_KEYS_PATH, CAL_TOKENS_PATH, GMAIL_CREDENTIAL_PATHS } from './config';

type Credentials = {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
};

type OAuthKeys = {
  installed: {
    client_id: string;
    client_secret: string;
    token_uri: string;
  };
};

let _oauthKeys: OAuthKeys | null = null;
function getOAuthKeys(): OAuthKeys {
  if (!_oauthKeys) {
    _oauthKeys = JSON.parse(fs.readFileSync(OAUTH_KEYS_PATH, 'utf-8'));
  }
  return _oauthKeys!;
}

async function refreshToken(creds: Credentials): Promise<Credentials> {
  const keys = getOAuthKeys();
  const res = await fetch(keys.installed.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: keys.installed.client_id,
      client_secret: keys.installed.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error}`);

  return {
    ...creds,
    access_token: data.access_token,
    expiry_date: Date.now() + (data.expires_in * 1000),
  };
}

// --- Gmail tokens ---

export async function getGmailToken(account: string): Promise<string> {
  const credPath = GMAIL_CREDENTIAL_PATHS[account];

  const creds: Credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

  if (Date.now() > creds.expiry_date - 60_000) {
    const updated = await refreshToken(creds);
    fs.writeFileSync(credPath, JSON.stringify(updated, null, 2));
    return updated.access_token;
  }

  return creds.access_token;
}

// --- Calendar tokens (different file structure: keyed by account) ---

export async function getCalendarToken(): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(CAL_TOKENS_PATH, 'utf-8'));
  // tokens.json has accounts as keys, use "school" (the one with calendar scope)
  const accountKey = Object.keys(raw)[0];
  const creds: Credentials = raw[accountKey];

  if (Date.now() > creds.expiry_date - 60_000) {
    const updated = await refreshToken(creds);
    raw[accountKey] = updated;
    fs.writeFileSync(CAL_TOKENS_PATH, JSON.stringify(raw, null, 2));
    return updated.access_token;
  }

  return creds.access_token;
}
