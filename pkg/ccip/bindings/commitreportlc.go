package bindings

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// --- CommitReportLC ---

type CommitReportLC struct {
	PriceUpdates  PriceUpdatesLC
	MerkleRoot    MerkleRootsLC
	RMNSignatures []SignatureLC
}

func (c *CommitReportLC) MarshalBinary() ([]byte, error) {
	var buf bytes.Buffer

	priceUpdatesBytes, err := c.PriceUpdates.MarshalBinary()
	if err != nil {
		return nil, fmt.Errorf("marshal PriceUpdatesLC: %w", err)
	}
	buf.Write(priceUpdatesBytes)

	merkleRootBytes, err := c.MerkleRoot.MarshalBinary()
	if err != nil {
		return nil, fmt.Errorf("marshal MerkleRootsLC: %w", err)
	}
	buf.Write(merkleRootBytes)

	if len(c.RMNSignatures) > 0xFFFFFFFF {
		return nil, fmt.Errorf("too many RMNSignatures")
	}
	if err := binary.Write(&buf, binary.BigEndian, uint32(len(c.RMNSignatures))); err != nil {
		return nil, fmt.Errorf("write RMNSignatures length: %w", err)
	}
	for i, sig := range c.RMNSignatures {
		b, err := sig.MarshalBinary()
		if err != nil {
			return nil, fmt.Errorf("marshal RMNSignatures[%d]: %w", i, err)
		}
		buf.Write(b)
	}

	return buf.Bytes(), nil
}

func (c *CommitReportLC) UnmarshalBinary(data []byte) error {
	offset := 0

	var priceUpdates PriceUpdatesLC
	n, err := priceUpdates.unmarshalBinaryWithOffset(data[offset:])
	if err != nil {
		return fmt.Errorf("unmarshal PriceUpdatesLC: %w", err)
	}
	offset += n
	c.PriceUpdates = priceUpdates

	var merkleRoot MerkleRootsLC
	n, err = merkleRoot.unmarshalBinaryWithOffset(data[offset:])
	if err != nil {
		return fmt.Errorf("unmarshal MerkleRootsLC: %w", err)
	}
	offset += n
	c.MerkleRoot = merkleRoot

	if len(data[offset:]) < 4 {
		return fmt.Errorf("not enough data for RMNSignatures length")
	}
	numSigs := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	c.RMNSignatures = make([]SignatureLC, numSigs)
	for i := 0; i < int(numSigs); i++ {
		if len(data[offset:]) < 64 {
			return fmt.Errorf("not enough data for RMNSignatures[%d]", i)
		}
		var sig SignatureLC
		if err := sig.UnmarshalBinary(data[offset : offset+64]); err != nil {
			return fmt.Errorf("unmarshal RMNSignatures[%d]: %w", i, err)
		}
		c.RMNSignatures[i] = sig
		offset += 64
	}
	return nil
}

// --- MerkleRootsLC ---

type MerkleRootsLC struct {
	BlessedMerkleRoots   []MerkleRootLC
	UnblessedMerkleRoots []MerkleRootLC
}

func (m *MerkleRootsLC) MarshalBinary() ([]byte, error) {
	var buf bytes.Buffer

	if len(m.BlessedMerkleRoots) > 0xFFFFFFFF {
		return nil, fmt.Errorf("too many BlessedMerkleRoots")
	}
	if err := binary.Write(&buf, binary.BigEndian, uint32(len(m.BlessedMerkleRoots))); err != nil {
		return nil, fmt.Errorf("write BlessedMerkleRoots length: %w", err)
	}
	for i, mr := range m.BlessedMerkleRoots {
		b, err := mr.MarshalBinary()
		if err != nil {
			return nil, fmt.Errorf("marshal BlessedMerkleRoots[%d]: %w", i, err)
		}
		buf.Write(b)
	}

	if len(m.UnblessedMerkleRoots) > 0xFFFFFFFF {
		return nil, fmt.Errorf("too many UnblessedMerkleRoots")
	}
	if err := binary.Write(&buf, binary.BigEndian, uint32(len(m.UnblessedMerkleRoots))); err != nil {
		return nil, fmt.Errorf("write UnblessedMerkleRoots length: %w", err)
	}
	for i, mr := range m.UnblessedMerkleRoots {
		b, err := mr.MarshalBinary()
		if err != nil {
			return nil, fmt.Errorf("marshal UnblessedMerkleRoots[%d]: %w", i, err)
		}
		buf.Write(b)
	}

	return buf.Bytes(), nil
}

