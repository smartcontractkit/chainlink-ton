{
  pkgs,
  rev,
}: let
  lock = pkgs.callPackage ./lock.nix {inherit pkgs;};
  package-info = builtins.fromJSON (builtins.readFile ../../pkg/package.json);

  # Fetch karalabe/hid for HIDAPI C sources and headers
  karalabe-hid = pkgs.fetchFromGitHub {
    owner = "karalabe";
    repo = "hid";
    rev = "821c38d2678e741180ec60b2512b408fa8bab99e";
    sha256 = "sha256-z3KSqKrIoy6WR2HUPjKJEm93NvuN0m9Edcq5BtGO5yA=";
  };
in
  pkgs.buildGo124Module rec {
    inherit (package-info) version;
    pname = "chainlink-ton-extras";

    # source at the root of the module
    src = ./../..;
    subPackages = ["cmd/explorer"];

    nativeBuildInputs = [pkgs.gcc pkgs.pkg-config];
    buildInputs = [pkgs.libusb1]; # for Linux builds
    # Export CGO_CFLAGS so the C compiler can find vendored hidapi sources
    preBuild = ''
      export CGO_ENABLED=1

      # Ensure the C compiler can find hidapi headers:
      # point directly at the hidapi/hidapi subdir which contains hidapi.h
      export CGO_CFLAGS="-I${karalabe-hid}/hidapi/hidapi -I${karalabe-hid} -I${pkgs.libusb1}/include"

      export CGO_LDFLAGS="-L${pkgs.libusb1}/lib -lusb-1.0"
    '';

    ldflags = [
      "-X main.Version=${package-info.version}"
      "-X main.GitCommit=${rev}"
    ];

    # pin the vendor hash (update using 'pkgs.lib.fakeHash')
    vendorHash = lock.chainlink-ton-extras;

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
