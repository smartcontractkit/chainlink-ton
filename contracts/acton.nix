# Acton TON smart contract development toolkit
{pkgs}:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: let
  platform =
    {
      aarch64-darwin = {
        target = "aarch64-apple-darwin";
        hash = "sha256-z4e3l41eOGh6PBVwqipzeRizR3dyVgDjYds5IwyKMD8=";
      };
      aarch64-linux = {
        target = "aarch64-unknown-linux-gnu";
        hash = "sha256-rkTIG1SZb3TLyAy4jHZfDiI0G56DKUyC9gMwn60Zg94=";
      };
      x86_64-linux = {
        target = "x86_64-unknown-linux-gnu";
        hash = "sha256-wSxcpiLh5Bom1/fr6gJOS4pxbGXuks5/niIOevDgjNI=";
      };
    }
    .${
      pkgs.stdenv.hostPlatform.system
    }
    or (throw "Unsupported Acton platform: ${pkgs.stdenv.hostPlatform.system}");
in {
  pname = "acton";
  version = "1.2.0";

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
