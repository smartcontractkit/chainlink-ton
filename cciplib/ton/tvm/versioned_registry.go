package tvm

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/Masterminds/semver/v3"
)

// ErrNoInterfaceVersion is returned when a contract is versioned but has no declared interface
// at or below the requested version.
var ErrNoInterfaceVersion = errors.New("no interface version at or below requested version")

// VersionSeparator separates a contract's fully qualified name from its interface version in a
// version-qualified registry key, e.g. "link.chain.ton.ccip.OnRamp@1.6.2".
const VersionSeparator = "@"

// This file adds interface versioning to ContractTLBRegistry. There is deliberately no separate
// "versioned registry" type: the existing registry is already a map, so a version is simply an
// extra key namespace. That keeps every existing consumer working unchanged:
//
//	Lookup(contract, opcode)                  // unchanged: resolves the current interface
//	LookupVersion(contract, opcode, version)  // new: resolves the interface for that version
//	ForVersion(version)                       // new: a registry pinned to one version
//
// See cciplib/ccip/bindings/README.md for the design.

// VersionKey builds the version-qualified registry key for a contract.
func VersionKey(contract FullyQualifiedName, version semver.Version) FullyQualifiedName {
	return FullyQualifiedName(string(contract) + VersionSeparator + version.String())
}

// ParseVersionKey splits a version-qualified key into its contract and version.
//
// ok is false for an unversioned key.
func ParseVersionKey(key FullyQualifiedName) (contract FullyQualifiedName, version *semver.Version, ok bool) {
	idx := strings.LastIndex(string(key), VersionSeparator)
	if idx < 0 {
		return key, nil, false
	}

	parsed, err := semver.NewVersion(string(key)[idx+len(VersionSeparator):])
	if err != nil {
		return key, nil, false
	}

	return FullyQualifiedName(string(key)[:idx]), parsed, true
}

// DeclaredVersions lists the interface versions declared for a contract, ascending.
//
// An empty result means the contract has no interface-change history: it never changed and its
// current interface (the unversioned key) serves every version.
func (r ContractTLBRegistry) DeclaredVersions(contract FullyQualifiedName) []*semver.Version {
	prefix := string(contract) + VersionSeparator

	versions := make([]*semver.Version, 0, len(r))
	for key := range r {
		if !strings.HasPrefix(string(key), prefix) {
			continue
		}
		if _, version, ok := ParseVersionKey(key); ok {
			versions = append(versions, version)
		}
	}

	sort.Sort(semver.Collection(versions))
	return versions
}

// LookupVersion retrieves the TL-B type for a contract and opcode as of the given version.
//
// Resolution picks the greatest declared interface version that is <= version, which is exactly
// the interface that was live on-chain at that release.
//
// A contract with no declared history is resolved through its unversioned (current) key, so
// unchanged contracts keep working across every version. An error is returned when a contract is
// versioned but predates every declared version, rather than silently falling back to a newer
// interface — on TON that would encode a wrong cell rather than fail.
func (r ContractTLBRegistry) LookupVersion(contract FullyQualifiedName, opcode uint64, version semver.Version) (any, bool, error) {
	declared := r.DeclaredVersions(contract)
	if len(declared) == 0 {
		// Never changed: the current interface serves every version.
		typ, ok := r.Lookup(contract, opcode)
		return typ, ok, nil
	}

	for i := len(declared) - 1; i >= 0; i-- {
		if declared[i].GreaterThan(&version) {
			continue
		}

		typ, ok := r.Lookup(VersionKey(contract, *declared[i]), opcode)
		if ok {
			return typ, true, nil
		}
		// Declared version exists but has no type for this opcode; keep looking older.
	}

	return nil, false, fmt.Errorf("%w: contract=%s opcode=0x%08x requested=%s first-declared=%s",
		ErrNoInterfaceVersion, contract, opcode, version.String(), declared[0].String())
}

// ForVersion returns a copy of the registry pinned to a single interface version.
//
// Every versioned contract is replaced by the interface it had at that version, while contracts
// with no declared history are carried over unchanged. The result is an ordinary
// ContractTLBRegistry, so version-unaware consumers (for example MessageEnvelope.LoadDecoded)
// work against a specific version without any signature change:
//
//	codec.WrapMessage(...).LoadDecoded(registry.ForVersion(semver.MustParse("1.6.2")))
func (r ContractTLBRegistry) ForVersion(version semver.Version) (ContractTLBRegistry, error) {
	pinned := make(ContractTLBRegistry, len(r))

	// Carry over every unversioned contract, and collect the versioned ones.
	versioned := make(map[FullyQualifiedName]struct{})
	for key := range r {
		contract, _, ok := ParseVersionKey(key)
		if ok {
			versioned[contract] = struct{}{}
			continue
		}
		pinned[key] = r[key]
	}

	for contract := range versioned {
		tlbs, ok, err := lookupTLBMapVersion(r, contract, version)
		if err != nil {
			return nil, err
		}
		if ok {
			pinned[contract] = tlbs
		}
		// No map for this version: fall back to the unversioned entry carried over above.
	}

	return pinned, nil
}

// lookupTLBMapVersion resolves the whole TLB map for a contract at a version.
func lookupTLBMapVersion(r ContractTLBRegistry, contract FullyQualifiedName, version semver.Version) (TLBMap, bool, error) {
	declared := r.DeclaredVersions(contract)
	if len(declared) == 0 {
		tlbs, ok := r[contract]
		return tlbs, ok, nil
	}

	for i := len(declared) - 1; i >= 0; i-- {
		if declared[i].GreaterThan(&version) {
			continue
		}
		if tlbs, ok := r[VersionKey(contract, *declared[i])]; ok {
			return tlbs, true, nil
		}
	}

	return nil, false, fmt.Errorf("%w: contract=%s requested=%s first-declared=%s",
		ErrNoInterfaceVersion, contract, version.String(), declared[0].String())
}

// WithInterfaceVersions adds version-qualified entries to the registry and returns it.
//
// versions maps a contract to its interface at each version at which that interface became
// current. The highest declared version must be the contract's current interface, so that
// resolving a version at or above it lands on the current bindings.
//
// The unversioned entry is left untouched, so version-unaware consumers keep resolving the
// current interface.
func (r ContractTLBRegistry) WithInterfaceVersions(versions map[FullyQualifiedName]map[semver.Version]TLBMap) ContractTLBRegistry {
	for contract, byVersion := range versions {
		for version, tlbs := range byVersion {
			r[VersionKey(contract, version)] = tlbs
		}
	}
	return r
}
