module "github_environment_bootstrap" {
  source  = "pagopa-dx/github-environment-bootstrap/github"
  version = "~> 1.1"

  repository = {
    name            = "io-functions-services"
    description     = "Function App to manage external services"
    topics          = ["io", "functions", "services"]
    jira_boards_ids = ["CES", "IOPID", "IOPAE"]

    default_branch_name      = "master"
    infra_cd_policy_branches = ["master"]
    opex_cd_policy_branches  = ["master"]
    app_cd_policy_branches   = ["master"]

    reviewers_teams = [
      "io-backend-contributors",
      "engineering-team-cloud-eng",
      "io-backend-admin"
    ]
  }
}
