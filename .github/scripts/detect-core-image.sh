#!/bin/bash

set -euo pipefail

# Determines which Chainlink core image to use and whether it already exists.

CHAINLINK_PUBLIC_ECR_IMAGE="public.ecr.aws/chainlink/chainlink"
DOCKER_CACHE_DIR="${GITHUB_WORKSPACE}/.cache"
DOCKER_CACHE_KEY="ccip-chainlink-core-sha-cache-v1"
DOCKER_CACHE_TAR_NAME="ccip-chainlink-core-sha-cache.tar"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Read core version from file
read_core_version() {
    if [[ ! -f "./scripts/.core_version" ]]; then
        log_error "Core version file not found: ./scripts/.core_version"
        exit 1
    fi
    
    local core_ref
    core_ref=$(cat ./scripts/.core_version | tr -d '[:space:]')
    
    if [[ -z "$core_ref" ]]; then
        log_error "Core version file is empty"
        exit 1
    fi
    
    log_info "Read core ref: $core_ref"
    echo "$core_ref"  # This goes to stdout for capture
}


# Detect if the ref is a SHA or tag
is_sha() {
    local ref="$1"
    # SHA pattern: between 7 and 40 hex characters that look like a commit SHA
    if [[ "$ref" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
        return 0  # true
    else
        return 1  # false
    fi
}

# Generate short ref (first 7 chars for SHA, full for tags)
get_short_ref() {
    local ref="$1"
    if is_sha "$ref"; then
        echo "${ref:0:7}"
    else
        echo "$ref"
    fi
}

# Determine base image configuration
determine_base_image() {
    local core_ref="$1"
    local core_ref_short="$2"
    
    local base_image base_image_tag base_image_public
    
    if is_sha "$core_ref"; then
        log_info "SHA detected - using private ECR"
        base_image="${AWS_ACCOUNT_ID_STAGING}.dkr.ecr.${AWS_REGION}.amazonaws.com/chainlink-plugins-dev:chainlink-${core_ref_short}"
        base_image_tag="chainlink-${core_ref_short}"
        base_image_public="false"
    else
        log_info "Tag detected - using public ECR"
        base_image="${CHAINLINK_PUBLIC_ECR_IMAGE}:${core_ref}"
        base_image_tag="${core_ref}"
        base_image_public="true"
    fi
    
    # Output the variables (one per line, clean format)
    echo "BASE_IMAGE=${base_image}"
    echo "BASE_IMAGE_TAG=${base_image_tag}"
    echo "BASE_IMAGE_PUBLIC=${base_image_public}"
}

# Check if image already exists
check_image_availability() {
    local base_image="$1"
    local core_ref="$2"
    
    log_info "Checking availability of: $base_image"
    
    if ! is_sha "$core_ref"; then
        log_info "Tag-based image - checking cache and pulling if needed"
        if handle_tag_based_image "$base_image" "$core_ref"; then
            echo "EXISTS=true"
        else
            echo "EXISTS=false"
        fi
    else
        log_info "SHA-based image - checking if exists in ECR"
        if docker pull "$base_image" &>/dev/null; then
            log_success "SHA-based image exists in ECR"
            echo "EXISTS=true"
        else
            log_warning "SHA-based image not found in ECR - needs to be built"
            echo "EXISTS=false"
        fi
    fi
}

# Handle caching for tag-based images
handle_tag_based_image() {
    local base_image="$1"
    local core_ref="$2"
    local cache_file="${DOCKER_CACHE_DIR}/${core_ref}-${DOCKER_CACHE_TAR_NAME}"
    
    # Create cache directory
    mkdir -p "$DOCKER_CACHE_DIR"
    
    # Try to load from cache first
    if [[ -f "$cache_file" ]]; then
        log_info "Loading image from cache"
        docker load -i "$cache_file" >&2  # Send docker output to stderr
    else
        log_info "Cache miss - pulling and saving image"
        if docker pull "$base_image" >&2; then  # Send docker output to stderr
            docker save "$base_image" -o "$cache_file" >&2
        else
            log_error "Failed to pull image: $base_image"
            return 1
        fi
    fi
    return 0
}

# Output summary
print_summary() {
    local core_ref="$1"
    local core_ref_short="$2"
    local base_image="$3"
    local base_image_tag="$4"
    local base_image_public="$5"
    local exists="$6"
    
    log_success "=== Core Image Configuration Summary ==="
    log_info "Core Ref: $core_ref"
    log_info "Core Ref Short: $core_ref_short"
    log_info "Base Image: $base_image"
    log_info "Base Image Tag: $base_image_tag"
    log_info "Using Public ECR: $base_image_public"
    log_info "Image Already Exists: $exists"
}

# Main function
main() {
    log_info "Starting core image detection..."
    
    # Read core version (capture only the actual value)
    local core_ref
    core_ref=$(read_core_version)
    
    # Generate short ref
    local core_ref_short
    core_ref_short=$(get_short_ref "$core_ref")
    
    # Determine base image configuration
    local base_image_config
    base_image_config=$(determine_base_image "$core_ref" "$core_ref_short")
    
    # Parse the configuration (extract clean values)
    local base_image base_image_tag base_image_public
    base_image=$(echo "$base_image_config" | grep "^BASE_IMAGE=" | cut -d'=' -f2-)
    base_image_tag=$(echo "$base_image_config" | grep "^BASE_IMAGE_TAG=" | cut -d'=' -f2-)
    base_image_public=$(echo "$base_image_config" | grep "^BASE_IMAGE_PUBLIC=" | cut -d'=' -f2-)
    
    # Check availability
    local exists_result exists
    exists_result=$(check_image_availability "$base_image" "$core_ref")
    exists=$(echo "$exists_result" | grep "^EXISTS=" | cut -d'=' -f2-)
    
    # Validate all outputs are clean
    if [[ -z "$core_ref" || -z "$core_ref_short" || -z "$base_image" || -z "$base_image_tag" || -z "$base_image_public" || -z "$exists" ]]; then
        log_error "One or more output variables are empty or invalid"
        log_error "core_ref='$core_ref', core_ref_short='$core_ref_short', base_image='$base_image'"
        log_error "base_image_tag='$base_image_tag', base_image_public='$base_image_public', exists='$exists'"
        exit 1
    fi
    
    # Write to GitHub outputs 
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        {
            echo "CORE_REF=${core_ref}"
            echo "CORE_REF_SHORT=${core_ref_short}"
            echo "BASE_IMAGE=${base_image}"
            echo "BASE_IMAGE_TAG=${base_image_tag}"
            echo "BASE_IMAGE_PUBLIC=${base_image_public}"
            echo "EXISTS=${exists}"
        } >> "$GITHUB_OUTPUT"
    fi
    
    # Print summary to stderr (for debugging)
    print_summary "$core_ref" "$core_ref_short" "$base_image" "$base_image_tag" "$base_image_public" "$exists"
    
    log_success "Core image detection completed successfully!"
}

main "$@"
