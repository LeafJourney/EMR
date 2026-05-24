import * as fs from 'fs';
import * as path from 'path';

const API_KEY = process.env.LINEAR_API_KEY || '';

if (!API_KEY) {
  console.error('Error: LINEAR_API_KEY env variable is not set.');
  process.exit(1);
}

async function syncLinearToLocal() {
  const query = `
    query {
      issues(first: 100) {
        nodes {
          id
          identifier
          title
          state {
            name
            type
          }
          priority
          description
          createdAt
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY,
      },
      body: JSON.stringify({ query }),
    });

    const json = (await res.json()) as any;
    if (json.errors) {
      console.error('API errors:', json.errors);
      return;
    }

    const issues = json.data.issues.nodes;
    // Filter out Done/Completed/Canceled issues
    const activeStates = ['In Progress', 'In Review', 'Backlog', 'Todo', 'Ready'];
    const activeIssues = issues.filter((i: any) => 
      activeStates.includes(i.state?.name)
    );

    activeIssues.sort((a: any, b: any) => {
      // Sort by state (In Progress first, then In Review, then Backlog)
      const stateOrder: Record<string, number> = {
        'In Progress': 0,
        'In Review': 1,
        'Todo': 2,
        'Ready': 3,
        'Backlog': 4
      };
      const orderA = stateOrder[a.state?.name] ?? 10;
      const orderB = stateOrder[b.state?.name] ?? 10;
      if (orderA !== orderB) return orderA - orderB;
      // Sort by priority (1 is highest, 0 is unprioritized/lowest in our sorting display)
      const prioA = a.priority === 0 ? 100 : a.priority;
      const prioB = b.priority === 0 ? 100 : b.priority;
      if (prioA !== prioB) return prioA - prioB;
      // Sort by identifier
      return a.identifier.localeCompare(b.identifier);
    });

    let markdown = `# Linear Active Backlog — Synced ${new Date().toISOString().split('T')[0]}\n\n`;
    markdown += `Total active issues: **${activeIssues.length}**\n\n`;
    markdown += `| Ticket | Priority | Title | Status |\n`;
    markdown += `|---|---|---|---|\n`;

    for (const issue of activeIssues) {
      const prioMap: Record<number, string> = {
        1: '🔴 Urgent (P1)',
        2: '🟠 High (P2)',
        3: '🟡 Normal (P3)',
        4: '🔵 Low (P4)',
        0: '⚪ None'
      };
      const priorityLabel = prioMap[issue.priority] || '⚪ None';
      markdown += `| [${issue.identifier}](#${issue.identifier.toLowerCase()}) | ${priorityLabel} | ${issue.title} | \`${issue.state?.name}\` |\n`;
    }

    markdown += `\n---\n\n## Ticket Details\n\n`;

    for (const issue of activeIssues) {
      markdown += `### ${issue.identifier}: ${issue.title}\n\n`;
      markdown += `* **Status:** \`${issue.state?.name}\`\n`;
      markdown += `* **Priority:** P${issue.priority}\n\n`;
      markdown += `#### Description\n\n${issue.description || '_No description provided._'}\n\n`;
      markdown += `---\n\n`;
    }

    const docsDir = path.join(__dirname, '../docs/pm');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(docsDir, 'linear-active-backlog.md'),
      markdown
    );
    console.log(`Synced ${activeIssues.length} active issues to docs/pm/linear-active-backlog.md`);
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

syncLinearToLocal();
