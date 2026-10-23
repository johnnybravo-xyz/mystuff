# Advanced SSO compatibility

My Stuff v1 includes a narrow forward-auth compatibility mode. It is useful when an existing trusted service owns the browser session. It is not a general OpenID Connect client: My Stuff forwards the browser cookie to one configured validation endpoint and accepts a non-empty `x-auth-request-user` response header only from that server-to-server call.

```env
ARCHIVE_AUTH_MODE=oidc
ARCHIVE_PUBLIC_URL=https://stuff.example.com
ARCHIVE_OIDC_AUTH_URL=http://auth-service:4180/oauth2/auth
ARCHIVE_OIDC_LOGIN_URL=https://login.example.com/oauth2/start
ARCHIVE_OIDC_LOGOUT_URL=https://login.example.com/oauth2/sign_out
```

The auth validation endpoint may be HTTP only on a private container network. Public, login, and logout URLs must be HTTPS. Browser-supplied identity headers are ignored. Provider failure, timeout, empty identity, and invalid configuration fail closed.

Keep the application reachable only through the intended proxy. Built-in password POSTs are rejected in OIDC mode. The separate inventory API token, if configured, does not open browser pages.
