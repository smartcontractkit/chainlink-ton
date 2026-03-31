---
id: dev-guides-cross-repo-dependency-dev
title: Cross-Repo Dependency Development
sidebar_label: Cross-Repo Dependencies
sidebar_position: 3
---

# Cross-Repository Change Flow: chainlink-ton ↔ chainlink Core

This guide documents the formal process for merging changes in `chainlink-ton` that also depend on changes in the `chainlink` core repository.

## Overview

When developing features or fixes that require changes in both repositories, the synchronization process must be carefully managed to maintain consistency and avoid breaking builds. This process ensures that:

1. Both repositories remain in a consistent state throughout the development cycle
2. Integration tests continue to work with the correct versions
3. The plugin system properly references the correct commit hashes
4. Contract versions are kept in sync when applicable

## Terminology

- **Core**: The main `github.com/smartcontractkit/chainlink` repository
- **chainlink-ton**: The `github.com/smartcontractkit/chainlink-ton` repository
- **core_version**: The commit hash stored in `scripts/.core_version` that specifies which core commit to use
- **plugins.public.yaml**: Configuration file in core that specifies plugin Git references


## Step-by-Step Merging Process

### Step 1: Publish chainlink-ton PR with Initial Changes

1. In the `chainlink-ton` repository, create a new branch
2. Implement your chainlink-ton changes
3. Create and publish a Pull Request
4. **Do NOT merge yet** - note the commit hash of your PR branch

### Step 2: Create Core Branch and Sync Dependencies
1. In the `chainlink` core repository, create a new branch
2. Follow the ["Syncing Changes from chainlink-ton to Core"](#syncing-changes-from-chainlink-ton-to-core) steps using the latest commit hash from the chainlink-ton PR

### Step 3: Make Required Core Changes

1. Implement changes required to support the chainlink-ton changes (most likely fixing broken E2E tests)
2. Commit your changes but **do NOT merge the core PR yet**
3. **Note the commit hash** of your core PR branch

### Step 4: Update chainlink-ton PR with Core Hash

1. Update the `scripts/.core_version` in your chainlink-ton PR to the core PR's commit hash from Step 3
2. Push the updated chainlink-ton PR

### Step 5: Iterate, Get Approval, and Merge chainlink-ton PR

1. Iterate on both PRs as needed based on reviews
2. Get the chainlink-ton PR reviewed and approved
3. Merge the chainlink-ton PR into the main branch
4. **Note the merge commit hash** - you'll need this for Step 6

### Step 6: Update Core PR Dependencies

1. In your core PR branch, follow the ["Syncing Changes from chainlink-ton to Core"](#syncing-changes-from-chainlink-ton-to-core) steps again, but this time using the commit hash from the chainlink-ton main branch that was just merged in Step 5
3. Commit the dependency updates

### Step 7: Merge Core PR

1. Ensure all tests pass with the updated dependencies
2. Get a final core PR approval
3. Merge the PR into the develop branch
4. **Note the merge commit hash** - you'll need this for Step 8

### Step 8: Finalize chainlink-ton Sync

1. Create a final PR in chainlink-ton
2. Update `scripts/.core_version` to the merged core commit hash from core's `develop` branch
3. Merge this final PR to complete the sync

## Syncing Changes from chainlink-ton to Core

When you need to update the core repository to reference new chainlink-ton changes, follow these steps:

### Steps:

1. **Update Go Module Dependency**

   ```bash
   go get github.com/smartcontractkit/chainlink-ton@<commit-hash>
   ```

   As well as any other chainlink-ton modules that need to be updated, probably easiest to run them on all. For example: `github.com/smartcontractkit/chainlink-ton/deployment` as well.


2. **Tidy Dependencies**

   ```bash
   gomods tidy
   ```

3. **Update Plugin Git Reference**

   Edit `plugins/plugins.public.yaml` and find the TON plugin entry (around line 53):

   ```yaml
   - name: ton
     git: 
       ref: "<commit-hash>"
       url: "https://github.com/smartcontractkit/chainlink-ton"
   ```

4. **Update Contract Version Reference (if applicable)**

   If contract changes are involved, update hardcoded versions in:

   `deployment/ccip/changeset/testhelpers/test_environment.go`

   Look for lines like:

   ```go
   // TODO replace the hardcoded commit sha with the one fetched from memory.GetTONSha()
   contractVersion := "83e4df8520c5" // evm2ton enabled TON contracts(2025-10-09)
   ```

## Tips

1. It's good to make sure the core PR is passing and essentially approved before merging the chainlink-ton PR. This helps avoid delays when merging the core PR in the next steps which can lead to breaking changes for other developers working in the same repos.
