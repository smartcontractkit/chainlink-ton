#!/usr/bin/env python3
"""
Script to extract version from typeAndVersion function in Tolk files.

Usage:
    python extract_version.py <path_to_tolk_file>
"""

import sys
import re
import os


def extract_version_from_tolk_file(file_path):
    """
    Extract version from typeAndVersion function in a Tolk file.
    
    Args:
        file_path (str): Path to the .tolk file
        
    Returns:
        tuple: (type_string, version_string) or (None, None) if not found
    """
    
    if not os.path.exists(file_path):
        print(f"Error: File '{file_path}' does not exist.", file=sys.stderr)
        return None
    
    if not file_path.endswith('.tolk'):
        print(f"Warning: File '{file_path}' does not have .tolk extension.", file=sys.stderr)
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file '{file_path}': {e}", file=sys.stderr)
        return None
    
    pattern = r'const CONTRACT_VERSION = "([^"]+)";'
    
    # Try direct pattern first (most common and easier to extract)
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        version_string = match.group(1)
        return version_string
    
    print(f"Warning: No typeAndVersion function found in '{file_path}'", file=sys.stderr)
    return None


def main():
    if len(sys.argv) != 2:
        print("Usage: python extract_version.py <path_to_tolk_file>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    version_string = extract_version_from_tolk_file(file_path)

    if version_string:
        print(f"{version_string}")
    else:
        print("No version information found.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()