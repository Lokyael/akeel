import {
  createDecisionService as createDecisionServiceCore,
  type ProjectContext,
  type PolicyState,
  type RuntimeObserver,
} from "../../../../packages/access-gate/src/access-gate/access-decision";
import { createCredentialBoundary } from "../../../../packages/access-gate/src/access-gate/access-decision/core/index";

export const testCredentialBoundary = createCredentialBoundary(["/__test-agent-dir__"]);

export function createTestDecisionService(
  state: PolicyState,
  context?: ProjectContext,
  observer?: RuntimeObserver,
): ReturnType<typeof createDecisionServiceCore> {
  return createDecisionServiceCore(state, context, observer, testCredentialBoundary);
}
