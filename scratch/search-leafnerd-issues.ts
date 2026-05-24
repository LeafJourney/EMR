const LINEAR_API_URL = "https://api.linear.app/graphql";

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error("LINEAR_API_KEY is not defined in environment");
    return;
  }
  
  console.log("Searching for Leafnerd issues...");
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: `
          query {
            issues {
              nodes {
                id
                identifier
                title
                description
                state {
                  name
                  type
                }
              }
            }
          }
        `
      }),
    });

    const json = await response.json();
    const issues = json.data.issues.nodes;
    const leafnerdIssues = issues.filter((issue: any) => 
      issue.title.toLowerCase().includes("leafnerd") || 
      (issue.description && issue.description.toLowerCase().includes("leafnerd"))
    );
    console.log(`Found ${leafnerdIssues.length} issues matching 'Leafnerd':`);
    for (const issue of leafnerdIssues) {
      console.log(`- [${issue.identifier}] ${issue.title} (State: ${issue.state.name})`);
    }
  } catch (error) {
    console.error("Failed to fetch issues:", error);
  }
}

main();

export {};
