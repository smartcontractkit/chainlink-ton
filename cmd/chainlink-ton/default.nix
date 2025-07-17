{
  pkgs,
  rev,
}: let
  package-info = builtins.fromJSON (builtins.readFile ../../pkg/package.json);
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
<<<<<<< HEAD
    vendorHash = "sha256-K/+RrKol5eHKrVNYk0agMlgCU/DCuQl5Zhde8avobTY=";
=======
    vendorHash = "sha256-qqZb7duCkioR482ugQO3mE2+TL4EhiTwZU9P4NFynhA=";
>>>>>>> 3af9447a126973c47ca5d22edd36f4951717047e

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
