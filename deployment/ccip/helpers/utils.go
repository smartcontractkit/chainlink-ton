package helpers

import (
	"context"
	"fmt"
	"os/exec"
	"path"
	"strings"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Transactions encapsulates serialized TON internal messages with type safety.
type Transactions struct {
	Serialized [][]byte `json:"serialized"`
}

// NewTransactions creates a new Transactions from internal messages.
func NewTransactions(msgs []*tlb.InternalMessage) (*Transactions, error) {
	serialized, err := Serialize(msgs)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize transactions: %w", err)
	}
	return &Transactions{Serialized: serialized}, nil
}

// NewEmptyTransactions creates an empty Transactions.
func NewEmptyTransactions() *Transactions {
	return &Transactions{Serialized: [][]byte{}}
}

// Append adds more transactions from another Transactions.
func (t *Transactions) Append(other *Transactions) {
	if other != nil && len(other.Serialized) > 0 {
		t.Serialized = append(t.Serialized, other.Serialized...)
	}
}

// AppendRaw adds raw serialized transactions (for backward compatibility during migration).
func (t *Transactions) AppendRaw(raw [][]byte) {
	t.Serialized = append(t.Serialized, raw...)
}

// ToMessages deserializes back to internal messages.
func (t *Transactions) ToMessages() ([]*tlb.InternalMessage, error) {
	return Deserialize(t.Serialized)
}

// Raw returns the underlying [][]byte for functions that still need it.
func (t *Transactions) Raw() [][]byte {
	return t.Serialized
}

// IsEmpty returns true if there are no transactions.
func (t *Transactions) IsEmpty() bool {
	return len(t.Serialized) == 0
}

// Len returns the number of transactions.
func (t *Transactions) Len() int {
	return len(t.Serialized)
}

func Serialize(msgs []*tlb.InternalMessage) ([][]byte, error) {
	raw := make([][]byte, len(msgs))
	for i, msg := range msgs {
		bytes, err := pack(msg)
		if err != nil {
			return nil, err
		}
		raw[i] = bytes
	}
	return raw, nil
}
func Deserialize(raw [][]byte) ([]*tlb.InternalMessage, error) {
	msgs := make([]*tlb.InternalMessage, len(raw))
	for i, bytes := range raw {
		msg, err := unpack[tlb.InternalMessage](bytes)
		if err != nil {
			return nil, err
		}
		msgs[i] = &msg
	}
	return msgs, nil
}

func unpack[T any](data []byte) (T, error) {
	var decoded T
	cell, err := cell.FromBOC(data)
	if err != nil {
		return decoded, err
	}
	err = tlb.LoadFromCell(&decoded, cell.BeginParse())
	return decoded, err
}

func pack(msg any) ([]byte, error) {
	cell, err := tlb.ToCell(msg)
	if err != nil {
		return nil, err
	}
	return cell.ToBOC(), nil
}

func GetRepoRootDir(ctx context.Context) string {
	res := exec.CommandContext(ctx, "git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("failed to get repo root dir: %s", err))
	}
	rootDir := strings.TrimSpace(string(stdout))
	return rootDir
}

func GetBuildsDir(ctx context.Context) string {
	repoRoot := GetRepoRootDir(ctx)
	return path.Join(repoRoot, "contracts", "build")
}

func GetBuildDir(ctx context.Context, contractPath string) string {
	buildsDir := GetBuildsDir(ctx)
	return path.Join(buildsDir, contractPath)
}
