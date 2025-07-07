{
  pkgs,
  rev,
}: let
  package-info = builtins.fromJSON (builtins.readFile ./package.json);

  # source yarn.lock at the root of the repo
  yarnLock = ../yarn.lock;
  
  # Fetch jetton contracts from GitHub
  jettonContracts = pkgs.fetchFromGitHub {
    owner = "ton-blockchain";
    repo = "jetton-contract";
    rev = "3d24b419f2ce49c09abf6b8703998187fe358ec9";
    sha256 = "sha256-jel0z/DsndlpnWuUhm4vzoacM/zboLCIqcPmPqBsDgU=";
  };
in {
  # Output a set of specifc shells
  devShells = {
    contracts = pkgs.callPackage ./shell.nix {inherit pkgs;};
  };

  # Output a set of specifc packages
  packages = {
    # Chainlink contract pkgs
    contracts = pkgs.stdenv.mkDerivation (finalAttrs: {
      inherit (package-info) version;
      pname = "chainlink-contracts-ton";
      src = ./.;

      yarnOfflineCache = pkgs.fetchYarnDeps {
        inherit yarnLock;
        # pin the vendor hash (update using 'pkgs.lib.fakeHash')
        hash = "sha256-qew0YS9vSV0ukoFP5E2zQsiuAyzB5N0FMi+8s0C8k/U=";
      };

      # postPatch script to copy root yarn.lock to the current build directory (and make it writeable)
      postPatch = ''
        cp ${yarnLock} ./yarn.lock
        chmod u+w ./yarn.lock
      '';

      nativeBuildInputs = with pkgs; [
        yarnConfigHook
        yarnBuildHook
        yarnInstallHook
        # Needed for executing package.json scripts
        nodejs_24
      ];

      meta = with pkgs.lib; {
        inherit (package-info) description;
        license = licenses.mit;
        # TODO: update to contracts project-specific tag
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
      };
    });
    
    # Jetton contracts package
    jetton-contracts = pkgs.stdenv.mkDerivation {
      name = "jetton-contracts";
      version = "1.0.0";
      
      src = jettonContracts;
      
      buildPhase = ''
        echo "Preparing jetton contracts..."
      '';
      
      installPhase = ''
        # Copy jetton contracts to the output directory
        mkdir -p $out/contracts/contracts/jetton
        cp -r $src/contracts/* $out/contracts/contracts/jetton/
        
        # Create a simple script to show where the contracts are
        mkdir -p $out/bin
        cat > $out/bin/show-jetton-contracts << 'EOF'
#!/bin/bash
echo "Jetton contracts are located at: $out/contracts/contracts/jetton"
ls -la $out/contracts/contracts/jetton
EOF
        chmod +x $out/bin/show-jetton-contracts
      '';
      
      meta = with pkgs.lib; {
        description = "TON Jetton contracts from ton-blockchain/jetton-contract";
        license = licenses.mit;
      };
    };
  };
}
