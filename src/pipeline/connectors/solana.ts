// Source connector: Solana JSON-RPC (Helius). Used to confirm that every trade Jupiter
// reports exists and is finalized on-chain.
import { getTx, rpc, verifySignatures } from "../../lib/solana";
import { probe, type Connector } from "./types";

export class SolanaRpcConnector implements Connector {
  readonly name = "solana-rpc";

  health() {
    return probe(this.name, async () => `slot=${await rpc<number>("getSlot", [{ commitment: "finalized" }])}`);
  }

  /** Batched getSignatureStatuses (256 per call). */
  signatureStatuses(signatures: string[]) {
    return verifySignatures(signatures);
  }

  /** Single transaction: slot, block time, signers and invoked programs. */
  transaction(signature: string) {
    return getTx(signature);
  }
}
