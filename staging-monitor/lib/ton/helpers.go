package ton

// leftPadTo32 pads a byte slice to 32 bytes (left-padding with zeros)
// This is required for EVM addresses when sending to TON router
func leftPadTo32(in []byte) []byte {
	if len(in) >= 32 {
		return in
	}
	out := make([]byte, 32)
	copy(out[32-len(in):], in)
	return out
}
