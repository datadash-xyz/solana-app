import { JupiterPredictionConnector } from "./jupiter";
import { PostgresConnector } from "./postgres";
import { SolanaRpcConnector } from "./solana";

// One instance per process: the Jupiter connector's request pacing is shared by every job in it.
export const connectors = {
  jupiter: new JupiterPredictionConnector(),
  solana: new SolanaRpcConnector(),
  postgres: new PostgresConnector(),
};

export type { Connector, Health } from "./types";
