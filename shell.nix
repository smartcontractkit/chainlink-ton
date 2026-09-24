{
  stdenv,
  pkgs,
  lib,
}: let
  tonapiwaitlint = pkgs.callPackage ./tools/tonapiwaitlint {inherit pkgs;};
in
  pkgs.mkShell {
    buildInputs = with pkgs;
      [
        # nix tooling
        alejandra

        # Go 1.27 + tools
        go_1_27
        gopls
        delve
        golangci-lint
        tonapiwaitlint.golangci-lint-ton
        gotools
        # go-mockery built with go1.27: nixpkgs builds it with go1.26, which
        # cannot parse packages requiring go 1.27 (e.g. cldf main since #1188)
        # — mockery regen in check-tidy fails with "package requires newer Go
        # version go1.27 (application built with go1.26)".
        (go-mockery.override {buildGoModule = buildGo127Module;})

        # TS/Node set of tools for changesets
        nodejs_24
        (yarn.override {nodejs = nodejs_24;})
        (pnpm.override {nodejs-slim = nodejs_24;})
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
        golangci-lint-ton run --config ${tonapiwaitlint.golangci-lint-config} --path-mode "abs" "$@"
      }
    '';
  }
