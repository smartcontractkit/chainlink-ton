tolk 1.0

const WORKCHAIN = 0;

@inline
fun forceChain(workchain: int, addr: address, error_code: int) {
  val wc = addr.getWorkchain();
  assert(wc == workchain, error_code);
}