func (m *MerkleRootsLC) UnmarshalBinary(data []byte) error {
	_, err := m.unmarshalBinaryWithOffset(data)
	return err
}

func (m *MerkleRootsLC) unmarshalBinaryWithOffset(data []byte) (int, error) {
	offset := 0

	if len(data[offset:]) < 4 {
		return 0, fmt.Errorf("not enough data for BlessedMerkleRoots length")
	}
	numBlessed := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	m.BlessedMerkleRoots = make([]MerkleRootLC, numBlessed)
	for i := 0; i < int(numBlessed); i++ {
		if len(data[offset:]) < 120 {
			return 0, fmt.Errorf("not enough data for BlessedMerkleRoots[%d]", i)
		}
		var mr MerkleRootLC
		if err := mr.UnmarshalBinary(data[offset : offset+120]); err != nil {
			return 0, fmt.Errorf("unmarshal BlessedMerkleRoots[%d]: %w", i, err)
		}
		m.BlessedMerkleRoots[i] = mr
		offset += 120
	}

	if len(data[offset:]) < 4 {
		return 0, fmt.Errorf("not enough data for UnblessedMerkleRoots length")
	}
	numUnblessed := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	m.UnblessedMerkleRoots = make([]MerkleRootLC, numUnblessed)
	for i := 0; i < int(numUnblessed); i++ {
		if len(data[offset:]) < 120 {
			return 0, fmt.Errorf("not enough data for UnblessedMerkleRoots[%d]", i)
		}
		var mr MerkleRootLC
		if err := mr.UnmarshalBinary(data[offset : offset+120]); err != nil {
			return 0, fmt.Errorf("unmarshal UnblessedMerkleRoots[%d]: %w", i, err)
		}
		m.UnblessedMerkleRoots[i] = mr
		offset += 120
	}
	return offset, nil
}

// --- PriceUpdatesLC ---

type PriceUpdatesLC struct {
	TokenPriceUpdates []TokenPriceUpdateLC
	GasPriceUpdates   []GasPriceUpdateLC
}

func (p *PriceUpdatesLC) MarshalBinary() ([]byte, error) {
	var buf bytes.Buffer

	if len(p.TokenPriceUpdates) > 0xFFFFFFFF {
		return nil, fmt.Errorf("too many TokenPriceUpdates")
	}
	if err := binary.Write(&buf, binary.BigEndian, uint32(len(p.TokenPriceUpdates))); err != nil {
		return nil, fmt.Errorf("write TokenPriceUpdates length: %w", err)
	}
	for i, tpu := range p.TokenPriceUpdates {
		b, err := tpu.MarshalBinary()
		if err != nil {
			return nil, fmt.Errorf("marshal TokenPriceUpdates[%d]: %w", i, err)
		}
		buf.Write(b)
	}

	if len(p.GasPriceUpdates) > 0xFFFFFFFF {
		return nil, fmt.Errorf("too many GasPriceUpdates")
	}
	if err := binary.Write(&buf, binary.BigEndian, uint32(len(p.GasPriceUpdates))); err != nil {
		return nil, fmt.Errorf("write GasPriceUpdates length: %w", err)
	}
	for i, gpu := range p.GasPriceUpdates {
		b, err := gpu.MarshalBinary()
		if err != nil {
			return nil, fmt.Errorf("marshal GasPriceUpdates[%d]: %w", i, err)
		}
		buf.Write(b)
	}

	return buf.Bytes(), nil
}

func (p *PriceUpdatesLC) UnmarshalBinary(data []byte) error {
	_, err := p.unmarshalBinaryWithOffset(data)
	return err
}

