{
  pkgs,
  lock,
}:
# returns a function that accepts a plugin attribute set (build-info)
build-info:
pkgs.buildGo124Module rec {
  inherit (build-info.package-info) version;
  inherit (build-info) src;
  inherit (build-info) pname;
  inherit (build-info) subPackages;

  ldflags = [
    "-X main.Version=${build-info.package-info.version}"
    "-X main.GitCommit=${build-info.rev}"
  ];

  # pin the vendor hash (update using 'pkgs.lib.fakeHash' in the lock file)
  vendorHash = lock.${pname};

  # postInstall script to write version and rev to share folder
  postInstall = ''
    mkdir $out/share
    echo ${build-info.package-info.version} > $out/share/${pname}.version
    echo ${build-info.rev} > $out/share/${pname}.rev
  '';

  meta = with pkgs.lib; {
    inherit (build-info.package-info) description;
    license = licenses.mit;
    changelog = "${build-info.url}/releases/tag/v${build-info.package-info.version}";
  };
}
