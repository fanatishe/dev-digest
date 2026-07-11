# deprecation-policy

Never silently remove a public API element. **Deprecate first, then remove** in a
future major version. Correct cycle: `v1.x` adds an `@deprecated` marker + runtime
warning → `v2.0` removes it.

## Directive
Flag as **WARNING** when a diff:
- Removes an endpoint without a prior `@deprecated` marker in the codebase.
- Removes a field without documenting the removal in the CHANGELOG.
- Deletes a route handler without a redirect or a `410 Gone` response.

## Good vs. bad

Bad — the handler is deleted outright, with no deprecation trail:
```diff
- app.get('/v1/users/:id/legacy', getLegacyUser)
```

Good — mark deprecated first (removal happens a major version later):
```diff
- app.get('/v1/users/:id/legacy', getLegacyUser)
+ /** @deprecated since v1.9 — use GET /v1/users/:id. Removed in v2.0. */
+ app.get('/v1/users/:id/legacy', (req, res) => {
+   res.setHeader('Deprecation', 'true')
+   return getLegacyUser(req, res)
+ })
```
