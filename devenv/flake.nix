{
  description = "CCIP TON developer dependencies shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f {
        pkgs = import nixpkgs { inherit system; };
      });
    in
    {
      devShells = forEachSystem ({ pkgs }: {
        default = pkgs.mkShell {
        shellHook = ''
          echo "Installing CCIP TON CLI"
          pushd cmd/ton > /dev/null
          go install -ldflags="-X main.Version=1.0.0" .
          popd > /dev/null
          [ -f .envrc ] && source .envrc && echo "Loaded .envrc file"
          echo "⚙️ Run 'just clean-docker-dev' if you have old JobDistributor images to clean up"
          echo "⚙️ Run 'just build-docker-dev' to build dev images (once!)"
          echo "💻 Run 'ton sh' to enter the environment shell"
          '';
          packages = [
          pkgs.air
          pkgs.postgresql_16
          pkgs.llvmPackages.libcxxClang
          pkgs.clang
          pkgs.minio-client
          pkgs.kubernetes-helm
          pkgs.kubectl
          pkgs.actionlint
          pkgs.golangci-lint
          pkgs.shellcheck
          pkgs.jq
          pkgs.awscli2
          pkgs.kubefwd
          pkgs.nodejs
          pkgs.go
          pkgs.just
          pkgs.kind
          pkgs.k9s
          ];
        };
      });
    };
}