# Contributing to Wiki-Web

Thanks for taking a look. Bug reports, ideas, and pull requests are welcome.

## Report a bug or suggest a change

[Open an issue](https://github.com/utpalsinghdev/wiki-web/issues) and describe what happened, what you expected, and how to reproduce it. For feature ideas, explain the use case before proposing an implementation. Check existing issues first.

**Do not post private notes, vault contents, tokens, or unredacted screenshots.** If you find a security issue that could expose or alter someone's vault, contact the maintainer privately rather than publishing reproduction details in an issue.

## Work on a change

1. Fork the repository and create a branch from `main`.
2. Follow the [README](README.md) to run the app. Use a small test vault outside the repo, not your personal notes.
3. Keep the change focused. If it changes user-facing behavior, explain how you tested it.
4. Run checks before opening a PR:

   ```bash
   npm ci
   npm run build
   npm run lint
   ```

5. Open a pull request against `main`. Link the issue if there is one, summarize the change, and include reproduction/verification steps. Add screenshots for UI changes, using demo data only.

`main` is protected. Contributors can open PRs, but only the repository maintainer merges them. Please don't commit vault files or machine-specific configuration.
