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

      # Extra tools
      git
      jq
      kubectl
      kubernetes-helm
    ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      libiconv
    ];
  shellHook = ''
    # use upstream golangci-lint config from core Chainlink repository
    alias golint="golangci-lint run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/develop/.golangci.yml) --path-mode \"abs\""
    echo ""
    echo "You can lint your code with:"
    echo "    cd pkg && golint ./..."
    echo "    cd integration-tests && golint ./..."
    echo ""
  '';
}
