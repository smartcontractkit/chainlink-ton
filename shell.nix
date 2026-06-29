{
  stdenv,
  pkgs,
  lib,
}:
let
  go_1_26_2 = pkgs.go_1_26.overrideAttrs (_old: rec {
    version = "1.26.2";
    src = pkgs.fetchurl {
      url = "https://go.dev/dl/go${version}.src.tar.gz";
      hash = "sha256-LpHrtpR6lulDb7KzkmqIAu/mOm03Xf/sT4Kqnb1v1Ds=";
    };
  });

  golangci-lint-ton = pkgs.stdenv.mkDerivation {
    pname = "golangci-lint-ton";
    version = pkgs.golangci-lint.version;

    src = ./.;

    nativeBuildInputs = [
      go_1_26_2
      pkgs.golangci-lint
      pkgs.cacert
      pkgs.git
    ];

    buildPhase = ''
      runHook preBuild

      export HOME="$TMPDIR"
      export GOCACHE="$TMPDIR/go-cache"
      export GOPATH="$TMPDIR/go"
      export GOMODCACHE="$TMPDIR/go/pkg/mod"
      export GOTOOLCHAIN=local
      export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      export GIT_SSL_CAINFO="$SSL_CERT_FILE"
      export CURL_CA_BUNDLE="$SSL_CERT_FILE"

      printf '%s\n' \
        'version: v${pkgs.golangci-lint.version}' \
        'name: golangci-lint-ton' \
        'destination: ./bin' \
        'plugins:' \
        '  - module: github.com/smartcontractkit/chainlink-ton/tools/tonapiwaitlint' \
        '    path: ./tools/tonapiwaitlint' \
        > .custom-gcl.yml

      golangci-lint custom -v

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/bin"
      install -m755 "$(find bin -type f -perm -u+x | head -n 1)" "$out/bin/golangci-lint-ton"

      runHook postInstall
    '';
  };
in
pkgs.mkShell {
  buildInputs = with pkgs;
    [
      # nix tooling
      alejandra

      # Go 1.26 + tools
      go_1_26_2
      gopls
      delve
      golangci-lint
      golangci-lint-ton
      gotools
      go-mockery

      # TS/Node set of tools for changesets
      nodejs_24
      (yarn.override {nodejs = nodejs_24;})
      (pnpm.override {nodejs = nodejs_24;})
      typescript
      typescript-language-server
      # Required dependency for @ledgerhq/hw-transport-node-hid -> usb
      node-gyp

      # Extra tools
      git
      jq
      kubectl
      kubernetes-helm
      yq-go # for manipulating golangci-lint config
    ]
    ++ lib.optionals stdenv.hostPlatform.isDarwin [
      libiconv

      # Required to support go build inside a nix devshell (c compiler dependency on SecTrustCopyCertificateChain/macOS 12+)
      # https://github.com/NixOS/nixpkgs/issues/433688#issuecomment-3231551949
      pkgs.apple-sdk_15
    ];

  shellHook = ''
    unset GOROOT
    unset GOTOOLDIR
    export GOTOOLCHAIN=local

    # use upstream golangci-lint config from core Chainlink repository, overriding the local prefixes
    golint() {
      golangci-lint-ton run --config <(curl -sSL https://raw.githubusercontent.com/smartcontractkit/chainlink/5638f1698966509af1265aec46a438af04755ea0/.golangci.yml | yq e '.formatters.settings.goimports.local-prefixes = ["github.com/smartcontractkit/chainlink-ton"] | .linters.enable = ((.linters.enable // []) + ["tonapiwaitlint"]) | .linters.settings.custom.tonapiwaitlint = {"type": "module", "description": "require WaitForBlock before selected TON API calls", "settings": {"methods": ["GetAccount", "RunGetMethod"]}}' -) --path-mode "abs" "$@"
    }
  '';
}
