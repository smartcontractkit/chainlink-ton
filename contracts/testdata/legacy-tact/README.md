# Legacy Tact fixtures

These are the compiled code packages required by the async trace-tracking Go
wrappers. They are versioned test data so `yarn build` does not need to compile
the legacy Tact examples.

When one of the corresponding contracts changes, refresh these artifacts with:

```sh
yarn update:legacy-tact-fixtures
```

Each fixture retains only the Tact package's `code` field; the ABI and bundled
source metadata are not consumed by the Go wrappers.
