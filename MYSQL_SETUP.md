# MySQL Setup Útmutató

## 🚀 Gyors Setup (2 lehetőség)

### Opció 1: PlanetScale (Ajánlott - INGYENES)

1. **Regisztráció:** [planetscale.com](https://planetscale.com)
2. **Új adatbázis létrehozása:**
   - Database name: `game_db`
   - Region: válassz közel hozzád (pl. EU-West)
3. **Connection string megszerzése:**
   - Kattints a "Connect" gombra
   - Másold ki a connection details-t

### Opció 2: Saját MySQL szerver

```sql
-- Hozz létre egy adatbázist
CREATE DATABASE game_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Hozz létre egy user-t
CREATE USER 'gameuser'@'%' IDENTIFIED BY 'your-secure-password';
GRANT ALL PRIVILEGES ON game_db.* TO 'gameuser'@'%';
FLUSH PRIVILEGES;
```

## 📝 Telepítés

### 1. Függőségek telepítése

```bash
cd netlify/functions
npm install
```

### 2. Environment változók beállítása

#### Lokális fejlesztéshez (.env fájl):

```bash
# A projekt root-jában hozd létre:
cp .env.example .env
```

Szerkeszd a `.env` fájlt:
```
DB_HOST=aws.connect.psdb.cloud
DB_USER=your-username
DB_PASSWORD=pscale_pw_xxxxxx
DB_NAME=game_db
```

#### Netlify Production-höz:

1. Menj a Netlify Dashboard-ra
2. Site Settings → Environment Variables
3. Add meg a változókat:
   - `DB_HOST`: your-mysql-host.com
   - `DB_USER`: your-username
   - `DB_PASSWORD`: your-password
   - `DB_NAME`: game_db

### 3. Tesztelés lokálisan

```bash
# Indítsd el a netlify dev-et
netlify dev
```

A táblák automatikusan létrejönnek első futáskor!

## 🗄️ Adatbázis Struktúra

### users tábla
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username)
);
```

### scores tábla
```sql
CREATE TABLE scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  score INT NOT NULL,
  wave INT NOT NULL,
  kills INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_score (score DESC),
  INDEX idx_user_score (user_id, score DESC)
);
```

### sessions tábla
```sql
CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_expires (expires_at)
);
```

## 🔒 Biztonsági Megjegyzések

### Jelenlegi implementáció:
- ✅ SHA-256 password hashing
- ✅ Database-based sessions (7 napos lejárat)
- ✅ Automatic session cleanup
- ✅ SQL injection védelem (prepared statements)
- ✅ CORS konfiguráció

### Production ajánlások:
- 🔒 **Bcrypt használata** SHA-256 helyett
- 🔒 **SSL/TLS kapcsolat** az adatbázishoz
- 🔒 **Rate limiting** API endpoint-okon
- 🔒 **Input validáció** mindenhol
- 🔒 **Security headers** beállítása

## 🧪 API Tesztelés

### Regisztráció tesztelése
```bash
curl -X POST http://localhost:8888/.netlify/functions/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "username": "testuser",
    "password": "test123",
    "email": "test@example.com"
  }'
```

### Bejelentkezés
```bash
curl -X POST http://localhost:8888/.netlify/functions/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "username": "testuser",
    "password": "test123"
  }'
```

### Token ellenőrzés
```bash
curl -X POST http://localhost:8888/.netlify/functions/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "verify",
    "token": "your-token-here"
  }'
```

### Score mentése
```bash
curl -X POST http://localhost:8888/.netlify/functions/leaderboard \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your-token-here",
    "score": 15000,
    "wave": 10,
    "kills": 250
  }'
```

### Leaderboard lekérése
```bash
# All time
curl http://localhost:8888/.netlify/functions/leaderboard?type=alltime

# 24 hours
curl http://localhost:8888/.netlify/functions/leaderboard?type=24h
```

## 🐛 Hibaelhárítás

### "connect ECONNREFUSED"
- Ellenőrizd, hogy a MySQL szerver fut
- Ellenőrizd a connection details-t (.env)
- Ellenőrizd, hogy a DB_HOST elérhető

### "Access denied for user"
- Rossz username vagy password
- Ellenőrizd a user jogosultságokat
- PlanetScale esetén generálj új password-öt

### "Database does not exist"
- Hozd létre a `game_db` adatbázist
- Vagy módosítsd a `DB_NAME` változót

### "ER_NOT_SUPPORTED_AUTH_MODE"
```sql
-- MySQL 8.0 esetén:
ALTER USER 'gameuser'@'%' IDENTIFIED WITH mysql_native_password BY 'your-password';
FLUSH PRIVILEGES;
```

### Sessions nem működnek
- Ellenőrizd, hogy a `sessions` tábla létrejött
- Nézd meg az expires_at értékeket
- Tisztítsd meg a lejárt sessionöket:
```sql
DELETE FROM sessions WHERE expires_at < NOW();
```

## 📊 Adatbázis Karbantartás

### Session cleanup (automatikus)
A `cleanExpiredSessions()` automatikusan töröli a lejárt sessionöket minden auth és score submit műveletnél.

Manuális cleanup:
```sql
DELETE FROM sessions WHERE expires_at < NOW();
```

### Top 10 játékos lekérése
```sql
SELECT u.username, MAX(s.score) as best_score, COUNT(s.id) as games_played
FROM users u
LEFT JOIN scores s ON u.id = s.user_id
GROUP BY u.id
ORDER BY best_score DESC
LIMIT 10;
```

### User statisztikák
```sql
SELECT 
  u.username,
  COUNT(s.id) as total_games,
  MAX(s.score) as best_score,
  AVG(s.score) as avg_score,
  MAX(s.wave) as best_wave
FROM users u
LEFT JOIN scores s ON u.id = s.user_id
WHERE u.username = 'yourusername'
GROUP BY u.id;
```

## 🚀 Production Deployment

### 1. Push to GitHub
```bash
git add .
git commit -m "Add MySQL authentication system"
git push origin main
```

### 2. Netlify Environment Variables
- Settings → Build & deploy → Environment
- Add meg a 4 DB változót

### 3. Deploy
Netlify automatikusan deploy-ol és futtatja a functions-öket!

## 🎮 Következő Lépések

- [ ] Bcrypt implementálás (jelszó biztonság)
- [ ] Email verifikáció
- [ ] Jelszó visszaállítás
- [ ] User profilok
- [ ] Achievement tracking DB-ben
- [ ] Weekly/monthly leaderboards
- [ ] Admin panel
