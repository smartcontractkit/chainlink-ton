# Acton TON smart contract development toolkit
{pkgs}:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: let
  platform =
    {
      aarch64-darwin = {
        target = "aarch64-apple-darwin";
        hash = "sha256-RLD82Sjxlq6bp+sIjorFGxVek/4lBIhFO1lCfD1jwhY=";
      };
      x86_64-darwin = {
        target = "x86_64-apple-darwin";
        hash = "sha256-HxpJyiHYYMbqKWUZNuLd3lIBRO31Kyo8pyLeHWNH82Q=";
      };
      aarch64-linux = {
        target = "aarch64-unknown-linux-gnu";
        hash = "sha256-kJ7tT5Bv/FntBih+lBECwEyzkiodfoRBR4pUYws5tXM=";
      };
      x86_64-linux = {
        target = "x86_64-unknown-linux-gnu";
        hash = "sha256-wuZA6su1tuzhw0PKsqttLbdGQ9BwZ3eq0YHtfm4b/BY=";
      };
    }
    .${
      pkgs.stdenv.hostPlatform.system
    }
    or (throw "Unsupported Acton platform: ${pkgs.stdenv.hostPlatform.system}");
in {
  pname = "acton";
  version = "1.1.0";

  src = pkgs.fetchurl {
    url = "https://github.com/ton-blockchain/acton/releases/download/v${finalAttrs.version}/acton-${platform.target}.tar.gz";
    hash = platform.hash;
  };

  sourceRoot = ".";

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
    platforms = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
  };
})
