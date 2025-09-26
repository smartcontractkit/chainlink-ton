#!/usr/bin/env python3
"""
Script to check contract version changes by comparing compiled bytecode between PR and base branch.

This script:
1. Takes two directory paths (PR branch and base branch) already checked out by GitHub Actions
2. Builds contracts in both directories using `nix develop .#contracts -c yarn build`
3. Compares the compiled bytecode in X.compiled.json files between branches
4. For contracts with different bytecode, extracts CONTRACT_VERSION from source files
5. Fails if contracts have different bytecode but same CONTRACT_VERSION
6. Ensures contract version updates are enforced when contracts actually change

Usage:
    python check-contract-versions.py --pr-dir PR_DIR --base-dir BASE_DIR [--verbose]
"""

import sys
import os
import argparse
import subprocess
import json
import re
from pathlib import Path


def run_command(cmd, cwd=None, check=True):
    """Run a shell command and return the result."""
    try:
        result = subprocess.run(
            cmd, 
            shell=True,
            cwd=cwd,
            check=check,
            capture_output=True,
            text=True
        )
        return result
    except subprocess.CalledProcessError as e:
        print(f"Command failed in {cwd}: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        raise


def build_contracts(contracts_dir, verbose=False):
    """Build contracts using nix develop and yarn build."""
    if verbose:
        print(f"Building contracts in {contracts_dir}...")
    
    build_cmd = "nix develop .#contracts -c yarn build"
    result = run_command(build_cmd, cwd=contracts_dir)
    
    if verbose:
        print(f"Build completed in {contracts_dir}")
        if result.stdout:
            print(f"Build output: {result.stdout}")
    
    return result


def get_compiled_contracts(contracts_dir):
    """Get all compiled.json files from the build directory."""
    build_dir = os.path.join(contracts_dir, 'build')
    compiled_contracts = {}
    
    if not os.path.exists(build_dir):
        print(f"Warning: Build directory not found at {build_dir}")
        return compiled_contracts
    
    for file_name in os.listdir(build_dir):
        if file_name.endswith('.compiled.json'):
            contract_name = file_name.replace('.compiled.json', '')
            compiled_file_path = os.path.join(build_dir, file_name)
            
            try:
                with open(compiled_file_path, 'r', encoding='utf-8') as f:
                    compiled_data = json.load(f)
                    compiled_contracts[contract_name] = compiled_data
            except Exception as e:
                print(f"Error reading {compiled_file_path}: {e}")
    
    return compiled_contracts


def find_contracts_with_different_bytecode(pr_contracts, base_contracts, verbose=False):
    """Find contracts that have different compiled bytecode."""
    contracts_with_changes = []
    
    # Get all contract names from both branches
    all_contracts = set(pr_contracts.keys()) | set(base_contracts.keys())
    
    for contract_name in all_contracts:
        pr_compiled = pr_contracts.get(contract_name)
        base_compiled = base_contracts.get(contract_name)
        
        if verbose:
            print(f"Comparing contract: {contract_name}")
        
        # Check if bytecode differs
        bytecode_differs = False
        
        if pr_compiled and base_compiled:
            # Compare the compiled bytecode/hex data
            pr_hex = pr_compiled.get('hex', '')
            base_hex = base_compiled.get('hex', '')
            
            if pr_hex != base_hex:
                bytecode_differs = True
                if verbose:
                    print(f"  Bytecode differs (lengths: PR={len(pr_hex)}, base={len(base_hex)})")
            else:
                if verbose:
                    print(f"  Bytecode identical")
                    
        elif pr_compiled and not base_compiled:
            # New contract
            bytecode_differs = True
            if verbose:
                print(f"  New contract")
                
        elif not pr_compiled and base_compiled:
            # Deleted contract - we don't need to check versions for this
            if verbose:
                print(f"  Deleted contract")
        else:
            # Neither exists - shouldn't happen but handle gracefully
            if verbose:
                print(f"  Contract not found in either branch")
        
        if bytecode_differs:
            contracts_with_changes.append(contract_name)
    
    return contracts_with_changes


def extract_entrypoint_from_compile_ts(file_path):
    """Extract the entrypoint path from a .compile.ts file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Look for entrypoint: 'path/to/contract.tolk'
        pattern = r"entrypoint:\s*['\"]([^'\"]+)['\"]"
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        return None
        
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None


def find_contract_entrypoint(contract_name, contracts_dir):
    """Find the entrypoint for a specific contract by reading its .compile.ts file."""
    wrappers_dir = os.path.join(contracts_dir, 'wrappers')
    compile_file = os.path.join(wrappers_dir, f"{contract_name}.compile.ts")
    
    if os.path.exists(compile_file):
        return extract_entrypoint_from_compile_ts(compile_file)
    
    return None


def extract_version_from_content(content):
    """Extract CONTRACT_VERSION from file content."""
    pattern = r'const CONTRACT_VERSION = "([^"]+)";'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    
    if match:
        return match.group(1)
    
    return None


def get_file_content(file_path):
    """Get the content of a file if it exists."""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
    
    return None


def check_contract_versions(pr_dir, base_dir, contracts_with_changes, verbose=False):
    """
    Check contract versions for contracts with different bytecode.
    
    Returns:
        list: List of violations found
    """
    violations = []
    
    pr_contracts_dir = os.path.join(pr_dir, 'contracts')
    base_contracts_dir = os.path.join(base_dir, 'contracts')
    
    for contract_name in contracts_with_changes:
        if verbose:
            print(f"\nChecking versions for contract: {contract_name}")
        
        # Find entrypoints for this contract in both branches
        pr_entrypoint = find_contract_entrypoint(contract_name, pr_contracts_dir)
        base_entrypoint = find_contract_entrypoint(contract_name, base_contracts_dir)
        
        # Get current version from PR branch
        current_version = None
        if pr_entrypoint:
            pr_contract_path = os.path.join(pr_contracts_dir, pr_entrypoint)
            pr_content = get_file_content(pr_contract_path)
            if pr_content:
                current_version = extract_version_from_content(pr_content)
        
        # Get base version from base branch
        base_version = None
        if base_entrypoint:
            base_contract_path = os.path.join(base_contracts_dir, base_entrypoint)
            base_content = get_file_content(base_contract_path)
            if base_content:
                base_version = extract_version_from_content(base_content)
        
        if verbose:
            print(f"  PR entrypoint: {pr_entrypoint} -> version: {current_version}")
            print(f"  Base entrypoint: {base_entrypoint} -> version: {base_version}")
        
        # Check for violations - contracts with different bytecode should have different versions
        if current_version and base_version:
            if current_version == base_version:
                violations.append({
                    'contract': contract_name,
                    'pr_entrypoint': pr_entrypoint,
                    'base_entrypoint': base_entrypoint,
                    'current_version': current_version,
                    'base_version': base_version,
                    'violation': 'Contract bytecode changed but version unchanged'
                })
            else:
                print(f"✅ {contract_name}: Bytecode and version both updated ({base_version} -> {current_version})")
        elif current_version and not base_version:
            print(f"✅ {contract_name}: New contract with version {current_version}")
        elif not current_version and base_version:
            print(f"⚠️  {contract_name}: CONTRACT_VERSION removed but bytecode changed (was {base_version})")
        elif not current_version and not base_version:
            print(f"⚠️  {contract_name}: Bytecode changed but no CONTRACT_VERSION found in either version")
        else:
            # This shouldn't happen, but just in case
            print(f"⚠️  {contract_name}: Unexpected version state")
    
    return violations


def main():
    parser = argparse.ArgumentParser(
        description="Check contract version changes by comparing compiled bytecode"
    )
    parser.add_argument(
        '--pr-dir', 
        required=True,
        help='Directory containing PR branch code'
    )
    parser.add_argument(
        '--base-dir', 
        required=True,
        help='Directory containing base branch code'
    )
    parser.add_argument(
        '--verbose', 
        action='store_true',
        help='Enable verbose output'
    )
    
    args = parser.parse_args()
    
    # Validate directories exist
    if not os.path.isdir(args.pr_dir):
        print(f"Error: PR directory {args.pr_dir} does not exist")
        sys.exit(1)
    
    if not os.path.isdir(args.base_dir):
        print(f"Error: Base directory {args.base_dir} does not exist")
        sys.exit(1)
    
    pr_contracts_dir = os.path.join(args.pr_dir, 'contracts')
    base_contracts_dir = os.path.join(args.base_dir, 'contracts')
    
    # Build contracts in both directories
    print("Building contracts in PR branch...")
    try:
        build_contracts(pr_contracts_dir, args.verbose)
    except subprocess.CalledProcessError:
        print("❌ Failed to build contracts in PR branch")
        sys.exit(1)
    
    print("Building contracts in base branch...")
    try:
        build_contracts(base_contracts_dir, args.verbose)
    except subprocess.CalledProcessError:
        print("❌ Failed to build contracts in base branch")
        sys.exit(1)
    
    # Get compiled contracts from both branches
    print("Reading compiled contracts...")
    pr_compiled = get_compiled_contracts(pr_contracts_dir)
    base_compiled = get_compiled_contracts(base_contracts_dir)
    
    if args.verbose:
        print(f"PR branch compiled contracts: {list(pr_compiled.keys())}")
        print(f"Base branch compiled contracts: {list(base_compiled.keys())}")
    
    # Find contracts with different bytecode
    contracts_with_changes = find_contracts_with_different_bytecode(
        pr_compiled, base_compiled, args.verbose
    )
    
    if not contracts_with_changes:
        print("✅ No contracts with different bytecode found - skipping version check")
        sys.exit(0)
    
    print(f"\nFound {len(contracts_with_changes)} contracts with different bytecode:")
    for contract in contracts_with_changes:
        print(f"  - {contract}")
    
    # Check contract versions for contracts with different bytecode
    violations = check_contract_versions(
        args.pr_dir, args.base_dir, contracts_with_changes, args.verbose
    )
    
    if violations:
        print("\n❌ Contract version violations found:")
        for violation in violations:
            print(f"\n  Contract: {violation['contract']}")
            print(f"  Issue: {violation['violation']}")
            print(f"  PR version: {violation['current_version']} (entrypoint: {violation['pr_entrypoint']})")
            print(f"  Base version: {violation['base_version']} (entrypoint: {violation['base_entrypoint']})")
        
        print(f"\n💡 To fix this:")
        print(f"   Update the CONTRACT_VERSION constant in the contract files with changed bytecode.")
        print(f"   Bytecode changes indicate functional contract modifications that require version updates.")
        
        sys.exit(1)
    else:
        print("\n✅ All contract version checks passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()

import sys
import os
import argparse
import re
from pathlib import Path


def extract_entrypoint_from_compile_ts(file_path):
    """Extract the entrypoint path from a .compile.ts file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Look for entrypoint: 'path/to/contract.tolk'
        pattern = r"entrypoint:\s*['\"]([^'\"]+)['\"]"
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        return None
        
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None


def find_contract_entrypoints(contracts_dir):
    """Find all .compile.ts files in contracts/wrappers directory."""
    wrappers_dir = os.path.join(contracts_dir, 'wrappers')
    compile_files = {}
    
    if not os.path.exists(wrappers_dir):
        print(f"Warning: wrappers directory not found at {wrappers_dir}")
        return compile_files
    
    for file_name in os.listdir(wrappers_dir):
        if file_name.endswith('.compile.ts'):
            compile_file_path = os.path.join(wrappers_dir, file_name)
            entrypoint = extract_entrypoint_from_compile_ts(compile_file_path)
            
            if entrypoint:
                # The entrypoint is relative to contracts/ directory
                contract_name = file_name.replace('.compile.ts', '')
                compile_files[contract_name] = entrypoint
    
    return compile_files


def get_contract_entrypoints(pr_dir, base_dir, verbose=False):
    """Get contract entrypoints from both PR and base branches."""
    pr_contracts_dir = os.path.join(pr_dir, 'contracts')
    base_contracts_dir = os.path.join(base_dir, 'contracts')
    
    pr_entrypoints = find_contract_entrypoints(pr_contracts_dir)
    base_entrypoints = find_contract_entrypoints(base_contracts_dir)
    
    if verbose:
        print(f"PR branch entrypoints: {pr_entrypoints}")
        print(f"Base branch entrypoints: {base_entrypoints}")
    
    # Find all unique contract names
    all_contracts = set(pr_entrypoints.keys()) | set(base_entrypoints.keys())
    
    contracts_to_check = []
    
    for contract_name in all_contracts:
        pr_entrypoint = pr_entrypoints.get(contract_name)
        base_entrypoint = base_entrypoints.get(contract_name)
        
        # Check if the contract exists in both branches and if entrypoints differ OR
        # if contract exists in only one branch (new/deleted)
        if pr_entrypoint != base_entrypoint:
            contracts_to_check.append({
                'name': contract_name,
                'pr_entrypoint': pr_entrypoint,
                'base_entrypoint': base_entrypoint
            })
            
            if verbose:
                if pr_entrypoint and base_entrypoint:
                    print(f"Contract {contract_name}: entrypoint changed from {base_entrypoint} to {pr_entrypoint}")
                elif pr_entrypoint and not base_entrypoint:
                    print(f"Contract {contract_name}: new contract with entrypoint {pr_entrypoint}")
                elif not pr_entrypoint and base_entrypoint:
                    print(f"Contract {contract_name}: removed contract (was {base_entrypoint})")
    
    return contracts_to_check


def extract_version_from_content(content):
    """Extract CONTRACT_VERSION from file content."""
    pattern = r'const CONTRACT_VERSION = "([^"]+)";'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    
    if match:
        return match.group(1)
    
    return None


def get_file_content(file_path):
    """Get the content of a file if it exists."""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
    
    return None


def check_contract_versions(pr_dir, base_dir, contracts_to_check, verbose=False):
    """
    Check contract versions for contracts with changed entrypoints.
    
    Returns:
        list: List of violations found
    """
    violations = []
    
    for contract_info in contracts_to_check:
        contract_name = contract_info['name']
        pr_entrypoint = contract_info['pr_entrypoint']
        base_entrypoint = contract_info['base_entrypoint']
        
        if verbose:
            print(f"\nChecking contract: {contract_name}")
        
        # Get current version from PR branch
        current_version = None
        if pr_entrypoint:
            pr_contract_path = os.path.join(pr_dir, 'contracts', pr_entrypoint)
            pr_content = get_file_content(pr_contract_path)
            if pr_content:
                current_version = extract_version_from_content(pr_content)
        
        # Get base version from base branch
        base_version = None
        if base_entrypoint:
            base_contract_path = os.path.join(base_dir, 'contracts', base_entrypoint)
            base_content = get_file_content(base_contract_path)
            if base_content:
                base_version = extract_version_from_content(base_content)
        
        if verbose:
            print(f"  PR entrypoint: {pr_entrypoint} -> version: {current_version}")
            print(f"  Base entrypoint: {base_entrypoint} -> version: {base_version}")
        
        # Check for violations
        if current_version and base_version:
            if current_version == base_version:
                violations.append({
                    'contract': contract_name,
                    'pr_entrypoint': pr_entrypoint,
                    'base_entrypoint': base_entrypoint,
                    'current_version': current_version,
                    'base_version': base_version,
                    'violation': 'Contract version unchanged despite contract modifications'
                })
            else:
                print(f"✅ {contract_name}: Version updated from {base_version} to {current_version}")
        elif current_version and not base_version:
            print(f"✅ {contract_name}: New contract with version {current_version}")
        elif not current_version and base_version:
            print(f"⚠️  {contract_name}: CONTRACT_VERSION removed (was {base_version})")
        elif not current_version and not base_version:
            print(f"ℹ️  {contract_name}: No CONTRACT_VERSION found in either version")
        else:
            # This shouldn't happen, but just in case
            print(f"⚠️  {contract_name}: Unexpected version state")
    
    return violations


def main():
    parser = argparse.ArgumentParser(
        description="Check contract version changes in .tolk files by reading compile.ts entrypoints"
    )
    parser.add_argument(
        '--pr-dir', 
        required=True,
        help='Directory containing PR branch code'
    )
    parser.add_argument(
        '--base-dir', 
        required=True,
        help='Directory containing base branch code'
    )
    parser.add_argument(
        '--verbose', 
        action='store_true',
        help='Enable verbose output'
    )
    
    args = parser.parse_args()
    
    # Validate directories exist
    if not os.path.isdir(args.pr_dir):
        print(f"Error: PR directory {args.pr_dir} does not exist")
        sys.exit(1)
    
    if not os.path.isdir(args.base_dir):
        print(f"Error: Base directory {args.base_dir} does not exist")
        sys.exit(1)
    
    print("Finding contract entrypoints from compile.ts files...")
    contracts_to_check = get_contract_entrypoints(args.pr_dir, args.base_dir, args.verbose)
    
    if not contracts_to_check:
        print("✅ No contract entrypoints changed - skipping contract version check")
        sys.exit(0)
    
    print(f"\nFound {len(contracts_to_check)} contracts with changed entrypoints:")
    for contract_info in contracts_to_check:
        print(f"  - {contract_info['name']}: {contract_info['base_entrypoint']} -> {contract_info['pr_entrypoint']}")
    
    # Check contract versions
    violations = check_contract_versions(args.pr_dir, args.base_dir, contracts_to_check, args.verbose)
    
    if violations:
        print("\n❌ Contract version violations found:")
        for violation in violations:
            print(f"\n  Contract: {violation['contract']}")
            print(f"  Issue: {violation['violation']}")
            print(f"  PR entrypoint: {violation['pr_entrypoint']} (version: {violation['current_version']})")
            print(f"  Base entrypoint: {violation['base_entrypoint']} (version: {violation['base_version']})")
        
        print(f"\n💡 To fix this:")
        print(f"   Update the CONTRACT_VERSION constant in the modified contract files.")
        print(f"   Every contract change should increment the version to ensure proper deployment tracking.")
        
        sys.exit(1)
    else:
        print("\n✅ All contract version checks passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()