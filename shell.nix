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

      # Go 1.24 + tools
      go_1_24
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
      # macOS SDK 15 required for Go 1.25+ which needs SecTrustCopyCertificateChain
      # Default darwin SDK is 11.3, but Go 1.25 requires at least SDK 12
      # https://github.com/NixOS/nixpkgs/issues/433688#issuecomment-3231551949
      apple-sdk_15
    ];
  shellHook = ''
    # use upstream golangci-lint config from core Chainlink repository, overriding the local prefixes
    alias golint="golangci-lint run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/develop/.golangci.yml | yq e '.formatters.settings.goimports.local-prefixes = [\"github.com/smartcontractkit/chainlink-ton\"]' -) --path-mode \"abs\""
  '';
}
