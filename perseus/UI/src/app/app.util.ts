import { authStrategy, isAzureAuth, isDev, serverUrl } from '@app/app.constants'
import { OAuthModule } from 'angular-oauth2-oidc'
import { HTTP_INTERCEPTORS } from '@angular/common/http'
import { UsernameInterceptor } from '@interceptors/username.interceptor'
import { SmtpInterceptor } from '@interceptors/smtp-interceptor.service'
import { AuthStrategies } from '../environments/auth-strategies'
import { AzureInterceptor } from '@interceptors/azure-interceptor.service'

export function getAuthModules(): any[] {
  return isAzureAuth ? [
    OAuthModule.forRoot({
      resourceServer: {
        allowedUrls: getAddAllowedUrls(),
        sendAccessToken: true
      }
    })
  ] : []
}

export function getAuthInterceptors(): any[] {
  switch (authStrategy) {
    case AuthStrategies.AAD:
      return [
        {provide: HTTP_INTERCEPTORS, useClass: AzureInterceptor, multi: true}
      ]
    case AuthStrategies.SMTP:
      return [
        { provide: HTTP_INTERCEPTORS, useClass: SmtpInterceptor, multi: true }
      ]
    case AuthStrategies.FAKE:
      return [
        {provide: HTTP_INTERCEPTORS, useClass: UsernameInterceptor, multi: true}
      ]
    default:
      throw Error('Unsupported auth strategy')
  }
}

export function getAddAllowedUrls(): string[] {
  const result = [serverUrl]
  if (isDev) {
    result.push('http://localhost')
  }
  return result;
}
