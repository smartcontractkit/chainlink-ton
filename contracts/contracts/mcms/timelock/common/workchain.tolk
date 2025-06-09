const WORKCHAIN = 0;

@inline
fun getWorkchain(address: slice): int {
  val (wc, _) = parseStandardAddress(address);
  return wc;
}

@inline
fun forceChain(workchain: int, address: slice, error_code: int) {
  val wc = getWorkchain(address);
  assert(wc == workchain, error_code);
}
