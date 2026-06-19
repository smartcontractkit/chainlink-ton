#!/usr/bin/env python3
import os
import pathlib
import re
import subprocess
import sys
import tomllib


def sort_errors_blocks(content: str) -> str:
    """Sort 'static Errors = { ... }' entries by (value, key) for cross-platform determinism.

    acton uses an unordered hash map internally, so entries with the same numeric value
    may appear in different orders depending on the platform (macOS vs Linux).
    This normalises the output so CI and local agree.
    """
    lines = content.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if "static Errors = {" in line:
            result.append(line)
            i += 1
            entries = []
            while i < len(lines) and "}" not in lines[i]:
                entry_line = lines[i]
                m = re.match(r"^( +)'([^']+)': (\d+),\s*$", entry_line)
                if m:
                    entries.append((int(m.group(3)), m.group(2), m.group(1)))
                i += 1
            entries.sort(key=lambda x: (x[0], x[1]))
            for value, key, indent in entries:
                result.append(f"{indent}'{key}': {value},")
            result.append(lines[i])  # closing brace line
        else:
            result.append(line)
        i += 1
    return "\n".join(result)


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
        # Normalise error-map entry order (acton's hash map is unordered, so
        # entries with the same numeric value come out in platform-specific order).
        original = output_path.read_text(encoding="utf-8")
        normalised = sort_errors_blocks(original)
        if normalised != original:
            output_path.write_text(normalised, encoding="utf-8")


if __name__ == "__main__":
    main()
