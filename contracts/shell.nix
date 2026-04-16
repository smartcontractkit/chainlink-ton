{
  stdenv,
  pkgs,
  lib,
  jetton-contracts,
  oplint,
}:
pkgs.mkShell {
  buildInputs = with pkgs; [
    # nix tooling
    alejandra

    # TS/Node set of tools for TON dev
    nodejs_24
    (yarn.override {nodejs = nodejs_24;})
    typescript
    typescript-language-server
    # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
    node-gyp

    # Extra tools
    git
    jq
    oplint
  ];

  PATH_CONTRACTS_JETTON = "${jetton-contracts}/lib/node_modules/jetton/build/";

  shellHook = ''
    echo "Jetton contracts located here: $PATH_CONTRACTS_JETTON"
  '';
}
