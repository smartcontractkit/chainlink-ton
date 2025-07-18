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
    # Ensure the build directory exists
    mkdir -p build/jetton

    # Copy the compiled jetton contracts to the expected location (force overwrite)
    cp -f ${jetton-contracts}/lib/node_modules/jetton/build/*.compiled.json build/jetton
  '';
}
