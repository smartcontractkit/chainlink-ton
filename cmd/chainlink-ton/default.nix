{
  pkgs,
  rev,
}: let
  package-info = builtins.fromJSON (builtins.readFile ../../package.json);
in
  pkgs.buildGo124Module rec {
    inherit (package-info) version;
    pname = "chainlink-ton";

    # source at the root of the module
    src = ./../..;
    subPackages = ["cmd/chainlink-ton"];

    ldflags = [
      "-X main.Version=${package-info.version}"
      "-X main.GitCommit=${rev}"
    ];

    # pin the vendor hash (update using 'pkgs.lib.fakeHash')
    vendorHash = "sha256-/Dy1+OA6fu2LiZRC62S+M85Sfh5juubSBHFBSqOIyT4=";

    # postInstall script to write version and rev to share folder
    postInstall = ''
      mkdir $out/share
      echo ${package-info.version} > $out/share/.version
      echo ${rev} > $out/share/.rev
    '';

    meta = with pkgs.lib; {
      inherit (package-info) description;
      license = licenses.mit;
      changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
    };
  }
