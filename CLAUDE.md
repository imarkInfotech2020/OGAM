# Project Instructions

## Pre-Commit Quality Gates

Before EVERY commit, you MUST run all of the following checks and ensure they pass. Do NOT commit until all three are green:

1. **Tests**: `npm test` — if you wrote or modified code, first ensure tests exist for the changes. Write missing tests before running.
2. **Linting**: `npm run lint`
3. **TypeScript**: `npx tsc --noEmit`

Run all three in parallel. If any fail, fix the issues and re-run until they all pass. Never skip these checks.

## Push = Create PR + Address Review

When asked to push code, follow this full workflow:

0. ensure that you are on a branch that is specific to this change i.e feat/new-feature or fix/bug-fix or docs/update-readme or chore/update-dependencies, or test/new-test, etc
1. Push the branch to the remote (`git push -u origin <branch>`)
2. Create a PR using `gh pr create`. Ensure that you are adhering to the PR template
3. Wait for Gemini to review the PR (poll with `gh pr checks` and `gh api repos/{owner}/{repo}/pulls/{number}/reviews` until a review appears)
4. Once a review exists, pull down the review comments: `gh api repos/{owner}/{repo}/pulls/{number}/comments` and `gh api repos/{owner}/{repo}/pulls/{number}/reviews`
5. Address every review comment — fix the code, re-run the quality gates (tests, lint, tsc)
6. Push the fixes
7. Report what was changed in response to the review
