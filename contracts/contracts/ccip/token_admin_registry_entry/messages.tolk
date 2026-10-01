import "types"
import "../../lib/versioning/upgradeable"

type TokenAdminRegistryEntry_InMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_RegistrationInitialized
    | TokenAdminRegistryEntry_MessageFromRoot
    | Upgradeable_Upgrade
    | TokenAdminRegistryEntry_Resume;

/// Messages the root sends wrapped in TokenAdminRegistryEntry_MessageFromRoot.
type TokenAdminRegistryEntry_RootMessage =
    | TokenAdminRegistryEntry_ResolveTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool;

/// Envelope for every message the root sends to an entry. Its layout must
/// never change: the entry checks `minEntryVersion` before loading `content`,
/// so an older entry can defer and upgrade for messages it does not know.
// crc32('TokenAdminRegistryEntry_MessageFromRoot')
struct (0x558e7559) TokenAdminRegistryEntry_MessageFromRoot {
    queryId: uint64;
    minEntryVersion: uint16;
    content: Cell<TokenAdminRegistryEntry_RootMessage>;
}

/// Public read answered by the running code. CCIP resolves token info through
/// the root instead (TokenAdminRegistry_GetTokenInfo).
// crc32('TokenAdminRegistryEntry_GetTokenInfo')
struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {
    queryId: uint64;
}

fun TokenAdminRegistryEntry_GetTokenInfo.cost(responseHandlerCost: coins): coins {
    return
        + grams("0.002")
        + grams("0.019")
        + responseHandlerCost;
}

/// Sent by the root on behalf of `requester`. The entry answers the root with
/// TokenAdminRegistry_TokenInfoResolved.
// crc32('TokenAdminRegistryEntry_ResolveTokenInfo')
struct (0x4f60fff3) TokenAdminRegistryEntry_ResolveTokenInfo {
    /// Lets the root report an unregistered token from a bounce.
    token: address;
    requester: address;
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
// Sent only by Deployable_InitializeAndSend after initial state installation.
struct (0x31580269) TokenAdminRegistryEntry_RegistrationInitialized {
    queryId: uint64;
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
}

/// Value the root attaches to an Upgradeable_Upgrade sent to an entry.
fun TokenAdminRegistryEntry_upgradeCost(): coins {
    return grams("0.01");
}

/// Worst-case cost of a stale entry round trip: entry -> root, then root ->
/// entry with the Upgradeable_Upgrade and the Resume.
fun TokenAdminRegistryEntry_upgradeRoundTripCost(): coins {
    return grams("0.02");
}

/// Sent by the root right after an Upgradeable_Upgrade to replay a deferred request. TON
/// delivers both in order, so the request runs on the upgraded code. Its layout
/// must never change: an entry whose upgrade failed must still parse it.
// crc32('TokenAdminRegistryEntry_Resume')
struct (0x47d63a64) TokenAdminRegistryEntry_Resume {
    request: Cell<TokenAdminRegistryEntry_MessageFromRoot>;
}

// crc32('TokenAdminRegistryEntry_ReturnTokenInfo')
struct (0x0a58e678) TokenAdminRegistryEntry_ReturnTokenInfo {
    queryId: uint64;
    minterAddress: address
    tokenPool: address?
    version: uint32
}
