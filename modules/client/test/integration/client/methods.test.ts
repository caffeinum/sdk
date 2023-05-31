// mocks need to be at the top of the imports
import { mockedIPFSClient } from "../../mocks/aragon-sdk-ipfs";
import * as mockedGraphqlRequest from "../../mocks/graphql-request";

import * as ganacheSetup from "../../helpers/ganache-setup";
import * as deployContracts from "../../helpers/deployContracts";
import {
  ADDRESS_ONE,
  ADDRESS_THREE,
  ADDRESS_TWO,
  contextParamsLocalChain,
  IPFS_CID,
  TEST_DAO_ADDRESS,
  TEST_INVALID_ADDRESS,
  TEST_MULTISIG_PROPOSAL_ID,
  TEST_NO_BALANCES_DAO_ADDRESS,
  TEST_NON_EXISTING_ADDRESS,
  TEST_TX_HASH,
  // TEST_WALLET,
} from "../constants";
import {
  AddresslistVotingClient,
  AddresslistVotingPluginInstall,
  AssetBalanceSortBy,
  Client,
  Context,
  CreateDaoParams,
  DaoCreationSteps,
  DaoDepositSteps,
  DaoQueryParams,
  DaoSortBy,
  DepositParams,
  HasPermissionParams,
  LIVE_CONTRACTS,
  Permissions,
  PluginQueryParams,
  PluginSortBy,
  PrepareInstallationStep,
  PrepareUninstallationSteps,
  SetAllowanceParams,
  SetAllowanceSteps,
  SortDirection,
  SupportedNetworksArray,
  TokenType,
  TransferQueryParams,
  TransferSortBy,
  TransferType,
  VotingMode,
} from "../../../src";
import { MissingExecPermissionError } from "@aragon/sdk-common";
import { Server } from "ganache";
import {
  SubgraphBalance,
  SubgraphDao,
  SubgraphPluginInstallation,
  SubgraphPluginRepo,
  SubgraphPluginRepoListItem,
  SubgraphTransferListItem,
  SubgraphTransferType,
} from "../../../src/internal/types";
import { QueryDao, QueryDaos } from "../../../src/internal/graphql-queries/dao";
import {
  QueryTokenBalances,
  QueryTokenTransfers,
} from "../../../src/internal/graphql-queries";
import { GraphQLClient } from "graphql-request";
import { AddressZero } from "@ethersproject/constants";
import { deployErc20 } from "../../helpers/deploy-erc20";
import { buildMultisigDAO } from "../../helpers/build-daos";
import { JsonRpcProvider } from "@ethersproject/providers";
import { INSTALLATION_ABI } from "../../../src/multisig/internal/constants";

