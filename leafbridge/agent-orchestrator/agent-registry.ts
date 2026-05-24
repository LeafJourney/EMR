import { InvalidRequestError } from "../shared/errors";
import type { AgentRegistration } from "./types";

/**
 * Registry of agents the orchestrator may invoke. Agents are registered
 * up-front (not at request time) so the security model is auditable
 * from config alone.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentRegistration>();

  register(agent: AgentRegistration): void {
    if (this.agents.has(agent.id)) {
      throw new InvalidRequestError(`Agent ${agent.id} already registered`);
    }
    this.agents.set(agent.id, Object.freeze({ ...agent }));
  }

  get(id: string): AgentRegistration | null {
    return this.agents.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): readonly AgentRegistration[] {
    return [...this.agents.values()];
  }
}
