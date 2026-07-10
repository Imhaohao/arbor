/** Shared deterministic vectorizer used by both the offline baseline and the
 * bundled query-conditioned delegation head. */
export {
  delegationCosine as cosine,
  embedDelegationText as embed,
  type DelegationVector as Vec,
} from "../../lib/hive/delegation-head-core";
