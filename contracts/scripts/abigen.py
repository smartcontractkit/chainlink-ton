#!/usr/bin/env python3
import os
import pathlib
import re
import subprocess
import sys
import tomllib


# ---------------------------------------------------------------------------
#   SnakedCell<T> ergonomic transform
#
#   Acton generates `type SnakedCell<T> = c.Cell`, forcing every caller to
#   manually snake-encode arrays before calling `.create()`.  This transform
#   rewrites the generated output so that `SnakedCell<T>` is `T[]` and the
#   generated `store()` / `fromSlice()` methods handle the snake encoding
#   automatically — the same way `lisp_list<T>` already works.
# ---------------------------------------------------------------------------

# Primitive Tolk integer types that appear as SnakedCell<T> type parameters.
# These don't have generated `.store` / `.fromSlice` methods, so we inline
# the store/load expressions.
_PRIMITIVE_SNAKE_ITEMS = {
    "uint8": ("(v, b) => b.storeUint(v, 8)", "(s) => s.loadUintBig(8)"),
    "uint64": ("(v, b) => b.storeUint(v, 64)", "(s) => s.loadUintBig(64)"),
    "uint128": ("(v, b) => b.storeUint(v, 128)", "(s) => s.loadUintBig(128)"),
    "uint160": ("(v, b) => b.storeUint(v, 160)", "(s) => s.loadUintBig(160)"),
    "uint192": ("(v, b) => b.storeUint(v, 192)", "(s) => s.loadUintBig(192)"),
    "uint256": ("(v, b) => b.storeUint(v, 256)", "(s) => s.loadUintBig(256)"),
    "c.Address": ("(v, b) => b.storeAddress(v)", "(s) => s.loadAddress()"),
}

_SNAKED_HELPERS = r'''

function storeSnakedCellOf<T>(v: SnakedCell<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v.length === 0) {
        b.storeRef(c.Cell.EMPTY);
        return;
    }
    const cells: c.Builder[] = [];
    let builder = c.beginCell();
    for (const value of v) {
        let itemB = c.beginCell();
        storeFn_T(value, itemB);
        if (builder.availableBits < itemB.bits || builder.availableRefs <= 1) {
            cells.push(builder);
            builder = c.beginCell();
        }
        builder.storeBuilder(itemB);
    }
    cells.push(builder);
    let current = cells[cells.length - 1].endCell();
    for (let i = cells.length - 2; i >= 0; i--) {
        cells[i].storeRef(current);
        current = cells[i].endCell();
    }
    b.storeRef(current);
}

function loadSnakedCellOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): SnakedCell<T> {
    let outArr = [] as T[];
    let head = s.loadRef().beginParse();
    while (head.remainingBits > 0 || head.remainingRefs > 0) {
        if (head.remainingBits > 0) {
            outArr.push(loadFn_T(head));
        }
        if (head.remainingRefs > 0) {
            head = head.loadRef().beginParse();
        } else {
            break;
        }
    }
    return outArr;
}
'''


def _snake_store_expr(item_type: str) -> str:
    """Return the store callback expression for a SnakedCell item type."""
    if item_type in _PRIMITIVE_SNAKE_ITEMS:
        return _PRIMITIVE_SNAKE_ITEMS[item_type][0]
    return f"{item_type}.store"


def _snake_load_expr(item_type: str) -> str:
    """Return the load callback expression for a SnakedCell item type."""
    if item_type in _PRIMITIVE_SNAKE_ITEMS:
        return _PRIMITIVE_SNAKE_ITEMS[item_type][1]
    return f"{item_type}.fromSlice"


