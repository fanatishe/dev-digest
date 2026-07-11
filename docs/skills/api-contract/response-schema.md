# response-schema

Enforce that response schemas only change in **backwards-compatible** ways. Check
TypeScript `interface`/`type` changes under `src/api/`, `src/routes/`, or any file
exporting a response schema.

## Directive
Allowed without a version bump:
- Adding new **optional** fields to a response.
- Making a required field optional (wider).

Flag as **WARNING** (not allowed without a version bump):
- Removing existing fields from a response.
- Making an optional field required (narrower).
- Changing a field's type.
- Changing a field from nullable to non-nullable.

## Good vs. bad

Bad — removing `email` narrows the schema; clients relying on it break:
```diff
- interface OrderResponse { id: string; total: number; email: string }
+ interface OrderResponse { id: string; total: number }
```

Good — a new optional field is backwards-compatible:
```diff
- interface OrderResponse { id: string; total: number }
+ interface OrderResponse { id: string; total: number; currency?: string }
```
