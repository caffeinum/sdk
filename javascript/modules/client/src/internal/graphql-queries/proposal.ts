import { gql } from "graphql-request";

export const QueryErc20Proposal = gql`
query erc20Proposal($proposalId: ID!) {
  erc20VotingProposal(id: $proposalId){
    id
    dao {
      id
      name
    }
    creator
    metadata
    createdAt
    actions {
      to
      value
      data
    }
    yes,
    no,
    abstain
    supportRequiredPct,
    participationRequiredPct,
    startDate
    endDate
    executed
    executable
    voters{
      voter{
        id
      }
      vote
      weight
    }
    pkg{
			token{
        symbol
        name
        id
        decimals
      }
    }
    votingPower
  }
}
`;
export const QueryErc20Proposals = gql`
query erc20Proposals($where: ERC20VotingProposal_filter!, $limit:Int!, $skip: Int!, $direction: OrderDirection!, $sortBy: ERC20VotingProposal_orderBy!) {
  erc20VotingProposals(where: $where, first: $limit, skip: $skip, orderDirection: $direction, orderBy: $sortBy){
    id
    dao {
      id
      name
    }
    creator
    metadata
    yes,
    no,
    abstain
    startDate
    endDate
    executed
    executable
    pkg{
			token{
        symbol
        name
        id
        decimals
      }
    }
  }
}
`;

export const QueryAddressListProposal = gql`
query addressListProposal($proposalId: ID!) {
  allowlistProposal(id: $proposalId){
    id
    dao {
      id
      name
    }
    creator
    metadata
    createdAt
    actions {
      to
      value
      data
    }
    yes,
    no,
    abstain
    supportRequiredPct,
    participationRequired,
    startDate
    endDate
    executed
    executable
    voters{
      voter{
        id
      }
      vote
    }
    votingPower
  }
}
`;
export const QueryAddressListProposals = gql`
query addressListProposals($where: ERC20VotingProposal_filter!, $limit:Int!, $skip: Int!, $direction: OrderDirection!, $sortBy: ERC20VotingProposal_orderBy!) {
  allowlistProposals(where: $where, first: $limit, skip: $skip, orderDirection: $direction, orderBy: $sortBy){
    id
    dao {
      id
      name
    }
    creator
    metadata
    yes,
    no,
    abstain
    startDate
    endDate
    executed
    executable
  }
}
`;