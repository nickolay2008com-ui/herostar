## Scope

<!-- One logical change per PR. Link the parent issue/plan. -->

## Delivery Gate

Before marking this PR ready or merging it, every applicable item must be backed by evidence from the exact head SHA.

- [ ] Implementation is complete in this branch and the exact head commit is known.
- [ ] Required unit/static tests are green on the exact head SHA.
- [ ] Required browser/E2E/device checks are green on the exact head SHA.
- [ ] Syntax/lint/build checks are green where applicable.
- [ ] Changed immutable static assets use a fresh cache key before first production deployment.
- [ ] No correct regression test was weakened only to make CI green.
- [ ] Diff contains no unrelated changes or temporary fix layer.
- [ ] PR must not be merged while any required check is red, cancelled, pending, or running.
- [ ] After merge, production deployment is verified separately before reporting “on prod”.
- [ ] After deployment, the target live URL and critical user path are verified before reporting “done”.
- [ ] Parent issue / Definition of Done has been reconciled with the actual result.

## Evidence

Head SHA:

CI run:

Merge commit (after merge):

Production verification (after deploy):
