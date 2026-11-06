// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"
import "errors"
import "../../lib/utils"
import "events"

import "../../lib/access/ownable_2step"
import "../../lib/versioning/upgradeable"
import "../../lib/funding/withdrawable"
import "@stdlib/gas-payments"
import "../../lib/deployable/types"
import "../token_admin_registry_entry/messages"
import "../token_admin_registry_entry/storage"
import "../token_admin_registry_entry/types"

tolk 1.4.2

/// Root contract for the sharded token-admin registry. It owns deployment
/// configuration for deterministic entries and is the future replacement for
/// the Router's token-registry administration surface.
///
/// Entries are upgraded on demand to the entry code compiled into this
/// contract: every request to an entry declares a minimum entry version, and a
/// stale entry round-trips the request through the root to get the new code.
contract TokenAdminRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenAdminRegistry"

    storage: TokenAdminRegistry_Storage
    incomingMessages: TokenAdminRegistry_InMessage | Ownable2Step_Messages
    thrownErrors: Ownable2Step_Error | TokenAdminRegistry_Error | Upgradeable_Error | Withdrawable_Error
}

const CONTRACT_VERSION = "1.6.0".literalSlice();
const RICH_BOUNCE_PREFIX = 0xfffffffe;
const WITHDRAW_RESERVE = ton("0.1");

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenAdminRegistry_InMessage.fromSlice(in.body);
    match (msg) {
        TokenAdminRegistry_RegisterToken => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            assert(in.valueCoins >= TokenAdminRegistry_RegisterToken.cost()) throw (TokenAdminRegistry_Error.InsufficientValue);
            registerToken(st, msg);
        }
        TokenAdminRegistry_OverridePendingAdministrator => {
            var st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw (TokenAdminRegistry_Error.InsufficientValue);
            overridePendingAdministrator(msg);
        }
        TokenAdminRegistry_TransferAdminRole => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw (TokenAdminRegistry_Error.InsufficientValue);
            transferAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_AcceptAdminRole => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost()) throw (TokenAdminRegistry_Error.InsufficientValue);
            acceptAdminRole(msg, in.senderAddress);
        }
        TokenAdminRegistry_SetPool => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost() + TokenAdminRegistryEntry_POOL_PROBE_VALUE) throw (TokenAdminRegistry_Error.InsufficientValue);
            setPool(msg, in.senderAddress);
        }
        TokenAdminRegistry_GetTokenInfo => {
            assert(in.valueCoins >= TokenAdminRegistry_GetTokenInfo.cost()) throw (TokenAdminRegistry_Error.InsufficientValue);
            forwardToEntry(msg.token, msg.queryID, TokenAdminRegistryEntry_GetTokenInfo {
                token: msg.token,
                requester: in.senderAddress,
            });
        }
        TokenAdminRegistryEntry_TokenInfo => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            relayTokenInfo(msg);
        }
        TokenAdminRegistry_EntryUpgradeRequest => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            upgradeAndResume(in.senderAddress, msg.queryID, msg.request, in.valueCoins);
        }
        TokenAdminRegistry_UpgradeRefund => {}
        TokenAdminRegistry_UpgradeEntry => {
            assert(in.valueCoins >= TokenAdminRegistryEntry_upgradeCost(entryCode())) throw (TokenAdminRegistry_Error.InsufficientValue);
            sendUpgrade(entryAddress(msg.tokenAddress).calculateAddress(), msg.queryID, 0, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        Upgradeable_Upgrade => {
            val st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Upgradeable{ migrate, version }.upgrade(msg);
        }
        Withdrawable_Withdraw => {
            val st = lazy TokenAdminRegistry_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{ reserve: WITHDRAW_RESERVE }.withdraw(msg);
        }
        TokenAdminRegistry_AdministratorTransferRequested => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitAdministratorTransferRequested(msg);
        }
        TokenAdminRegistry_AdministratorTransferred => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitAdministratorTransferred(msg);
        }
        TokenAdminRegistry_PoolSet => {
            val st = TokenAdminRegistry_Storage.load();
            requireEntrySender(st, msg.token, in.senderAddress);
            emitPoolSet(msg);
        }
        TokenAdminRegistry_VerifyToken => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost() + TokenAdminRegistryEntry_WALLET_QUERY_VALUE) throw (TokenAdminRegistry_Error.InsufficientValue);
            forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_VerifyToken { requester: in.senderAddress });
        }
        TokenAdminRegistry_RefreshPoolConfig => {
            assert(in.valueCoins >= TokenAdminRegistry_forwardCost() + TokenAdminRegistryEntry_POOL_PROBE_VALUE) throw (TokenAdminRegistry_Error.InsufficientValue);
            forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_RefreshPoolConfig { requester: in.senderAddress });
        }
        else => {
            var st = lazy TokenAdminRegistry_Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }
            assert (in.body.isEmpty()) throw (0xFFFF);
        }
    }
}

