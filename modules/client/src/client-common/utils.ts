import { IDAO } from "@aragon/core-contracts-ethers";
import { ContractReceipt } from "@ethersproject/contracts";
import { VoteValues, VotingMode } from "../client-common/interfaces/plugin";
import {
  IComputeStatusProposal,
  ICreateProposalParams,
  ProposalStatus,
} from "./interfaces/plugin";

import { Interface } from "@ethersproject/abi";
import { id } from "@ethersproject/hash";
import { Log } from "@ethersproject/providers";
import { InvalidVotingModeError } from "@aragon/sdk-common";
import { formatEther } from "@ethersproject/units";
import { InvalidPrecisionError } from "@aragon/sdk-common";

export function unwrapProposalParams(
  params: ICreateProposalParams,
): [string, IDAO.ActionStruct[], number, number, boolean, number] {
  return [
    params.metadataUri,
    params.actions ?? [],
    // TODO: Verify => seconds?
    params.startDate ? Math.floor(params.startDate.getTime() / 1000) : 0,
    // TODO: Verify => seconds?
    params.endDate ? Math.floor(params.endDate.getTime() / 1000) : 0,
    params.executeOnPass ?? false,
    params.creatorVote ?? VoteValues.ABSTAIN,
  ];
}

export function computeProposalStatus(
  proposal: IComputeStatusProposal,
): ProposalStatus {
  const now = new Date();
  const startDate = new Date(
    parseInt(proposal.startDate) * 1000,
  );
  const endDate = new Date(parseInt(proposal.endDate) * 1000);
  if (startDate >= now) {
    return ProposalStatus.PENDING;
  } else if (endDate >= now) {
    return ProposalStatus.ACTIVE;
  } else if (proposal.executed) {
    return ProposalStatus.EXECUTED;
  } else if (
    proposal.executable
  ) {
    return ProposalStatus.SUCCEEDED;
  } else {
    return ProposalStatus.DEFEATED;
  }
}

export function computeProposalStatusFilter(
  status: ProposalStatus,
): Object {
  let where = {};
  const now = Math.round(new Date().getTime() / 1000).toString();
  switch (status) {
    case ProposalStatus.PENDING:
      where = { startDate_gte: now };
      break;
    case ProposalStatus.ACTIVE:
      where = { startDate_lt: now, endDate_gte: now };
      break;
    case ProposalStatus.EXECUTED:
      where = { executed: true };
      break;
    case ProposalStatus.SUCCEEDED:
      where = { executable: true, endDate_lt: now };
      break;
    case ProposalStatus.DEFEATED:
      where = { executable: false, endDate_lt: now };
      break;
    default:
      throw new Error("invalid proposal status");
  }
  return where;
}

export function isProposalId(proposalId: string): boolean {
  const regex = new RegExp(/^0x[A-Fa-f0-9]{40}_0x[A-Fa-f0-9]{1,}$/i);
  return regex.test(proposalId);
}
export function isIpfsUri(ipfsUri: string): boolean {
  const regex = new RegExp(
    /^ipfs:\/\/((Qm([1-9A-HJ-NP-Za-km-z]{44,})|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,}))(\/[A-Za-z0-9-._~!$&'()*+,;=:@]+)*$/,
  );
  return regex.test(ipfsUri);
}

export function findLog(
  receipt: ContractReceipt,
  iface: Interface,
  eventName: string,
): Log | undefined {
  return receipt.logs.find(
    (log) =>
      log.topics[0] ===
        id(
          iface.getEvent(eventName).format(
            "sighash",
          ),
        ),
  );
}

export function votingModeToContracts(votingMode: VotingMode): number {
  switch (votingMode) {
    case VotingMode.STANDARD:
      return 0;
    case VotingMode.EARLY_EXECUTION:
      return 1;
    case VotingMode.VOTE_REPLACEMENT:
      return 2;
    default:
      throw new InvalidVotingModeError();
  }
}
export function votingModeFromContracts(votingMode: number): VotingMode {
  switch (votingMode) {
    case 0:
      return VotingMode.STANDARD;
    case 1:
      return VotingMode.EARLY_EXECUTION;
    case 2:
      return VotingMode.VOTE_REPLACEMENT;
    default:
      throw new InvalidVotingModeError();
  }
}

export function parseEtherRatio(ether: string, precision: number = 2): number {
  if (precision <= 0 || !Number.isInteger(precision)) {
    throw new InvalidPrecisionError();
  }
  return parseFloat(
    parseFloat(
      formatEther(ether),
    ).toFixed(precision),
  );
}

export function isEnsName(ensName: string): boolean {
  const regex = new RegExp(
    /(([-a-z0-9]{1,256})\.)*(eth)$/,
  );
  return regex.test(ensName);
}

export function isPermission(permission: string): boolean {
  const regex = new RegExp(
    /^[A-Z]+(?:_[A-Z]+)*$/,
  );
  return regex.test(permission);
}
