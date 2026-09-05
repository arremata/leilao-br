# Claude Code project instructions

Read and follow `AGENTS.md` at the repository root before taking action. It is
the shared source of truth for product context, architecture, testing, the
plain-language delivery workflow, the production-data preview contract, review
ownership, and the required changelog.

In particular, a requester may describe only what they want to experience in
the product. Translate that request into acceptance criteria and implementation
details yourself. Publish and verify a branch preview before opening a PR to
`main`, respect the explicit preview write policy and treat every enabled preview
write as a production operation, and never bypass the required `GustavoAdamee`
approval or repository checks.
