{
  stdenv,
  pkgs,
  lib,
}:
pkgs.mkShell {
  buildInputs = with pkgs; [
    # nix tooling
    alejandra

    # TS/Node set of tools for TON dev
    nodejs_23
    (yarn.override {nodejs = nodejs_23;})
    nodePackages.typescript
    nodePackages.typescript-language-server
    nodePackages.npm
    # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
    nodePackages.node-gyp

    # Extra tools
    git
    jq
  ];
}
