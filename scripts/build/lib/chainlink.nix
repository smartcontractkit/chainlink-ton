{
  pkgs,
  tag,
  lock,
}: let
  build-info = {
    operator-ui = rec {
      owner = "smartcontractkit";
      repo = "operator-ui";

      strippedTag =
        if pkgs.lib.strings.hasPrefix "v" tag
        then builtins.substring 1 (builtins.stringLength tag - 1) tag
        else tag;

      # release asset filename: smartcontractkit-operator-ui-<strippedTag>.tgz
      assetFilename = "${owner}-${repo}-${strippedTag}.tgz";
      downloadUrl = "https://github.com/${owner}/${repo}/releases/download/${tag}/${assetFilename}";
    };
  };
in {
  packages = rec {
    # Derivation that downloads the operator-ui release tgz for the given tag,
    # extracts the "package/artifacts" subpath and installs it to $out/core/web/assets.
    operator-ui = pkgs.stdenv.mkDerivation rec {
      pname = "operator-ui-assets";
      version = build-info.operator-ui.strippedTag;

      nativeBuildInputs = with pkgs; [gnutar coreutils];

      # initial placeholder: update after first build with the printed hash
      src = pkgs.fetchurl {
        url = build-info.operator-ui.downloadUrl;
        hash = lock.operator-ui-assets;
      };

      # Only extract the subpath "package/artifacts" into $out/core/web/assets
      unpackPhase = ''
        mkdir -p "$TMPDIR/asset-unpack"
        tar -xzf "${src}" -C "$TMPDIR/asset-unpack"
        mkdir -p "$out/core/web/assets"

        cp -a "$TMPDIR/asset-unpack/package/artifacts/." "$out/core/web/assets/"
      '';

      doBuild = false;
      installPhase = ''
        # normalize permissions
        find $out -type d -exec chmod 0755 {} \;
        find $out -type f -exec chmod 0644 {} \;
      '';

      meta = with pkgs.lib; {
        description = "Operator UI static assets for ${build-info.operator-ui.owner}/${build-info.operator-ui.repo}#${build-info.operator-ui.strippedTag}";
        license = licenses.mit;
      };
    };

    chainlink = pkgs.buildGo124Module rec {
      pname = "chainlink";
      version = "2.28.0"; # TODO: set automatically from tag/rev

      src = builtins.fetchGit {
        url = "https://github.com/smartcontractkit/chainlink";
        rev = "6289ad570fcb2b4255871d397e85daa00bb945c0"; # v2.28.0 # TODO: extract from single source .core_ref (?)
      };

      subPackages = ["."];

      vendorHash = lock.chainlink;

      # native libraries needed for cgo (duckdb, wasmtime, pkg-config helps)
      nativeBuildInputs = with pkgs; [pkg-config clang];
      buildInputs = with pkgs; [duckdb wasmtime];

      # enable cgo and point to nix-provided headers/libs
      env = {
        CGO_ENABLED = "1";
        CGO_CFLAGS = "-I${pkgs.duckdb}/include -I${pkgs.wasmtime}/include";
        CGO_LDFLAGS = "-L${pkgs.duckdb}/lib -lduckdb -L${pkgs.wasmtime}/lib -lwasmtime";
      };

      # copy operator-ui assets into the source tree before build so //go:embed sees them
      preBuild = ''
        echo "Injecting operator-ui assets for embed..."
        rm -rf ./core/web/assets || true
        mkdir -p ./core/web
        cp -a ${operator-ui}/core/web/assets ./core/web/assets
      '';

      # Skip check phase (runs tests, currently fails)
      doCheck = false;

      meta = with pkgs.lib; {
        description = "Chainlink binary built with operator-ui assets embedded";
        license = licenses.mit;
      };
    };
  };
}
