import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';

export interface User {
  userId: number;
  username: string;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/.netlify/functions/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkStoredAuth();
  }

  private checkStoredAuth(): void {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      // Verify token is still valid
      this.verifyToken(user.token).subscribe({
        next: (valid) => {
          if (valid) {
            this.currentUserSubject.next(user);
          } else {
            localStorage.removeItem('currentUser');
          }
        },
        error: () => {
          localStorage.removeItem('currentUser');
        }
      });
    }
  }

  register(username: string, password: string, email?: string): Observable<any> {
    return this.http.post(this.apiUrl, {
      action: 'register',
      username,
      password,
      email
    }).pipe(
      tap((response: any) => {
        if (response.success) {
          const user: User = {
            userId: response.userId,
            username: response.username,
            token: response.token
          };
          localStorage.setItem('currentUser', JSON.stringify(user));
          this.currentUserSubject.next(user);
        }
      })
    );
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(this.apiUrl, {
      action: 'login',
      username,
      password
    }).pipe(
      tap((response: any) => {
        if (response.success) {
          const user: User = {
            userId: response.userId,
            username: response.username,
            token: response.token
          };
          localStorage.setItem('currentUser', JSON.stringify(user));
          this.currentUserSubject.next(user);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  verifyToken(token: string): Observable<boolean> {
    return this.http.post<{ valid: boolean }>(this.apiUrl, {
      action: 'verify',
      token
    }).pipe(
      map(response => response.valid)
    );
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  getToken(): string | null {
    return this.currentUser?.token || null;
  }
}
