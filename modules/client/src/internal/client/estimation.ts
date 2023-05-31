import {
  DAO__factory,
  DAOFactory,
  DAOFactory__factory,
  PluginRepo__factory,
} from "@aragon/osx-ethers";
import {
  DepositNativeTokenError,
  InvalidAddressOrEnsError,
  NoProviderError,
} from "@aragon/sdk-common";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { erc20ContractAbi } from "../abi/erc20";
import {
  ClientCore,
  GasFeeEstimation,
  PrepareInstallationParams,
  TokenType,
} from "../../client-common";
import {
  CreateDaoParams,
  DepositParams,
  SetAllowanceParams,
} from "../../types";
import { unwrapDepositParams } from "../utils";
import { isAddress } from "@ethersproject/address";
import { toUtf8Bytes } from "@ethersproject/strings";
import { IClientEstimation } from "../../interfaces";

/**
 * Estimation module the SDK Generic Client
 */
export class ClientEstimation extends ClientCore implements IClientEstimation {
  public async prepareInstallation(
    _params: PrepareInstallationParams,
  ): Promise<GasFeeEstimation> {
    return {average: BigInt(0), max: BigInt(0)}
    // return this.estimation.prepareInstallation(params);
  }
  /**
   * Estimates the gas fee of creating a DAO
   *
   * @param {CreateDaoParams} _params
   * @return {*}  {Promise<GasFeeEstimation>}
   * @memberof ClientEstimation
   */
  public async createDao(params: CreateDaoParams): Promise<GasFeeEstimation> {
    const signer = this.web3.getConnectedSigner();
    if (
      params.ensSubdomain && !params.ensSubdomain.match(/^[a-z0-9\-]+$/)
    ) {
      throw new Error("Invalid subdomain format: use a-z, 0-9 and -");
    }

    const daoInstance = DAOFactory__factory.connect(
      this.web3.getDaoFactoryAddress(),
      signer,
    );
    const pluginInstallationData: DAOFactory.PluginSettingsStruct[] = [];
    for (const plugin of params.plugins) {
      const repo = PluginRepo__factory.connect(plugin.id, signer);

      const currentRelease = await repo.latestRelease();
      const latestVersion = await repo["getLatestVersion(uint8)"](
        currentRelease,
      );
      pluginInstallationData.push({
        pluginSetupRef: {
          pluginSetupRepo: repo.address,
          versionTag: latestVersion.tag,
        },
        data: plugin.data,
      });
    }

    const gasEstimation = await daoInstance.estimateGas.createDao(
      {
        subdomain: params.ensSubdomain,
        metadata: toUtf8Bytes(params.metadataUri),
        daoURI: params.daoUri || "",
        trustedForwarder: params.trustedForwarder || AddressZero,
      },
      pluginInstallationData,
    );

    return this.web3.getApproximateGasFee(gasEstimation.toBigInt());
  }
  /**
   * Estimates the gas fee of depositing ether or an ERC20 token into the DAO
   * This does not estimate the gas cost of updating the allowance of an ERC20 token
   *
   * @param {DepositParams} params
   * @return {*}  {Promise<GasFeeEstimation>}
   * @memberof ClientEstimation
   */
  public deposit(
    params: DepositParams,
  ): Promise<GasFeeEstimation> {
    const signer = this.web3.getConnectedSigner();

    if (params.type !== TokenType.NATIVE && params.type !== TokenType.ERC20) {
      throw new DepositNativeTokenError();
    }

    const [daoAddress, amount, tokenAddress, reference] = unwrapDepositParams(
      params,
    );

    const daoInstance = DAO__factory.connect(daoAddress, signer);

    const override: { value?: bigint } = {};
    if (tokenAddress === AddressZero) {
      override.value = amount;
    }

    return daoInstance.estimateGas
      .deposit(tokenAddress, amount, reference, override)
      .then((gasLimit) => {
        return this.web3.getApproximateGasFee(gasLimit.toBigInt());
      });
  }
  /**
   * Estimates the gas fee of updating the allowance of an ERC20 token
   *
   * @param {SetAllowanceParams} _params
   * @return {*}  {Promise<GasFeeEstimation>}
   * @memberof ClientEstimation
   */
  public async setAllowance(
    params: SetAllowanceParams,
  ): Promise<GasFeeEstimation> {
    const signer = this.web3.getConnectedSigner();
    // resolve ens
    let daoAddress = params.spender;
    if (!isAddress(daoAddress)) {
      await this.web3.ensureOnline();
      const provider = this.web3.getProvider();
      if (!provider) {
        throw new NoProviderError();
      }
      const resolvedAddress = await provider.resolveName(daoAddress);
      if (!resolvedAddress) {
        throw new InvalidAddressOrEnsError();
      }
      daoAddress = resolvedAddress;
    }

    const contract = new Contract(
      params.tokenAddress,
      erc20ContractAbi,
      signer,
    );
    return contract.estimateGas.approve(
      daoAddress,
      params.amount,
    ).then((gasLimit) => {
      return this.web3.getApproximateGasFee(gasLimit.toBigInt());
    });
  }
}
