# Sourcegraph Search Action

Have [Sourcegraph](https://sourcegraph.com) search PR diffs and notify the interested parties.

For large organisations, knowing who should be involved in a code review can be challenging. With this action, library maintainers can set up search queries that monitor PRs that use their library; when a PR is found that matches that query that maintainer is notified.

This action is designed to be hooked into a pull request workflow. It checks against specific saved searches in Sourcegraph, extracts contact information from the description (currently, either an email or slack handle), and uses that contact information to send them an automated message.

## Instructions

A [sample workflow yaml file](./sample_workflow/sourcegraph.yml) provides a starter to integrating this action into a branch that will monitor its PRs.

From a Sourcegraph point of view, create saved searches under a username or organisation. In the description include either an email (e.g. christy@acme.com) or slack handle (@christy) for the maintainer.

That's it. Now when PRs are made against that repo, the saved searches (specified by the yml file) under that organisation or username will be ran against the commit diffs and any that match will fire either emails or slacks accordingly.