func (p *PriceUpdatesLC) unmarshalBinaryWithOffset(data []byte) (int, error) {
	offset := 0

	if len(data[offset:]) < 4 {
		return 0, fmt.Errorf("not enough data for TokenPriceUpdates length")
	}
	numTokens := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	p.TokenPriceUpdates = make([]TokenPriceUpdateLC, numTokens)
	for i := 0; i < int(numTokens); i++ {
		if len(data[offset:]) < 96 {
			return 0, fmt.Errorf("not enough data for TokenPriceUpdates[%d]", i)
		}
		var tpu TokenPriceUpdateLC
		if err := tpu.UnmarshalBinary(data[offset : offset+96]); err != nil {
			return 0, fmt.Errorf("unmarshal TokenPriceUpdates[%d]: %w", i, err)
		}
		p.TokenPriceUpdates[i] = tpu
		offset += 96
	}

	if len(data[offset:]) < 4 {
		return 0, fmt.Errorf("not enough data for GasPriceUpdates length")
	}
	numGas := binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4
	p.GasPriceUpdates = make([]GasPriceUpdateLC, numGas)
	for i := 0; i < int(numGas); i++ {
		if len(data[offset:]) < 40 {
			return 0, fmt.Errorf("not enough data for GasPriceUpdates[%d]", i)
		}
		var gpu GasPriceUpdateLC
		if err := gpu.UnmarshalBinary(data[offset : offset+40]); err != nil {
			return 0, fmt.Errorf("unmarshal GasPriceUpdates[%d]: %w", i, err)
		}
		p.GasPriceUpdates[i] = gpu
		offset += 40
	}
	return offset, nil
}

// --- SignatureLC ---

type SignatureLC struct {
	R []byte
	S []byte
}

func (s *SignatureLC) MarshalBinary() ([]byte, error) {
	if len(s.R) != 32 {
		return nil, fmt.Errorf("R must be 32 bytes, got %d", len(s.R))
	}
	if len(s.S) != 32 {
		return nil, fmt.Errorf("S must be 32 bytes, got %d", len(s.S))
	}
	data := make([]byte, 64)
	copy(data[0:32], s.R)
	copy(data[32:64], s.S)
	return data, nil
}

func (s *SignatureLC) UnmarshalBinary(data []byte) error {
	if len(data) != 64 {
		return fmt.Errorf("expected 64 bytes for SignatureLC, got %d", len(data))
	}
	s.R = make([]byte, 32)
	s.S = make([]byte, 32)
	copy(s.R, data[0:32])
	copy(s.S, data[32:64])
	return nil
}

// --- MerkleRootLC ---

type MerkleRootLC struct {
	SourceChainSelector uint64
	OnRampAddress       []byte
	MinSeqNr            uint64
	MaxSeqNr            uint64
	MerkleRoot          []byte
}

func (m *MerkleRootLC) MarshalBinary() ([]byte, error) {
	if len(m.OnRampAddress) != 64 {
		return nil, fmt.Errorf("OnRampAddress must be 64 bytes, got %d", len(m.OnRampAddress))
	}
	if len(m.MerkleRoot) != 32 {
		return nil, fmt.Errorf("MerkleRoot must be 32 bytes, got %d", len(m.MerkleRoot))
	}
	data := make([]byte, 120)
	binary.BigEndian.PutUint64(data[0:8], m.SourceChainSelector)
	copy(data[8:72], m.OnRampAddress)
	binary.BigEndian.PutUint64(data[72:80], m.MinSeqNr)
	binary.BigEndian.PutUint64(data[80:88], m.MaxSeqNr)
	copy(data[88:120], m.MerkleRoot)
	return data, nil
}

func (m *MerkleRootLC) UnmarshalBinary(data []byte) error {
	if len(data) != 120 {
		return fmt.Errorf("expected 120 bytes for MerkleRootLC, got %d", len(data))
	}
	m.SourceChainSelector = binary.BigEndian.Uint64(data[0:8])
	m.OnRampAddress = make([]byte, 64)
	copy(m.OnRampAddress, data[8:72])
	m.MinSeqNr = binary.BigEndian.Uint64(data[72:80])
	m.MaxSeqNr = binary.BigEndian.Uint64(data[80:88])
	m.MerkleRoot = make([]byte, 32)
	copy(m.MerkleRoot, data[88:120])
	return nil
}

