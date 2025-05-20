import os
import re
import subprocess
from typing import Dict, List, Set
from pathlib import Path

def find_tact_imports(file_path: str) -> Set[str]:
    """Extract import statements from a .tact file."""
    imports = set()
    import_pattern = re.compile(r'^import\s+"([^"]+)";')
    
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            for line in file:
                match = import_pattern.match(line.strip())
                if match:
                    imports.add(match.group(1))
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    
    return imports

def analyze_imports(root_dir: str) -> Dict[str, List[str]]:
    """Recursively analyze all .tact files and their imports."""
    import_map = {}
    
    for root, _, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.tact'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, root_dir)
                imports = find_tact_imports(file_path)
                import_map[relative_path] = list(imports)
    
    return import_map

def resolve_import_path(import_path: str, current_file: str, root_dir: str) -> str:
    """Resolve an import path to its full path relative to root_dir."""
    if import_path.startswith('@'):
        return import_path
    
    current_dir = os.path.dirname(current_file)
    
    if import_path.startswith('./'):
        resolved = os.path.normpath(os.path.join(current_dir, import_path[2:]))
    elif import_path.startswith('../'):
        resolved = os.path.normpath(os.path.join(current_dir, import_path))
    else:
        resolved = os.path.normpath(import_path)
    
    # Add .tact extension if not already present
    if not resolved.endswith('.tact'):
        resolved += '.tact'
    
    return resolved

def generate_mermaid_diagram(import_map: Dict[str, List[str]], root_dir: str) -> str:
    """Generate a Mermaid flowchart from the import map."""
    mermaid_lines = [
        "```mermaid",               
        "---",
        "config:",
        "  flowchart:",
        "    rankSpacing: 100",
        "---",
        "flowchart RL",
    ]
    
    
    # Group files by directory
    dir_files: Dict[str, List[str]] = {}
    for file in import_map.keys():
        directory = os.path.dirname(file)
        if directory not in dir_files:
            dir_files[directory] = []
        dir_files[directory].append(file)
    
    # Create subgraphs for each directory
    for directory, files in dir_files.items():
        # Create a clean subgraph name (no spaces or special chars)
        subgraph_name = directory.replace('/', '_').replace('.', '_')
        if not subgraph_name:
            subgraph_name = "root"
            
        mermaid_lines.append(f"    subgraph {subgraph_name}[{directory or 'root'}]")
        # Create nodes for all files in this directory
        for file in files:
            node_id = file.replace('/', '__').replace('.', '_')
            display_name = os.path.basename(file)
            display_name = display_name.replace('.tact', '')
            mermaid_lines.append(f"        {node_id}[{display_name}]")
        mermaid_lines.append("    end")
    
    # Create a subgraph for external dependencies
    external_deps = set()
    for imports in import_map.values():
        for imp in imports:
            if imp.startswith('@'):
                external_deps.add(imp)
    
    if external_deps:
        mermaid_lines.append("    subgraph external[External Dependencies]")
        for dep in external_deps:
            node_id = normalize_path(dep)
            display_name = dep.replace('@', '')
            mermaid_lines.append(f"        {node_id}[{display_name}]")
        mermaid_lines.append("    end")
    
    # Sort the import map for consistent ordering, collecting it into a list
    sorted_import_map = sorted(import_map.items(), key=lambda x: normalize_path(x[0]))

    # Create connections
    for file, imports in sorted_import_map:
        source = normalize_path(file)
        for imp in sorted(imports, key=lambda x: normalize_path(x)):
            if imp.startswith('@'):
                target = normalize_path(imp)
                mermaid_lines.append(f"    {source} --> {target}")
            else:
                resolved = resolve_import_path(imp, file, root_dir)
                if resolved in import_map:
                    target = normalize_path(resolved)
                    mermaid_lines.append(f"    {source} --> {target}")
                else:
                    print(f"Warning: Import '{imp}' not found in the import map for '{file}'")
    
    mermaid_lines.append("```")
    return '\n'.join(mermaid_lines)

def normalize_path(imp):
    return imp.replace('/', '__').replace('.', '_').replace('@', 'ext_')

def main():
    # Get the git repo root directory from `git rev-parse --show-toplevel`
    try:
        result = subprocess.run(['git', 'rev-parse', '--show-toplevel'], check=True, capture_output=True, text=True)
        root_dir = result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print("Error: Failed to retrieve the git repository root. Ensure you are in a valid git repository.")
        raise e
    
    print(f"Analyzing Tact imports in: {root_dir}")
    print("-" * 50)
    
    import_map = analyze_imports(os.path.join(root_dir, 'contracts', 'contracts'))
    output_file = os.path.join(root_dir,'contracts', 'generated', 'dependencies.md')

    # Generate and save Mermaid diagram
    mermaid_content = generate_mermaid_diagram(import_map, root_dir)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# Tact Dependencies Diagram\n\n")
        f.write(mermaid_content)
        f.write("\n")
    
    print("\nDependencies diagram has been saved to 'contracts/generated/dependencies.md'")


if __name__ == "__main__":
    main()