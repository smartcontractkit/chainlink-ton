import "types"
import "../../lib/versioning/upgradeable"
import "../../lib/jetton/messages"

type TokenAdminRegistryEntry_InMessage =
    | TokenAdminRegistryEntry_RegistrationInitialized
    | TokenAdminRegistryEntry_MessageFromRoot
    | Upgradeable_Upgrade
    | TokenAdminRegistryEntry_Resume
    | ResponseWalletAddress;

/// Messages the root sends wrapped in TokenAdminRegistryEntry_MessageFromRoot.
type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool
    | TokenAdminRegistryEntry_VerifyToken;

/// Envelope for every message the root sends to an entry. Its layout must
/// never change: the entry checks `minEntryVersion` before loading `content`,
/// so an older entry can defer and upgrade for messages it does not know.
// crc32('TokenAdminRegistryEntry_MessageFromRoot')
struct (0x558e7559) TokenAdminRegistryEntry_MessageFromRoot {
    queryId: uint64;
    minEntryVersion: uint16;
    content: Cell<TokenAdminRegistryEntry_RootMessage>;
}

/// Sent by the root on behalf of `requester`. The entry answers the root with
/// TokenAdminRegistryEntry_TokenInfo.
// crc32('TokenAdminRegistryEntry_GetTokenInfo')
struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {
    /// Lets the root report an unregistered token from a bounce.
    token: address;
    requester: address;
}

/// Entry answer to TokenAdminRegistryEntry_GetTokenInfo, relayed to
/// `requester` after the root validates the entry address.
// crc32('TokenAdminRegistryEntry_TokenInfo')
struct (0x4e1c9ad5) TokenAdminRegistryEntry_TokenInfo {
    queryId: uint64;
    token: address;
    requester: address;
    tokenInfo: Cell<TokenRegistry_TokenInfo>;
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
// Sent only by Deployable_InitializeAndSend after initial state installation.
struct (0x31580269) TokenAdminRegistryEntry_RegistrationInitialized {
    queryId: uint64;
}

/// Entry execution (~0.0003 TON measured), the event relay and the TEP-89 wallet query.
fun TokenAdminRegistryEntry_RegistrationInitialized.cost(): coins {
    return grams("0.002") + TokenAdminRegistryEntry_relayEventCost() + TokenAdminRegistryEntry_WALLET_QUERY_VALUE;
}

/// Value an entry attaches to an event it sends to the root to be emitted:
/// its forward fee and the root's execution and emit (~0.0006 TON measured).
/// Unspent value stays on the root.
fun TokenAdminRegistryEntry_relayEventCost(): coins {
    return grams("0.004");
}

/// Value the root deploys an entry with: the deploy forward fee and Deployable
/// initialization (~0.0016 TON measured), the RegistrationInitialized
/// self-message, and a 0.04 TON storage fee reserve that stays on the entry.
fun TokenAdminRegistryEntry_deployCost(): coins {
    return grams("0.04") + grams("0.008") + TokenAdminRegistryEntry_RegistrationInitialized.cost();
}

struct (0x6dcbe573) TokenAdminRegistryEntry_ProposeAdministrator {
    administrator: address
}

struct (0x8b1503cf) TokenAdminRegistryEntry_TransferAdminRole {
    /// Original sender of the root request. It is trusted only after the
    /// entry has verified that the immediate sender is the registry root.
    actor: address;
    newAdministrator: address?
}

struct (0x39c6e872) TokenAdminRegistryEntry_AcceptAdminRole {
    /// Original sender of the root request. See TransferAdminRole.actor.
    actor: address;
}

struct (0xa64e05c9) TokenAdminRegistryEntry_SetPool {
    /// Original sender of the root request. See TransferAdminRole.actor.
    actor: address;
    /// A null pool delists the token from CCIP.
    tokenPool: address?
    transferInitiator: address?
}

struct (0xa14b0288) TokenAdminRegistryEntry_VerifyToken {}

/// Value the root attaches to an Upgradeable_Upgrade sent to an entry. Today
/// the entry already runs the root's entry code and skips the reinstall
/// (~0.0014 TON measured, mostly the code forward fee). Re-measure with a real
/// code install, `migrate` and Upgradeable_UpgradedEvent when shipping a new
/// entry version.
fun TokenAdminRegistryEntry_upgradeCost(): coins {
    return grams("0.01");
}

/// Sent by the root right after an Upgradeable_Upgrade to replay a deferred request. TON
/// delivers both in order, so the request runs on the upgraded code. Its layout
/// must never change: an entry whose upgrade failed must still parse it.
// crc32('TokenAdminRegistryEntry_Resume')
struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
    request: Cell<TokenAdminRegistryEntry_MessageFromRoot>;
}
