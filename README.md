# listyoutube

Todo dia, às 06:00 (horário de Brasília), percorre todos os canais que você segue no YouTube e
adiciona os vídeos publicados nas últimas 24 horas a uma playlist existente. Roda como um
workflow agendado no GitHub Actions — não depende do seu computador estar ligado.

## Como funciona

1. Lista todas as suas inscrições (`subscriptions.list`).
2. Para cada canal, pega a playlist de "uploads" dele e verifica os vídeos publicados nas
   últimas 24h.
3. Compara com o que já está na playlist de destino, para não duplicar.
4. Adiciona os vídeos novos.

## Setup

### 1. Criar credenciais no Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto (ou use um existente).
2. Em **APIs e serviços → Biblioteca**, habilite a **YouTube Data API v3**.
3. Em **APIs e serviços → Tela de consentimento OAuth**, configure como "Externo" e adicione
   seu próprio e-mail do Google como usuário de teste (não precisa publicar o app).
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**, escolha o
   tipo **App para computador (Desktop app)**.
5. Copie o **Client ID** e o **Client Secret** gerados.

### 2. Achar o ID da playlist de destino

Abra a playlist no YouTube e copie o valor do parâmetro `list=` na URL, por exemplo:

```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ este é o ID
```

### 3. Gerar o refresh token (uma vez, localmente)

```bash
pnpm install
cp .env.example .env
# preencha CLIENT_ID e CLIENT_SECRET no .env
pnpm run get-refresh-token
```

O script vai imprimir uma URL — abra no navegador, faça login com a conta do YouTube que tem as
inscrições e a playlist, e autorize o acesso. O terminal vai imprimir o `REFRESH_TOKEN`. Copie
esse valor e preencha também no `.env` (e no passo 5, como secret do GitHub).

### 4. Criar o repositório privado no GitHub

```bash
gh repo create listyoutube --private --source=. --remote=origin
git push -u origin main
```

### 5. Configurar os secrets no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**, crie:

- `CLIENT_ID`
- `CLIENT_SECRET`
- `REFRESH_TOKEN`
- `TARGET_PLAYLIST_ID`

### 6. Testar

Vá em **Actions → Daily playlist update → Run workflow** para disparar manualmente e conferir
os logs antes de esperar pelo horário agendado (06:00 horário de Brasília, todo dia).

## Rodando localmente

```bash
pnpm install
pnpm run start
```

Lê as variáveis do arquivo `.env` (veja `.env.example`).