jest.spyOn(SupportedNetworksArray, "includes").mockReturnValue(true);
jest.spyOn(Context.prototype, "network", "get").mockReturnValue(
  { chainId: 5, name: "goerli" },
);
describe("Client", () => {
  let daoAddress: string;
  let deployment: deployContracts.Deployment;

  describe("Methods Module tests", () => {
    let server: Server;

    beforeAll(async () => {
      server = await ganacheSetup.start();
      deployment = await deployContracts.deploy();
      contextParamsLocalChain.daoFactoryAddress = deployment.daoFactory.address;
      contextParamsLocalChain.ensRegistryAddress =
        deployment.ensRegistry.address;
      const daoCreation = await deployContracts.createTokenVotingDAO(
        deployment,
        "test-tokenvoting-dao",
        VotingMode.STANDARD,
      );
      daoAddress = daoCreation.daoAddr;
      LIVE_CONTRACTS.goerli.daoFactory = deployment.daoFactory.address;
      LIVE_CONTRACTS.goerli.pluginSetupProcessor =
        deployment.pluginSetupProcessor.address;
      LIVE_CONTRACTS.goerli.multisigRepo = deployment.multisigRepo.address;
      LIVE_CONTRACTS.goerli.adminRepo = "";
      LIVE_CONTRACTS.goerli.addresslistVotingRepo =
        deployment.addresslistVotingRepo.address;
      LIVE_CONTRACTS.goerli.tokenVotingRepo =
        deployment.tokenVotingRepo.address;
      LIVE_CONTRACTS.goerli.multisigSetup =
        deployment.multisigPluginSetup.address;
      LIVE_CONTRACTS.goerli.adminSetup = "";
      LIVE_CONTRACTS.goerli.addresslistVotingSetup =
        deployment.addresslistVotingPluginSetup.address;
      LIVE_CONTRACTS.goerli.tokenVotingSetup =
        deployment.tokenVotingPluginSetup.address;
    });

    afterAll(async () => {
      await server.close();
    });

    describe("DAO Creation", () => {
      it("Should create a DAO locally", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);

        const daoName = "AddresslistVoting DAO-" +
          Math.floor(Math.random() * 9999) + 1;
        // pin metadata
        const ipfsUri = await client.methods.pinMetadata({
          name: daoName,
          description: "this is a dao",
          avatar: "https://...",
          links: [],
        });
        const pluginParams: AddresslistVotingPluginInstall = {
          votingSettings: {
            minDuration: 3600,
            minParticipation: 0.5,
            supportThreshold: 0.5,
          },
          addresses: [
            "0x1234567890123456789012345678901234567890",
            "0x0987654321098765432109876543210987654321",
          ],
        };

        const addresslistVotingPlugin = AddresslistVotingClient.encoding
          .getPluginInstallItem(pluginParams);
        addresslistVotingPlugin.id = deployment.addresslistVotingRepo.address;

        const daoCreationParams: CreateDaoParams = {
          metadataUri: ipfsUri,
          ensSubdomain: daoName.toLowerCase().replace(" ", "-"),
          plugins: [
            addresslistVotingPlugin,
          ],
        };

        for await (const step of client.methods.createDao(daoCreationParams)) {
          switch (step.key) {
            case DaoCreationSteps.CREATING:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case DaoCreationSteps.DONE:
              expect(typeof step.address).toBe("string");
              expect(step.address).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              break;
            default:
              throw new Error(
                "Unexpected DAO creation step: " +
                  JSON.stringify(step, null, 2),
              );
          }
        }
      });

      it("should fail if no execute_permission is requested", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);

        const daoName = "AddresslistVoting DAO-" +
          Math.floor(Math.random() * 9999) + 1;

        const daoCreationParams: CreateDaoParams = {
          metadataUri: "ipfs://QmeJ4kRW21RRgjywi9ydvY44kfx71x2WbRq7ik5xh5zBZK",
          ensSubdomain: daoName.toLowerCase().replace(" ", "-"),
          plugins: [],
        };

        await expect(client.methods.createDao(daoCreationParams).next()).rejects
          .toMatchObject(new MissingExecPermissionError());
      });
    });

    describe("DAO deposit", () => {
      it("Should allow to deposit ERC20 (no prior allowance)", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);

        const tokenContract = await deployErc20();
        const amount = BigInt("1000000000000000000");
        const depositParams: DepositParams = {
          type: TokenType.ERC20,
          daoAddressOrEns: daoAddress,
          amount,
          tokenAddress: tokenContract.address,
        };

        expect(
          (
            await tokenContract.functions.balanceOf(
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe("0");

        for await (const step of client.methods.deposit(depositParams)) {
          switch (step.key) {
            case DaoDepositSteps.CHECKED_ALLOWANCE:
              expect(typeof step.allowance).toBe("bigint");
              expect(step.allowance).toBe(BigInt(0));
              break;
            case SetAllowanceSteps.SETTING_ALLOWANCE:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case SetAllowanceSteps.ALLOWANCE_SET:
              expect(typeof step.allowance).toBe("bigint");
              expect(step.allowance).toBe(amount);
              break;
            case DaoDepositSteps.DEPOSITING:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case DaoDepositSteps.DONE:
              expect(typeof step.amount).toBe("bigint");
              expect(step.amount).toBe(amount);
              break;
            default:
              throw new Error(
                "Unexpected DAO deposit step: " + JSON.stringify(step, null, 2),
              );
          }
        }

        expect(
          (
            await tokenContract.functions.balanceOf(
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe(amount.toString());
      });
      it("Should ensure allowance for an ERC20 token", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const tokenContract = await deployErc20();
        const amount = BigInt("1000000000000000000");
        const SetAllowanceParams: SetAllowanceParams = {
          spender: daoAddress,
          amount,
          tokenAddress: tokenContract.address,
        };

        for await (
          const step of client.methods.setAllowance(SetAllowanceParams)
        ) {
          switch (step.key) {
            case SetAllowanceSteps.SETTING_ALLOWANCE:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case SetAllowanceSteps.ALLOWANCE_SET:
              expect(typeof step.allowance).toBe("bigint");
              expect(step.allowance).toBe(amount);
              break;
            default:
              throw new Error(
                "Unexpected DAO ensure allowance step: " +
                  JSON.stringify(step, null, 2),
              );
          }
        }

        expect(
          (
            await tokenContract.functions.allowance(
              client.web3.getSigner()?.getAddress(),
              daoAddress,
            )
          ).toString(),
        ).toBe(amount.toString());
      });

      it("Should allow to deposit ERC20 (with existing allowance)", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);

        const tokenContract = await deployErc20();

        const depositParams: DepositParams = {
          type: TokenType.ERC20,
          daoAddressOrEns: daoAddress,
          amount: BigInt(7),
          tokenAddress: tokenContract.address,
        };

        expect(
          (
            await tokenContract.functions.balanceOf(
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe("0");

        // Prior allowance
        expect(
          (
            await tokenContract.functions.allowance(
              await client.web3.getSigner()?.getAddress(),
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe("0");

        await tokenContract.functions
          .approve(depositParams.daoAddressOrEns, 10)
          .then((tx) => tx.wait());

        expect(
          (
            await tokenContract.functions.allowance(
              await client.web3.getSigner()?.getAddress(),
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe("10");

        // Deposit
        for await (const step of client.methods.deposit(depositParams)) {
          switch (step.key) {
            case DaoDepositSteps.CHECKED_ALLOWANCE:
              expect(typeof step.allowance).toBe("bigint");
              expect(step.allowance).toBe(BigInt(10));
              break;
            case DaoDepositSteps.DEPOSITING:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case DaoDepositSteps.DONE:
              expect(typeof step.amount).toBe("bigint");
              expect(step.amount).toBe(BigInt(7));
              break;
            default:
              throw new Error(
                "Unexpected DAO deposit step: " + JSON.stringify(step, null, 2),
              );
          }
        }

        expect(
          (
            await tokenContract.functions.balanceOf(
              depositParams.daoAddressOrEns,
            )
          ).toString(),
        ).toBe("7");
      });

      it("Check if dao factory has register dao permission in the dao registry", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const params: HasPermissionParams = {
          daoAddressOrEns: deployment.managingDaoAddress,
          who: deployment.daoFactory.address,
          where: deployment.daoRegistry.address,
          permission: Permissions.REGISTER_DAO_PERMISSION,
        };
        // this permission was granted on deployment
        // so it must be true
        const hasPermission = await client.methods.hasPermission(params);
        expect(hasPermission).toBe(true);
      });

      it("Check if an user has root permission in a dao", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const who = await contextParamsLocalChain.signer?.getAddress();
        const params: HasPermissionParams = {
          daoAddressOrEns: daoAddress,
          who: who!,
          where: daoAddress,
          permission: Permissions.ROOT_PERMISSION,
        };

        const hasPermission = await client.methods.hasPermission(params);
        expect(hasPermission).toBe(false);
      });

      it("Should prepare the installation of a plugin", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const { dao } = await buildMultisigDAO(
          deployment.multisigRepo.address,
        );
        const networkSpy = jest.spyOn(JsonRpcProvider.prototype, "getNetwork");
        networkSpy.mockReturnValueOnce(
          Promise.resolve({
            name: "goerli",
            chainId: 31337,
          }),
        );
        const steps = client.methods.prepareInstallation(
          {
            daoAddressOrEns: dao,
            pluginRepo: deployment.multisigRepo.address,
            installationAbi: INSTALLATION_ABI,
            installationParams: [["0x1234567890123456789012345678901234567890"], [true, 1]],
          },
        );

        for await (const step of steps) {
          switch (step.key) {
            case PrepareInstallationStep.PREPARING:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case PrepareInstallationStep.DONE:
              expect(typeof step.pluginAddress).toBe("string");
              expect(step.pluginAddress).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              expect(typeof step.pluginRepo).toBe("string");
              expect(step.pluginRepo).toBe(deployment.multisigRepo.address);
              expect(step.pluginRepo).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              expect(typeof step.versionTag.build).toBe("number");
              expect(step.versionTag.build).toBe(1);
              expect(typeof step.versionTag.release).toBe("number");
              expect(step.versionTag.release).toBe(1);
              for (const permission of step.permissions) {
                if (permission.condition) {
                  expect(typeof permission.condition).toBe("string");
                  expect(permission.condition).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
                }
                expect(typeof permission.operation).toBe("number");
                expect(typeof permission.where).toBe("string");
                expect(permission.where).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
                expect(typeof permission.who).toBe("string");
                expect(permission.who).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              }
              break;
          }
        }
      });

      it("Should prepare the uninstallation of a plugin", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const { dao, plugin } = await buildMultisigDAO(
          deployment.multisigRepo.address,
        );
        const networkSpy = jest.spyOn(JsonRpcProvider.prototype, "getNetwork");
        networkSpy.mockReturnValueOnce(
          Promise.resolve({
            name: "goerli",
            chainId: 31337,
          }),
        );
        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        const installation: SubgraphPluginInstallation = {
          appliedPreparation: {
            helpers: [],
            pluginRepo: {
              id: deployment.multisigRepo.address,
            },
          },
          appliedVersion: {
            metadata: `ipfs://${IPFS_CID}`,
            release: {
              release: 1,
            },
            build: 1,
          },
        };
        mockedClient.request.mockResolvedValueOnce({
          iplugin: { installations: [installation] },
        });
        const steps = client.methods.prepareUninstallation(
          {
            daoAddressOrEns: dao,
            pluginAddress: plugin,
          },
        );

        for await (const step of steps) {
          switch (step.key) {
            case PrepareUninstallationSteps.PREPARING:
              expect(typeof step.txHash).toBe("string");
              expect(step.txHash).toMatch(/^0x[A-Fa-f0-9]{64}$/i);
              break;
            case PrepareUninstallationSteps.DONE:
              expect(typeof step.pluginAddress).toBe("string");
              expect(step.pluginAddress).toBe(plugin);
              expect(step.pluginAddress).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              expect(typeof step.pluginRepo).toBe("string");
              expect(step.pluginRepo).toBe(deployment.multisigRepo.address);
              expect(step.pluginRepo).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              expect(typeof step.versionTag.build).toBe("number");
              expect(step.versionTag.build).toBe(1);
              expect(typeof step.versionTag.release).toBe("number");
              expect(step.versionTag.release).toBe(1);
              for (const permission of step.permissions) {
                if (permission.condition) {
                  expect(typeof permission.condition).toBe("string");
                  expect(permission.condition).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
                }
                expect(typeof permission.operation).toBe("number");
                expect(typeof permission.where).toBe("string");
                expect(permission.where).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
                expect(typeof permission.who).toBe("string");
                expect(permission.who).toMatch(/^0x[A-Fa-f0-9]{40}$/i);
              }
              break;
          }
        }
      });
    });

    describe("Data retrieval", () => {
      it("Should get a DAO's metadata with a specific address", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const daoAddress = TEST_DAO_ADDRESS;

        mockedIPFSClient.cat.mockResolvedValueOnce(
          Buffer.from(
            JSON.stringify({
              name: "Name",
              description: "Description",
              links: [],
            }),
          ),
        );

        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        const subgraphDao: SubgraphDao = {
          createdAt: Math.round(Date.now() / 1000).toString(),
          id: TEST_DAO_ADDRESS,
          subdomain: "test",
          metadata: `ipfs://${IPFS_CID}`,
          plugins: [
            {
              appliedVersion: {
                build: 1,
                release: {
                  release: 1,
                },
              },
              appliedPreparation: {
                pluginAddress: ADDRESS_ONE,
              },
              appliedPluginRepo: {
                subdomain: "multisig",
              },
            },
          ],
        };
        mockedClient.request.mockResolvedValueOnce({
          dao: subgraphDao,
        });

        const dao = await client.methods.getDao(daoAddress);
        expect(dao!.address).toBe(subgraphDao.id);
        expect(dao!.ensDomain).toBe(`${subgraphDao.subdomain}.dao.eth`);
        expect(dao!.creationDate).toMatchObject(
          new Date(parseInt(subgraphDao.createdAt) * 1000),
        );

        expect(dao!.plugins.length).toBe(1);
        expect(dao!.plugins[0].instanceAddress).toBe(
          ADDRESS_ONE,
        );
        expect(dao!.plugins[0].id).toBe("multisig.plugin.dao.eth");
        expect(dao!.plugins[0].build).toBe(1);
        expect(dao!.plugins[0].release).toBe(1);

        expect(dao!.metadata.name).toBe("Name");
        expect(dao!.metadata.description).toBe("Description");
        expect(dao!.metadata.links.length).toBe(0);
        expect(dao!.metadata.avatar).toBe(undefined);

        expect(mockedClient.request).toHaveBeenCalledWith(QueryDao, {
          address: daoAddress,
        });
      });
      it("Should get a DAO's metadata of an non existent dao and receive null", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const daoAddress = TEST_NON_EXISTING_ADDRESS;
        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        mockedClient.request.mockResolvedValueOnce({ dao: null });

        const dao = await client.methods.getDao(daoAddress);
        expect(dao === null).toBe(true);
      });

      it("Should get a DAO's metadata of an invalid dao address and throw an error", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const daoAddress = TEST_INVALID_ADDRESS;
        await expect(() => client.methods.getDao(daoAddress)).rejects.toThrow();
      });

      it("Should retrieve a list of Metadata details of DAO's, based on the given search params", async () => {
        const context = new Context(contextParamsLocalChain);
        const client = new Client(context);
        const limit = 3;
        const params: DaoQueryParams = {
          limit,
          skip: 0,
          direction: SortDirection.ASC,
          sortBy: DaoSortBy.SUBDOMAIN,
        };

        const defaultImplementation = mockedIPFSClient.cat
          .getMockImplementation();
        mockedIPFSClient.cat.mockResolvedValue(
          Buffer.from(
            JSON.stringify({
              name: "Name",
              description: "Description",
              links: [],
            }),
          ),
        );
        const subgraphDao: SubgraphDao = {
          createdAt: Math.round(Date.now() / 1000).toString(),
          id: TEST_DAO_ADDRESS,
          subdomain: "test",
          metadata: `ipfs://${IPFS_CID}`,
          plugins: [
            {
              appliedVersion: {
                build: 1,
                release: {
                  release: 1,
                },
              },
              appliedPreparation: {
                pluginAddress: ADDRESS_ONE,
              },
              appliedPluginRepo: {
                subdomain: "multisig",
              },
            },
          ],
        };
        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        mockedClient.request.mockResolvedValueOnce({
          daos: [subgraphDao],
        });

        const daos = await client.methods.getDaos(params);
        expect(daos.length).toBe(1);
        expect(daos[0].address).toBe(subgraphDao.id);
        expect(daos[0].ensDomain).toBe(`${subgraphDao.subdomain}.dao.eth`);

        expect(daos[0].plugins.length).toBe(1);
        expect(daos[0].plugins[0].instanceAddress).toBe(
          ADDRESS_ONE,
        );
        expect(daos[0].plugins[0].id).toBe("multisig.plugin.dao.eth");
        expect(daos[0].plugins[0].build).toBe(1);
        expect(daos[0].plugins[0].release).toBe(1);

        expect(daos[0].metadata.name).toBe("Name");
        expect(daos[0].metadata.description).toBe("Description");
        expect(daos[0].metadata.avatar).toBe(undefined);

        expect(mockedClient.request).toHaveBeenCalledWith(QueryDaos, {
          ...params,
        });

        mockedIPFSClient.cat.mockImplementation(defaultImplementation);
      });

      it("Should get DAOs balances", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const daoAddress = TEST_DAO_ADDRESS;

        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        const subgraphBalanceNative: SubgraphBalance = {
          __typename: "NativeBalance",
          token: {
            id: ADDRESS_ONE,
            name: "TestToken",
            symbol: "TST",
            decimals: 18,
          },
          balance: "50",
          lastUpdated: Math.round(Date.now() / 1000).toString(),
        };
        const subgraphBalanceERC20: SubgraphBalance = {
          __typename: "ERC20Balance",
          token: {
            id: ADDRESS_TWO,
            name: "TestToken",
            symbol: "TST",
            decimals: 18,
          },
          balance: "50",
          lastUpdated: Math.round(Date.now() / 1000).toString(),
        };
        const subgraphBalanceERC721: SubgraphBalance = {
          __typename: "ERC721Balance",
          token: {
            id: ADDRESS_THREE,
            name: "TestToken",
            symbol: "TST",
            decimals: 18,
          },
          balance: "50",
          lastUpdated: Math.round(Date.now() / 1000).toString(),
        };
        mockedClient.request.mockResolvedValueOnce({
          tokenBalances: [
            subgraphBalanceNative,
            subgraphBalanceERC721,
            subgraphBalanceERC20,
          ],
        });

        const balances = await client.methods.getDaoBalances({
          daoAddressOrEns: daoAddress,
        });
        expect(balances!.length).toBe(3);
        if (balances && balances.length > 0) {
          expect(balances[0].type).toBe(TokenType.NATIVE);
          if (balances[0].type === TokenType.NATIVE) {
            expect(balances[0].balance).toBe(
              BigInt(subgraphBalanceNative.balance),
            );
            expect(balances[0].updateDate).toMatchObject(
              new Date(parseInt(subgraphBalanceNative.lastUpdated) * 1000),
            );
          }

          expect(balances[1].type).toBe(TokenType.ERC721);
          if (balances[1].type === TokenType.ERC721) {
            expect(balances[1].name).toBe(
              subgraphBalanceERC721.token.name,
            );
            expect(balances[1].symbol).toBe(
              subgraphBalanceERC721.token.symbol,
            );
            expect(balances[1].address).toBe(
              subgraphBalanceERC721.token.id,
            );
            expect(balances[1].updateDate).toMatchObject(
              new Date(parseInt(subgraphBalanceERC721.lastUpdated) * 1000),
            );
          }

          expect(balances[2].type).toBe(TokenType.ERC20);
          if (balances[2].type === TokenType.ERC20) {
            expect(balances[2].name).toBe(
              subgraphBalanceERC20.token.name,
            );
            expect(balances[2].symbol).toBe(
              subgraphBalanceERC20.token.symbol,
            );
            expect(balances[2].address).toBe(
              subgraphBalanceERC20.token.id,
            );
            expect(balances[2].decimals).toBe(
              subgraphBalanceERC20.token.decimals,
            );
            expect(balances[2].balance).toBe(
              BigInt(subgraphBalanceERC20.balance),
            );
            expect(balances[2].updateDate).toMatchObject(
              new Date(parseInt(subgraphBalanceERC20.lastUpdated) * 1000),
            );
          }
        }

        expect(mockedClient.request).toHaveBeenCalledWith(QueryTokenBalances, {
          limit: 10,
          skip: 0,
          direction: SortDirection.ASC,
          sortBy: AssetBalanceSortBy.LAST_UPDATED,
          where: {
            dao: daoAddress,
          },
        });
      });
      it("Should get DAOs balances from a dao with no balances", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const daoAddress = TEST_NO_BALANCES_DAO_ADDRESS;
        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        mockedClient.request.mockResolvedValueOnce({ tokenBalances: [] });
        const balances = await client.methods.getDaoBalances({
          daoAddressOrEns: daoAddress,
        });
        expect(Array.isArray(balances)).toBe(true);
        expect(balances?.length).toBe(0);
      });

      describe("Should get the transfers of a dao", () => {
        let client: Client,
          mockedClient: jest.Mocked<GraphQLClient>,
          params: TransferQueryParams,
          ctx: Context;
        beforeAll(() => {
          contextParamsLocalChain.ensRegistryAddress =
            deployment.ensRegistry.address;
          ctx = new Context(contextParamsLocalChain);
          params = {
            daoAddressOrEns: TEST_DAO_ADDRESS,
            sortBy: TransferSortBy.CREATED_AT,
            limit: 10,
            skip: 0,
            direction: SortDirection.ASC,
          };
        });

        beforeEach(() => {
          client = new Client(ctx);
          mockedClient = mockedGraphqlRequest.getMockedInstance(
            client.graphql.getClient(),
          );
        });

        it("should call request correctly", async () => {
          mockedClient.request.mockResolvedValueOnce({ tokenTransfers: [] });
          await client.methods.getDaoTransfers(params);
          expect(mockedClient.request).toHaveBeenCalledWith(
            QueryTokenTransfers,
            {
              sortBy: params.sortBy,
              limit: params.limit,
              skip: params.skip,
              direction: params.direction,
              where: {
                dao: params.daoAddressOrEns,
              },
            },
          );
        });

        it("deposit native transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "NativeTransfer",
            type: SubgraphTransferType.DEPOSIT,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.DEPOSIT);
            expect(transfer.tokenType).toBe(TokenType.NATIVE);
            if (
              transfer.type === TransferType.DEPOSIT &&
              transfer.tokenType === TokenType.NATIVE
            ) {
              expect(transfer.amount).toBe(BigInt(subgraphTransfer.amount));
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
            }
          }
        });

        it("deposit erc721 transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "ERC721Transfer",
            type: SubgraphTransferType.DEPOSIT,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.DEPOSIT);
            expect(transfer.tokenType).toBe(TokenType.ERC721);
            if (
              transfer.type === TransferType.DEPOSIT &&
              transfer.tokenType === TokenType.ERC721
            ) {
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
              expect(transfer.token.address).toBe(subgraphTransfer.token.id);
              expect(transfer.token.name).toBe(subgraphTransfer.token.name);
              expect(transfer.token.symbol).toBe(subgraphTransfer.token.symbol);
            }
          }
        });

        it("deposit erc20 transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "ERC20Transfer",
            type: SubgraphTransferType.DEPOSIT,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.DEPOSIT);
            expect(transfer.tokenType).toBe(TokenType.ERC20);
            if (
              transfer.type === TransferType.DEPOSIT &&
              transfer.tokenType === TokenType.ERC20
            ) {
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
              expect(transfer.token.address).toBe(subgraphTransfer.token.id);
              expect(transfer.token.name).toBe(subgraphTransfer.token.name);
              expect(transfer.token.symbol).toBe(subgraphTransfer.token.symbol);
              expect(transfer.amount).toBe(BigInt(subgraphTransfer.amount));
            }
          }
        });
        it("withdraw native transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "NativeTransfer",
            type: SubgraphTransferType.WITHDRAW,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.WITHDRAW);
            expect(transfer.tokenType).toBe(TokenType.NATIVE);
            if (
              transfer.type === TransferType.WITHDRAW &&
              transfer.tokenType === TokenType.NATIVE
            ) {
              expect(transfer.amount).toBe(BigInt(subgraphTransfer.amount));
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
              expect(transfer.proposalId).toBe(subgraphTransfer.proposal.id);
            }
          }
        });

        it("withdraw erc721 transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "ERC721Transfer",
            type: SubgraphTransferType.WITHDRAW,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.WITHDRAW);
            expect(transfer.tokenType).toBe(TokenType.ERC721);
            if (
              transfer.type === TransferType.WITHDRAW &&
              transfer.tokenType === TokenType.ERC721
            ) {
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
              expect(transfer.proposalId).toBe(subgraphTransfer.proposal.id);
              expect(transfer.token.address).toBe(subgraphTransfer.token.id);
              expect(transfer.token.name).toBe(subgraphTransfer.token.name);
              expect(transfer.token.symbol).toBe(subgraphTransfer.token.symbol);
            }
          }
        });

        it("withdraw erc20 transfer", async () => {
          const subgraphTransfer: SubgraphTransferListItem = {
            __typename: "ERC20Transfer",
            type: SubgraphTransferType.WITHDRAW,
            amount: "50",
            createdAt: Math.round(Date.now() / 1000).toString(),
            txHash: TEST_TX_HASH,
            from: ADDRESS_ONE,
            to: ADDRESS_TWO,
            proposal: {
              id: TEST_MULTISIG_PROPOSAL_ID,
            },
            token: {
              id: AddressZero,
              name: "TestToken",
              symbol: "TST",
              decimals: 18,
            },
          };
          mockedClient.request.mockResolvedValueOnce({
            tokenTransfers: [subgraphTransfer],
          });

          const transfers = await client.methods.getDaoTransfers(params);
          expect(transfers?.length).toBe(1);
          if (transfers && transfers.length > 0) {
            const transfer = transfers[0];
            expect(transfer.type).toBe(TransferType.WITHDRAW);
            expect(transfer.tokenType).toBe(TokenType.ERC20);
            if (
              transfer.type === TransferType.WITHDRAW &&
              transfer.tokenType === TokenType.ERC20
            ) {
              expect(transfer.creationDate).toMatchObject(
                new Date(parseInt(subgraphTransfer.createdAt) * 1000),
              );
              expect(transfer.transactionId).toBe(subgraphTransfer.txHash);
              expect(transfer.from).toBe(subgraphTransfer.from);
              expect(transfer.to).toBe(subgraphTransfer.to);
              expect(transfer.proposalId).toBe(subgraphTransfer.proposal.id);
              expect(transfer.token.address).toBe(subgraphTransfer.token.id);
              expect(transfer.token.name).toBe(subgraphTransfer.token.name);
              expect(transfer.token.symbol).toBe(subgraphTransfer.token.symbol);
              expect(transfer.amount).toBe(BigInt(subgraphTransfer.amount));
            }
          }
        });
      });

      it("Should get a list plugin details", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);
        const defaultCatImplementation = mockedIPFSClient.cat
          .getMockImplementation();

        mockedIPFSClient.cat.mockResolvedValue(
          Buffer.from(
            JSON.stringify({
              name: "Name",
              description: "Description",
              images: {},
            }),
          ),
        );

        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        const address = "0x1234567890123456789012345678901234567890";
        const pluginRepo: SubgraphPluginRepoListItem = {
          id: address,
          subdomain: "test",
          releases: [
            {
              release: 1,
              metadata: `ipfs://${IPFS_CID}`,
              builds: [
                {
                  build: 1,
                },
                {
                  build: 2,
                },
              ],
            },
            {
              release: 2,
              metadata: `ipfs://${IPFS_CID}`,
              builds: [
                {
                  build: 1,
                },
              ],
            },
          ],
        };
        mockedClient.request.mockResolvedValueOnce({
          pluginRepos: [pluginRepo],
        });

        const params: PluginQueryParams = {
          limit: 10,
          skip: 0,
          direction: SortDirection.ASC,
          sortBy: PluginSortBy.SUBDOMAIN,
        };

        const plugins = await client.methods.getPlugins(params);
        expect(plugins.length).toBe(1);
        expect(plugins[0].releases.length).toBe(2);
        expect(plugins[0].releases[0].release).toBe(1);
        expect(plugins[0].releases[0].metadata.name).toBe("Name");
        expect(plugins[0].releases[0].metadata.description).toBe("Description");
        expect(plugins[0].releases[0].currentBuild).toBe(2);
        mockedIPFSClient.cat.mockImplementation(defaultCatImplementation);
      });

      it("Should get a plugin details given the address", async () => {
        const ctx = new Context(contextParamsLocalChain);
        const client = new Client(ctx);

        mockedIPFSClient.cat.mockResolvedValueOnce(
          Buffer.from(
            JSON.stringify({
              name: "Name",
              description: "Description",
              images: {},
            }),
          ),
        );
        mockedIPFSClient.cat.mockResolvedValueOnce(
          Buffer.from(
            JSON.stringify({
              ui: "test",
              change: "test",
              pluginSetupABI: {},
            }),
          ),
        );

        const mockedClient = mockedGraphqlRequest.getMockedInstance(
          client.graphql.getClient(),
        );
        const address = "0x1234567890123456789012345678901234567890";
        const pluginRepo: SubgraphPluginRepo = {
          id: address,
          subdomain: "test",
          releases: [
            {
              metadata: `ipfs://${IPFS_CID}`,
              release: 1,
              builds: [
                {
                  metadata: `ipfs://${IPFS_CID}`,
                  build: 1,
                },
              ],
            },
          ],
        };
        mockedClient.request.mockResolvedValueOnce({
          pluginRepo,
        });
        const plugin = await client.methods.getPlugin(address);
        expect(plugin.address).toBe(address);
        expect(plugin.subdomain).toBe("test");
        expect(plugin.current.build.number).toBe(1);
        expect(plugin.current.build.metadata.ui).toBe("test");
        expect(typeof plugin.current.build.metadata.ui).toBe("string");
        expect(plugin.current.build.metadata.change).toBe("test");
        expect(typeof plugin.current.build.metadata.change).toBe("string");
        expect(typeof plugin.current.build.metadata.pluginSetupABI).toBe(
          "object",
        );
        expect(plugin.current.release.number).toBe(1);
        expect(plugin.current.release.metadata.name).toBe("Name");
        expect(typeof plugin.current.release.metadata.name).toBe("string");
        expect(plugin.current.release.metadata.description).toBe("Description");
        expect(typeof plugin.current.release.metadata.description).toBe(
          "string",
        );
        expect(typeof plugin.current.release.metadata.images).toBe("object");
      });

      test.todo(
        "Should return an empty array when getting the transfers of a DAO that does not exist",
      ); //, async () => {
      //   const ctx = new Context(contextParamsOkWithGraphqlTimeouts);
      //   const client = new Client(ctx)
      //   const res = await client.methods.getTransfers(contextParamsOkWithGraphqlTimeouts.dao)
      //   expect(res.length).toBe(0)
      // })
      test.todo("Should fail if the given ENS is invalid"); // async () => {
      // const ctx = new Context(contextParamsOkWithGraphqlTimeouts);
      // const client = new Client(ctx)
      // // will fail when tested on local chain
      // await expect(client.methods.getTransfers("the.dao")).rejects.toThrow(
      //   "Invalid ENS name"
      // );
    });
  });
});
