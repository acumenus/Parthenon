import { Inject, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  CanLoad,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment
} from '@angular/router';
import { AuthService } from '@services/auth/auth.service';
import { authInjector } from '@services/auth/auth-injector';
import { loginRouter } from '@app/app.constants';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { parseHttpError } from '@utils/error'

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanLoad, CanActivate, CanActivateChild {
  private loader$ = new BehaviorSubject<boolean>(false);

  errorMessage$ = new BehaviorSubject<string | null>(null)

  get loading$(): Observable<boolean> {
    return this.loader$.asObservable()
  }

  constructor(private router: Router,
              @Inject(authInjector) private authService: AuthService) {}

  canLoad(route: Route, segments: UrlSegment[]): Observable<boolean> | boolean {
    return this.canLoadOrActivate()
  }

  canActivate(next: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.canLoadOrActivate()
  }

  canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.canLoadOrActivate()
  }

  private canLoadOrActivate(): Observable<boolean> {
    this.loader$.next(true)
    return this.authService.isUserLoggedIn$
        .pipe(
            catchError(error => {
              if (this.router.url.includes(loginRouter)) {
                this.errorMessage$.next(parseHttpError(error) ?? 'Auth failed')
              }
              return of(false)
            }),
            tap(result => {
              if (result) {
                this.errorMessage$.next(null)
              } else {
                this.router.navigateByUrl(loginRouter)
              }
            }),
            finalize(() => this.loader$.next(false))
        )
  }
}

