{
  stdenv,
  pkgs,
  lib,
}:
pkgs.mkShell {
  buildInputs = with pkgs; [
    # nix tooling
    alejandra

    # python
    python314

    # Extra tools
    git
    jq
  ];
}
