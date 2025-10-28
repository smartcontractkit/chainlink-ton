# Notice: `pkgs.lib.fakeHash` can be used as a placeholder,
#   but `nix-lock-tidy` will only replace actual hashes.
{pkgs}: {
  chainlink = "sha256-V7ZN569ByJUByqe5H3+ukuzqFbI+nnJDMl41w4iqm6U=";
  operator-ui-assets = "sha256-FQlExEZw4Z4lhxW0kvBdKaaTfqA/OWcM8Txe5F9FRao=";

  # LOOP plugins
  chainlink-solana = "sha256-tjCAntnWsqBJ9HXhDu1NVU+ndKqYTueAus3NfYty910=";
  chainlink-aptos = "sha256-9egC+Mpzv07ygY6g7yL9OGuzy3z/4RLtv8i0WdsVsug=";
}
