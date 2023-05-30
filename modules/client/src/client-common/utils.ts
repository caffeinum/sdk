import {
  IDAO,
  PluginRepo__factory,
  PluginSetupProcessor,
  PluginSetupProcessor__factory,
} from "@aragon/osx-ethers";
import { ContractReceipt } from "@ethersproject/contracts";
import { VoteValues, VotingMode } from "./types/plugin";
import {
  CreateMajorityVotingProposalParams,
  IComputeStatusProposal,
  ProposalStatus,
} from "./types/plugin";

import { Interface } from "@ethersproject/abi";
import { id } from "@ethersproject/hash";
import { Log } from "@ethersproject/providers";
import {
  InvalidAddressError,
  InvalidVotingModeError,
  PluginInstallationPreparationError,
} from "@aragon/sdk-common";
import {
  ApplyInstallationParams,
  DecodedApplyInstallationParams,
  MetadataAbiInput,
  PrepareInstallationParams,
  PrepareInstallationStep,
  PrepareInstallationStepValue,
  SupportedNetwork,
} from "./types";
import { defaultAbiCoder, Result } from "@ethersproject/abi";
import { keccak256 } from "@ethersproject/keccak256";
import { AddressZero } from "@ethersproject/constants";
import { IClientWeb3Core } from "./interfaces";
import { LIVE_CONTRACTS } from "./constants";
import { isAddress } from "@ethersproject/address";

export function unwrapProposalParams(
  params: CreateMajorityVotingProposalParams,
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
  if (proposal.executed) {
    return ProposalStatus.EXECUTED;
  }
  if (startDate >= now) {
    return ProposalStatus.PENDING;
  }
  if (proposal.potentiallyExecutable || proposal.earlyExecutable) {
    return ProposalStatus.SUCCEEDED;
  }
  if (endDate >= now) {
    return ProposalStatus.ACTIVE;
  }
  return ProposalStatus.DEFEATED;
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
      where = { startDate_lt: now, endDate_gte: now, executed: false };
      break;
    case ProposalStatus.EXECUTED:
      where = { executed: true };
      break;
    case ProposalStatus.SUCCEEDED:
      where = { potentiallyExecutable: true, endDate_lt: now };
      break;
    case ProposalStatus.DEFEATED:
      where = {
        potentiallyExecutable: false,
        endDate_lt: now,
        executed: false,
      };
      break;
    default:
      throw new Error("invalid proposal status");
  }
  return where;
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

export function applyInstallatonParamsToContract(
  params: ApplyInstallationParams,
): PluginSetupProcessor.ApplyInstallationParamsStruct {
  return {
    plugin: params.pluginAddress,
    pluginSetupRef: {
      pluginSetupRepo: params.pluginRepo,
      versionTag: params.versionTag,
    },
    helpersHash: keccak256(
      defaultAbiCoder.encode(["address[]"], [params.helpers]),
    ),
    permissions: params.permissions.map((permission) => {
      return { ...permission, condition: permission.condition || AddressZero };
    }),
  };
}

export function applyInstallatonParamsFromContract(
  result: Result,
): DecodedApplyInstallationParams {
  const params = result[1];
  return {
    helpersHash: params.helpersHash,
    permissions: params.permissions,
    versionTag: params.pluginSetupRef.versionTag,
    pluginAddress: params.plugin,
    pluginRepo: params.pluginSetupRef.pluginSetupRepo,
  };
}

export function getNamedTypesFromMetadata(
  inputs: MetadataAbiInput[] = [],
): string[] {
  return inputs.map((input) => {
    if (input.type.startsWith("tuple")) {
      const tupleResult = getNamedTypesFromMetadata(input.components).join(
        ", ",
      );

      let tupleString = `tuple(${tupleResult})`;

      if (input.type.endsWith("[]")) {
        tupleString = tupleString.concat("[]");
      }

      return tupleString;
    } else if (input.type.endsWith("[]")) {
      const baseType = input.type.slice(0, -2);
      return `${baseType}[] ${input.name}`;
    } else {
      return `${input.type} ${input.name}`;
    }
  });
}

export async function* prepareGenericInstallation(
  web3: IClientWeb3Core,
  params: PrepareInstallationParams,
): AsyncGenerator<PrepareInstallationStepValue> {
  // todo web 3 as params
  const signer = web3.getConnectedSigner();
  const provider = web3.getProvider();
  if (!isAddress(params.pluginRepo)) {
    throw new InvalidAddressError();
  }
  const networkName = (await provider.getNetwork()).name as SupportedNetwork;
  let version = params.version;
  // if version is not specified install latest version
  if (!version) {
    const pluginRepo = PluginRepo__factory.connect(
      params.pluginRepo,
      signer,
    );
    const currentRelease = await pluginRepo.latestRelease();
    const latestVersion = await pluginRepo["getLatestVersion(uint8)"](
      currentRelease,
    );
    version = latestVersion.tag;
  }
  // encode installation params
  const { installationParams = [], installationAbi = [] } = params;
  const data = defaultAbiCoder.encode(
    getNamedTypesFromMetadata(installationAbi),
    installationParams,
  );
  // connect to psp contract
  const pspContract = PluginSetupProcessor__factory.connect(
    LIVE_CONTRACTS[networkName].pluginSetupProcessor,
    signer,
  );
  const tx = await pspContract.prepareInstallation(params.daoAddressOrEns, {
    pluginSetupRef: {
      pluginSetupRepo: params.pluginRepo,
      versionTag: version,
    },
    data,
  });

  yield {
    key: PrepareInstallationStep.PREPARING,
    txHash: tx.hash,
  };

  const receipt = await tx.wait();
  const pspContractInterface = PluginSetupProcessor__factory
    .createInterface();
  const log = findLog(
    receipt,
    pspContractInterface,
    "InstallationPrepared",
  );
  if (!log) {
    throw new PluginInstallationPreparationError();
  }
  const parsedLog = pspContractInterface.parseLog(log);
  const pluginAddress = parsedLog.args["plugin"];
  const preparedSetupData = parsedLog.args["preparedSetupData"];
  if (!(pluginAddress || preparedSetupData)) {
    throw new PluginInstallationPreparationError();
  }

  yield {
    key: PrepareInstallationStep.DONE,
    pluginAddress,
    pluginRepo: params.pluginRepo,
    versionTag: version,
    permissions: preparedSetupData.permissions,
    helpers: preparedSetupData.helpers,
  };
}
