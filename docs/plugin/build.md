
### Build - Chainlink TON LOOP plugin

Build `chainlink-ton` Nix package:

```bash
nix build .# --print-out-paths              # default pkg
nix build .#chainlink-ton --print-out-paths # labeled pkg
```

Build `chainlink-ton` Nix package without checking out the source code locally:

```bash
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'# --print-out-paths              # default pkg
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'#chainlink-ton --print-out-paths # labeled pkg
```

Build `chainlink-ton` bin manually:

```bash
# Enter the default dev shell
nix develop
# Build the LOOP plugin
go build ./cmd/chainlink-ton
```
