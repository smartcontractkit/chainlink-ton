{
  stdenv,
  pkgs,
  lib,
}:
let
  go_1_26_2 = pkgs.go_1_26.overrideAttrs (_old: rec {
    version = "1.26.2";
    src = pkgs.fetchurl {
      url = "https://go.dev/dl/go${version}.src.tar.gz";
      hash = "sha256-LpHrtpR6lulDb7KzkmqIAu/mOm03Xf/sT4Kqnb1v1Ds=";
    };
  });

  # Build the stock nixpkgs golangci-lint with our TON analyzer compiled in.
  # We avoid `golangci-lint custom` here because it clones golangci-lint from GitHub
  # during the build, which is not reproducible and fails in restricted CI builders.
  golangci-lint-ton = pkgs.golangci-lint.overrideAttrs (old: {
    pname = "golangci-lint-ton";

    postPatch =
      (old.postPatch or "")
      + ''
        # Compile the plugin directly into cmd/golangci-lint so its init()
        # registers `tonapiwaitlint` with golangci-lint's plugin registry.
        cp ${./tools/tonapiwaitlint/tonapiwaitlint.go} cmd/golangci-lint/tonapiwaitlint_plugin.go
        substituteInPlace cmd/golangci-lint/tonapiwaitlint_plugin.go \
          --replace-fail "package tonapiwaitlint" "package main"
      '';

    postInstall =
      (old.postInstall or "")
      + ''
        # Keep the upstream binary available separately from our custom one.
        mv "$out/bin/golangci-lint" "$out/bin/golangci-lint-ton"
      '';
  });
in
pkgs.mkShell {
  buildInputs = with pkgs;
    [
      # nix tooling
      alejandra

      # Go 1.26 + tools
      go_1_26_2
      gopls
      delve
      golangci-lint
      golangci-lint-ton
      gotools
      go-mockery

      # TS/Node set of tools for changesets
      nodejs_24
      (yarn.override {nodejs = nodejs_24;})
      (pnpm.override {nodejs = nodejs_24;})
      typescript
      typescript-language-server
      # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
      node-gyp

      # Extra tools
      git
      jq
      kubectl
      kubernetes-helm
      yq-go # for manipulating golangci-lint config
    ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      libiconv

      # Required to support go build inside a nix devshell (c compiler dependency on SecTrustCopyCertificateChain/macOS 12+)
      # https://github.com/NixOS/nixpkgs/issues/433688#issuecomment-3231551949
      pkgs.apple-sdk_15
    ];

  shellHook = ''
    unset GOROOT
    unset GOTOOLDIR
    export GOTOOLCHAIN=local

    # use upstream golangci-lint config from core Chainlink repository, overriding the local prefixes
    golint() {
      golangci-lint-ton run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/5638f1698966509af1265aec46a438af04755ea0/.golangci.yml | yq e '.formatters.settings.goimports.local-prefixes = ["github.com/smartcontractkit/chainlink-ton"] | .linters.enable = ((.linters.enable // []) + ["tonapiwaitlint"]) | .linters.settings.custom.tonapiwaitlint = {"type": "module", "description": "require WaitForBlock before selected TON API calls", "settings": {"methods": ["GetAccount", "RunGetMethod"]}}' -) --path-mode "abs" "$@"
    }
  '';
}
