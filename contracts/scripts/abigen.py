#!/usr/bin/env python3
import os
import pathlib
import subprocess
import sys
import tomllib


def find_manifest(args):
    if args:
        return pathlib.Path(args[0]).resolve()

    cwd = pathlib.Path.cwd()
    candidates = [cwd / "Acton.toml", cwd / "contracts" / "Acton.toml"]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    raise SystemExit(
        "Acton.toml not found. Run from the contracts directory, repo root, or pass a manifest path."
    )


def main():
    manifest_path = find_manifest(sys.argv[1:])
    project_root = manifest_path.parent

    with manifest_path.open("rb") as manifest_file:
        manifest = tomllib.load(manifest_file)

    output_dir = manifest["wrappers"]["typescript"]["output-dir"]
    contracts = manifest.get("contracts", {})

    for name, contract in contracts.items():
        domain = contract["domain"]
        output_path = project_root / output_dir / domain / f"{name}.ts"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "acton",
                "wrapper",
                "--ts",
                name,
                "-o",
                os.fspath(output_path),
            ],
            check=True,
            cwd=project_root,
        )


if __name__ == "__main__":
    main()
