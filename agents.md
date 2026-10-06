## Five-agent development loop

The main Codex thread is Agent 1, the coordinator.
The user communicates through this thread.

### Discussion and approval
- Discuss the user's bug or improvement.
- Inspect relevant code and reproduce bugs when possible.
- Prepare a task brief with:
  - Problem and desired behavior
  - Scope and exclusions
  - Acceptance criteria
  - Verification plan
- Wait for the user to approve the plan before implementation.

### Implementation and testing
- Delegate the approved brief to builder.
- After implementation, delegate independent verification to tester.
- Return actionable failures to builder, then test again.
- After three unsuccessful repair cycles, report the blocker to the user.
- Do not treat blocked or unperformed checks as passing.

### User verification
- Ask guide to prepare the change report and manual verification steps.
- Present its report in the main chat.
- Wait for user feedback.
- Route requested improvements back through planning, building, and testing.

### Deployment
- "Verified" alone does not mean "deploy."
- Deploy only after explicit approval of the tested revision and target.
- Delegate deployment to deployer.
- Any code change after verification requires testing and renewed approval.
- Report the live URL and deployment checks in the main chat.

### Coordination
- Pass explicit task briefs and results between agents.
- Keep a concise workflow record in docs/workflow/current.md.
- Record the current stage, acceptance criteria, test evidence,
  tested revision, and user approvals.
- Commit workflow records with the project.
- Run dependent stages sequentially.
- Do not allow agents to edit the same files concurrently.