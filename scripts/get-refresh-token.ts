import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import http from 'node:http';
import { URL } from 'node:url';

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Set it in .env before running this script.`);
  }
  return value;
}

async function main() {
  const clientId = requireEnv('CLIENT_ID');
  const clientSecret = requireEnv('CLIENT_SECRET');

  const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube'],
  });

  console.log('\nAbra esta URL no navegador e autorize o acesso:\n');
  console.log(authUrl);
  console.log('\nAguardando autorização...\n');

  const code = await waitForAuthCode();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'Nenhum refresh_token retornado. Revogue o acesso do app em https://myaccount.google.com/permissions e rode este script novamente (garanta prompt=consent).'
    );
  }

  console.log('\nRefresh token obtido com sucesso. Guarde-o como o secret REFRESH_TOKEN:\n');
  console.log(tokens.refresh_token);
  console.log();
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.end('Autorização negada. Você pode fechar esta aba.');
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.end('Autorização concluída! Você pode fechar esta aba e voltar ao terminal.');
        server.close();
        resolve(code);
      }
    });

    server.listen(PORT);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
