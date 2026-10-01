import "types"

type TokenAdminRegistryEntry_InMessage =
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_RegistrationInitialized
    | TokenAdminRegistryEntry_MessageFromRoot
    | TokenAdminRegistryEntry_UpgradeAndResume
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

/// Sent by the root with its compiled-in entry code. The entry installs the
/// code unless it is already running it, then resumes the deferred request.
// crc32('TokenAdminRegistryEntry_UpgradeAndResume')
struct (0x1fa23ab9) TokenAdminRegistryEntry_UpgradeAndResume {
    queryId: uint64;
    code: cell;
    request: Cell<TokenAdminRegistryEntry_MessageFromRoot>?;
}

/// Worst-case cost of a stale entry round trip: entry -> root, root -> entry
/// carrying the entry code, the upgrade itself and the self-sent Resume.
fun TokenAdminRegistryEntry_UpgradeAndResume.cost(): coins {
    return grams("0.02");
}

/// Self-message that replays a deferred request on the upgraded code.
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
