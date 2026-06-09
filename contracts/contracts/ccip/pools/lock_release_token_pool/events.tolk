// SPDX-License-Identifier: BUSL-1.1

const LOCKED_OR_BURNED_TOPIC = stringCrc32("LockReleaseTokenPool_LockedOrBurned");
const RELEASED_OR_MINTED_TOPIC = stringCrc32("LockReleaseTokenPool_ReleasedOrMinted");
const RAMP_ACCESS_UPDATED_TOPIC = stringCrc32("LockReleaseTokenPool_RampAccessUpdated");
const CURSED_SUBJECTS_UPDATED_TOPIC = stringCrc32("LockReleaseTokenPool_CursedSubjectsUpdated");

struct LockedOrBurnedDetails {
    token: address;
    sender: address;
    amount: uint256;
}

struct LockedOrBurned {
    remoteChainSelector: uint64;
    details: Cell<LockedOrBurnedDetails>;
}

struct ReleasedOrMintedDetails {
    token: address;
    amount: uint256;
    participants: Cell<ReleasedOrMintedParticipants>;
}

struct ReleasedOrMintedParticipants {
    sender: address;
    recipient: address;
}

struct ReleasedOrMinted {
    remoteChainSelector: uint64;
    details: Cell<ReleasedOrMintedDetails>;
}

struct RampAccessUpdated {
    remoteChainSelector: uint64;
    onRamp: address? = null;
    offRamp: address? = null;
}
