# Jaanch.ai - infrastructure and CD

    infra/bootstrap   run ONCE by hand: state bucket + GitHub OIDC role
    infra/app         run by .github/workflows/cd.yml: S3, IAM, RDS, Elastic Beanstalk

## One-time setup
1. `cd infra/bootstrap && ./bootstrap.sh` (dry run), then `APPLY=1 ./bootstrap.sh`.
2. GitHub > Settings > Secrets and variables > Actions
   - Variables: AWS_ROLE_ARN, TF_STATE_BUCKET, AWS_REGION (printed by bootstrap),
     BEDROCK_MODEL_ID (google.gemma-3-27b-it), DOCKERHUB_USERNAME (already set)
   - Secrets: SAFE_BROWSING_API_KEY (rotated key), DOCKERHUB_TOKEN (already set)
3. GitHub > Settings > Environments: create `production` and `destroy`,
   each with yourself as Required reviewer.
4. Merge .github/workflows/* to `main` (workflow_run only fires from the default branch).

## Run
ci-devsecops (manual) -> on success cd-deploy starts -> approve `production` -> live.

## Tear down
Actions > destroy > type `destroy` > approve `destroy`, then on your laptop
`infra/bootstrap/bootstrap-destroy.sh`.
