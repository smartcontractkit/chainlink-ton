import os
import re
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

def generate_mermaid_diagram(import_map: Dict[str, List[str]]) -> str:
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
            node_id = dep.replace('/', '__').replace('.', '_').replace('@', 'ext_')
            display_name = dep.replace('@', '')
            mermaid_lines.append(f"        {node_id}[{display_name}]")
        mermaid_lines.append("    end")
    
    # Create connections
    for file, imports in import_map.items():
        source = file.replace('/', '__').replace('.', '_')
        for imp in imports:
            if imp.startswith('@'):
                target = imp.replace('/', '__').replace('.', '_').replace('@', 'ext_')
                mermaid_lines.append(f"    {source} --> {target}")
            else:
                resolved = resolve_import_path(imp, file, os.getcwd())
                if resolved in import_map:
                    target = resolved.replace('/', '__').replace('.', '_')
                    mermaid_lines.append(f"    {source} --> {target}")
                else:
                    print(f"Warning: Import '{imp}' not found in the import map for '{file}'")
    
    mermaid_lines.append("```")
    return '\n'.join(mermaid_lines)

def main():
    # Get the current working directory
    root_dir = os.getcwd()
    
    print(f"Analyzing Tact imports in: {root_dir}")
    print("-" * 50)
    
    import_map = analyze_imports(root_dir)
    
    # Generate and save Mermaid diagram
    mermaid_content = generate_mermaid_diagram(import_map)
    with open('dependencies.md', 'w', encoding='utf-8') as f:
        f.write("# Tact Dependencies Diagram\n\n")
        f.write(mermaid_content)
    
    print("\nDependencies diagram has been saved to 'dependencies.md'")
    
    # Print results
    # for file, imports in import_map.items():
    #     print(f"\nFile: {file}")
    #     if imports:
    #         print("Imports:")
    #         for imp in imports:
    #             print(f"  - {imp}")
    #     else:
    #         print("No imports found")


if __name__ == "__main__":
    main()