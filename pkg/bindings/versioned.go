package bindings

import (
	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	offrampv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/offramp"
	onrampv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/onramp"
	routerv160 "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/v1_6_0/router"
)

// Interface versions. These are the releases in which a contract's interface became current.
//
// version1_6_0 is where the pre-c6655369 interfaces became current (the contracts/1.6.2 tag).
//
// version1_6_3 is where the current interfaces became current. c6655369 itself did not bump the
// package version — it landed on main as "1.6.2" and the bump to 1.6.3 came with the next release,
// which is what the upgrade pipeline targets. So the outgoing interfaces are in force up to
// (but excluding) 1.6.3, and a 1.6.2 request must still resolve the frozen snapshot.
var (
	version1_6_0 = semver.MustParse("1.6.0")
	version1_6_3 = semver.MustParse("1.6.3")
)

// VersionedInterfaces declares, per contract, the interface that was current at each version.
//
// A contract absent from this map has never changed: its current interface (the unversioned
// Registry entry) serves every version. A contract present here resolves
// "greatest declared version <= requested", so a message authored against an older interface keeps
// encoding correctly.
//
// The highest declared version must hold the contract's current interface, so requests at or above
// it land on the current bindings.
//
// Adding a checkpoint is a two-line change: an entry for the outgoing interface, and an entry for
// the new current interface. See cciplib/ccip/bindings/README.md.
var VersionedInterfaces = map[tvm.FullyQualifiedName]map[semver.Version]tvm.TLBMap{
	// OnRamp: c6655369 removed OnRamp_UpdateSendExecutor (0x82901c45) and restructured storage.
	TypeOnRamp: {
		*version1_6_0: onrampv160.TLBs, // serves 1.6.0 .. <1.6.3
		*version1_6_3: onramp.TLBs,     // current interface
	},

	// OffRamp: c6655369 changed the OffRamp message and storage layouts.
	TypeOffRamp: {
		*version1_6_0: offrampv160.TLBs, // serves 1.6.0 .. <1.6.3
		*version1_6_3: offramp.TLBs,     // current interface
	},

	// Router: c6655369 added a leading `queryId` to Router_RouteMessage and
	// Router_CCIPReceiveConfirm, which shifts every following field.
	TypeRouter: {
		*version1_6_0: routerv160.TLBs, // serves 1.6.0 .. <1.6.3
		*version1_6_3: router.TLBs,     // current interface
	},
}
