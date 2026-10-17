# Jaanch.ai: infrastructure and CD

Terraform and GitHub Actions that deploy Jaanch.ai to AWS Elastic Beanstalk
(Docker, Amazon Linux 2023) with an RDS PostgreSQL database, an S3 bucket for
screenshots and Amazon Bedrock for the AI explanations. AWS access from GitHub
uses OIDC, so no AWS access keys are stored in the repository.

## Layout

```
infra/bootstrap   applied once, by hand: Terraform state bucket + GitHub OIDC provider and deploy role
infra/app         applied by .github/workflows/cd.yml: S3, IAM, RDS, Elastic Beanstalk
.github/workflows ci-devsecops (CI), cd (deploy), dast (ZAP scan), destroy (tear down)
```

## Pipeline

```
ci-devsecops (manual) -> docker-push (images tagged with the commit SHA)
  -> cd-deploy: gate -> verify images -> terraform plan -> approval (production)
     -> terraform apply -> deploy to Elastic Beanstalk -> smoke tests (rollback on failure)
     -> DAST (OWASP ZAP) -> summary
```

CD starts automatically when `ci-devsecops` succeeds on `main`. It can also be
started from **Actions > cd-deploy > Run workflow** with the SHA of a commit whose
images already exist on Docker Hub.

## Prerequisites

- An AWS account, the AWS CLI configured with permission to create IAM, S3 and OIDC resources (for the one-time bootstrap)
- Terraform 1.10 or newer
- Access to the Bedrock model named in `BEDROCK_MODEL_ID` in the target region
- A Docker Hub account for the images, and the GitHub CLI (optional, to set variables from the terminal)

## One-time setup

1. **Bootstrap** (local Terraform state; keep `infra/bootstrap/terraform.tfstate`).

   The role's trust policy is pinned to the numeric IDs of the repository owner
   and the repository, because GitHub issues the OIDC subject in the form
   `repo:<owner>@<owner_id>/<repo>@<repo_id>:ref:refs/heads/main`. When using a
   fork or another repository, look up the IDs and pass them as variables
   (the defaults in `infra/bootstrap/variables.tf` belong to the original repository):

   ```bash
   gh api users/<owner> --jq .id
   gh api repos/<owner>/<repo> --jq .id
   ```

   ```bash
   # forks / other repositories only: set the owner, repository and their IDs first
   export TF_VAR_github_owner=<owner> TF_VAR_github_repo=<repo>
   export TF_VAR_github_owner_id=<owner id> TF_VAR_github_repo_id=<repo id>

   cd infra/bootstrap
   ./bootstrap.sh                # plan only
   APPLY=1 ./bootstrap.sh        # create the resources
   ```

2. **Repository variables and secrets** (Settings > Secrets and variables > Actions)

   | Type | Name | Value |
   |---|---|---|
   | Variable | `AWS_ROLE_ARN` | printed by the bootstrap |
   | Variable | `TF_STATE_BUCKET` | printed by the bootstrap |
   | Variable | `AWS_REGION` | printed by the bootstrap (default `ap-south-1`) |
   | Variable | `BEDROCK_MODEL_ID` | for example `google.gemma-3-27b-it` |
   | Variable | `DOCKERHUB_USERNAME` | used by the image build |
   | Secret | `DOCKERHUB_TOKEN` | used by the image build |
   | Secret | `SAFE_BROWSING_API_KEY` | optional; without it the Google Safe Browsing check is reported as "not checked" |

3. **Environments** (Settings > Environments): create `production` and `destroy`
   with a required reviewer on each. The names must match exactly; the AWS trust
   policy and the workflows use them.

4. **Default branch:** the workflows must exist on `main` (`workflow_run` only
   fires from the default branch).

## Running a deployment

1. Run `ci-devsecops` on `main`.
2. When it succeeds, `cd-deploy` starts. Review the Terraform plan in the run summary.
3. Approve the `production` deployment. A full run takes about 11 minutes.
4. The live URL is in the run summary (plain HTTP on the default Elastic Beanstalk domain,
   so the ZAP report will list missing HTTPS-related headers).

## Tear down

1. **Actions > destroy**, enter `destroy`, approve the `destroy` deployment. This removes
   Elastic Beanstalk, RDS, the S3 bucket, the application IAM roles and the log groups.
2. Last, from the machine that ran the bootstrap:

   ```bash
   cd infra/bootstrap
   APPLY=1 ./bootstrap-destroy.sh
   ```

   The destroy workflow needs the bootstrap resources to sign in, so they are removed last.
   Running `bootstrap.sh` again recreates them with the same names.

AWS keeps the shared `elasticbeanstalk-<region>-<account>` bucket and the
`AWSServiceRoleForElasticBeanstalk` role; neither is removed or billed noticeably.

## Notes

- The deploy role is limited to the services used here, and its IAM permissions only cover
  roles and instance profiles named `jaanch-eb-*`.
- The Terraform plan is deliberately not uploaded as a build artifact, because it contains the
  generated database password.
- `docker-push` tags images with both `latest` and the commit SHA. CD deploys the SHA tag,
  so a commit that only changes workflows or Terraform has no images and cannot be deployed
  until CI has run for it (or an earlier SHA is supplied).