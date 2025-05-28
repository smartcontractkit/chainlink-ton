{ pkgs, rev }:
let
  package-info = {
    version = "0.1.0";
    description = "Tact dependency analyzer tool";
    pname = "dependency-analyzer";
  };
in {
  # Output a set of specific shells
  devShells = {
    default = pkgs.callPackage ./shell.nix {inherit pkgs;};
  };

  # Output a set of specific packages
  packages = {
    # Dependency Analyzer pkgs
    default = pkgs.python3Packages.buildPythonApplication {
      inherit (package-info) version;
      inherit (package-info) pname;
      src = ./.;
      
      format = "setuptools";
      
      propagatedBuildInputs = with pkgs.python3Packages; [
        # Add any Python dependencies here if needed
      ];

      # Create a simple setup.py for the package
      preBuild = ''
        cat > setup.py << EOF
        from setuptools import setup

        setup(
          name="${package-info.pname}",
          version="${package-info.version}",
          py_modules=["dependency_analyzer"],
          entry_points={
            "console_scripts": [
              "dependency-analyzer=dependency_analyzer:main",
            ],
          },
        )
        EOF
      '';

      # Basic smoke test
      pythonImportsCheck = [ "dependency_analyzer" ];

      meta = with pkgs.lib; {
        inherit (package-info) description;
        license = licenses.mit;
        changelog = "https://github.com/smartcontractkit/chainlink-ton/releases/tag/v${version}";
      };
    };
  };
}