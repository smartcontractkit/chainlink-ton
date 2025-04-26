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

      # Extra tools
      git
      jq
      kubectl
      kubernetes-helm
    ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      libiconv
    ];
}
