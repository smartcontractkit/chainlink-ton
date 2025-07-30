{
  stdenv,
  pkgs,
  lib,
  jetton-contracts,
}:
pkgs.mkShell {
  buildInputs = with pkgs; [
    # nix tooling
    alejandra

    # TS/Node set of tools for TON dev
    nodejs_24
    (yarn.override {nodejs = nodejs_24;})
    nodePackages.typescript
    nodePackages.typescript-language-server
    nodePackages.npm
    # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
    nodePackages.node-gyp

    # Extra tools
    git
    jq
  ];

  shellHook = ''
    export PATH_CONTRACTS_JETTON="${jetton-contracts}/lib/node_modules/jetton/build/"
    
    echo "Jetton contracts located here: $PATH_CONTRACTS_JETTON"
  '';
}
