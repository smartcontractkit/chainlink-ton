// SPDX-License-Identifier: BUSL-1.1
import "../../lib/access/access_control"
import "../../lib/access/ownable_2step"
import "../../lib/utils"

const RMNREMOTE_GLOBAL_CURSE_SUBJECT =  0x01000000000000000000000000000001
const CURSE_ROLE = 0xb3c5b7cb9096e539f419cdc795a52c8cbe8dfbc9e27f70077d0b9749efe27fc5; // keccak256('CURSE_ROLE')
const UNCURSE_ROLE = 0x19331e9591f40b6bd5c2716faeab95f6a63184877fab2619bf484155c597abf0; // keccak256('UNCURSE_ROLE')

/// CursePolicy handles , role-backed curse/uncurse authority,
/// and the set of cursed subjects.
///
/// Enforcement is centralized in the Router: every lock-or-burn and
/// release-or-mint reaches a pool through it, so cursing the Router halts all
/// token movement. Pool-local policies are not propagated and
/// exist so that a pool operator can run a policy of its own.
///
/// Having an `admin` mirrors the EVM RMNProxy's owner 
/// that can by itself curse/uncurse and grant/revoke roles.
/// It is never written into `rbac`, that way revoking the last
/// explicit `DEFAULT_ADMIN_ROLE` member cannot lock the policy.

struct CursePolicy {
    admin: Ownable2Step;
    rbac: Cell<AccessControl_Data>;
    cursedSubjects: CursedSubjects;
}

fun CursePolicy.hookTrait__AccessControl(self): AccessControl<null?> {
    return AccessControl<null?> { data: AccessControl_Data.fromCell(self.rbac), context: null, hooks: null };
}

/// Because admin is not written into rbac, `hasRole` under-reports:
/// use `canCurse`/`canUncurse` to answer "who may
/// curse?". A renounce from `admin` is a no-op; it must transfer instead.
fun CursePolicy.canCurse(self, account: address): bool {
    if (account == self.admin.get_owner()) { return true; }
    return self.hookTrait__AccessControl().hasRole(CURSE_ROLE, account);
}

fun CursePolicy.canUncurse(self, account: address): bool {
    if (account == self.admin.get_owner()) { return true; }
    return self.hookTrait__AccessControl().hasRole(UNCURSE_ROLE, account);
}

fun CursePolicy.requireCurseRole(self, sender: address) {
    if (sender == self.admin.get_owner()) { return; }
    self.hookTrait__AccessControl().requireRole(CURSE_ROLE, sender);
}

fun CursePolicy.requireUncurseRole(self, sender: address) {
    if (sender == self.admin.get_owner()) { return; }
    self.hookTrait__AccessControl().requireRole(UNCURSE_ROLE, sender);
}

/// Authorizes a role grant or revocation. `admin` is accepted only for roles
/// administered by `DEFAULT_ADMIN_ROLE`.
fun CursePolicy.requireRoleAdmin(self, role: uint256, sender: address) {
    val rbac = self.hookTrait__AccessControl();
    val adminRole = rbac.getRoleAdmin(role);
    if (sender == self.admin.get_owner() && adminRole == DEFAULT_ADMIN_ROLE) { return; }
    rbac.requireRole(adminRole, sender);
}

/// Cannot be delegated to `AccessControl.onInternalMessage`: that path
/// authorizes against the role admin only and would reject `admin` acting as
/// implicit `DEFAULT_ADMIN_ROLE`. `renounceRole` is self-service, so it stays
/// on the lib path.
fun CursePolicy.onAccessControlMessage(mutate self, sender: address, body: slice) {
    var rbac = self.hookTrait__AccessControl();
    val msg = lazy AccessControl_InMessage.fromSlice(body);
    match (msg) {
        AccessControl_GrantRole => {
            self.requireRoleAdmin(msg.role, sender);
            rbac._grantRole(msg.queryId, sender, msg.role, msg.account, true);
        }
        AccessControl_RevokeRole => {
            self.requireRoleAdmin(msg.role, sender);
            rbac._revokeRole(msg.queryId, sender, msg.role, msg.account, true);
        }
        AccessControl_RenounceRole => {
            rbac.renounceRole(msg.queryId, sender, msg.role, msg.callerConfirmation, true);
        }
        else => {
            throw 0xFFFF;
        }
    }
    self.rbac = rbac.data.toCell();
}

/// Two-step transfer of the curse administrator, leaving the host contract's
/// own ownership untouched.
fun CursePolicy.onOwnableMessage(mutate self, sender: address, body: slice): bool {
    return self.admin.onInternalMessage(sender, body);
}

/// Curses every subject in `subjects`. Callers that need per-subject side
/// effects (events, forwarding) should iterate themselves and call
/// `cursedSubjects.curse` directly.
fun CursePolicy.curseAll(mutate self, subjects: SnakedCell<uint128>) {
    var it = subjects.iter();
    while (!it.empty()) {
        self.cursedSubjects.curse(it.next());
    }
}

/// Uncurses every subject in `subjects`. See `curseAll` for the per-subject case.
fun CursePolicy.uncurseAll(mutate self, subjects: SnakedCell<uint128>) {
    var it = subjects.iter();
    while (!it.empty()) {
        self.cursedSubjects.uncurse(it.next());
    }
}

/// An unseeded policy: no explicit role members, no cursed subjects.
fun CursePolicy.empty(admin: Ownable2Step): CursePolicy {
    return { admin, rbac: AccessControl_Data { roles: [] }.toCell(), cursedSubjects: CursedSubjects {} };
}

fun CursePolicy.newWithAdmin(admin: address): CursePolicy {
    return CursePolicy.empty(Ownable2Step { owner: admin, pendingOwner: null });
}

struct CursedSubjects {
    data: map<uint128, ()> = [];
}

fun CursedSubjects.curse(mutate self, subject: uint128) {
    self.data.addIfNotExists(subject, ());
}
fun CursedSubjects.uncurse(mutate self, subject: uint128) {
    self.data.delete(subject);
}
fun CursedSubjects.isCursed(self, subject: uint128) {
    // fastpath, majority of the time there's no curse
    if (self.data.isEmpty()) { return false; }
    val isGlobalCursed = self.data.exists(RMNREMOTE_GLOBAL_CURSE_SUBJECT);
    if (isGlobalCursed) {
        return true;
    }
    return self.data.exists(subject);
}


