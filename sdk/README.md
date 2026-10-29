# LocalAssistant plugin SDKs

Write an integration in TypeScript, Go or Python. Each folder holds the SDK, its
tests and the same example, a Tasmota plug.

- [TypeScript](typescript/localassistant-plugin.ts): one file to copy, runs
  inside the server. Example in
  [typescript/example](typescript/example/src/index.ts).
- [Go](go/plugin.go): `go get github.com/orochibraru/localassistant/sdk/go`,
  runs as its own process. Example in [go/example](go/example/main.go).
- [Python](python/localassistant_plugin.py): one file to copy, standard library
  only, runs as its own process. Example in
  [python/example](python/example/plugin.py).

The guide, the manifest reference and the process protocol are in
[Writing an integration](../docs/plugins.md).