// --- GasPriceUpdateLC ---

type GasPriceUpdateLC struct {
	DestChainSelector uint64
	UsdPerUnitGas     *big.Int
}

func (g *GasPriceUpdateLC) MarshalBinary() ([]byte, error) {
	if g.UsdPerUnitGas == nil {
		return nil, fmt.Errorf("UsdPerUnitGas cannot be nil")
	}
	data := make([]byte, 40)
	binary.BigEndian.PutUint64(data[0:8], g.DestChainSelector)
	usdBytes := g.UsdPerUnitGas.FillBytes(make([]byte, 32))
	copy(data[8:], usdBytes)
	return data, nil
}

func (g *GasPriceUpdateLC) UnmarshalBinary(data []byte) error {
	if len(data) != 40 {
		return fmt.Errorf("expected 40 bytes for GasPriceUpdateLC, got %d", len(data))
	}
	g.DestChainSelector = binary.BigEndian.Uint64(data[0:8])
	g.UsdPerUnitGas = new(big.Int).SetBytes(data[8:40])
	return nil
}

// --- TokenPriceUpdateLC ---

type TokenPriceUpdateLC struct {
	SourceToken *address.Address
	UsdPerToken *big.Int
}

func (t *TokenPriceUpdateLC) MarshalBinary() ([]byte, error) {
	if t.SourceToken == nil {
		return nil, fmt.Errorf("SourceToken cannot be nil")
	}
	addrStr := t.SourceToken.String()
	addrBytes := []byte(addrStr)
	if len(addrBytes) < 64 {
		padded := make([]byte, 64)
		copy(padded, addrBytes)
		addrBytes = padded
	}
	addrBytes = addrBytes[:64]
	if t.UsdPerToken == nil {
		return nil, fmt.Errorf("UsdPerToken cannot be nil")
	}
	data := make([]byte, 96)
	copy(data[0:64], addrBytes)
	usdBytes := t.UsdPerToken.FillBytes(make([]byte, 32))
	copy(data[64:], usdBytes)
	return data, nil
}

func (t *TokenPriceUpdateLC) UnmarshalBinary(data []byte) error {
	if len(data) != 96 {
		return fmt.Errorf("expected 96 bytes for TokenPriceUpdateLC, got %d", len(data))
	}
	addrStr := string(bytes.TrimRight(data[0:64], "\x00"))
	addr, err := address.ParseAddr(addrStr)
	if err != nil {
		return fmt.Errorf("failed to parse address: %w", err)
	}
	t.SourceToken = addr
	t.UsdPerToken = new(big.Int).SetBytes(data[64:96])
	return nil
}

// --- Linked Cell Serialization ---

func SerializeToLinkedCells(report CommitReportLC) (*cell.Cell, error) {
	b, err := report.MarshalBinary()
	if err != nil {
		return nil, err
	}

	var cells []*cell.Builder
	curr := cell.BeginCell()
	cells = append(cells, curr)
	offset := 0

	for offset < len(b) {
		bitsLeft := curr.BitsLeft()
		bytesLeft := int(bitsLeft / 8)
		if bytesLeft == 0 {
			curr = cell.BeginCell()
			cells = append(cells, curr)
			continue
		}
		end := offset + bytesLeft
		if end > len(b) {
			end = len(b)
		}
		if err := curr.StoreSlice(b[offset:end], uint((end-offset)*8)); err != nil {
			return nil, err
		}
		offset = end
	}

	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, err
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

func DeserializeFromLinkedCells(report *CommitReportLC, root *cell.Cell) error {
	var buf bytes.Buffer
	curr := root
	for curr != nil {
		s, err := curr.BeginParse().LoadSlice(curr.BitsSize())
		if err != nil {
			return err
		}
		_, _ = buf.Write(s)
		if curr.RefsNum() > 0 {
			ref, err := curr.PeekRef(0)
			if err != nil {
				return err
			}
			curr = ref
		} else {
			curr = nil
		}
	}
	return report.UnmarshalBinary(buf.Bytes())
}
