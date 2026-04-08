import { SubTask } from './state';

export interface PipelineNode {
  task: SubTask;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
}

export class Pipeline {
  private nodes = new Map<string, PipelineNode>();

  load(tasks: SubTask[]): void {
    this.nodes.clear();

    for (const task of tasks) {
      this.nodes.set(task.id, {
        task,
        dependsOn: new Set(task.dependsOn),
        dependedBy: new Set(),
      });
    }

    // Build reverse edges
    for (const node of this.nodes.values()) {
      for (const dep of node.dependsOn) {
        const parent = this.nodes.get(dep);
        if (parent) {
          parent.dependedBy.add(node.task.id);
        }
      }
    }
  }

  getReady(completedIds: Set<string>): SubTask[] {
    const ready: SubTask[] = [];

    for (const node of this.nodes.values()) {
      if (completedIds.has(node.task.id)) {
        continue;
      }
      if (node.task.status !== 'pending') {
        continue;
      }

      const depsResolved = [...node.dependsOn].every(d => completedIds.has(d));
      if (depsResolved) {
        ready.push(node.task);
      }
    }

    return ready;
  }

  hasCycle(): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (id: string): boolean => {
      visited.add(id);
      inStack.add(id);

      const node = this.nodes.get(id);
      if (!node) { return false; }

      for (const dep of node.dependedBy) {
        if (!visited.has(dep)) {
          if (dfs(dep)) { return true; }
        } else if (inStack.has(dep)) {
          return true;
        }
      }

      inStack.delete(id);
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id) && dfs(id)) {
        return true;
      }
    }

    return false;
  }

  getAll(): SubTask[] {
    return [...this.nodes.values()].map(n => n.task);
  }
}
