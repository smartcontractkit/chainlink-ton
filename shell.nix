{
  stdenv,
  pkgs,
  lib,
}:
pkgs.mkShell {
  buildInputs = with pkgs;
    [
      # nix tooling
      alejandra

      # Go 1.25 + tools
      go_1_25
      gopls
      delve
      golangci-lint
      gotools
      go-mockery

      # TS/Node set of tools for changesets
      nodejs_24
      (yarn.override {nodejs = nodejs_24;})
      (pnpm.override {nodejs = nodejs_24;})
      nodePackages.typescript
      nodePackages.typescript-language-server
      # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
      nodePackages.node-gyp

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
    # use upstream golangci-lint config from core Chainlink repository, overriding the local prefixes
    alias golint="CGO_ENABLED=0 golangci-lint run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/develop/.golangci.yml | yq e '.formatters.settings.goimports.local-prefixes = [\"github.com/smartcontractkit/chainlink-ton\"]' -) --path-mode \"abs\""
  '';
}
