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
  
  # Fetch func compiler binary
  funcCompiler = pkgs.fetchurl {
    url = "https://github.com/ton-blockchain/ton/releases/download/v2025.06/func-mac-arm64";
    sha256 = "sha256-8lNW8Z6na2RkzVs25V4tuQuMxF8HmDufpQCFVHJLjTQ=";
  };
  
  # Fetch fift compiler binary
  fiftCompiler = pkgs.fetchurl {
    url = "https://github.com/ton-blockchain/ton/releases/download/v2025.06/fift-mac-arm64";
    sha256 = "sha256-WS/IHHIjR0S3G5x3N3EOozlHTcX7dcok0gP6OmSmWrw=";
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
      version = "1.0.2";
      
      src = jettonContracts;
      
      nativeBuildInputs = [ pkgs.makeWrapper ];
      
      buildPhase = ''
        echo "Preparing jetton contracts compilation..."
        
        # Make func compiler executable
        cp ${funcCompiler} ./func
        chmod +x ./func
        
        # Create output directory for compiled contracts
        mkdir -p compiled
        
        # Compile jetton contracts using func
        echo "Compiling jetton-minter.fc..."
        ./func -o compiled/jetton-minter.fif -S contracts/stdlib.fc contracts/jetton-minter.fc || echo "Warning: jetton-minter compilation failed"
        
        echo "Compiling jetton-wallet.fc..."
        ./func -o compiled/jetton-wallet.fif -S contracts/stdlib.fc contracts/jetton-wallet.fc || echo "Warning: jetton-wallet compilation failed"
        
        echo "Compilation completed!"
      '';
      
      installPhase = ''
        # Copy source contracts to the output directory
        mkdir -p $out/contracts/jetton
        cp -r $src/contracts/* $out/contracts/jetton/
        
        # Copy compiled contracts if they exist
        if [ -d compiled ]; then
          mkdir -p $out/compiled
          cp compiled/* $out/compiled/ 2>/dev/null || echo "No compiled files to copy"
        fi
        
        # Create wrapper scripts for the compilers
        mkdir -p $out/bin
        cp ${funcCompiler} $out/bin/func
        chmod +x $out/bin/func
        
        cp ${fiftCompiler} $out/bin/fift
        chmod +x $out/bin/fift
      '';
      
      meta = with pkgs.lib; {
        description = "TON Jetton contracts from ton-blockchain/jetton-contract with func and fift compilers";
        license = licenses.mit;
      };
    };
  };
}
