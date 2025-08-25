{
  stdenv,
  pkgs,
  lib,
  chainlink-ton,
  jetton-contracts,
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
      nodePackages.npm
      # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
      nodePackages.node-gyp

      # Extra tools
      git
      jq
      kubectl
      kubernetes-helm
      yq-go # for manipulating golangci-lint config
    ]
    ++ [
      # Chainlink TON packages
      chainlink-ton
      jetton-contracts
    ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      libiconv
    ];
  shellHook = ''
    # Export jetton contracts path
    export PATH_CONTRACTS_JETTON="${jetton-contracts}/lib/node_modules/jetton/build/"
    
    # use upstream golangci-lint config from core Chainlink repository, overriding the local prefixes
    alias golint="golangci-lint run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/develop/.golangci.yml | yq e '.formatters.settings.goimports.local-prefixes = [\"github.com/smartcontractkit/chainlink-ton\"]' -) --path-mode \"abs\""
    echo ""
    echo "Jetton contracts located here: $PATH_CONTRACTS_JETTON"
    echo "Chainlink TON binary available as: chainlink-ton"
    echo ""
    echo "You can lint your code with:"
    echo "    cd pkg && golint ./..."
    echo "    cd integration-tests && golint ./..."
    echo ""
  '';
}