def transform_snaked_cell(content: str) -> str:
    """Transform SnakedCell<T> from c.Cell to T[] with automatic snake encoding.

    The transform is struct-aware: it parses each ``export const StructName = { ... }``
    block, identifies which fields are ``SnakedCell<T>`` *within that struct*, and
    rewrites only those fields' ``store()`` / ``fromSlice()`` lines.  This avoids
    accidentally transforming plain ``cell`` fields that happen to share a name with
    a SnakedCell field in a different struct (e.g. ``tokenAmounts`` in
    ``Any2TVMMessage`` vs ``Any2TVMRampMessage``).
    """

    # Skip files that don't use SnakedCell at all.
    if "SnakedCell<" not in content:
        return content

    # 1. Change the type alias and inject helper functions.
    content = content.replace(
        "export type SnakedCell<T> = c.Cell",
        "export type SnakedCell<T> = T[]" + _SNAKED_HELPERS,
    )

    # 2. Process each `export const StructName = { ... }` block individually.
    #    This ensures we only transform fields that are SnakedCell<T> within the
    #    specific struct, not fields with the same name in other structs.
    def _process_struct_block(m: re.Match) -> str:
        block = m.group(0)

        # Find SnakedCell fields declared in this struct's create() args.
        # Pattern: `fieldName: SnakedCell<ItemType>`  (also handles `| null`)
        snaked_fields: dict[str, str] = {}
        for fm in re.finditer(r"(\w+):\s*SnakedCell<([^>]+)>", block):
            snaked_fields[fm.group(1)] = fm.group(2)

        if not snaked_fields:
            return block  # nothing to transform in this struct

        # Transform non-nullable store(): b.storeRef(self.field); → storeSnakedCellOf(...)
        for field, item_type in snaked_fields.items():
            store_expr = _snake_store_expr(item_type)
            block = block.replace(
                f"b.storeRef(self.{field});",
                f"storeSnakedCellOf(self.{field}, b, {store_expr});",
            )

        # Transform non-nullable fromSlice(): field: s.loadRef(), → field: loadSnakedCellOf(...)
        for field, item_type in snaked_fields.items():
            load_expr = _snake_load_expr(item_type)
            block = block.replace(
                f"{field}: s.loadRef(),",
                f"{field}: loadSnakedCellOf(s, {load_expr}),",
            )

        # Transform nullable store():
        #   storeTolkNullable<SnakedCell<ItemType>>(self.field, b, (v,b) => b.storeRef(v))
        #   → ...storeSnakedCellOf(v, b, <store_expr>))
        nullable_store = re.compile(
            r"storeTolkNullable<SnakedCell<(\w+)>>\(self\.(\w+),\s*b,\s*\(v,b\)\s*=>\s*b\.storeRef\(v\)\s*\)"
        )

        def _nullable_store_repl(nm: re.Match) -> str:
            item_type, field = nm.group(1), nm.group(2)
            store_expr = _snake_store_expr(item_type)
            return (
                f"storeTolkNullable<SnakedCell<{item_type}>>(self.{field}, b, "
                f"(v,b) => storeSnakedCellOf(v, b, {store_expr}))"
            )

        block = nullable_store.sub(_nullable_store_repl, block)

        # Transform nullable fromSlice():
        #   field: s.loadBoolean() ? s.loadRef() : null,
        #   → field: s.loadBoolean() ? loadSnakedCellOf(s, <load_expr>) : null,
        for field, item_type in snaked_fields.items():
            # Only transform if this field is actually nullable SnakedCell in this struct
            if f"{field}: SnakedCell<" not in block:
                continue
            # Check if it's nullable
            if f"{field}: SnakedCell<{item_type}> | null" not in block:
                continue
            load_expr = _snake_load_expr(item_type)
            block = block.replace(
                f"{field}: s.loadBoolean() ? s.loadRef() : null,",
                f"{field}: s.loadBoolean() ? loadSnakedCellOf(s, {load_expr}) : null,",
            )

        return block

    # Match `export const StructName = {` ... `}` blocks (non-greedy, balanced via the
    # closing `}` that precedes a blank line or the next export/comment).
    # The generated code always has `export const X = {` at the start of a line and
    # the block ends with `}` on its own line followed by a blank line.
    content = re.sub(
        r"export const (\w+) = \{.*?\n\}",
        _process_struct_block,
        content,
        flags=re.DOTALL,
    )

    return content


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
        # Then transform SnakedCell<T> from c.Cell to T[] with automatic snake encoding.
        original = output_path.read_text(encoding="utf-8")
        normalised = sort_errors_blocks(original)
        normalised = transform_snaked_cell(normalised)
        if normalised != original:
            output_path.write_text(normalised, encoding="utf-8")


if __name__ == "__main__":
    main()
