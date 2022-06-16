import {
  IClientErc20,
  ICreateProposalParams,
  IErc20FactoryParams,
  IWithdrawParams,
  ProposalCreationSteps,
  ProposalCreationStepValue,
  VoteOptions,
  VotingConfig,
} from "./internal/interfaces/plugins";
import {
  DAO__factory,
  ERC20Voting__factory,
  // GovernanceERC20__factory,
  IDAO,
} from "@aragon/core-contracts-ethers";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { ClientCore } from "./internal/core";
import {
  DaoAction,
  DaoConfig,
  FactoryInitParams,
} from "./internal/interfaces/common";
import { Context } from "./context";

/**
 * Provider a generic client with high level methods to manage and interact with DAO's
 */
export class ClientErc20 extends ClientCore implements IClientErc20 {
  private _pluginAddress: string;

  constructor(pluginAddress: string, context: Context) {
    super(context);

    if (!pluginAddress) {
      throw new Error("An address for the plugin is required");
    }
    this._pluginAddress = pluginAddress;
  }

  //// HIGH LEVEL HANDLERS

  /** Contains all the generic high level methods to interact with a DAO */
  methods = {
    createProposal: (params: ICreateProposalParams) =>
      this._createProposal(params),
    voteProposal: (proposalId: string, vote: VoteOptions) =>
      this._voteProposal(proposalId, vote),
    executeProposal: (proposalId: string) => this._executeProposal(proposalId),
    setDaoConfig: (address: string, config: DaoConfig) =>
      this._setDaoConfig(address, config),
    setVotingConfig: (address: string, config: VotingConfig) =>
      this._setVotingConfig(address, config),
  };

  //// ACTION BUILDERS

  /** Contains the helpers to encode actions and parameters that can be passed as a serialized buffer on-chain */
  encoding = {
    /** Computes the parameters to be given when creating the DAO, as the initialization for the plugin */
    init: (params: IErc20FactoryParams) => this._buildActionInit(params),
    /** Computes the action payload to pass upon proposal creation */
    withdrawAction: (to: string, value: bigint, params: IWithdrawParams) =>
      this._buildActionWithdraw(to, value, params),
  };

  //// ESTIMATION HANDLERS

  /** Contains the gas estimation of the Ethereum transactions */
  estimation = {
    createProposal: (params: ICreateProposalParams) =>
      this._estimateCreateProposal(params),
    voteProposal: (proposalId: string, vote: VoteOptions) =>
      this._estimateVoteProposal(proposalId, vote),
    executeProposal: (proposalId: string) =>
      this._estimateExecuteProposal(proposalId),
    setDaoConfig: (daoAddress: string, config: DaoConfig) =>
      this._estimateSetDaoConfig(daoAddress, config),
    setVotingConfig: (daoAddress: string, config: VotingConfig) =>
      this._estimateSetVotingConfig(daoAddress, config),
  };

  //// PRIVATE METHOD IMPLEMENTATIONS

  private async *_createProposal(
    params: ICreateProposalParams,
  ): AsyncGenerator<ProposalCreationStepValue> {
    const signer = this.web3.getConnectedSigner();
    if (!signer) {
      throw new Error("A signer is needed");
    } else if (!signer.provider) {
      throw new Error("A web3 provider is needed");
    }

    const erc20VotingInstance = ERC20Voting__factory.connect(
      this._pluginAddress,
      signer,
    );

    const tx = await erc20VotingInstance
      .newVote(...unwrapProposalParameters(params));

    yield { key: ProposalCreationSteps.CREATING, txHash: tx.hash };

    const receipt = await tx.wait();
    const startVoteEvent = receipt.events?.find(
      (e) => e.event === "StartVote",
    );
    if (!startVoteEvent || startVoteEvent.args?.voteId) {
      return Promise.reject(
        new Error("Could not read the proposal ID"),
      );
    }

    yield {
      key: ProposalCreationSteps.DONE,
      proposalId: startVoteEvent.args?.voteId,
    };
  }

  private _voteProposal(proposalId: string, vote: VoteOptions) {
    // TODO: Unimplemented
    throw new Error("Unimplemented");
  }
  private _executeProposal(proposalId: string) {
    // TODO: Unimplemented
    throw new Error("Unimplemented");
  }
  private _setDaoConfig(daoAddress: string, config: DaoConfig) {
    // TODO: Unimplemented
    throw new Error("Unimplemented");
  }
  private _setVotingConfig(daoAddress: string, config: VotingConfig) {
    // TODO: Unimplemented
    throw new Error("Unimplemented");
  }

  //// PRIVATE ACTION BUILDER HANDLERS

  private _buildActionInit(params: IErc20FactoryParams): FactoryInitParams {
    // TODO: Unimplemented
    throw new Error("Unimplemented");
  }

  private _buildActionWithdraw(
    to: string,
    value: bigint,
    params: IWithdrawParams,
  ): DaoAction {
    const data = encodeWithdrawActionData(params);
    return { to, value, data };
  }

  //// PRIVATE METHOD GAS ESTIMATIONS

  private _estimateCreateProposal(params: ICreateProposalParams) {
    const signer = this.web3.getConnectedSigner();
    if (!signer) {
      throw new Error("A signer is needed");
    } else if (!signer.provider) {
      throw new Error("A web3 provider is needed");
    }

    const erc20VotingInstance = ERC20Voting__factory.connect(
      this._pluginAddress,
      signer,
    );

    return erc20VotingInstance.estimateGas.newVote(
      ...unwrapProposalParameters(params),
    ).then((gasLimit) => {
      return this.web3.getApproximateGasFee(gasLimit.toBigInt());
    });
  }

  private _estimateVoteProposal(proposalId: string, vote: VoteOptions) {
    // TODO: Unimplemented
    return Promise.resolve(BigInt(0));
  }
  private _estimateExecuteProposal(proposalId: string) {
    // TODO: Unimplemented
    return Promise.resolve(BigInt(0));
  }
  private _estimateSetDaoConfig(daoAddress: string, config: DaoConfig) {
    // TODO: Unimplemented
    return Promise.resolve(BigInt(0));
  }
  private _estimateSetVotingConfig(daoAddress: string, config: VotingConfig) {
    // TODO: Unimplemented
    return Promise.resolve(BigInt(0));
  }
}

//// PARAMETER MANAGERS

function unwrapProposalParameters(
  params: ICreateProposalParams,
): [
  string,
  IDAO.ActionStruct[],
  number,
  number,
  boolean,
  number,
] {
  return [
    params.metadataUri,
    params.actions ?? [],
    params.startDate ?? 0,
    params.endDate ?? 0,
    params.executeIfPassed ?? false,
    params.creatorVote ?? VoteOptions.NONE,
  ];
}

function encodeWithdrawActionData(params: IWithdrawParams): string {
  const daoInterface = DAO__factory.createInterface();
  return daoInterface.encodeFunctionData(
    "withdraw",
    unwrapWithdrawParams(params),
  );
}

function unwrapWithdrawParams(
  params: IWithdrawParams,
): [string, string, BigNumber, string] {
  return [
    params.token ?? AddressZero,
    params.to,
    BigNumber.from(params.amount),
    params.reference ?? "",
  ];
}