/// Requests to entries are rich-bounced, either on the first forward or on a Resume, and reported
/// to their sender with the unspent value. A first forward bounces when the token was never
/// registered. Bounced upgrades are not rich and keep their value on the root, as does any other
/// bounce.
fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.preloadUint(32) != RICH_BOUNCE_PREFIX) {
        return;
    }
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val bounced = lazy TokenAdminRegistry_BouncedEntryMessage.fromCell(rich.originalBody);
    var requestCell: Cell<TokenAdminRegistryEntry_MessageFromRoot>;
    match (bounced) {
        TokenAdminRegistryEntry_MessageFromRoot => { requestCell = rich.originalBody as Cell<TokenAdminRegistryEntry_MessageFromRoot>; }
        TokenAdminRegistryEntry_Resume => { requestCell = bounced.request; }
        else => { return; }
    }
    val request = requestCell.load();
    val content = request.content.load();
    if (content is TokenAdminRegistryEntry_GetTokenInfo) {
        createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: content.requester,
            body: TokenAdminRegistry_GetTokenInfoFailed {
                queryID: request.queryID,
                token: content.token,
            },
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        return;
    }
    createMessage({
        bounce: false,
        value: 0,
        dest: requestSender(content),
        body: TokenAdminRegistry_RequestFailed {
            queryID: request.queryID,
            errorCode: rich.exitCode,
            request: requestCell,
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun requestSender(content: TokenAdminRegistryEntry_RootMessage): address {
    return match (content) {
        TokenAdminRegistryEntry_GetTokenInfo => content.requester,
        TokenAdminRegistryEntry_ProposeAdministrator => TokenAdminRegistry_Storage.load().ownable.get_owner(),
        TokenAdminRegistryEntry_TransferAdminRole => content.actor,
        TokenAdminRegistryEntry_AcceptAdminRole => content.actor,
        TokenAdminRegistryEntry_SetPool => content.actor,
        TokenAdminRegistryEntry_VerifyToken => content.requester,
        TokenAdminRegistryEntry_RefreshPoolConfig => content.requester,
    };
}

/// Every entry event is relayed through the root. The token in the payload is
/// sufficient to recompute the only entry address that may send that event.
fun requireEntrySender(st: TokenAdminRegistry_Storage, token: address, sender: address) {
    val expectedEntry = entryAddress(token).calculateAddress();
    assert(sender == expectedEntry) throw (TokenAdminRegistry_Error.UnauthorizedEntry);
}

fun entryAddress(token: address): AutoDeployAddress {
    return TokenAdminRegistryEntry.deriveAddress(deployableCode(), token, contract.getAddress());
}

/// Forwards to an entry carrying all value, so a stale entry can fund its
/// upgrade round trip before handling the request.
fun forwardToEntry(token: address, queryID: uint64, content: TokenAdminRegistryEntry_RootMessage) {
    createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: entryAddress(token).calculateAddress(),
        body: TokenAdminRegistryEntry_MessageFromRoot {
            queryID,
            minEntryVersion: TokenAdminRegistryEntry_VERSION,
            content: content.toCell(),
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Answers a stale entry with an Upgradeable_Upgrade followed by the deferred request as a
/// Resume. TON delivers both in order, and the entry will not defer a Resume
/// again, so a failed upgrade bounces the request instead of looping.
///
/// The root's own balance pays for the upgrade. This is affordable for every entry because only the
/// owner registers tokens, which keeps the number of entries limited until self-registration is
/// rolled out. If the root can't pay, the Resume still goes out and fails on the stale entry, so
/// the request is reported as failed instead of left unanswered.
fun upgradeAndResume(entry: address, queryID: uint64, request: Cell<TokenAdminRegistryEntry_MessageFromRoot>, requestValue: coins) {
    val code = entryCode();
    val upgradeValue = TokenAdminRegistryEntry_upgradeCost(code);
    val (cells, bits, _) = code.calculateSizeStrict(TokenAdminRegistryEntry_MAX_CODE_CELLS);
    val upgradeFwdFee = 2 * calculateForwardFee(BASECHAIN, bits, cells + 1);
    if (contract.getOriginalBalance() - requestValue >= upgradeValue + upgradeFwdFee) {
        sendUpgrade(entry, queryID, upgradeValue, SEND_MODE_PAY_FEES_SEPARATELY);
    }
    createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: entry,
        body: TokenAdminRegistryEntry_Resume { request },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun sendUpgrade(dest: address, queryID: uint64, value: coins, mode: int) {
    createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value,
        dest,
        body: Upgradeable_Upgrade {
            queryID,
            code: entryCode(),
        },
    }).send(mode | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun relayTokenInfo(msg: TokenAdminRegistryEntry_TokenInfo) {
    val tokenInfo = msg.tokenInfo.load();

    // `tokenPool` and `admission` are written together by `onPoolConfig`. If either is missing
    // (delisted, or still waiting for the probe), publish no pool info; a non-null pool without
    // an admission is treated as not enabled instead of inventing a zero budget.
    var poolInfo: Cell<TokenAdminRegistry_PoolInfo>? = null;
    if (tokenInfo.tokenPool != null && tokenInfo.admission != null) {
        poolInfo = TokenAdminRegistry_PoolInfo {
            tokenPool: tokenInfo.tokenPool,
            transferInitiator: tokenInfo.transferInitiator,
            admission: tokenInfo.admission,
        }.toCell();
    }

    createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: msg.requester,
        body: TokenAdminRegistry_TokenInfo {
            queryID: msg.queryID,
            token: msg.token,
            version: tokenInfo.version,
            poolInfo,
        },
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun emitAdministratorTransferRequested(event: TokenAdminRegistry_AdministratorTransferRequested) {
    emit(ADMINISTRATOR_TRANSFER_REQUESTED_TOPIC, event);
}

fun emitAdministratorTransferred(event: TokenAdminRegistry_AdministratorTransferred) {
    emit(ADMINISTRATOR_TRANSFERRED_TOPIC, event);
}

fun emitPoolSet(event: TokenAdminRegistry_PoolSet) {
    emit(POOL_SET_TOPIC, event);
}

/// Deploys a deterministic shard with an unclaimed administrator proposal.
///
/// This is intentionally create-only. Callers resolve the outcome by deriving
/// the entry address and reading its config after finality; retrying this
/// message against an existing entry is expected to fail in Deployable.
///
/// The entry then queries the token with TEP-89 and stays disabled until the token
/// answers with a wallet. See TokenAdminRegistry_VerifyToken to query again.
fun registerToken(st: TokenAdminRegistry_Storage, msg: TokenAdminRegistry_RegisterToken) {
    val deployMsg = createMessage({
        bounce: BounceMode.NoBounce,
        value: TokenAdminRegistryEntry_deployCost(),
        dest: entryAddress(msg.tokenAddress),
        body: Deployable_InitializeAndSend {
            stateInit: {
                code: entryCode(),
                data: TokenRegistry_Storage {
                    tokenAddress: msg.tokenAddress,
                    tokenInfo: msg.tokenInfo,
                    adminConfig: TokenRegistry_AdminConfig {
                        tokenAdminRegistry: contract.getAddress(),
                        administrator: null,
                        pendingAdministrator: msg.administrator,
                    }.toCell(),
                }.toCell(),
            },
            // The entry emits the initial proposal event after its state is
            // installed. This is not a second root-to-entry operation.
            selfMessage: {
                value: TokenAdminRegistryEntry_RegistrationInitialized.cost(),
                body: TokenAdminRegistryEntry_RegistrationInitialized {
                    queryID: msg.queryID,
                }.toCell(),
            },
        },
    });
    deployMsg.send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Replaces an unaccepted administrator proposal. The shard enforces that no
/// active administrator exists, so this cannot reclaim a configured token.
fun overridePendingAdministrator(msg: TokenAdminRegistry_OverridePendingAdministrator) {
    forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_ProposeAdministrator {
        administrator: msg.administrator,
    });
}

/// The root is the only public ingress for entry administration. It derives
/// the shard and forwards the original caller as `actor`; the entry remains
/// responsible for checking its own active/pending administrator state.
fun transferAdminRole(msg: TokenAdminRegistry_TransferAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_TransferAdminRole {
        actor,
        newAdministrator: msg.newAdministrator,
    });
}

fun acceptAdminRole(msg: TokenAdminRegistry_AcceptAdminRole, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_AcceptAdminRole {
        actor,
    });
}

fun setPool(msg: TokenAdminRegistry_SetPool, actor: address) {
    forwardToEntry(msg.tokenAddress, msg.queryID, TokenAdminRegistryEntry_SetPool {
        actor,
        tokenPool: msg.tokenPool,
    });
}

import "../../../gen/Deployable.code"
import "../../../gen/TokenAdminRegistryEntry.code"

fun deployableCode(): cell {
    return deployableCompiledCode();
}

fun entryCode(): cell {
    return tokenAdminRegistryEntryCompiledCode();
}

/// Value TokenAdminRegistry_UpgradeEntry needs, and what the root spends on a lazy entry upgrade.
get fun entryUpgradeCost(): coins {
    return TokenAdminRegistryEntry_upgradeCost(entryCode());
}

/// Gets the current owner of the registry root.
get fun owner(): address {
    val st = lazy TokenAdminRegistry_Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the registry root, if any.
get fun pendingOwner(): address? {
    val st = lazy TokenAdminRegistry_Storage.load();
    return st.ownable.get_pendingOwner();
}

// Implement on future versions to upgrade this contract to
@method_id(1000)
fun migrate(storage: cell, version: slice): cell {
    throw Upgradeable_Error.VersionMismatch
}

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun typeAndVersion(): (slice, slice) {
    return (TokenAdminRegistry_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}
