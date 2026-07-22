import { google } from 'googleapis';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getYoutubeClient() {
  const clientId = requireEnv('CLIENT_ID');
  const clientSecret = requireEnv('CLIENT_SECRET');
  const refreshToken = requireEnv('REFRESH_TOKEN');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}
