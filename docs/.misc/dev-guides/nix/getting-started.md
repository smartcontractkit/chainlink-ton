# Getting started - Nix

## Setting up the dev environment

We currently provide three options:

1. **Install Nix locally using a recommended installer:** (recommended)

- Install Nix using the Determinate Systems installer ([github](https://github.com/DeterminateSystems/nix-installer), [article](https://determinate.systems/posts/determinate-nix-installer)):

    > A fast, friendly, and reliable tool to help you use Nix with Flakes everywhere.
    >
    > ```bash
    > curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --determinate
    > ```

- Open terminal and write `nix run nixpkgs#hello`

2. **Run in VSCode/Docker using the provided [DevContainer](.devcontainer.json):** (practical)

- Install VSCode [DevContainer extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- Enter `cmd + shift + p`, choose "DevContainers: Reopen in Container..." command.
- Wait for DevContainer to load and VS Code to restart
- Open terminal and write `nix run nixpkgs#hello`

3. **Run in GitHub Codespaces using the provided [DevContainer](.devcontainer.json):** (fun)

Open the [https://github.dev/smartcontractkit/chainlink-ton](https://github.dev/smartcontractkit/chainlink-ton) (notice the *github.dev* url):

- Wait for VS Code to load in your browser
- Go to the Terminal tab, click "Open Codespace"
- Wait for DevContainer to load and VS Code to restart in a new tab
- Open terminal and write `nix flake show` to list all available dev shells and packages
