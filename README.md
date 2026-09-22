# pi-web

`pi-web` is the web/control-plane shell for the `pi` project.

## Development modes

The default mode is local development:

```bash
npm run dev:server
npm run dev:web
```

The current `control-plane` implementation still uses deterministic/mock authentication. It is intentionally disabled by default and must only be enabled in a trusted development or test environment with an explicit opt-in:

```bash
PI_WEB_MODE=control-plane \
PI_WEB_ALLOW_MOCK_CONTROL_PLANE=1 \
PI_WEB_MOCK_PRINCIPAL_JSON='{"subject":"dev","userId":"dev","tenantId":"tenant-dev","companyIds":["company-dev"],"roles":["developer"],"permissions":["industry.workspace"],"sessionId":"session-dev"}' \
npm run dev:server
```

Do not use `PI_WEB_ALLOW_MOCK_CONTROL_PLANE=1` as production authentication. Production control-plane deployment requires a real OIDC/SSO or trusted-upstream `PrincipalProvider` and a secure session design.
