# breaking-change

Flag any diff that removes, renames, or changes the type of a **public** API element
without a version bump. These break existing callers at runtime.

## Directive
Flag as **CRITICAL** when a diff:
- Removes a public endpoint without a prior deprecation notice.
- Renames a field in a request or response body.
- Changes a field from optional to required.
- Changes a field's type (e.g. `string → number`, `array → object`).
- Removes a query or path parameter.

Cite the exact `file:line` and explain what downstream callers will break.

## Good vs. bad

Bad — a rename silently breaks every client reading `name`:
```diff
- type UserResponse = { id: string; name: string; email?: string }
+ type UserResponse = { id: string; fullName: string; email?: string }
```

Good — additive, older clients keep working:
```diff
- type UserResponse = { id: string; name: string; email?: string }
+ type UserResponse = { id: string; name: string; email?: string; fullName?: string }
```
