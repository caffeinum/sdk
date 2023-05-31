import {
  AddresslistVoting__factory,
  MajorityVotingBase__factory,
} from "@aragon/osx-ethers";

export const AVAILABLE_FUNCTION_SIGNATURES: string[] = [
  MajorityVotingBase__factory.createInterface().getFunction(
    "updateVotingSettings",
  )
    .format("minimal"),
  AddresslistVoting__factory.createInterface().getFunction("addAddresses")
    .format("minimal"),
  AddresslistVoting__factory.createInterface().getFunction(
    "removeAddresses",
  ).format("minimal"),
];

export const INSTALLATION_ABI: string[] = [
  "tuple(uint8, uint64, uint64, uint64, uint256)",
  "address[]",
];
