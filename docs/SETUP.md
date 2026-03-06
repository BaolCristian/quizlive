# Quiz Live - Guida all'installazione

## Prerequisiti

- Docker e Docker Compose installati sul server
- Un progetto Google Cloud Console con OAuth 2.0 configurato
- Accesso alla rete scolastica

## 1. Configurazione Google OAuth

1. Vai su https://console.cloud.google.com
2. Crea un nuovo progetto (o usa quello esistente della scuola)
3. Vai su "API e servizi" > "Credenziali"
4. Crea "ID client OAuth 2.0":
   - Tipo: Applicazione web
   - Nome: Quiz Live
   - URI di reindirizzamento autorizzati: `https://quiz.tuascuola.it/api/auth/callback/google`
5. Copia Client ID e Client Secret

## 2. Configurazione ambiente

Crea un file `.env` nella directory del progetto:

```
DATABASE_URL=postgresql://kahoot:UNA_PASSWORD_SICURA@db:5432/kahoot
DB_PASSWORD=UNA_PASSWORD_SICURA
GOOGLE_CLIENT_ID=il-tuo-client-id
GOOGLE_CLIENT_SECRET=il-tuo-client-secret
NEXTAUTH_SECRET=genera-con-openssl-rand-base64-32
NEXTAUTH_URL=https://quiz.tuascuola.it
```

Per generare NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

## 3. Avvio

```bash
docker compose up -d
```

La prima volta, inizializza il database:
```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

## 4. Accesso

- **Docenti**: vai su `https://quiz.tuascuola.it/login` e accedi con Google
- **Studenti**: vai su `https://quiz.tuascuola.it` e inserisci il PIN del quiz

## 5. SSL (opzionale ma consigliato)

Per HTTPS, usa un reverse proxy come Caddy:

```bash
# Installa Caddy
sudo apt install caddy

# Configura /etc/caddy/Caddyfile
quiz.tuascuola.it {
    reverse_proxy localhost:3000
}

# Riavvia
sudo systemctl restart caddy
```

Caddy genera automaticamente i certificati SSL con Let's Encrypt.

## 6. Aggiornamenti

```bash
git pull
docker compose build
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

## 7. Backup database

```bash
docker compose exec db pg_dump -U kahoot kahoot > backup.sql
```

Per ripristinare:
```bash
cat backup.sql | docker compose exec -T db psql -U kahoot kahoot
```

## Risoluzione problemi

- **"Cannot connect to database"**: verifica che il container `db` sia avviato con `docker compose ps`
- **"Google login non funziona"**: controlla che l'URL di callback in Google Console corrisponda a NEXTAUTH_URL
- **"Studenti non riescono a connettersi"**: verifica che la porta 3000 sia accessibile dalla rete scolastica
