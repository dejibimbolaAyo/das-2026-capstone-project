// Build 7: the auth routes. They translate HTTP and nothing else - every rule
// lives in src/services/authService.js.
//
// The Build 7 prompt names src/routes/auth.js, but architecture.md keeps every
// HTTP concern under src/http, so the file lives next to routes.js instead.

export function registerAuthRoutes(router, { authService, guards } = {}) {
  router.post('/api/auth/signup', async ({ res, body }) => {
    const result = await authService.signup({
      email: body?.email,
      password: body?.password,
      role: body?.role,
    });
    res.statusCode = 201;
    return result;
  });

  router.post('/api/auth/login', ({ body }) => {
    return authService.login({
      email: body?.email,
      password: body?.password,
    });
  });

  router.get('/api/auth/me', ({ req }) => {
    const user = guards.requireUser(req);
    return authService.me(user.userId);
  });
}
