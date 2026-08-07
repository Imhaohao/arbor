/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as a2aAuth from "../a2aAuth.js";
import type * as a2aAuthCore from "../a2aAuthCore.js";
import type * as a2aNegotiations from "../a2aNegotiations.js";
import type * as a2aNonces from "../a2aNonces.js";
import type * as a2aOutboundKeys from "../a2aOutboundKeys.js";
import type * as a2aTaskRuns from "../a2aTaskRuns.js";
import type * as agentBlackboard from "../agentBlackboard.js";
import type * as agentKeys from "../agentKeys.js";
import type * as agentKeysAdmin from "../agentKeysAdmin.js";
import type * as agentProfiles from "../agentProfiles.js";
import type * as agentReadiness from "../agentReadiness.js";
import type * as agentReadinessActions from "../agentReadinessActions.js";
import type * as agentSmokeStats from "../agentSmokeStats.js";
import type * as agentToolCalls from "../agentToolCalls.js";
import type * as agents from "../agents.js";
import type * as auctions from "../auctions.js";
import type * as battery from "../battery.js";
import type * as bidProbes from "../bidProbes.js";
import type * as bids from "../bids.js";
import type * as buyerAnalytics from "../buyerAnalytics.js";
import type * as contextEnrichment from "../contextEnrichment.js";
import type * as crons from "../crons.js";
import type * as demos from "../demos.js";
import type * as discoveredSpecialists from "../discoveredSpecialists.js";
import type * as disputes from "../disputes.js";
import type * as escalations from "../escalations.js";
import type * as escrow from "../escrow.js";
import type * as evolutionArchive from "../evolutionArchive.js";
import type * as goldenTaskAudit from "../goldenTaskAudit.js";
import type * as goldenTasks from "../goldenTasks.js";
import type * as hiveBaselineBackstop from "../hiveBaselineBackstop.js";
import type * as hiveCandidates from "../hiveCandidates.js";
import type * as hiveConnector from "../hiveConnector.js";
import type * as hiveData from "../hiveData.js";
import type * as hiveEvalGate from "../hiveEvalGate.js";
import type * as hiveEvaluator from "../hiveEvaluator.js";
import type * as hiveNetwork from "../hiveNetwork.js";
import type * as hiveOrchestrator from "../hiveOrchestrator.js";
import type * as hivePlanner from "../hivePlanner.js";
import type * as hiveRegistry from "../hiveRegistry.js";
import type * as hiveRegistryData from "../hiveRegistryData.js";
import type * as hiveReplay from "../hiveReplay.js";
import type * as hiveRouter from "../hiveRouter.js";
import type * as intake from "../intake.js";
import type * as lifecycle from "../lifecycle.js";
import type * as mediaActions from "../mediaActions.js";
import type * as mediaArtifacts from "../mediaArtifacts.js";
import type * as payments from "../payments.js";
import type * as planning from "../planning.js";
import type * as productContext from "../productContext.js";
import type * as productContextActions from "../productContextActions.js";
import type * as providerJobs from "../providerJobs.js";
import type * as reputation from "../reputation.js";
import type * as reputationDimensions from "../reputationDimensions.js";
import type * as reputationPrior from "../reputationPrior.js";
import type * as scratchpad from "../scratchpad.js";
import type * as scratchpadActions from "../scratchpadActions.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as settlement from "../settlement.js";
import type * as settlementData from "../settlementData.js";
import type * as stripePayouts from "../stripePayouts.js";
import type * as taskAgentDiscovery from "../taskAgentDiscovery.js";
import type * as taskContexts from "../taskContexts.js";
import type * as taskList from "../taskList.js";
import type * as tasks from "../tasks.js";
import type * as tiktokUploadActions from "../tiktokUploadActions.js";
import type * as trilemma from "../trilemma.js";
import type * as userContext from "../userContext.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  a2aAuth: typeof a2aAuth;
  a2aAuthCore: typeof a2aAuthCore;
  a2aNegotiations: typeof a2aNegotiations;
  a2aNonces: typeof a2aNonces;
  a2aOutboundKeys: typeof a2aOutboundKeys;
  a2aTaskRuns: typeof a2aTaskRuns;
  agentBlackboard: typeof agentBlackboard;
  agentKeys: typeof agentKeys;
  agentKeysAdmin: typeof agentKeysAdmin;
  agentProfiles: typeof agentProfiles;
  agentReadiness: typeof agentReadiness;
  agentReadinessActions: typeof agentReadinessActions;
  agentSmokeStats: typeof agentSmokeStats;
  agentToolCalls: typeof agentToolCalls;
  agents: typeof agents;
  auctions: typeof auctions;
  battery: typeof battery;
  bidProbes: typeof bidProbes;
  bids: typeof bids;
  buyerAnalytics: typeof buyerAnalytics;
  contextEnrichment: typeof contextEnrichment;
  crons: typeof crons;
  demos: typeof demos;
  discoveredSpecialists: typeof discoveredSpecialists;
  disputes: typeof disputes;
  escalations: typeof escalations;
  escrow: typeof escrow;
  evolutionArchive: typeof evolutionArchive;
  goldenTaskAudit: typeof goldenTaskAudit;
  goldenTasks: typeof goldenTasks;
  hiveBaselineBackstop: typeof hiveBaselineBackstop;
  hiveCandidates: typeof hiveCandidates;
  hiveConnector: typeof hiveConnector;
  hiveData: typeof hiveData;
  hiveEvalGate: typeof hiveEvalGate;
  hiveEvaluator: typeof hiveEvaluator;
  hiveNetwork: typeof hiveNetwork;
  hiveOrchestrator: typeof hiveOrchestrator;
  hivePlanner: typeof hivePlanner;
  hiveRegistry: typeof hiveRegistry;
  hiveRegistryData: typeof hiveRegistryData;
  hiveReplay: typeof hiveReplay;
  hiveRouter: typeof hiveRouter;
  intake: typeof intake;
  lifecycle: typeof lifecycle;
  mediaActions: typeof mediaActions;
  mediaArtifacts: typeof mediaArtifacts;
  payments: typeof payments;
  planning: typeof planning;
  productContext: typeof productContext;
  productContextActions: typeof productContextActions;
  providerJobs: typeof providerJobs;
  reputation: typeof reputation;
  reputationDimensions: typeof reputationDimensions;
  reputationPrior: typeof reputationPrior;
  scratchpad: typeof scratchpad;
  scratchpadActions: typeof scratchpadActions;
  seed: typeof seed;
  seedData: typeof seedData;
  settlement: typeof settlement;
  settlementData: typeof settlementData;
  stripePayouts: typeof stripePayouts;
  taskAgentDiscovery: typeof taskAgentDiscovery;
  taskContexts: typeof taskContexts;
  taskList: typeof taskList;
  tasks: typeof tasks;
  tiktokUploadActions: typeof tiktokUploadActions;
  trilemma: typeof trilemma;
  userContext: typeof userContext;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
