# Gyors Telepítési Útmutató

## 1. Függőségek telepítése

### Netlify Functions
```bash
cd netlify/functions
npm install
cd ../..
```

## 2. Lokális fejlesztés

### Netlify Dev indítása
```bash
netlify dev
```

Ez elindítja:
- Angular dev server (általában http://localhost:4200)
- Netlify functions (/.netlify/functions/*)

## 3. Használat

### Első használat

1. **Regisztráció:**
   - Nyisd meg a játékot
   - Kattints a "REGISZTRÁCIÓ" tabra
   - Adj meg felhasználónevet és jelszót
   - (Opcionális) Email címet
   - Kattints "REGISZTRÁCIÓ" gombra

2. **Játék indítása:**
   - Bejelentkezés után kattints "START GAME"
   - Játssz!

3. **Pontszám mentése:**
   - Game Over után kattints "SAVE SCORE"
   - A pontszámod automatikusan mentve lesz a felhasználónevedhez

### Következő alkalommal

1. **Bejelentkezés:**
   - Nyisd meg a játékot
   - Az előző session lehet hogy még aktív (localStorage)
   - Ha nem, jelentkezz be újra

## 4. Tesztelés

### Auth tesztelése
```bash
# Regisztráció
curl -X POST http://localhost:8888/.netlify/functions/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"register","username":"testuser","password":"test123"}'

# Bejelentkezés
curl -X POST http://localhost:8888/.netlify/functions/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","username":"testuser","password":"test123"}'
```

### Leaderboard tesztelése
```bash
# GET leaderboard
curl http://localhost:8888/.netlify/functions/leaderboard?type=alltime

# POST score (használd a kapott tokent)
curl -X POST http://localhost:8888/.netlify/functions/leaderboard \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN_HERE","score":10000,"wave":5,"kills":100}'
```

## 5. Production Deploy

### GitHub Push
```bash
git add .
git commit -m "Add authentication and database system"
git push origin main
```

### Netlify automatikusan:
1. Build-eli az Angular projektet
2. Deploy-olja a functions-öket
3. Az SQLite adatbázis a `/tmp`-ben jön létre minden cold start-nál

## ⚠️ Fontos Megjegyzések

### Adatbázis perzisztencia
- Netlify serverless esetén `/tmp` törlődik minden cold start után
- **Production-ban használj állandó adatbázist:**
  - Supabase (PostgreSQL) - AJÁNLOTT
  - MongoDB Atlas
  - PlanetScale (MySQL)
  - AWS RDS

### Session Management
- Jelenlegi: in-memory sessions (elvesznek cold start-nál)
- **Production-ban:**
  - Redis (Upstash Redis ajánlott)
  - Database-based sessions
  - JWT tokens

### Következő lépések Production-ra:

1. **Supabase Setup** (ajánlott):
```bash
# Regisztrálj a supabase.com-on
# Készíts új projektet
# Használd a connection stringet a netlify functions-ben
```

2. **Environment változók** (Netlify Dashboard):
```
DATABASE_URL=your_supabase_connection_string
JWT_SECRET=your_random_secret_key_here
```

3. **Auth továbbfejlesztés:**
   - Bcrypt jelszó hash
   - JWT tokenek
   - Email verifikáció
   - Jelszó visszaállítás

## 6. Hibaelhárítás

### "Module not found: sqlite3"
```bash
cd netlify/functions
rm -rf node_modules package-lock.json
npm install
```

### Auth service error
- Ellenőrizd, hogy a netlify dev fut
- Nézd meg a browser console-t hibákért
- Ellenőrizd a Network tab-ot

### Leaderboard nem tölt be
- Ellenőrizd a /.netlify/functions/leaderboard endpoint-ot
- Nézd meg a Netlify function logs-ot
- Cold start esetén várj 1-2 másodpercet

## 7. Fejlesztői tippek

### Debug mode
A browser console-ban láthatod:
- Auth events (login, register)
- Score submissions
- Leaderboard updates
- API errors

### localStorage törlése
```javascript
// Browser console-ban:
localStorage.clear()
// Majd refresh a page
```

### Auth token manuális beszúrása
```javascript
// Browser console-ban:
const user = {
  userId: 1,
  username: "testuser",
  token: "your-token-here"
};
localStorage.setItem('currentUser', JSON.stringify(user));
```

## 8. Következő funkciók (opcionális)

- [ ] User profile page
- [ ] Statistics tracking
- [ ] Friend system
- [ ] Achievements synchronized to database
- [ ] Weekly/monthly leaderboards
- [ ] Tournament mode
- [ ] Cosmetic unlockables
- [ ] Social sharing
