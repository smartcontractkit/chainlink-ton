# Notice: `pkgs.lib.fakeHash` can be used as a placeholder,
#   but `lock-nix-tidy` will only replace actual hashes.
{pkgs}: {
  contracts = "sha256-U/XTgHtTNzPi+JtXb8lhVvVN0uj0aE1UAAhBlClogzo=";
  contracts-jetton = "sha256-EZtvTf19MjSKTWNir6pcP9XHwUIpE4ILSlhS+cQD/7w=";

  # Published release tarballs (GH release `contracts/<version>`).
  contracts-1_6_0 = "sha256-ZQaOVtB63nwfsKSbu0gN+yyvASbSz74sA1NindIOO5M=";
  contracts-1_6_1 = "sha256-Qbtb4S+3hcgFJ6FsyMsFSJbQ35tJufzHDRJXhfs9Lkk=";
  contracts-1_6_2 = "sha256-1KvtGREpoOikVqWItrTGvLss4wAJQ6gzl8B9uuNTe70=";
  contracts-1_6_3 = "sha256-YAmcXDdgJE3IzqPoRaTHGDBq2enFGx5cqDjc4imbFQw=";
}
