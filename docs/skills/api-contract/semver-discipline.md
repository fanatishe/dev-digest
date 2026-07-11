# semver-discipline

Flag when a breaking API change is merged **without a corresponding major version
bump**. Look for changes to the `version` field in `package.json`, `openapi.yaml`, or
any API-version constant.

## Directive
- **MAJOR** bump required: any breaking change to a public endpoint, removal of an
  endpoint, or a change in the auth scheme.
- **MINOR** bump sufficient: new optional endpoints or fields.
- **PATCH** sufficient: bug fixes that don't change API shape.

A breaking change with no major bump is a **WARNING**.

## Good vs. bad

Bad — a field was removed (breaking) but the version only got a patch bump:
```diff
  // response: removed `legacyId`  ← breaking
- "version": "2.3.1"
+ "version": "2.3.2"
```

Good — the breaking change is paired with a major bump:
```diff
  // response: removed `legacyId`  ← breaking
- "version": "2.3.1"
+ "version": "3.0.0"
```
