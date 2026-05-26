{
  stdenv,
  pkgs,
  lib,
  contracts_1_6,
  contracts_1_6_1,
  contracts_1_6_2,
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
  PATH_CONTRACTS_1_6 = "${contracts_1_6}"; # Notice: loaded from GH release, artifacts in root of the package
  PATH_CONTRACTS_1_6_1 = "${contracts_1_6_1}"; # Notice: loaded from GH release, artifacts in root of the package
  PATH_CONTRACTS_1_6_2 = "${contracts_1_6_2}"; # Notice: loaded from GH release, artifacts in root of the package

  shellHook = ''
    echo "Loaded TVM contracts at following paths:"
    echo "  - CCIP 1.6.0: (env:PATH_CONTRACTS_1_6)    $PATH_CONTRACTS_1_6"
    echo "  - CCIP 1.6.1: (env:PATH_CONTRACTS_1_6_1)    $PATH_CONTRACTS_1_6_1"
    echo "  - CCIP 1.6.2: (env:PATH_CONTRACTS_1_6_2)    $PATH_CONTRACTS_1_6_2"
    echo "  - Jetton:     (env:PATH_CONTRACTS_JETTON) $PATH_CONTRACTS_JETTON"
  '';
}
