import { InvalidRequestError } from "../shared/errors";
import type { ToolId, ToolRegistration } from "./types";

/**
 * Registry of tools agents may invoke. The orchestrator binds tools to
 * a specific agent run — an agent cannot invoke a tool that isn't on
 * its `allowedTools` list, and it cannot invoke a tool that exceeds
 * its autonomy tier.
 */
export class ToolRegistry {
  private readonly tools = new Map<ToolId, ToolRegistration>();

  register(tool: ToolRegistration): void {
    if (this.tools.has(tool.id)) {
      throw new InvalidRequestError(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: ToolId): ToolRegistration | null {
    return this.tools.get(id) ?? null;
  }

  has(id: ToolId): boolean {
    return this.tools.has(id);
  }

  list(): readonly ToolRegistration[] {
    return [...this.tools.values()];
  }
}
