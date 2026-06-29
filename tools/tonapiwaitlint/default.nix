{pkgs}: let
  # Build the stock nixpkgs golangci-lint with our TON analyzer compiled in.
  # We avoid `golangci-lint custom` here because it clones golangci-lint from GitHub
  # during the build, which is not reproducible and fails in restricted CI builders.
  golangci-lint-ton = pkgs.golangci-lint.overrideAttrs (old: {
    pname = "golangci-lint-ton";

    postPatch =
      (old.postPatch or "")
      + ''
        # Compile the plugin directly into cmd/golangci-lint so its init()
        # registers `tonapiwaitlint` with golangci-lint's plugin registry.
        cp ${./tonapiwaitlint.go} cmd/golangci-lint/tonapiwaitlint_plugin.go
        substituteInPlace cmd/golangci-lint/tonapiwaitlint_plugin.go \
          --replace-fail "package tonapiwaitlint" "package main"
      '';

    postInstall =
      (old.postInstall or "")
      + ''
        # Keep the upstream binary available separately from our custom one.
        mv "$out/bin/golangci-lint" "$out/bin/golangci-lint-ton"
      '';
  });

  upstream-golangci-config = pkgs.fetchurl {
    url = "https://raw.githubusercontent.com/smartcontractkit/chainlink/5638f1698966509af1265aec46a438af04755ea0/.golangci.yml";
    hash = "sha256-Y3vg7tW98OqyvRsYXKEFfr49+E6w3rO070+YRpqgV6w=";
  };

  golangci-lint-config =
    pkgs.runCommand "golangci-lint-ton.yml" {
      nativeBuildInputs = [pkgs.yq-go];
    } ''
      yq e '
        .formatters.settings.goimports.local-prefixes = ["github.com/smartcontractkit/chainlink-ton"] |
        .linters.enable = ((.linters.enable // []) + ["tonapiwaitlint"]) |
        .linters.settings.custom.tonapiwaitlint = {
          "type": "module",
          "description": "require WaitForBlock before selected TON API calls",
          "settings": {
            "methods": ["GetAccount", "RunGetMethod"]
          }
        }
      ' ${upstream-golangci-config} > "$out"
    '';
in {
  inherit golangci-lint-ton golangci-lint-config;
}
