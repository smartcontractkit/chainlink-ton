# Acton TON smart contract development toolkit
{pkgs}:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: let
  platform =
    {
      aarch64-darwin = {
        target = "aarch64-apple-darwin";
        hash = "sha256-Dbge2exBLZNw2PCo8uS7+f+ZgP9PaQOfIJEKh8dt2QA=";
      };
      aarch64-linux = {
        target = "aarch64-unknown-linux-gnu";
        hash = "sha256-GvEPX0e89+IxfdcPaSa4ulL1uec0gbAwrEcpIKTFgbI=";
      };
      x86_64-linux = {
        target = "x86_64-unknown-linux-gnu";
        hash = "sha256-SQ1nY9z+FI6cg0bj1Ww5jpUFUtMpp2i36RaNTdVK/j8=";
      };
    }
    .${
      pkgs.stdenv.hostPlatform.system
    }
    or (throw "Unsupported Acton platform: ${pkgs.stdenv.hostPlatform.system}");
in {
  pname = "acton";
  version = "1.2.1";

  src = pkgs.fetchurl {
    url = "https://github.com/ton-blockchain/acton/releases/download/v${finalAttrs.version}/acton-${platform.target}.tar.gz";
    hash = platform.hash;
  };

  sourceRoot = ".";

  # Acton is distributed as a dynamically linked Linux binary. Patch its ELF
  # interpreter and provide the runtime libraries expected in the Nix store.
  nativeBuildInputs = pkgs.lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.autoPatchelfHook;
  buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
    pkgs.stdenv.cc.cc.lib
    pkgs.openssl
  ];

  installPhase = ''
    runHook preInstall
    install -Dm755 acton $out/bin/acton
    runHook postInstall
  '';

  meta = with pkgs.lib; {
    description = "All-in-one TON smart contract development toolkit";
    homepage = "https://ton-blockchain.github.io/acton";
    license = with licenses; [mit asl20];
    mainProgram = "acton";
    platforms = ["aarch64-darwin" "aarch64-linux" "x86_64-linux"];
  };
})
