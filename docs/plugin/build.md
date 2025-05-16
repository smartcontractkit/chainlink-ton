
# Chainlink TON - LOOP plugin - Build

## Go build

Build `chainlink-ton` Go bin manually:

```bash
# Enter the default dev shell
nix develop
# Build the LOOP plugin
go build -v ./cmd/chainlink-ton
```

## Nix build

Build `chainlink-ton` Nix package:

```bash
nix build .# --print-out-paths              # default pkg
nix build .#chainlink-ton --print-out-paths # labeled pkg
```

Build `chainlink-ton` Nix package without checking out the source code locally:

```bash
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'# --print-out-paths              # default pkg
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'#chainlink-ton --print-out-paths # labeled pkg
```

## Docker build

### Using host as a builder

```bash
# Build the LOOP plugin manually
# Prepare the build output path and run go build
export PKG_OUT_PATH=./.build
mkdir -p $PKG_OUT_PATH/bin $PKG_OUT_PATH/lib
nix develop -c go build -v -o $PKG_OUT_PATH/bin ./cmd/chainlink-ton

# Or build the plugin Nix package
export PKG_OUT_PATH=$(nix build .#chainlink-ton --print-out-paths)

# Build the final Docker image by layering in the plugin bin on top of base chainlink:*-plugins image
docker build $PKG_OUT_PATH \
    -t smartcontract/chainlink-plugins-dev:v0.0.1-beta.1-chainlink-ton \
    -f https://raw.githubusercontent.com/smartcontractkit/chainlink/refs/heads/develop/plugins/chainlink.prebuilt.Dockerfile \
    --build-arg BASE_IMAGE=public.ecr.aws/chainlink/chainlink:v2.23.0-plugins \
    --build-arg PKG_PATH=.
```

Alternatively just use a prepared script:

```bash
# Build the final Docker image
nix develop -c ./scripts/build/make-docker.sh
```

Inspect the newly created image:

```bash
docker run -it --rm --entrypoint /bin/sh smartcontract/chainlink-plugins-dev:v0.0.1-beta.1-chainlink-ton
# ls -la /usr/local/bin
total 795768
drwxr-xr-x 1 root root      4096 Jan  1  1970 .
drwxr-xr-x 1 root root      4096 Apr  4 02:05 ..
-rwxr-xr-x 1 root root 220261760 Apr 22 19:06 chainlink
-rwxr-xr-x 1 root root  35477040 Apr 22 19:09 chainlink-aptos
-rwxr-xr-x 1 root root  66711568 Apr 22 19:08 chainlink-cosmos
-rwxr-xr-x 1 root root  37383787 Apr 22 19:07 chainlink-feeds
-rwxr-xr-x 1 root root  41947208 Apr 22 19:07 chainlink-medianpoc
-rwxr-xr-x 1 root root  38475960 Apr 22 19:07 chainlink-mercury
-rwxr-xr-x 1 root root 153752104 Apr 22 19:07 chainlink-ocr3-capability
-rwxr-xr-x 1 root root  51898332 Apr 22 19:08 chainlink-solana
-rwxr-xr-x 1 root root  46982544 Apr 22 19:09 chainlink-starknet
-r-xr-xr-x 1 root root  31829088 Jan  1  1970 chainlink-ton
-rwxr-xr-x 1 root root  37296178 Apr 22 19:09 cron
-rwxr-xr-x 1 root root  19443252 Apr 22 19:05 dlv
-rwxr-xr-x 1 root root  33364768 Apr 22 19:09 readcontract
# ...
```

### Using Dockerfile.build.nix builder

Build the Chainlink core node image using a Nix builder.

Builds a specific Nix package (single bin or a bundle) and layers in the output as Chinlink plugin bins:

```bash
docker build . \
    -t smartcontract/chainlink-plugins-dev:v0.0.1-beta.1-chainlink-ton \
    -f ./scripts/build/Dockerfile.build.nix
```

Or with using specific build args:

```bash
docker build . \
    -t smartcontract/chainlink-plugins-dev:v0.0.1-beta.1-chainlink-ton \
    -f ./scripts/build/Dockerfile.build.nix \
    --build-arg NIX_BUILD_PKG=chainlink-ton \
    --build-arg BASE_IMAGE=public.ecr.aws/chainlink/chainlink:v2.23.0-plugins
```

Alternatively just use a prepared script:

```bash
# Build the final Docker image
nix develop -c ./scripts/build/make-docker.sh --docker-builder
```
