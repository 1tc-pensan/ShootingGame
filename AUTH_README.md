# Regisztrációs és Adatbázis Rendszer

## Áttekintés

A játékhoz most már egy teljes regisztrációs rendszer lett hozzáadva SQLite adatbázissal, amely biztonságosan menti a felhasználók adatait és pontszámait.

## Új Funkciók

### 1. Felhasználói Regisztráció
- Felhasználók regisztrálhatnak felhasználónévvel és jelszóval
- Opcionálisan email cím is megadható
- Jelszavak SHA-256 hash-elve vannak tárolva (production környezetben bcrypt ajánlott)

### 2. Bejelentkezés
- Regisztrált felhasználók bejelentkezhetnek
- Session token alapú autentikáció
- Token localStorage-ban tárolva a böngészőben

### 3. Adatbázis Struktúra

#### Users tábla
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### Scores tábla
```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

## API Endpoints

### POST /.netlify/functions/auth
Autentikációs műveletek

**Regisztráció:**
```json
{
  "action": "register",
  "username": "player1",
  "password": "password123",
  "email": "player@example.com" // opcionális
}
```

**Bejelentkezés:**
```json
{
  "action": "login",
  "username": "player1",
  "password": "password123"
}
```

**Token ellenőrzés:**
```json
{
  "action": "verify",
  "token": "your-session-token"
}
```

### POST /.netlify/functions/leaderboard
Pontszám mentése (token szükséges)

```json
{
  "token": "your-session-token",
  "score": 15000,
  "wave": 10,
  "kills": 250
}
```

### GET /.netlify/functions/leaderboard
Leaderboard lekérése

Query paraméterek:
- `type`: "24h" vagy "alltime"

## Használat

### Frontend (Angular)

1. **AuthService** használata:
```typescript
import { AuthService } from './auth/auth.service';

constructor(private authService: AuthService) {}

// Regisztráció
this.authService.register(username, password, email).subscribe(...);

// Bejelentkezés
this.authService.login(username, password).subscribe(...);

// Kijelentkezés
this.authService.logout();

// Aktuális felhasználó lekérése
const user = this.authService.currentUser;
const isLoggedIn = this.authService.isLoggedIn;
```

2. **Pontszám mentése:**
```typescript
// Csak bejelentkezett felhasználók menthetnek pontszámot
if (this.authService.isLoggedIn) {
  const token = this.authService.getToken();
  // Score submission with token
}
```

## Telepítés

### Fejlesztési környezet

1. Telepítsd a függőségeket a netlify functions-höz:
```bash
cd netlify/functions
npm install
```

2. Lokális teszteléshez használd a Netlify Dev-et:
```bash
netlify dev
```

### Production Telepítés

1. Push-old a kódot a GitHub repo-ba
2. Netlify automatikusan build-eli és deploy-olja a funkciókat
3. Az SQLite adatbázis a `/tmp` könyvtárban jön létre minden cold start-nál

**Megjegyzés:** Netlify serverless funkciók esetén a `/tmp` tartalom elvész minden cold start után. Production környezetben ajánlott:
- PostgreSQL/MySQL használata (pl. Supabase, PlanetScale)
- MongoDB Atlas
- AWS RDS
- Persistent storage megoldás

## Biztonsági Megfontolások

### Jelenlegi implementáció:
- ✅ Jelszavak hash-elve (SHA-256)
- ✅ Session token rendszer
- ✅ CORS védelem
- ⚠️ In-memory session storage (serverless-nél limitált)

### Production ajánlások:
- 🔒 Bcrypt használata SHA-256 helyett
- 🔒 JWT tokenek refresh token-nel
- 🔒 Redis/Database alapú session storage
- 🔒 Rate limiting az API-kon
- 🔒 Input validáció és sanitizáció
- 🔒 HTTPS mindig
- 🔒 Environment változók a secret key-ekhez

## Frissítések az UI-ban

### Főmenü
- Új auth szekció bejelentkezéshez/regisztrációhoz
- Tab-os navigáció login/register között
- Felhasználó információ megjelenítése bejelentkezés után
- Kijelentkezés gomb

### Game Over képernyő
- Automatikus felhasználónév használata
- "Save Score" gomb bejelentkezett felhasználóknak
- Figyelmeztetés nem bejelentkezett játékosoknak

### Leaderboard
- Felhasználónevek az adatbázisból
- "(YOU)" badge saját rekordnál
- 24h és all-time szűrés továbbra is működik

## Hibaelhárítás

### "Database not initialized" hiba
- Ellenőrizd, hogy az `initDB()` fut-e minden endpoint-nál
- Netlify esetén cold start után az adatbázis újra létrejön

### Session token problémák
- Token localStorage-ban van, töröld a böngésző cache-t
- Jelentkezz be újra

### SQLite telepítési problémák
```bash
cd netlify/functions
rm -rf node_modules package-lock.json
npm install
```

## Következő lépések (Production-ra)

1. **Adatbázis migráció:** SQLite → PostgreSQL/MySQL
2. **Auth továbbfejlesztés:** JWT tokenek, refresh tokenek
3. **Email verifikáció:** Email megerősítés regisztrációnál
4. **Jelszó visszaállítás:** "Forgot password" funkció
5. **Profilok:** User profile page, statisztikák
6. **Social login:** Google/Facebook bejelentkezés opció
7. **Rate limiting:** API védelem abuse ellen
