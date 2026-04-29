import '@ton/test-utils'
import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../wrappers/utils'

import * as sendExecutor from '../wrappers/ccip/CCIPSendExecutor'
import * as fq from '../wrappers/ccip/FeeQuoter'
import * as mr from '../wrappers/ccip/MerkleRoot'
import * as offr from '../wrappers/ccip/OffRamp'
import * as onr from '../wrappers/ccip/OnRamp'
import * as rx from '../wrappers/ccip/ReceiveExecutor'
import * as rt from '../wrappers/ccip/Router'
import * as rece from '../wrappers/examples/Receiver'

import * as deployable from '../wrappers/libraries/Deployable'
import * as rec from '../wrappers/libraries/Receiver'
import * as ownable2step from '../wrappers/libraries/access/Ownable2Step'
import * as withdrawable from '../wrappers/libraries/funding/Withdrawable'
import * as upgradeable from '../wrappers/libraries/versioning/Upgradeable'
import * as ocr from '../wrappers/libraries/ocr/MultiOCR3Base'
import * as mmp from '../wrappers/libraries/merkle_proof/MerkleMultiProof'
import * as ocrbase from '../wrappers/libraries/ocr/MultiOCR3Base'
import * as utils from '../wrappers/libraries/utils/Utils'

import * as ac from '../wrappers/lib/access/AccessControl'
import * as mcms from '../wrappers/mcms/MCMS'
import * as rbact from '../wrappers/mcms/RBACTimelock'

describe('Exit Codes', () => {
  it('should have correct facility IDs and error codes', () => {
    const cases = [
      {
        facilityId: sendExecutor.FACILITY_ID,
        facilityName: sendExecutor.FACILITY_NAME,
        errorCode: sendExecutor.ERROR_CODE,
        error0: sendExecutor.error.StateNotExpected,
      },
      {
        facilityId: fq.FACILITY_ID,
        facilityName: fq.FACILITY_NAME,
        errorCode: fq.ERROR_CODE,
        error0: fq.errors.UnsupportedChainFamilySelector,
      },
      {
        facilityId: mr.FACILITY_ID,
        facilityName: mr.FACILITY_NAME,
        errorCode: mr.ERROR_CODE,
        error0: mr.MerkleRootError.AlreadyExecuted,
      },
      {
        facilityId: offr.FACILITY_ID,
        facilityName: offr.FACILITY_NAME,
        errorCode: offr.ERROR_CODE,
        error0: offr.OffRampError.MessageNotFromOwnedContract,
      },
      {
        facilityId: onr.FACILITY_ID,
        facilityName: onr.FACILITY_NAME,
        errorCode: onr.ERROR_CODE,
        error0: onr.Errors.UnknownDestChainSelector,
      },
      {
        facilityId: rx.FACILITY_ID,
        facilityName: rx.FACILITY_NAME,
        errorCode: rx.ERROR_CODE,
        error0: rx.Errors.StateIsNotUntouched,
      },
      {
        facilityId: rt.FACILITY_ID,
        facilityName: rt.FACILITY_NAME,
        errorCode: rt.ERROR_CODE,
        error0: rt.RouterError.DestChainNotEnabled,
      },
      {
        facilityId: rece.FACILITY_ID,
        facilityName: rece.FACILITY_NAME,
        errorCode: rece.ERROR_CODE,
        error0: rece.error.Rejected,
      },
      {
        facilityId: rec.FACILITY_ID,
        facilityName: rec.FACILITY_NAME,
        errorCode: rec.ERROR_CODE,
        error0: rec.error.Unauthorized,
      },
      {
        facilityId: ownable2step.FACILITY_ID,
        facilityName: ownable2step.FACILITY_NAME,
        errorCode: ownable2step.ERROR_CODE,
        error0: ownable2step.Errors.OnlyCallableByOwner,
      },
      {
        facilityId: withdrawable.FACILITY_ID,
        facilityName: withdrawable.FACILITY_NAME,
        errorCode: withdrawable.ERROR_CODE,
        error0: withdrawable.Error.InsufficientBalance,
      },
      {
        facilityId: upgradeable.FACILITY_ID,
        facilityName: upgradeable.FACILITY_NAME,
        errorCode: upgradeable.ERROR_CODE,
        error0: upgradeable.Error.VersionMismatch,
      },
      {
        facilityId: ocr.FACILITY_ID,
        facilityName: ocr.FACILITY_NAME,
        errorCode: ocr.ERROR_CODE,
        error0: ocr.Errors.BigFMustBePositive,
      },
      {
        facilityId: deployable.FACILITY_ID,
        facilityName: deployable.FACILITY_NAME,
        errorCode: deployable.ERROR_CODE,
        error0: deployable.Errors.ErrorNotOwner,
      },
      {
        facilityId: mmp.FACILITY_ID,
        facilityName: mmp.FACILITY_NAME,
        errorCode: mmp.ERROR_CODE,
        error0: mmp.Errors.InvalidProofLeavesCannotBeEmpty,
      },
      {
        facilityId: ocrbase.FACILITY_ID,
        facilityName: ocrbase.FACILITY_NAME,
        errorCode: ocrbase.ERROR_CODE,
        error0: ocrbase.Errors.BigFMustBePositive,
      },
      {
        facilityId: utils.FACILITY_ID,
        facilityName: utils.FACILITY_NAME,
        errorCode: utils.ERROR_CODE,
        error0: utils.Errors.InvalidData,
      },
      // MCMS
      {
        facilityId: ac.FACILITY_ID,
        facilityName: ac.FACILITY_NAME,
        errorCode: ac.ERROR_CODE,
        error0: ac.Error.UnauthorizedAccount,
      },
      {
        facilityId: mcms.FACILITY_ID,
        facilityName: mcms.FACILITY_NAME,
        errorCode: mcms.ERROR_CODE,
        error0: mcms.Error.OutOfBoundsNumSigners,
      },
      {
        facilityId: rbact.FACILITY_ID,
        facilityName: rbact.FACILITY_NAME,
        errorCode: rbact.ERROR_CODE,
        error0: rbact.Error.SelectorIsBlocked,
      },
    ]

    for (const { facilityId: id, facilityName, errorCode: ec, error0 } of cases) {
      expect(id).toEqual(facilityId(crc32(facilityName)))
      expect(ec).toEqual(errorCode(crc32(facilityName)))
      expect(error0).toEqual(errorCode(crc32(facilityName)))
    }
  })
})
